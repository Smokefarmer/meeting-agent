/**
 * Tests for webhook-handlers.ts — pure handler functions extracted from webhook-server.ts.
 * These are transport-agnostic and do not depend on Express.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OpenClawConfig } from '../config.js';
import type { MeetingSession } from '../session.js';

// Mock dependencies before importing
vi.mock('../detect.js', () => ({
  extractIntents: vi.fn().mockResolvedValue([]),
}));
vi.mock('../route.js', () => ({
  routeIntent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../dedup.js', () => ({
  isDuplicate: vi.fn().mockReturnValue(false),
}));
vi.mock('../converse.js', () => ({
  detectWakeWord: vi.fn().mockReturnValue(null),
  handleAddressedSpeech: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../summary.js', () => ({
  generateAndSendSummary: vi.fn().mockResolvedValue(undefined),
}));

import type { LlmClient } from '../llm.js';
import {
  handleTranscriptWebhook,
  handleBotDoneWebhook,
  verifySignature,
  registerSession,
  unregisterSession,
  SessionState,
  sessions,
} from '../webhook-handlers.js';
import type { SessionState as SessionStateType } from '../webhook-handlers.js';

import { extractIntents } from '../detect.js';
import { isDuplicate } from '../dedup.js';
import { routeIntent } from '../route.js';
import { detectWakeWord, handleAddressedSpeech } from '../converse.js';
import { generateAndSendSummary } from '../summary.js';

const mockLlmClient: LlmClient = { infer: vi.fn() };

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

const BOT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeTranscriptBody(botId: string, text: string, speaker?: string) {
  return {
    event: 'transcript.data',
    data: {
      bot: { id: botId },
      data: {
        words: text.split(' ').map((w) => ({ text: w })),
        participant: speaker ? { name: speaker } : undefined,
      },
    },
  };
}

function createMockSession(): MeetingSession {
  return {
    botId: BOT_ID,
    meetingId: 'test-meeting',
    url: 'https://meet.google.com/abc-defg-hij',
    startTime: new Date(),
    config: TEST_CONFIG,
    websocketUrl: null,
    transcriptBuffer: [],
    intents: [],
    createdIssues: [],
    decisions: [],
    isActive: true,
    addSegment: vi.fn(),
    addIntent: vi.fn(),
    addCreatedIssue: vi.fn(),
    getTranscriptText: vi.fn().mockReturnValue(''),
    end: vi.fn(),
  } as unknown as MeetingSession;
}

describe('webhook-handlers', () => {
  let mockSession: MeetingSession;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(detectWakeWord).mockReturnValue(null);
    vi.mocked(handleAddressedSpeech).mockResolvedValue(undefined);
    vi.mocked(extractIntents).mockResolvedValue([]);
    vi.mocked(isDuplicate).mockReturnValue(false);
    vi.mocked(routeIntent).mockResolvedValue(undefined);
    vi.mocked(generateAndSendSummary).mockResolvedValue(undefined);
    sessions.clear();
    delete process.env.RECALL_WEBHOOK_SECRET;

    mockSession = createMockSession();
  });

  afterEach(() => {
    delete process.env.RECALL_WEBHOOK_SECRET;
  });

  // ---------------------------------------------------------------------------
  // registerSession / unregisterSession
  // ---------------------------------------------------------------------------

  describe('registerSession / unregisterSession', () => {
    it('registers a session by botId', () => {
      registerSession(mockSession);

      expect(sessions.has(BOT_ID)).toBe(true);
      expect(sessions.get(BOT_ID)!.session).toBe(mockSession);
    });

    it('throws if session has no botId', () => {
      mockSession.botId = null;

      expect(() => registerSession(mockSession)).toThrow('Cannot register session without botId');
    });

    it('unregisters a session by botId', () => {
      registerSession(mockSession);
      unregisterSession(BOT_ID);

      expect(sessions.has(BOT_ID)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // verifySignature
  // ---------------------------------------------------------------------------

  describe('verifySignature', () => {
    it('returns true when no secret is configured', () => {
      delete process.env.RECALL_WEBHOOK_SECRET;

      expect(verifySignature(Buffer.from('body'), undefined)).toBe(true);
    });

    it('returns false when secret is set but signature is missing', () => {
      process.env.RECALL_WEBHOOK_SECRET = 'secret';

      expect(verifySignature(Buffer.from('body'), undefined)).toBe(false);
    });

    it('returns true for a valid HMAC-SHA256 signature', () => {
      import('node:crypto').then((crypto) => {
        const secret = 'my-secret';
        process.env.RECALL_WEBHOOK_SECRET = secret;
        const body = Buffer.from('{"event":"test"}');
        const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

        expect(verifySignature(body, sig)).toBe(true);
      });
    });

    it('returns false for an invalid HMAC signature', () => {
      process.env.RECALL_WEBHOOK_SECRET = 'secret';

      expect(verifySignature(Buffer.from('body'), 'badhex')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // handleTranscriptWebhook
  // ---------------------------------------------------------------------------

  describe('handleTranscriptWebhook', () => {
    it('adds transcript segment to session for transcript.data events', async () => {
      registerSession(mockSession);
      const body = makeTranscriptBody(BOT_ID, 'hello world', 'Alice');

      await handleTranscriptWebhook(body, sessions, TEST_CONFIG, mockLlmClient);

      expect(mockSession.addSegment).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'hello world', speaker: 'Alice' }),
      );
    });

    it('sets speaker to null when participant is missing', async () => {
      registerSession(mockSession);
      const body = makeTranscriptBody(BOT_ID, 'hello');

      await handleTranscriptWebhook(body, sessions, TEST_CONFIG, mockLlmClient);

      expect(mockSession.addSegment).toHaveBeenCalledWith(
        expect.objectContaining({ speaker: null }),
      );
    });

    it('ignores non-transcript.data events', async () => {
      registerSession(mockSession);

      await handleTranscriptWebhook(
        { event: 'bot.status_change', data: {} },
        sessions,
        TEST_CONFIG,
        mockLlmClient,
      );

      expect(mockSession.addSegment).not.toHaveBeenCalled();
    });

    it('ignores unknown botIds', async () => {
      registerSession(mockSession);
      const body = makeTranscriptBody('unknown-bot', 'hello');

      await handleTranscriptWebhook(body, sessions, TEST_CONFIG, mockLlmClient);

      expect(mockSession.addSegment).not.toHaveBeenCalled();
    });

    it('ignores events with empty text (no words)', async () => {
      registerSession(mockSession);
      const body = {
        event: 'transcript.data',
        data: {
          bot: { id: BOT_ID },
          data: { words: [], participant: { name: 'Alice' } },
        },
      };

      await handleTranscriptWebhook(body, sessions, TEST_CONFIG, mockLlmClient);

      expect(mockSession.addSegment).not.toHaveBeenCalled();
    });

    it('triggers extraction after enough words accumulate', async () => {
      registerSession(mockSession);
      vi.mocked(extractIntents).mockResolvedValue([
        {
          id: 'i1',
          type: 'BUG',
          text: 'login is broken',
          owner: null,
          deadline: null,
          priority: 'high',
          confidence: 0.9,
          sourceQuote: 'login is broken',
        },
      ]);

      const longText = Array.from({ length: 55 }, (_, i) => `word${i}`).join(' ');
      const body = makeTranscriptBody(BOT_ID, longText, 'Bob');

      await handleTranscriptWebhook(body, sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(extractIntents).toHaveBeenCalled();
      expect(routeIntent).toHaveBeenCalled();
    });

    it('does not extract before word threshold', async () => {
      registerSession(mockSession);
      const body = makeTranscriptBody(BOT_ID, 'just a few words', 'Alice');

      await handleTranscriptWebhook(body, sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(extractIntents).not.toHaveBeenCalled();
    });

    it('skips duplicate intents', async () => {
      registerSession(mockSession);
      vi.mocked(extractIntents).mockResolvedValue([
        {
          id: 'i1',
          type: 'BUG',
          text: 'dup bug',
          owner: null,
          deadline: null,
          priority: 'high',
          confidence: 0.9,
          sourceQuote: 'dup bug',
        },
      ]);
      vi.mocked(isDuplicate).mockReturnValue(true);

      const longText = Array.from({ length: 55 }, (_, i) => `word${i}`).join(' ');
      await handleTranscriptWebhook(makeTranscriptBody(BOT_ID, longText), sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(routeIntent).not.toHaveBeenCalled();
    });

    it('routes to Q&A when wake word detected', async () => {
      registerSession(mockSession);
      vi.mocked(detectWakeWord).mockReturnValue('what is the status?');

      const body = makeTranscriptBody(BOT_ID, 'hey TestBot what is the status', 'Alice');

      await handleTranscriptWebhook(body, sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleAddressedSpeech).toHaveBeenCalledWith(
        'what is the status?',
        mockSession,
        TEST_CONFIG,
        mockLlmClient,
      );
    });

    it('does not run extraction when wake word detected', async () => {
      registerSession(mockSession);
      vi.mocked(detectWakeWord).mockReturnValue('question?');

      const longText = Array.from({ length: 55 }, (_, i) => `word${i}`).join(' ');
      await handleTranscriptWebhook(makeTranscriptBody(BOT_ID, longText), sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(extractIntents).not.toHaveBeenCalled();
    });

    it('stores pending wake word when bare name detected (no question)', async () => {
      registerSession(mockSession);
      vi.mocked(detectWakeWord).mockReturnValueOnce('');

      await handleTranscriptWebhook(
        makeTranscriptBody(BOT_ID, 'Hey TestBot', 'Alice'),
        sessions,
        TEST_CONFIG,
        mockLlmClient,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleAddressedSpeech).not.toHaveBeenCalled();
      const state = sessions.get(BOT_ID)!;
      expect(state.pendingWakeWord).not.toBeNull();
      expect(state.pendingWakeWord!.speaker).toBe('Alice');
    });

    it('resolves pending wake word with next segment as question', async () => {
      registerSession(mockSession);
      const state = sessions.get(BOT_ID)!;
      state.pendingWakeWord = { speaker: 'Alice', timestamp: Date.now() };

      await handleTranscriptWebhook(
        makeTranscriptBody(BOT_ID, 'how are you doing', 'Alice'),
        sessions,
        TEST_CONFIG,
        mockLlmClient,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleAddressedSpeech).toHaveBeenCalledWith(
        'how are you doing',
        mockSession,
        TEST_CONFIG,
        mockLlmClient,
      );
      expect(state.pendingWakeWord).toBeNull();
    });

    it('expires pending wake word after TTL', async () => {
      registerSession(mockSession);
      const state = sessions.get(BOT_ID)!;
      state.pendingWakeWord = { speaker: 'Alice', timestamp: Date.now() - 6000 };

      await handleTranscriptWebhook(
        makeTranscriptBody(BOT_ID, 'unrelated speech', 'Bob'),
        sessions,
        TEST_CONFIG,
        mockLlmClient,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleAddressedSpeech).not.toHaveBeenCalled();
      expect(state.pendingWakeWord).toBeNull();
    });

    it('handles null/undefined body gracefully', async () => {
      await expect(
        handleTranscriptWebhook(null, sessions, TEST_CONFIG, mockLlmClient),
      ).resolves.not.toThrow();
      await expect(
        handleTranscriptWebhook(undefined, sessions, TEST_CONFIG, mockLlmClient),
      ).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // handleBotDoneWebhook
  // ---------------------------------------------------------------------------

  describe('handleBotDoneWebhook', () => {
    it('processes remaining buffer and generates summary', async () => {
      registerSession(mockSession);
      const state = sessions.get(BOT_ID)!;
      state.buffer = 'we need to fix the login page';
      state.wordCount = 7;

      await handleBotDoneWebhook({ bot: { id: BOT_ID } }, sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(extractIntents).toHaveBeenCalledWith('we need to fix the login page', TEST_CONFIG, mockLlmClient);
      expect(generateAndSendSummary).toHaveBeenCalledWith(mockSession, TEST_CONFIG, mockLlmClient);
    });

    it('generates summary even with empty buffer', async () => {
      registerSession(mockSession);

      await handleBotDoneWebhook({ bot: { id: BOT_ID } }, sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(generateAndSendSummary).toHaveBeenCalledWith(mockSession, TEST_CONFIG, mockLlmClient);
    });

    it('unregisters session after processing', async () => {
      registerSession(mockSession);

      await handleBotDoneWebhook({ bot: { id: BOT_ID } }, sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sessions.has(BOT_ID)).toBe(false);
    });

    it('ignores unknown botIds', async () => {
      await handleBotDoneWebhook({ bot: { id: 'unknown' } }, sessions, TEST_CONFIG, mockLlmClient);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(generateAndSendSummary).not.toHaveBeenCalled();
    });

    it('handles summary generation failure gracefully', async () => {
      registerSession(mockSession);
      vi.mocked(generateAndSendSummary).mockRejectedValue(new Error('Telegram down'));

      await expect(
        handleBotDoneWebhook({ bot: { id: BOT_ID } }, sessions, TEST_CONFIG, mockLlmClient),
      ).resolves.not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sessions.has(BOT_ID)).toBe(false);
    });

    it('handles missing bot id in body gracefully', async () => {
      await expect(
        handleBotDoneWebhook({ bot: {} }, sessions, TEST_CONFIG, mockLlmClient),
      ).resolves.not.toThrow();
    });

    it('handles null/undefined body gracefully', async () => {
      await expect(
        handleBotDoneWebhook(null, sessions, TEST_CONFIG, mockLlmClient),
      ).resolves.not.toThrow();
      await expect(
        handleBotDoneWebhook(undefined, sessions, TEST_CONFIG, mockLlmClient),
      ).resolves.not.toThrow();
    });
  });
});
