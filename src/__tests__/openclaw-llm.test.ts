/**
 * Tests for openclaw-llm.ts — OpenClaw hooks API LLM client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenClawConfig } from '../config.js';

vi.mock('axios', () => {
  const mockPost = vi.fn();
  return {
    default: {
      post: mockPost,
      isAxiosError: (err: unknown): err is { response?: { status: number }; code?: string } => {
        return err instanceof Error && 'isAxiosError' in err;
      },
    },
  };
});

import axios from 'axios';
import { inferWithOpenClaw } from '../openclaw-llm.js';

const mockPost = vi.mocked(axios.post);

const TEST_CONFIG: OpenClawConfig = {
  instanceName: 'TestBot',
  recallApiKey: 'test-key',
  elevenLabsApiKey: null,
  openclawGatewayPort: 18789,
  openclawHooksToken: 'test-token',
  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

function makeAxiosError(status: number, code?: string): Error & { isAxiosError: boolean; response?: { status: number }; code?: string } {
  const err = new Error(`Request failed with status ${status}`) as Error & { isAxiosError: boolean; response?: { status: number }; code?: string };
  err.isAxiosError = true;
  err.response = { status };
  if (code) err.code = code;
  return err;
}

function makeConnectionError(): Error & { isAxiosError: boolean; code: string } {
  const err = new Error('connect ECONNREFUSED 127.0.0.1:18789') as Error & { isAxiosError: boolean; code: string };
  err.isAxiosError = true;
  err.code = 'ECONNREFUSED';
  return err;
}

describe('inferWithOpenClaw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockReset();
  });

  it('sends correct request to OpenClaw hooks API', async () => {
    mockPost.mockResolvedValueOnce({ data: { response: 'Hello' } });

    await inferWithOpenClaw('test prompt', TEST_CONFIG);

    expect(mockPost).toHaveBeenCalledWith(
      'http://localhost:18789/hooks/agent',
      { message: 'test prompt', deliver: false, timeoutSeconds: 30 },
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('returns the response text on success', async () => {
    mockPost.mockResolvedValueOnce({ data: { response: 'The answer is 42.' } });

    const result = await inferWithOpenClaw('what is the answer?', TEST_CONFIG);

    expect(result).toBe('The answer is 42.');
  });

  it('uses custom port from config', async () => {
    mockPost.mockResolvedValueOnce({ data: { response: 'ok' } });
    const customConfig = { ...TEST_CONFIG, openclawGatewayPort: 9999 };

    await inferWithOpenClaw('test', customConfig);

    expect(mockPost).toHaveBeenCalledWith(
      'http://localhost:9999/hooks/agent',
      expect.anything(),
      expect.anything(),
    );
  });

  it('uses custom token from config', async () => {
    mockPost.mockResolvedValueOnce({ data: { response: 'ok' } });
    const customConfig = { ...TEST_CONFIG, openclawHooksToken: 'my-secret' };

    await inferWithOpenClaw('test', customConfig);

    expect(mockPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-secret',
        }),
      }),
    );
  });

  it('throws on empty response', async () => {
    mockPost.mockResolvedValueOnce({ data: { response: '' } });

    await expect(inferWithOpenClaw('test', TEST_CONFIG)).rejects.toThrow(
      'OpenClaw returned an empty or invalid response',
    );
  });

  it('throws on missing response field', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });

    await expect(inferWithOpenClaw('test', TEST_CONFIG)).rejects.toThrow(
      'OpenClaw returned an empty or invalid response',
    );
  });

  it('retries on 429 and succeeds', async () => {
    mockPost
      .mockRejectedValueOnce(makeAxiosError(429))
      .mockResolvedValueOnce({ data: { response: 'ok after retry' } });

    const result = await inferWithOpenClaw('test', TEST_CONFIG);

    expect(result).toBe('ok after retry');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 and succeeds', async () => {
    mockPost
      .mockRejectedValueOnce(makeAxiosError(503))
      .mockResolvedValueOnce({ data: { response: 'recovered' } });

    const result = await inferWithOpenClaw('test', TEST_CONFIG);

    expect(result).toBe('recovered');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries on 429', async () => {
    mockPost
      .mockRejectedValueOnce(makeAxiosError(429))
      .mockRejectedValueOnce(makeAxiosError(429))
      .mockRejectedValueOnce(makeAxiosError(429));

    await expect(inferWithOpenClaw('test', TEST_CONFIG)).rejects.toThrow(
      'OpenClaw inference failed after 3 attempts',
    );
    expect(mockPost).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on ECONNREFUSED with clear message', async () => {
    mockPost.mockRejectedValueOnce(makeConnectionError());

    await expect(inferWithOpenClaw('test', TEST_CONFIG)).rejects.toThrow(
      'OpenClaw gateway not running on port 18789',
    );
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on non-retryable HTTP error (400)', async () => {
    mockPost.mockRejectedValueOnce(makeAxiosError(400));

    await expect(inferWithOpenClaw('test', TEST_CONFIG)).rejects.toThrow();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on non-retryable HTTP error (401)', async () => {
    mockPost.mockRejectedValueOnce(makeAxiosError(401));

    await expect(inferWithOpenClaw('test', TEST_CONFIG)).rejects.toThrow();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
