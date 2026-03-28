/**
 * Tests for session.ts — MeetingSession checkpoint persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OpenClawConfig } from '../config.js';

// Hoist mock functions so they're initialized before vi.mock factories run
const { mockWriteFile, mockUnlink } = vi.hoisted(() => ({
  mockWriteFile: vi.fn(),
  mockUnlink: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  unlink: mockUnlink,
}));

// Import after mocks
import { MeetingSession } from '../session.js';

const mockConfig: OpenClawConfig = {
  instanceName: 'test-bot',
  recallApiKey: 'test-recall',
  elevenLabsApiKey: null,
  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

describe('MeetingSession', () => {
  let session: MeetingSession;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    session = new MeetingSession('https://meet.google.com/abc', mockConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('toJSON', () => {
    it('serializes all session fields', () => {
      session.botId = 'bot-123';
      session.websocketUrl = 'wss://ws.recall.ai/123';

      const segment = { text: 'Hello world', speaker: 'Alice', timestamp: 1000 };
      session.addSegment(segment);

      const intent = {
        id: 'intent-1',
        type: 'DECISION' as const,
        text: 'Login fails',
        owner: 'Bob',
        deadline: '2026-04-01',
        priority: 'high' as const,
        confidence: 0.92,
        sourceQuote: 'login fails on mobile',
      };
      session.addIntent(intent);

      const issue = {
        intentText: 'Login fails',
        issueUrl: 'https://github.com/owner/repo/issues/1',
        issueNumber: 1,
        title: 'Bug: Login fails',
      };
      session.addCreatedIssue(issue);

      const json = session.toJSON();

      expect(json.meetingId).toBe(session.meetingId);
      expect(json.url).toBe('https://meet.google.com/abc');
      expect(json.botId).toBe('bot-123');
      expect(json.websocketUrl).toBe('wss://ws.recall.ai/123');
      expect(json.isActive).toBe(true);
      expect(json.startTime).toBe(session.startTime.toISOString());
      expect(json.transcriptBuffer).toHaveLength(1);
      expect(json.transcriptBuffer[0]).toEqual(segment);
      expect(json.intents).toHaveLength(1);
      expect(json.intents[0]).toEqual(intent);
      expect(json.createdIssues).toHaveLength(1);
      expect(json.createdIssues[0]).toEqual(issue);
      expect(json.decisions).toContain('Login fails');
    });

    it('serializes empty session correctly', () => {
      const json = session.toJSON();

      expect(json.transcriptBuffer).toEqual([]);
      expect(json.intents).toEqual([]);
      expect(json.createdIssues).toEqual([]);
      expect(json.decisions).toEqual([]);
      expect(json.botId).toBeNull();
      expect(json.websocketUrl).toBeNull();
    });
  });

  describe('saveCheckpoint', () => {
    it('writes JSON to correct path', async () => {
      await session.saveCheckpoint();

      const expectedPath = `data/meetings/${session.meetingId}-checkpoint.json`;
      expect(mockWriteFile).toHaveBeenCalledWith(
        expectedPath,
        expect.any(String),
        'utf-8',
      );

      // Verify the written content is valid JSON matching toJSON()
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.meetingId).toBe(session.meetingId);
    });

    it('silently handles write errors without crashing', async () => {
      mockWriteFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      // Must not throw
      await expect(session.saveCheckpoint()).resolves.not.toThrow();
    });

    it('writes serialized session content', async () => {
      session.botId = 'bot-456';
      session.addSegment({ text: 'Test segment', speaker: 'Alice', timestamp: 500 });

      await session.saveCheckpoint();

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.botId).toBe('bot-456');
      expect(parsed.transcriptBuffer).toHaveLength(1);
    });
  });

  describe('deleteCheckpoint', () => {
    it('calls unlink with the correct path', async () => {
      await session.deleteCheckpoint();

      const expectedPath = `data/meetings/${session.meetingId}-checkpoint.json`;
      expect(mockUnlink).toHaveBeenCalledWith(expectedPath);
    });

    it('silently handles unlink errors without crashing', async () => {
      mockUnlink.mockRejectedValue(new Error('ENOENT: file not found'));

      await expect(session.deleteCheckpoint()).resolves.not.toThrow();
    });
  });

  describe('startCheckpointing', () => {
    it('calls saveCheckpoint periodically using fake timers', async () => {
      vi.useFakeTimers();
      // Track saveCheckpoint calls via spy
      const spy = vi.spyOn(session, 'saveCheckpoint').mockResolvedValue(undefined);

      session.startCheckpointing(1000);

      // No call yet immediately
      expect(spy).not.toHaveBeenCalled();

      // Advance time by 1 interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Advance by another interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(spy).toHaveBeenCalledTimes(2);

      // Advance by 3 more intervals
      await vi.advanceTimersByTimeAsync(3000);
      expect(spy).toHaveBeenCalledTimes(5);

      session.end();
    });

    it('defaults to 30_000ms interval', async () => {
      vi.useFakeTimers();
      const spy = vi.spyOn(session, 'saveCheckpoint').mockResolvedValue(undefined);
      vi.spyOn(session, 'end').mockResolvedValue(undefined);

      session.startCheckpointing();

      await vi.advanceTimersByTimeAsync(29_999);
      expect(spy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(spy).toHaveBeenCalledTimes(1);

      await session.end();
    });
  });

  describe('end', () => {
    it('clears checkpoint interval so no more writes occur', async () => {
      vi.useFakeTimers();
      const spy = vi.spyOn(session, 'saveCheckpoint').mockResolvedValue(undefined);

      session.startCheckpointing(1000);

      await vi.advanceTimersByTimeAsync(1000);
      expect(spy).toHaveBeenCalledTimes(1);

      // end() should clear the interval and write one final checkpoint
      await session.end();
      // 1 from interval + 1 final = 2
      const callsAfterEnd = spy.mock.calls.length;

      // Advance more time — no additional calls expected beyond what end() wrote
      await vi.advanceTimersByTimeAsync(5000);
      expect(spy).toHaveBeenCalledTimes(callsAfterEnd);
    });

    it('sets isActive to false', async () => {
      await session.end();

      expect(session.isActive).toBe(false);
    });

    it('writes a final checkpoint on end', async () => {
      vi.useFakeTimers();
      const spy = vi.spyOn(session, 'saveCheckpoint').mockResolvedValue(undefined);

      session.startCheckpointing(1000);
      await session.end();

      // end() should have called saveCheckpoint once for the final checkpoint
      expect(spy).toHaveBeenCalled();
    });
  });
});
