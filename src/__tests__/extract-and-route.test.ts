/**
 * Tests for extract-and-route.ts — shared extraction + dedup + routing logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenClawConfig } from '../config.js';
import type { MeetingSession } from '../session.js';
import type { LlmClient } from '../llm.js';

vi.mock('../detect.js', () => ({
  extractIntents: vi.fn().mockResolvedValue([]),
}));
vi.mock('../route.js', () => ({
  routeIntent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../dedup.js', () => ({
  isDuplicate: vi.fn().mockReturnValue(false),
}));

import { extractAndRoute } from '../extract-and-route.js';
import { extractIntents } from '../detect.js';
import { isDuplicate } from '../dedup.js';
import { routeIntent } from '../route.js';

const TEST_CONFIG: OpenClawConfig = {
  instanceName: 'TestBot',
  recallApiKey: 'test-key',
  elevenLabsApiKey: null,

  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

const mockLlmClient: LlmClient = { infer: vi.fn() };

function createMockSession(): MeetingSession {
  return {
    botId: 'bot-1',
    meetingId: 'meeting-1',
    intents: [],
    addIntent: vi.fn(),
  } as unknown as MeetingSession;
}

describe('extractAndRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractIntents).mockResolvedValue([]);
    vi.mocked(isDuplicate).mockReturnValue(false);
    vi.mocked(routeIntent).mockResolvedValue(undefined);
  });

  it('extracts intents and routes non-duplicates', async () => {
    const session = createMockSession();
    const intent = {
      id: 'i1',
      type: 'BUG' as const,
      text: 'login broken',
      owner: null,
      deadline: null,
      priority: 'high' as const,
      confidence: 0.9,
      sourceQuote: 'login broken',
    };
    vi.mocked(extractIntents).mockResolvedValue([intent]);
    vi.mocked(isDuplicate).mockReturnValue(false);

    const count = await extractAndRoute('login is broken', session, TEST_CONFIG, mockLlmClient);

    expect(count).toBe(1);
    expect(session.addIntent).toHaveBeenCalledWith(intent);
    expect(routeIntent).toHaveBeenCalledWith(intent, session, TEST_CONFIG);
  });

  it('skips duplicate intents', async () => {
    const session = createMockSession();
    vi.mocked(extractIntents).mockResolvedValue([
      {
        id: 'i1',
        type: 'BUG',
        text: 'dup',
        owner: null,
        deadline: null,
        priority: 'high',
        confidence: 0.9,
        sourceQuote: 'dup',
      },
    ]);
    vi.mocked(isDuplicate).mockReturnValue(true);

    const count = await extractAndRoute('duplicate text', session, TEST_CONFIG, mockLlmClient);

    expect(count).toBe(0);
    expect(session.addIntent).not.toHaveBeenCalled();
    expect(routeIntent).not.toHaveBeenCalled();
  });

  it('returns 0 when no intents are extracted', async () => {
    const session = createMockSession();
    vi.mocked(extractIntents).mockResolvedValue([]);

    const count = await extractAndRoute('nothing actionable', session, TEST_CONFIG, mockLlmClient);

    expect(count).toBe(0);
  });

  it('routes multiple intents from a single chunk', async () => {
    const session = createMockSession();
    vi.mocked(extractIntents).mockResolvedValue([
      { id: 'i1', type: 'BUG', text: 'bug1', owner: null, deadline: null, priority: 'high', confidence: 0.9, sourceQuote: 'bug1' },
      { id: 'i2', type: 'FEATURE', text: 'feat1', owner: null, deadline: null, priority: 'medium', confidence: 0.88, sourceQuote: 'feat1' },
    ]);

    const count = await extractAndRoute('bugs and features', session, TEST_CONFIG, mockLlmClient);

    expect(count).toBe(2);
    expect(routeIntent).toHaveBeenCalledTimes(2);
  });

  it('propagates extraction errors', async () => {
    const session = createMockSession();
    vi.mocked(extractIntents).mockRejectedValue(new Error('LLM timeout'));

    await expect(extractAndRoute('text', session, TEST_CONFIG, mockLlmClient)).rejects.toThrow('LLM timeout');
  });
});
