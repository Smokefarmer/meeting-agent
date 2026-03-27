import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenClawConfig } from './config.js';

// ---------------------------------------------------------------------------
// Hoisted mock functions — vi.hoisted() makes these available to vi.mock()
// factories which are hoisted above all other code at transform time.
// ---------------------------------------------------------------------------

const { mockConvert, mockAxiosPost, mockSendWsAction } = vi.hoisted(() => ({
  mockConvert: vi.fn(),
  mockAxiosPost: vi.fn(),
  mockSendWsAction: vi.fn(),
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
// Mock listen.js (sendWsAction)
// ---------------------------------------------------------------------------

vi.mock('./listen.js', () => ({
  sendWsAction: mockSendWsAction,
}));

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
  skribbyApiKey: 'sk-skribby-test',
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
  const mockSession = { wsConnection: null } as unknown as import('./session.js').MeetingSession;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWsAction.mockImplementation(() => {});
  });

  it('sends chat message via WebSocket action', async () => {
    await sendChatMessage('Hello meeting', mockConfigWithTTS, BOT_ID, mockSession);

    expect(mockSendWsAction).toHaveBeenCalledWith(mockSession, 'chat-message', { content: 'Hello meeting' });
  });

  it('skips when text is empty', async () => {
    await sendChatMessage('', mockConfigWithTTS, BOT_ID, mockSession);

    expect(mockSendWsAction).not.toHaveBeenCalled();
  });

  it('skips when text is whitespace-only', async () => {
    await sendChatMessage('   \n\t  ', mockConfigWithTTS, BOT_ID, mockSession);

    expect(mockSendWsAction).not.toHaveBeenCalled();
  });

  it('warns when no session provided', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(sendChatMessage('Hello', mockConfigWithTTS, BOT_ID)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no session provided'));
    expect(mockSendWsAction).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('does not throw when sendWsAction throws (silent degradation)', async () => {
    mockSendWsAction.mockImplementationOnce(() => { throw new Error('WS error'); });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendChatMessage('Hello', mockConfigWithTTS, BOT_ID, mockSession)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendChatMessage() failed'),
    );

    consoleSpy.mockRestore();
  });

  it('handles non-Error thrown values gracefully', async () => {
    mockSendWsAction.mockImplementationOnce(() => { throw 'string error'; });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendChatMessage('Hello', mockConfigWithTTS, BOT_ID, mockSession)).resolves.toBeUndefined();

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

    const sess = { wsConnection: null } as unknown as import('./session.js').MeetingSession;
    await respond('Hello meeting', mockConfigWithTTS, BOT_ID, sess);

    // Chat message sent via WS
    expect(mockSendWsAction).toHaveBeenCalledWith(sess, 'chat-message', { content: 'Hello meeting' });

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

    // Audio buffer posted to Skribby speak endpoint
    const speakCall = mockAxiosPost.mock.calls.find(
      (call) => (call[0] as string).includes('/speak'),
    );
    expect(speakCall).toBeDefined();
    expect(Buffer.isBuffer(speakCall![1])).toBe(true);
    expect(speakCall![2].headers['Content-Type']).toBe('audio/mpeg');
  });

  // -------------------------------------------------------------------------
  // Chat only (elevenLabsApiKey null)
  // -------------------------------------------------------------------------

  it('sends chat message but skips TTS when elevenLabsApiKey is null', async () => {
    const sess = { wsConnection: null } as unknown as import('./session.js').MeetingSession;
    await respond('Hello meeting', mockConfigChatOnly, BOT_ID, sess);

    // Chat message sent via WS
    expect(mockSendWsAction).toHaveBeenCalledOnce();

    // No TTS
    expect(mockConvert).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Empty text
  // -------------------------------------------------------------------------

  it('skips both chat and TTS when text is empty', async () => {
    await respond('', mockConfigWithTTS, BOT_ID);

    // sendChatMessage returns early for empty text
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
  // Silent degradation: Skribby TTS upload failure
  // -------------------------------------------------------------------------

  it('does not throw when Skribby audio POST fails', async () => {
    const audioBytes = new Uint8Array([0xff, 0xfb]);
    mockConvert.mockResolvedValueOnce(fakeAudioStream(audioBytes));
    mockAxiosPost.mockRejectedValueOnce(new Error('Skribby 503'));
    const sess = { wsConnection: null } as unknown as import('./session.js').MeetingSession;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(respond('Hello', mockConfigWithTTS, BOT_ID, sess)).resolves.toBeUndefined();

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
    const sess = { wsConnection: null } as unknown as import('./session.js').MeetingSession;

    await speakGreeting(mockConfigWithTTS, BOT_ID, sess);

    // Chat message via WS includes instance name
    expect(mockSendWsAction).toHaveBeenCalledWith(sess, 'chat-message', expect.objectContaining({
      content: expect.stringContaining('TestClaw'),
    }));

    // TTS also called
    expect(mockConvert).toHaveBeenCalledOnce();
    const callArgs = mockConvert.mock.calls[0][1];
    expect(callArgs.text).toContain('TestClaw');
  });

  it('sends greeting via chat only when elevenLabsApiKey is null', async () => {
    const sess = { wsConnection: null } as unknown as import('./session.js').MeetingSession;
    await speakGreeting(mockConfigChatOnly, BOT_ID, sess);

    // Chat message sent via WS
    expect(mockSendWsAction).toHaveBeenCalledOnce();

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
