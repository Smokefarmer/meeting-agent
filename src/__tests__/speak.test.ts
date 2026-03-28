/**
 * Tests for speak.ts — ElevenLabs TTS + Recall.ai chat message delivery.
 *
 * Covers:
 *  - Model ID used for TTS (eleven_flash_v2_5)
 *  - Streaming: each chunk POSTed to output_audio immediately
 *  - Silent error handling (never throws)
 *  - Text truncation for both TTS and chat messages
 *  - respond() branching on elevenLabsApiKey presence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OpenClawConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Hoisted mock handles — must be created before vi.mock() factories execute
// ---------------------------------------------------------------------------
const { mockAxiosPost, mockConvert } = vi.hoisted(() => ({
  mockAxiosPost: vi.fn(),
  mockConvert: vi.fn(),
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost,
  },
}));

// Mock ElevenLabs SDK — ElevenLabsClient is a class whose instance exposes
// textToSpeech.convert
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: vi.fn(() => ({
    textToSpeech: {
      convert: mockConvert,
    },
  })),
}));

// Import after mocks are set up
import { sendChatMessage, respond } from '../speak.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

const mockConfig: OpenClawConfig = {
  instanceName: 'TestBot',
  recallApiKey: 'test-recall-key',
  elevenLabsApiKey: 'test-eleven-key',
  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

const BOT_ID = 'bot-abc123';

// ---------------------------------------------------------------------------
// speakTTS (exercised indirectly via respond())
// ---------------------------------------------------------------------------

describe('speakTTS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses eleven_flash_v2_5 model', async () => {
    const chunk = new Uint8Array([1, 2, 3]);
    mockConvert.mockResolvedValue(createMockStream([chunk]));

    await respond('Hello world', mockConfig, BOT_ID);

    expect(mockConvert).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ modelId: 'eleven_flash_v2_5' }),
    );
  });

  it('streams chunks to output_audio — 3 chunks produce 3 POSTs', async () => {
    const chunks = [
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5, 6]),
    ];
    mockConvert.mockResolvedValue(createMockStream(chunks));

    await respond('Hello', mockConfig, BOT_ID);

    const outputAudioCalls = mockAxiosPost.mock.calls.filter((call) =>
      (call[0] as string).includes('output_audio'),
    );
    expect(outputAudioCalls).toHaveLength(3);
  });

  it('handles single-chunk stream — 1 chunk produces 1 output_audio POST', async () => {
    const chunk = new Uint8Array([42]);
    mockConvert.mockResolvedValue(createMockStream([chunk]));

    await respond('Hi', mockConfig, BOT_ID);

    const outputAudioCalls = mockAxiosPost.mock.calls.filter((call) =>
      (call[0] as string).includes('output_audio'),
    );
    expect(outputAudioCalls).toHaveLength(1);
  });

  it('silently handles chunk POST failure — subsequent chunks still sent', async () => {
    const chunks = [
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ];
    mockConvert.mockResolvedValue(createMockStream(chunks));

    mockAxiosPost.mockImplementation((url: string) => {
      if ((url as string).includes('output_audio')) {
        const callCount = mockAxiosPost.mock.calls.filter((c) =>
          (c[0] as string).includes('output_audio'),
        ).length;
        if (callCount === 1) {
          return Promise.reject(new Error('network error'));
        }
      }
      return Promise.resolve({ status: 200 });
    });

    await expect(respond('Hello', mockConfig, BOT_ID)).resolves.toBeUndefined();

    const outputAudioCalls = mockAxiosPost.mock.calls.filter((call) =>
      (call[0] as string).includes('output_audio'),
    );
    expect(outputAudioCalls).toHaveLength(3);
  });

  it('truncates text over MAX_TEXT_LENGTH (200) before calling TTS', async () => {
    const longText = 'a'.repeat(300);
    mockConvert.mockResolvedValue(createMockStream([new Uint8Array([1])]));

    await respond(longText, mockConfig, BOT_ID);

    const [, callArgs] = mockConvert.mock.calls[0] as [string, { text: string }];
    expect(callArgs.text.length).toBeLessThanOrEqual(200);
  });

  it('skips TTS entirely for empty text', async () => {
    await respond('', mockConfig, BOT_ID);

    expect(mockConvert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// respond()
// ---------------------------------------------------------------------------

describe('respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends chat message AND calls TTS when elevenLabsApiKey is set', async () => {
    mockConvert.mockResolvedValue(createMockStream([new Uint8Array([1])]));

    await respond('Hello', mockConfig, BOT_ID);

    const chatCalls = mockAxiosPost.mock.calls.filter((call) =>
      (call[0] as string).includes('send_chat_message'),
    );
    expect(chatCalls).toHaveLength(1);
    expect(mockConvert).toHaveBeenCalledOnce();
  });

  it('sends only chat message when elevenLabsApiKey is null', async () => {
    const configNoTTS: OpenClawConfig = { ...mockConfig, elevenLabsApiKey: null };

    await respond('Hello', configNoTTS, BOT_ID);

    const chatCalls = mockAxiosPost.mock.calls.filter((call) =>
      (call[0] as string).includes('send_chat_message'),
    );
    expect(chatCalls).toHaveLength(1);
    expect(mockConvert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendChatMessage()
// ---------------------------------------------------------------------------

describe('sendChatMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('truncates text over 500 chars and appends ellipsis', async () => {
    const longText = 'b'.repeat(600);

    await sendChatMessage(longText, mockConfig, BOT_ID);

    const [, body] = mockAxiosPost.mock.calls[0] as [string, { message: string }];
    expect(body.message.length).toBe(500);
    expect(body.message.endsWith('…')).toBe(true);
  });

  it('sends the exact message when under 500 chars', async () => {
    const text = 'Short message';

    await sendChatMessage(text, mockConfig, BOT_ID);

    const [, body] = mockAxiosPost.mock.calls[0] as [string, { message: string }];
    expect(body.message).toBe(text);
  });

  it('does not POST for empty text', async () => {
    await sendChatMessage('', mockConfig, BOT_ID);

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });
});
