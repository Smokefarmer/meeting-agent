/**
 * Tests for listen.ts — Recall.ai WebSocket transcript streaming.
 * Tests handleMessage behavior through the WebSocket mock.
 *
 * The vi.mock factory is hoisted to top of file, so all class definitions
 * must live inside the factory (cannot reference top-level variables).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the 'ws' module.
// The factory is hoisted — we use a module-level store accessed via a getter
// function defined on globalThis so we can retrieve instances from test code.
// ---------------------------------------------------------------------------

vi.mock('ws', () => {
  const { EventEmitter } = require('node:events');

  class MockWebSocket extends EventEmitter {
    readyState = 1;

    constructor(_url: string, _opts?: unknown) {
      super();
      // Store instance on globalThis for test access
      (globalThis as Record<string, unknown>).__mockWsInstances =
        (globalThis as Record<string, unknown>).__mockWsInstances ?? [];
      ((globalThis as Record<string, unknown>).__mockWsInstances as MockWebSocket[]).push(this);
    }

    simulateMessage(raw: string) {
      this.emit('message', raw);
    }
  }

  return { default: MockWebSocket };
});

import { streamTranscript } from '../listen.js';
import type { OnSegmentCallback } from '../listen.js';
import type { TranscriptSegment } from '../models.js';

// ---------------------------------------------------------------------------
// Test-local helpers to get/reset mock instances
// ---------------------------------------------------------------------------

function getMockInstances(): Array<{ simulateMessage(r: string): void; emit(e: string, ...a: unknown[]): void }> {
  return ((globalThis as Record<string, unknown>).__mockWsInstances as Array<{ simulateMessage(r: string): void; emit(e: string, ...a: unknown[]): void }>) ?? [];
}

function clearMockInstances() {
  (globalThis as Record<string, unknown>).__mockWsInstances = [];
}

function lastInstance() {
  const instances = getMockInstances();
  return instances[instances.length - 1];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTranscriptMessage(options: {
  is_final: boolean;
  words?: Array<{ text: string; start_time: number; end_time: number }>;
  speaker?: string | null;
  type?: string;
}) {
  const { is_final, words, speaker, type = 'transcript' } = options;
  return JSON.stringify({
    type,
    data: {
      original_transcript_id: 1,
      speaker: speaker !== undefined ? speaker : 'Alice',
      speaker_id: 1,
      words: words ?? [
        { text: 'hello', start_time: 0.0, end_time: 0.5 },
        { text: 'world', start_time: 0.6, end_time: 1.0 },
      ],
      is_final,
      language: 'en',
    },
  });
}

/**
 * Run streamTranscript, send messages, then cleanly close.
 * Returns all (segment, isFinal) pairs received by the callback.
 */
async function captureSegments(
  messagesToSend: string[],
): Promise<Array<{ segment: TranscriptSegment; isFinal: boolean }>> {
  const captured: Array<{ segment: TranscriptSegment; isFinal: boolean }> = [];

  const callback: OnSegmentCallback = async (segment, isFinal) => {
    captured.push({ segment, isFinal });
  };

  const promise = streamTranscript('ws://test', 'api-key', callback);

  // Yield so the WS constructor runs and the instance is stored
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const ws = lastInstance();

  for (const msg of messagesToSend) {
    ws.simulateMessage(msg);
  }

  ws.emit('close', 1000);
  await promise;

  return captured;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listen.ts — handleMessage via WebSocket mock', () => {
  beforeEach(() => {
    clearMockInstances();
  });

  it('forwards partial transcripts with isFinal=false', async () => {
    const msg = makeTranscriptMessage({ is_final: false });
    const captured = await captureSegments([msg]);

    expect(captured).toHaveLength(1);
    expect(captured[0].isFinal).toBe(false);
    expect(captured[0].segment.text).toBe('hello world');
    expect(captured[0].segment.speaker).toBe('Alice');
  });

  it('forwards final transcripts with isFinal=true', async () => {
    const msg = makeTranscriptMessage({ is_final: true });
    const captured = await captureSegments([msg]);

    expect(captured).toHaveLength(1);
    expect(captured[0].isFinal).toBe(true);
    expect(captured[0].segment.text).toBe('hello world');
  });

  it('forwards both partial and final in correct order', async () => {
    const partial = makeTranscriptMessage({ is_final: false });
    const final = makeTranscriptMessage({ is_final: true });
    const captured = await captureSegments([partial, final]);

    expect(captured).toHaveLength(2);
    expect(captured[0].isFinal).toBe(false);
    expect(captured[1].isFinal).toBe(true);
  });

  it('skips empty word arrays when is_final=false', async () => {
    const msg = makeTranscriptMessage({ is_final: false, words: [] });
    const captured = await captureSegments([msg]);

    expect(captured).toHaveLength(0);
  });

  it('skips empty word arrays when is_final=true', async () => {
    const msg = makeTranscriptMessage({ is_final: true, words: [] });
    const captured = await captureSegments([msg]);

    expect(captured).toHaveLength(0);
  });

  it('skips non-transcript event types', async () => {
    const msg = makeTranscriptMessage({ is_final: true, type: 'audio' });
    const captured = await captureSegments([msg]);

    expect(captured).toHaveLength(0);
  });

  it('handles malformed JSON gracefully — no crash, no callback', async () => {
    const captured = await captureSegments(['not valid json {{{']);

    expect(captured).toHaveLength(0);
  });

  it('handles completely empty message gracefully', async () => {
    const captured = await captureSegments(['']);

    expect(captured).toHaveLength(0);
  });

  it('assembles segment text from words array', async () => {
    const msg = makeTranscriptMessage({
      is_final: true,
      words: [
        { text: 'foo', start_time: 0.0, end_time: 0.2 },
        { text: 'bar', start_time: 0.3, end_time: 0.5 },
        { text: 'baz', start_time: 0.6, end_time: 0.9 },
      ],
    });
    const captured = await captureSegments([msg]);

    expect(captured[0].segment.text).toBe('foo bar baz');
  });

  it('uses first word start_time as segment timestamp', async () => {
    const msg = makeTranscriptMessage({
      is_final: true,
      words: [
        { text: 'first', start_time: 42.5, end_time: 43.0 },
        { text: 'second', start_time: 43.1, end_time: 43.8 },
      ],
    });
    const captured = await captureSegments([msg]);

    expect(captured[0].segment.timestamp).toBe(42.5);
  });

  it('sets speaker to null when speaker field is null', async () => {
    const msg = makeTranscriptMessage({ is_final: true, speaker: null });
    const captured = await captureSegments([msg]);

    expect(captured[0].segment.speaker).toBeNull();
  });

  it('callback errors are caught and do not crash the stream', async () => {
    const callback: OnSegmentCallback = async (_segment, _isFinal) => {
      throw new Error('callback blew up');
    };

    const promise = streamTranscript('ws://test', 'api-key', callback);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const ws = lastInstance();
    ws.simulateMessage(makeTranscriptMessage({ is_final: true }));
    ws.emit('close', 1000);

    await expect(promise).resolves.toBeUndefined();
  });
});
