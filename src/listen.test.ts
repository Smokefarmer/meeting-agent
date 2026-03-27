import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { TranscriptSegment } from './models.js';
import type { OnSegmentCallback } from './listen.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket extends EventEmitter {
  readonly url: string;
  readonly options: Record<string, unknown>;

  constructor(url: string, options?: Record<string, unknown>) {
    super();
    this.url = url;
    this.options = options ?? {};
    // store for assertions
    instances.push(this);
  }
}

let instances: MockWebSocket[] = [];

vi.mock('ws', () => ({
  default: vi.fn().mockImplementation((url: string, opts?: Record<string, unknown>) => {
    return new MockWebSocket(url, opts);
  }),
}));

// ---------------------------------------------------------------------------
// Import after mock is set up
// ---------------------------------------------------------------------------

const { streamTranscript } = await import('./listen.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latestWs(): MockWebSocket {
  const ws = instances[instances.length - 1];
  if (!ws) throw new Error('No MockWebSocket instance found');
  return ws;
}

/**
 * Send a Recall.ai transcript event through the WebSocket mock.
 * Matches the RecallTranscriptDataSchema expected by listen.ts.
 */
function sendTranscriptMessage(
  ws: MockWebSocket,
  opts: {
    words: Array<{ text: string; start_time: number; end_time: number }>;
    speaker?: string | null;
    is_final?: boolean;
  },
): void {
  const data = {
    original_transcript_id: 1,
    speaker: opts.speaker ?? null,
    words: opts.words,
    is_final: opts.is_final ?? true,
  };
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'transcript', data })));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('streamTranscript', () => {
  beforeEach(() => {
    instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------------

  it('connects with correct URL and authorization header', () => {
    const onSegment = vi.fn<OnSegmentCallback>();
    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-123/transcript', 'sk-test-key', onSegment);

    const ws = latestWs();
    expect(ws.url).toBe('wss://us-east-1.recall.ai/api/v1/bot/bot-123/transcript');
    expect(ws.options).toEqual(
      expect.objectContaining({
        headers: { Authorization: 'Token sk-test-key' },
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Message parsing
  // -----------------------------------------------------------------------

  it('parses incoming Recall.ai transcript event and calls onSegment', async () => {
    const onSegment = vi.fn<OnSegmentCallback>().mockResolvedValue(undefined);
    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);

    const ws = latestWs();
    sendTranscriptMessage(ws, {
      words: [
        { text: 'Hello', start_time: 1.0, end_time: 1.5 },
        { text: 'world', start_time: 1.5, end_time: 2.0 },
      ],
      speaker: 'Alice',
    });

    // Let microtasks flush
    await vi.advanceTimersByTimeAsync(0);

    expect(onSegment).toHaveBeenCalledOnce();
    const segment: TranscriptSegment = onSegment.mock.calls[0][0];
    expect(segment).toEqual({
      text: 'Hello world',
      speaker: 'Alice',
      timestamp: 1.0,
    });
  });

  it('defaults speaker to null when missing from message', async () => {
    const onSegment = vi.fn<OnSegmentCallback>().mockResolvedValue(undefined);
    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);

    const ws = latestWs();
    sendTranscriptMessage(ws, {
      words: [{ text: 'No', start_time: 2.0, end_time: 2.5 }, { text: 'speaker', start_time: 2.5, end_time: 3.0 }],
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(onSegment).toHaveBeenCalledOnce();
    expect(onSegment.mock.calls[0][0].speaker).toBeNull();
  });

  it('ignores non-final transcript events', async () => {
    const onSegment = vi.fn<OnSegmentCallback>().mockResolvedValue(undefined);
    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);

    const ws = latestWs();
    sendTranscriptMessage(ws, {
      words: [{ text: 'partial', start_time: 0, end_time: 0.5 }],
      is_final: false,
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(onSegment).not.toHaveBeenCalled();
  });

  it('ignores non-transcript event types', async () => {
    const onSegment = vi.fn<OnSegmentCallback>().mockResolvedValue(undefined);
    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);

    const ws = latestWs();
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'status', data: { status: 'active' } })));

    await vi.advanceTimersByTimeAsync(0);

    expect(onSegment).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Malformed messages
  // -----------------------------------------------------------------------

  it('logs error on malformed JSON but does not crash', async () => {
    const onSegment = vi.fn<OnSegmentCallback>();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);
    const ws = latestWs();

    // Send invalid JSON
    ws.emit('message', Buffer.from('not valid json'));

    await vi.advanceTimersByTimeAsync(0);

    expect(onSegment).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to parse transcript message:',
      expect.any(String),
    );

    errorSpy.mockRestore();
  });

  it('logs error on valid JSON that fails Zod validation', async () => {
    const onSegment = vi.fn<OnSegmentCallback>();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);
    const ws = latestWs();

    // Missing required 'words' field — fails RecallTranscriptDataSchema
    ws.emit('message', Buffer.from(JSON.stringify({
      type: 'transcript',
      data: { speaker: 'Bob', is_final: true },
    })));

    await vi.advanceTimersByTimeAsync(0);

    expect(onSegment).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Clean close
  // -----------------------------------------------------------------------

  it('resolves on clean close (code 1000) without reconnecting', async () => {
    const onSegment = vi.fn<OnSegmentCallback>();
    const promise = streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);

    const ws = latestWs();
    ws.emit('close', 1000);

    await expect(promise).resolves.toBeUndefined();
    expect(instances).toHaveLength(1); // no reconnect
  });

  // -----------------------------------------------------------------------
  // Reconnect on unexpected close
  // -----------------------------------------------------------------------

  it('reconnects with exponential backoff on unexpected close (up to 3 times)', async () => {
    const onSegment = vi.fn<OnSegmentCallback>();
    const promise = streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);

    // First connection -- unexpected close
    expect(instances).toHaveLength(1);
    latestWs().emit('close', 1006);

    // Advance past 1s backoff
    await vi.advanceTimersByTimeAsync(1000);
    expect(instances).toHaveLength(2);

    // Second connection -- unexpected close
    latestWs().emit('close', 1006);

    // Advance past 2s backoff
    await vi.advanceTimersByTimeAsync(2000);
    expect(instances).toHaveLength(3);

    // Third connection -- unexpected close
    latestWs().emit('close', 1006);

    // Advance past 4s backoff
    await vi.advanceTimersByTimeAsync(4000);
    expect(instances).toHaveLength(4);

    // Fourth connection -- unexpected close, retries exhausted
    latestWs().emit('close', 1006);

    await expect(promise).rejects.toThrow(
      'WebSocket closed unexpectedly (code 1006) after 3 retries',
    );
  });

  it('reconnects then resolves if subsequent connection closes cleanly', async () => {
    const onSegment = vi.fn<OnSegmentCallback>();
    const promise = streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);

    // First connection -- unexpected close
    latestWs().emit('close', 1006);

    // Advance past 1s backoff
    await vi.advanceTimersByTimeAsync(1000);
    expect(instances).toHaveLength(2);

    // Second connection closes cleanly
    latestWs().emit('close', 1000);

    await expect(promise).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Callback errors
  // -----------------------------------------------------------------------

  it('does not crash when onSegment callback throws', async () => {
    const onSegment = vi.fn<OnSegmentCallback>().mockRejectedValue(new Error('callback boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);
    const ws = latestWs();

    sendTranscriptMessage(ws, {
      words: [{ text: 'test', start_time: 0.5, end_time: 1.0 }],
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(onSegment).toHaveBeenCalledOnce();
    // Stream should still be alive -- verify by sending another message
    sendTranscriptMessage(ws, {
      words: [{ text: 'still', start_time: 0.6, end_time: 0.8 }, { text: 'alive', start_time: 0.8, end_time: 1.0 }],
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(onSegment).toHaveBeenCalledTimes(2);

    errorSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Error event handling
  // -----------------------------------------------------------------------

  it('swallows WebSocket error events without crashing', async () => {
    const onSegment = vi.fn<OnSegmentCallback>();
    streamTranscript('wss://us-east-1.recall.ai/api/v1/bot/bot-1/transcript', 'key', onSegment);

    const ws = latestWs();

    // Should not throw
    ws.emit('error', new Error('connection refused'));

    // The close event follows an error -- trigger reconnect path
    ws.emit('close', 1006);

    await vi.advanceTimersByTimeAsync(1000);
    expect(instances).toHaveLength(2);
  });
});
