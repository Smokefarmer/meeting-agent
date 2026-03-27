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

import { speak, speakGreeting } from './speak.js';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const mockConfig: OpenClawConfig = {
  instanceName: 'TestClaw',
  skribbyApiKey: 'sk-skribby-test',
  elevenLabsApiKey: 'sk-eleven-test',
  anthropicApiKey: 'sk-ant-test',
  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
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
// Tests
// ---------------------------------------------------------------------------

describe('speak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ status: 200 });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('generates TTS audio and posts it to Skribby', async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33]); // fake MP3 header
    mockConvert.mockResolvedValueOnce(fakeAudioStream(audioBytes));

    await speak('Hello meeting', mockConfig, BOT_ID);

    // ElevenLabs client constructed with API key
    expect(ElevenLabsClient).toHaveBeenCalledWith({
      apiKey: 'sk-eleven-test',
    });

    // TTS convert called with correct voice + model
    expect(mockConvert).toHaveBeenCalledOnce();
    expect(mockConvert).toHaveBeenCalledWith(
      'pNInz6obpgDQGcFmaJgB',
      expect.objectContaining({
        text: 'Hello meeting',
        modelId: 'eleven_turbo_v2_5',
        outputFormat: 'mp3_44100_128',
      }),
    );

    // Audio buffer posted to Skribby speak endpoint
    expect(mockAxiosPost).toHaveBeenCalledOnce();
    const [url, body, opts] = mockAxiosPost.mock.calls[0];
    expect(url).toBe('https://platform.skribby.io/api/v1/bot/bot-123/speak');
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(opts.headers['Authorization']).toBe('Bearer sk-skribby-test');
    expect(opts.headers['Content-Type']).toBe('audio/mpeg');
  });

  // -------------------------------------------------------------------------
  // Empty text
  // -------------------------------------------------------------------------

  it('skips without API call when text is empty', async () => {
    await speak('', mockConfig, BOT_ID);

    expect(mockConvert).not.toHaveBeenCalled();
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('skips without API call when text is whitespace-only', async () => {
    await speak('   \n\t  ', mockConfig, BOT_ID);

    expect(mockConvert).not.toHaveBeenCalled();
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Silent degradation: ElevenLabs failure
  // -------------------------------------------------------------------------

  it('does not throw when ElevenLabs API fails', async () => {
    mockConvert.mockRejectedValueOnce(new Error('ElevenLabs rate limit'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(speak('Hello', mockConfig, BOT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ElevenLabs rate limit'),
    );
    expect(mockAxiosPost).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Silent degradation: Skribby failure
  // -------------------------------------------------------------------------

  it('does not throw when Skribby audio POST fails', async () => {
    const audioBytes = new Uint8Array([0xff, 0xfb]);
    mockConvert.mockResolvedValueOnce(fakeAudioStream(audioBytes));
    mockAxiosPost.mockRejectedValueOnce(new Error('Skribby 503'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(speak('Hello', mockConfig, BOT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skribby 503'),
    );

    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Silent degradation: non-Error thrown
  // -------------------------------------------------------------------------

  it('handles non-Error thrown values gracefully', async () => {
    mockConvert.mockRejectedValueOnce('string error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(speak('Hello', mockConfig, BOT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown error'),
    );

    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Long text warning
  // -------------------------------------------------------------------------

  it('logs a warning when text exceeds 200 characters', async () => {
    const longText = 'A'.repeat(250);
    mockConvert.mockResolvedValueOnce(fakeAudioStream(new Uint8Array([0x00])));

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await speak(longText, mockConfig, BOT_ID);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('250 chars'),
    );

    consoleSpy.mockRestore();
  });

  it('does not warn when text is within 200 characters', async () => {
    const shortText = 'A'.repeat(100);
    mockConvert.mockResolvedValueOnce(fakeAudioStream(new Uint8Array([0x00])));

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await speak(shortText, mockConfig, BOT_ID);

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
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

  it('speaks a greeting that includes the instance name', async () => {
    mockConvert.mockResolvedValueOnce(
      fakeAudioStream(new Uint8Array([0x00])),
    );

    await speakGreeting(mockConfig, BOT_ID);

    expect(mockConvert).toHaveBeenCalledOnce();
    const callArgs = mockConvert.mock.calls[0][1];
    expect(callArgs.text).toContain('TestClaw');
    expect(callArgs.text).toContain('action items');
  });

  it('does not throw when underlying speak fails', async () => {
    mockConvert.mockRejectedValueOnce(new Error('network down'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(speakGreeting(mockConfig, BOT_ID)).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});
