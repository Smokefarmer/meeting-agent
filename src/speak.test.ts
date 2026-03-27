import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenClawConfig } from './config.js';

// ---------------------------------------------------------------------------
// Hoisted mock functions — vi.hoisted() makes these available to vi.mock()
// factories which are hoisted above all other code at transform time.
// ---------------------------------------------------------------------------

const { mockConvert, mockAxiosPost } = vi.hoisted(() => ({
  mockConvert: vi.fn(),
  mockAxiosPost: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock ElevenLabs SDK
// ---------------------------------------------------------------------------

vi.mock('@elevenlabs/elevenlabs-js', () => {
  return {
    ElevenLabsClient: vi.fn().mockImplementation(() => ({
      textToSpeech: { convert: mockConvert },
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock axios
// ---------------------------------------------------------------------------

vi.mock('axios', () => {
  return {
    default: { post: mockAxiosPost },
  };
});

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------

import { respond, sendChatMessage, speakGreeting } from './speak.js';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Config with ElevenLabs enabled (chat + TTS). */
const mockConfigWithTTS: OpenClawConfig = {
  instanceName: 'TestClaw',
  recallApiKey: 'sk-recall-test',
  elevenLabsApiKey: 'sk-eleven-test',
  geminiApiKey: 'gemini-test-key',
  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

/** Config without ElevenLabs (chat only, no TTS). */
const mockConfigChatOnly: OpenClawConfig = {
  ...mockConfigWithTTS,
  elevenLabsApiKey: null,
};

const BOT_ID = 'bot-123';

/**
 * Build a minimal ReadableStream<Uint8Array> that yields `data` then closes.
 */
function fakeAudioStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// sendChatMessage
// ---------------------------------------------------------------------------

describe('sendChatMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ status: 200 });
  });

  it('sends chat message via Recall.ai REST API', async () => {
    await sendChatMessage('Hello meeting', mockConfigWithTTS, BOT_ID);

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://us-east-1.recall.ai/api/v1/bot/bot-123/send_chat_message/',
      { message: 'Hello meeting' },
      {
        headers: {
          Authorization: 'Token sk-recall-test',
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('skips when text is empty', async () => {
    await sendChatMessage('', mockConfigWithTTS, BOT_ID);

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('skips when text is whitespace-only', async () => {
    await sendChatMessage('   \n\t  ', mockConfigWithTTS, BOT_ID);

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('does not throw when REST API throws (silent degradation)', async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendChatMessage('Hello', mockConfigWithTTS, BOT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendChatMessage() failed'),
    );

    consoleSpy.mockRestore();
  });

  it('handles non-Error thrown values gracefully', async () => {
    mockAxiosPost.mockRejectedValueOnce('string error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendChatMessage('Hello', mockConfigWithTTS, BOT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown error'),
    );

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// respond
// ---------------------------------------------------------------------------

describe('respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ status: 200 });
  });

  // -------------------------------------------------------------------------
  // Chat + TTS (elevenLabsApiKey set)
  // -------------------------------------------------------------------------

  it('sends chat message and TTS audio when elevenLabsApiKey is set', async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33]); // fake MP3 header
    mockConvert.mockResolvedValueOnce(fakeAudioStream(audioBytes));

    await respond('Hello meeting', mockConfigWithTTS, BOT_ID);

    // Chat message sent via REST API
    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://us-east-1.recall.ai/api/v1/bot/bot-123/send_chat_message/',
      { message: 'Hello meeting' },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Token sk-recall-test',
        }),
      }),
    );

    // ElevenLabs client constructed with API key
    expect(ElevenLabsClient).toHaveBeenCalledWith({
      apiKey: 'sk-eleven-test',
    });

    // TTS convert called with correct voice + model
    expect(mockConvert).toHaveBeenCalledOnce();
    expect(mockConvert).toHaveBeenCalledWith(
      'aOcS60CY8CoaVaZfqqb5',
      expect.objectContaining({
        text: 'Hello meeting',
        modelId: 'eleven_turbo_v2_5',
        outputFormat: 'mp3_44100_128',
      }),
    );

    // Audio buffer posted to Recall.ai output_audio endpoint
    const audioCall = mockAxiosPost.mock.calls.find(
      (call) => (call[0] as string).includes('/output_audio/'),
    );
    expect(audioCall).toBeDefined();
    expect(audioCall![1]).toEqual(expect.objectContaining({
      kind: 'mp3',
      b64_data: expect.any(String),
    }));
    expect(audioCall![2].headers['Content-Type']).toBe('application/json');
  });

  // -------------------------------------------------------------------------
  // Chat only (elevenLabsApiKey null)
  // -------------------------------------------------------------------------

  it('sends chat message but skips TTS when elevenLabsApiKey is null', async () => {
    await respond('Hello meeting', mockConfigChatOnly, BOT_ID);

    // Chat message sent via REST
    expect(mockAxiosPost).toHaveBeenCalledOnce();
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/send_chat_message/'),
      expect.any(Object),
      expect.any(Object),
    );

    // No TTS
    expect(mockConvert).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Empty text
  // -------------------------------------------------------------------------

  it('skips both chat and TTS when text is empty', async () => {
    await respond('', mockConfigWithTTS, BOT_ID);

    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockConvert).not.toHaveBeenCalled();
  });

  it('skips both chat and TTS when text is whitespace-only', async () => {
    await respond('   \n\t  ', mockConfigWithTTS, BOT_ID);

    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockConvert).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Silent degradation: ElevenLabs failure
  // -------------------------------------------------------------------------

  it('does not throw when ElevenLabs API fails', async () => {
    mockConvert.mockRejectedValueOnce(new Error('ElevenLabs rate limit'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(respond('Hello', mockConfigWithTTS, BOT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ElevenLabs rate limit'),
    );

    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Silent degradation: Recall.ai audio POST failure
  // -------------------------------------------------------------------------

  it('does not throw when Recall.ai audio POST fails', async () => {
    const audioBytes = new Uint8Array([0xff, 0xfb]);
    mockConvert.mockResolvedValueOnce(fakeAudioStream(audioBytes));
    // First call succeeds (chat message), second fails (audio)
    mockAxiosPost
      .mockResolvedValueOnce({ status: 200 })
      .mockRejectedValueOnce(new Error('Recall 503'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(respond('Hello', mockConfigWithTTS, BOT_ID)).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Silent degradation: non-Error thrown in TTS
  // -------------------------------------------------------------------------

  it('handles non-Error thrown values gracefully in TTS path', async () => {
    mockConvert.mockRejectedValueOnce('string error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(respond('Hello', mockConfigWithTTS, BOT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown error'),
    );

    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Long text truncation (TTS path)
  // -------------------------------------------------------------------------

  it('silently truncates text exceeding 200 characters for TTS', async () => {
    const longText = 'A'.repeat(250);
    mockConvert.mockResolvedValueOnce(fakeAudioStream(new Uint8Array([0x00])));

    await respond(longText, mockConfigWithTTS, BOT_ID);

    expect(mockConvert).toHaveBeenCalledOnce();
    const callArgs = mockConvert.mock.calls[0][1];
    expect(callArgs.text).toHaveLength(200);
    expect(callArgs.text).toBe('A'.repeat(200));
  });

  it('does not truncate text within 200 characters for TTS', async () => {
    const shortText = 'A'.repeat(100);
    mockConvert.mockResolvedValueOnce(fakeAudioStream(new Uint8Array([0x00])));

    await respond(shortText, mockConfigWithTTS, BOT_ID);

    expect(mockConvert).toHaveBeenCalledOnce();
    const callArgs = mockConvert.mock.calls[0][1];
    expect(callArgs.text).toBe(shortText);
    expect(callArgs.text).toHaveLength(100);
  });
});

// ---------------------------------------------------------------------------
// speakGreeting
// ---------------------------------------------------------------------------

describe('speakGreeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ status: 200 });
  });

  it('sends a greeting via respond that includes the instance name', async () => {
    mockConvert.mockResolvedValueOnce(fakeAudioStream(new Uint8Array([0x00])));

    await speakGreeting(mockConfigWithTTS, BOT_ID);

    // Chat message via REST includes instance name
    const chatCall = mockAxiosPost.mock.calls.find(
      (call) => (call[0] as string).includes('/send_chat_message/'),
    );
    expect(chatCall).toBeDefined();
    expect(chatCall![1].message).toContain('TestClaw');

    // TTS also called
    expect(mockConvert).toHaveBeenCalledOnce();
    const callArgs = mockConvert.mock.calls[0][1];
    expect(callArgs.text).toContain('TestClaw');
  });

  it('sends greeting via chat only when elevenLabsApiKey is null', async () => {
    await speakGreeting(mockConfigChatOnly, BOT_ID);

    // Chat message sent via REST
    expect(mockAxiosPost).toHaveBeenCalledOnce();

    // No TTS
    expect(mockConvert).not.toHaveBeenCalled();
  });

  it('does not throw when underlying respond fails', async () => {
    mockConvert.mockRejectedValueOnce(new Error('network down'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(speakGreeting(mockConfigWithTTS, BOT_ID)).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});
