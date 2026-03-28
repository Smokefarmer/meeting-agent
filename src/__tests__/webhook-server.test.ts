/**
 * Tests for webhook-server.ts — Recall.ai webhook transcript receiver.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
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
import { createApp, registerSession, unregisterSession, _sessions, checkWakeBuffer } from '../webhook-server.js';

const mockLlmClient: LlmClient = { infer: vi.fn() };
import { extractIntents } from '../detect.js';
import { isDuplicate } from '../dedup.js';
import { routeIntent } from '../route.js';
import { detectWakeWord, handleAddressedSpeech } from '../converse.js';
import { generateAndSendSummary } from '../summary.js';

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

function makeTranscriptEvent(botId: string, text: string, speaker?: string) {
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

describe('webhook-server', () => {
  let app: ReturnType<typeof createApp>;
  let mockSession: MeetingSession;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(detectWakeWord).mockReturnValue(null);
    vi.mocked(handleAddressedSpeech).mockResolvedValue(undefined);
    vi.mocked(extractIntents).mockResolvedValue([]);
    vi.mocked(isDuplicate).mockReturnValue(false);
    vi.mocked(routeIntent).mockResolvedValue(undefined);
    vi.mocked(generateAndSendSummary).mockResolvedValue(undefined);
    _sessions.clear();
    delete process.env.RECALL_WEBHOOK_SECRET;

    app = createApp(TEST_CONFIG, mockLlmClient);
    mockSession = createMockSession();
  });

  afterEach(() => {
    delete process.env.RECALL_WEBHOOK_SECRET;
  });

  describe('registerSession / unregisterSession', () => {
    it('registers a session by botId', () => {
      registerSession(mockSession);

      expect(_sessions.has(BOT_ID)).toBe(true);
      expect(_sessions.get(BOT_ID)!.session).toBe(mockSession);
    });

    it('throws if session has no botId', () => {
      mockSession.botId = null;

      expect(() => registerSession(mockSession)).toThrow('Cannot register session without botId');
    });

    it('unregisters a session by botId', () => {
      registerSession(mockSession);
      unregisterSession(BOT_ID);

      expect(_sessions.has(BOT_ID)).toBe(false);
    });
  });

  describe('POST / (transcript.data)', () => {
    it('returns 200 for a valid transcript event', async () => {
      registerSession(mockSession);
      const body = makeTranscriptEvent(BOT_ID, 'hello world');

      const res = await request(app).post('/').send(body);

      expect(res.status).toBe(200);
    });

    it('adds transcript segment to session', async () => {
      registerSession(mockSession);
      const body = makeTranscriptEvent(BOT_ID, 'hello world', 'Alice');

      await request(app).post('/').send(body);

      expect(mockSession.addSegment).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'hello world',
          speaker: 'Alice',
        }),
      );
    });

    it('sets speaker to null when participant is missing', async () => {
      registerSession(mockSession);
      const body = makeTranscriptEvent(BOT_ID, 'hello');

      await request(app).post('/').send(body);

      expect(mockSession.addSegment).toHaveBeenCalledWith(
        expect.objectContaining({ speaker: null }),
      );
    });

    it('ignores non-transcript events', async () => {
      registerSession(mockSession);

      const res = await request(app)
        .post('/')
        .send({ event: 'bot.status_change', data: {} });

      expect(res.status).toBe(200);
      expect(mockSession.addSegment).not.toHaveBeenCalled();
    });

    it('ignores unknown botIds', async () => {
      registerSession(mockSession);
      const body = makeTranscriptEvent('unknown-bot', 'hello');

      await request(app).post('/').send(body);

      expect(mockSession.addSegment).not.toHaveBeenCalled();
    });

    it('ignores events with empty text', async () => {
      registerSession(mockSession);
      const body = {
        event: 'transcript.data',
        data: {
          bot: { id: BOT_ID },
          data: { words: [], participant: { name: 'Alice' } },
        },
      };

      await request(app).post('/').send(body);

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

      // Send enough words to trigger extraction (50+)
      const longText = Array.from({ length: 55 }, (_, i) => `word${i}`).join(' ');
      const body = makeTranscriptEvent(BOT_ID, longText, 'Bob');

      await request(app).post('/').send(body);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(extractIntents).toHaveBeenCalled();
      expect(routeIntent).toHaveBeenCalled();
    });

    it('does not extract before word threshold', async () => {
      registerSession(mockSession);
      const body = makeTranscriptEvent(BOT_ID, 'just a few words', 'Alice');

      await request(app).post('/').send(body);
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
      await request(app).post('/').send(makeTranscriptEvent(BOT_ID, longText));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(routeIntent).not.toHaveBeenCalled();
    });
  });

  describe('wake word detection', () => {
    it('routes to Q&A when wake word detected', async () => {
      registerSession(mockSession);
      vi.mocked(detectWakeWord).mockReturnValue('what is the status?');

      const body = makeTranscriptEvent(BOT_ID, 'hey TestBot what is the status', 'Alice');

      await request(app).post('/').send(body);
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
      await request(app).post('/').send(makeTranscriptEvent(BOT_ID, longText));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(extractIntents).not.toHaveBeenCalled();
    });

    it('stores pending wake word when bare name detected (no question)', async () => {
      registerSession(mockSession);
      // detectWakeWord returns '' for bare "Hey George" — wake word found, no question
      vi.mocked(detectWakeWord).mockReturnValueOnce('');

      await request(app).post('/').send(makeTranscriptEvent(BOT_ID, 'Hey TestBot', 'Alice'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should NOT call handleAddressedSpeech yet — waiting for follow-up
      expect(handleAddressedSpeech).not.toHaveBeenCalled();

      // Verify pending state was set
      const state = _sessions.get(BOT_ID)!;
      expect(state.pendingWakeWord).not.toBeNull();
      expect(state.pendingWakeWord!.speaker).toBe('Alice');
    });

    it('resolves pending wake word with next segment as question', async () => {
      registerSession(mockSession);
      // Directly set pending wake word state (avoids async timing issues with supertest)
      const state = _sessions.get(BOT_ID)!;
      state.pendingWakeWord = { speaker: 'Alice', timestamp: Date.now() };

      // Next segment arrives — should be treated as the question
      await request(app).post('/').send(makeTranscriptEvent(BOT_ID, 'how are you doing', 'Alice'));
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
      const state = _sessions.get(BOT_ID)!;
      state.pendingWakeWord = { speaker: 'Alice', timestamp: Date.now() - 6000 }; // 6s ago

      await request(app).post('/').send(makeTranscriptEvent(BOT_ID, 'unrelated speech', 'Bob'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should NOT route to Q&A — pending wake word expired
      expect(handleAddressedSpeech).not.toHaveBeenCalled();
      expect(state.pendingWakeWord).toBeNull();
    });

    it('handles full wake word + question in one segment (no pending needed)', async () => {
      registerSession(mockSession);
      vi.mocked(detectWakeWord).mockReturnValue('what is the plan');

      await request(app).post('/').send(makeTranscriptEvent(BOT_ID, 'Hey TestBot what is the plan', 'Alice'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleAddressedSpeech).toHaveBeenCalledWith(
        'what is the plan',
        mockSession,
        TEST_CONFIG,
        mockLlmClient,
      );
      const state = _sessions.get(BOT_ID)!;
      expect(state.pendingWakeWord).toBeNull();
    });

    it('detects wake word split mid-word across segments (e.g. "hey geor" + "ge")', async () => {
      registerSession(mockSession);
      // Simulate Recall.ai splitting "george" across segments
      // First segment: "hey geor" — no match on its own
      vi.mocked(detectWakeWord).mockReturnValue(null);
      await request(app).post('/').send(makeTranscriptEvent(BOT_ID, 'hey geor', 'Alice'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second segment: "ge how are you" — no match on its own either
      // But combined buffer "hey geor ge how are you" should match via checkWakeBuffer
      // We need detectWakeWord to match on the combined text
      vi.mocked(detectWakeWord).mockImplementation((seg) => {
        if (seg.text.toLowerCase().includes('george') || seg.text.toLowerCase().includes('geor ge')) {
          const idx = seg.text.toLowerCase().indexOf('geor ge');
          if (idx !== -1) {
            return seg.text.slice(idx + 'geor ge'.length).trim() || '';
          }
          const idx2 = seg.text.toLowerCase().indexOf('george');
          if (idx2 !== -1) {
            return seg.text.slice(idx2 + 'george'.length).trim() || '';
          }
        }
        return null;
      });

      await request(app).post('/').send(makeTranscriptEvent(BOT_ID, 'ge how are you', 'Alice'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleAddressedSpeech).toHaveBeenCalled();
    });
  });

  describe('checkWakeBuffer', () => {
    it('detects wake word across combined buffer entries', () => {
      // Combined text will be "hey test bot what is up"
      // Mock detectWakeWord to match when combined text contains the name
      const mockFn = vi.fn((seg: { text: string }) => {
        const lower = seg.text.toLowerCase();
        // "hey test bot" contains "testbot" when spaces removed? No, detectWakeWord
        // checks for the name as-is. Combined: "hey test bot what is up"
        // The real detectWakeWord checks for bare "testbot" — which appears in "test bot" only without space.
        // For this test, simulate matching on "test bot" (space in name due to split)
        if (lower.includes('testbot') || lower.includes('test bot')) {
          const patterns = ['hey testbot', 'hey test bot', 'testbot', 'test bot'];
          for (const p of patterns) {
            const idx = lower.indexOf(p);
            if (idx !== -1) {
              return seg.text.slice(idx + p.length).trim() || '';
            }
          }
        }
        return null;
      });
      vi.mocked(detectWakeWord).mockImplementation(mockFn as typeof detectWakeWord);

      const buffer = [
        { text: 'hey test', speaker: 'Alice', timestamp: Date.now() },
        { text: 'bot what is up', speaker: 'Alice', timestamp: Date.now() },
      ];

      const result = checkWakeBuffer(buffer, 'TestBot');

      expect(result).not.toBeNull();
      expect(result!.question).toBe('what is up');
    });

    it('returns null when no wake word in buffer', () => {
      vi.mocked(detectWakeWord).mockReturnValue(null);

      const buffer = [
        { text: 'hello world', speaker: 'Alice', timestamp: Date.now() },
        { text: 'this is a test', speaker: 'Alice', timestamp: Date.now() },
      ];

      const result = checkWakeBuffer(buffer, 'TestBot');

      expect(result).toBeNull();
    });

    it('returns null for empty buffer', () => {
      const result = checkWakeBuffer([], 'TestBot');
      expect(result).toBeNull();
    });
  });

  describe('POST /bot-done', () => {
    it('processes remaining buffer and generates summary', async () => {
      registerSession(mockSession);

      // Directly set buffer state (simulates accumulated transcript below extraction threshold)
      const state = _sessions.get(BOT_ID)!;
      state.buffer = 'we need to fix the login page';
      state.wordCount = 7;

      const res = await request(app)
        .post('/bot-done')
        .send({ bot: { id: BOT_ID } });

      expect(res.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(extractIntents).toHaveBeenCalledWith('we need to fix the login page', TEST_CONFIG, mockLlmClient);
      expect(generateAndSendSummary).toHaveBeenCalledWith(mockSession, TEST_CONFIG);
    });

    it('generates summary even with empty buffer', async () => {
      registerSession(mockSession);

      await request(app)
        .post('/bot-done')
        .send({ bot: { id: BOT_ID } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(generateAndSendSummary).toHaveBeenCalledWith(mockSession, TEST_CONFIG);
    });

    it('unregisters session after processing', async () => {
      registerSession(mockSession);

      await request(app)
        .post('/bot-done')
        .send({ bot: { id: BOT_ID } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(_sessions.has(BOT_ID)).toBe(false);
    });

    it('ignores unknown botIds', async () => {
      const res = await request(app)
        .post('/bot-done')
        .send({ bot: { id: 'unknown' } });

      expect(res.status).toBe(200);
      expect(generateAndSendSummary).not.toHaveBeenCalled();
    });

    it('handles summary generation failure gracefully', async () => {
      registerSession(mockSession);
      vi.mocked(generateAndSendSummary).mockRejectedValue(new Error('Telegram down'));

      await request(app)
        .post('/bot-done')
        .send({ bot: { id: BOT_ID } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not throw — error is caught
      expect(_sessions.has(BOT_ID)).toBe(false);
    });
  });

  describe('webhook signature verification', () => {
    it('rejects requests with invalid signature when secret is set', async () => {
      process.env.RECALL_WEBHOOK_SECRET = 'test-secret';
      app = createApp(TEST_CONFIG, mockLlmClient);
      registerSession(mockSession);

      const body = makeTranscriptEvent(BOT_ID, 'hello');

      const res = await request(app)
        .post('/')
        .set('x-recall-signature', 'invalid-sig')
        .send(body);

      expect(res.status).toBe(401);
      expect(mockSession.addSegment).not.toHaveBeenCalled();
    });

    it('accepts requests with valid HMAC signature', async () => {
      const secret = 'test-secret';
      process.env.RECALL_WEBHOOK_SECRET = secret;
      app = createApp(TEST_CONFIG, mockLlmClient);
      registerSession(mockSession);

      const body = makeTranscriptEvent(BOT_ID, 'hello world');
      const bodyStr = JSON.stringify(body);
      const hmac = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');

      const res = await request(app)
        .post('/')
        .set('Content-Type', 'application/json')
        .set('x-recall-signature', hmac)
        .send(bodyStr);

      expect(res.status).toBe(200);
      expect(mockSession.addSegment).toHaveBeenCalled();
    });

    it('allows all requests when no secret is configured', async () => {
      delete process.env.RECALL_WEBHOOK_SECRET;
      app = createApp(TEST_CONFIG, mockLlmClient);
      registerSession(mockSession);

      const body = makeTranscriptEvent(BOT_ID, 'hello');

      const res = await request(app).post('/').send(body);

      expect(res.status).toBe(200);
      expect(mockSession.addSegment).toHaveBeenCalled();
    });

    it('rejects /bot-done with invalid signature', async () => {
      process.env.RECALL_WEBHOOK_SECRET = 'test-secret';
      app = createApp(TEST_CONFIG, mockLlmClient);
      registerSession(mockSession);

      const res = await request(app)
        .post('/bot-done')
        .set('x-recall-signature', 'bad')
        .send({ bot: { id: BOT_ID } });

      expect(res.status).toBe(401);
      expect(generateAndSendSummary).not.toHaveBeenCalled();
    });
  });
});
