/**
 * Tests for llm.ts — LlmClient abstraction (subagent + CLI implementations).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginApi, LlmClient } from '../llm.js';
import { createSubagentLlmClient } from '../llm.js';

function createMockApi(): PluginApi & {
  mockRun: ReturnType<typeof vi.fn>;
  mockWaitForRun: ReturnType<typeof vi.fn>;
  mockGetSessionMessages: ReturnType<typeof vi.fn>;
  mockDeleteSession: ReturnType<typeof vi.fn>;
} {
  const mockRun = vi.fn();
  const mockWaitForRun = vi.fn();
  const mockGetSessionMessages = vi.fn();
  const mockDeleteSession = vi.fn().mockResolvedValue(undefined);

  return {
    runtime: {
      subagent: {
        run: mockRun,
        waitForRun: mockWaitForRun,
        getSessionMessages: mockGetSessionMessages,
        deleteSession: mockDeleteSession,
      },
    },
    mockRun,
    mockWaitForRun,
    mockGetSessionMessages,
    mockDeleteSession,
  };
}

describe('createSubagentLlmClient', () => {
  let api: ReturnType<typeof createMockApi>;
  let client: LlmClient;

  beforeEach(() => {
    api = createMockApi();
    client = createSubagentLlmClient(api, 'test-meeting');
  });

  it('calls subagent run → waitForRun → getSessionMessages and returns text', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [
        { role: 'user', content: 'prompt' },
        { role: 'assistant', content: 'The answer is 42.' },
      ],
    });

    const result = await client.infer('test prompt');

    expect(result).toBe('The answer is 42.');
    expect(api.mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: expect.stringContaining('meetingclaw:test-meeting:llm:'),
        message: 'test prompt',
        deliver: false,
      }),
    );
    expect(api.mockWaitForRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1' }),
    );
  });

  it('extracts text from content block arrays', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'internal thought' },
            { type: 'text', text: 'The visible answer.' },
          ],
        },
      ],
    });

    const result = await client.infer('prompt');

    expect(result).toBe('The visible answer.');
  });

  it('uses unique session keys per call', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'ok' }],
    });

    await client.infer('prompt 1');
    await client.infer('prompt 2');

    const key1 = api.mockRun.mock.calls[0][0].sessionKey;
    const key2 = api.mockRun.mock.calls[1][0].sessionKey;
    expect(key1).not.toBe(key2);
  });

  it('includes meetingId in session key when provided', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'ok' }],
    });

    await client.infer('prompt');

    const key = api.mockRun.mock.calls[0][0].sessionKey;
    expect(key).toContain('test-meeting');
  });

  it('works without meetingId', async () => {
    const clientNoMeeting = createSubagentLlmClient(api);
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'ok' }],
    });

    await clientNoMeeting.infer('prompt');

    const key = api.mockRun.mock.calls[0][0].sessionKey;
    expect(key).toMatch(/^meetingclaw:llm:\d+$/);
  });

  it('throws on subagent timeout', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'timeout' });

    await expect(client.infer('prompt')).rejects.toThrow(
      'LLM inference failed after 3 attempts',
    );
  });

  it('throws on subagent error', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'error', error: 'rate limited' });

    await expect(client.infer('prompt')).rejects.toThrow(
      'LLM inference failed after 3 attempts',
    );
  });

  it('throws on empty response from subagent', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: '' }],
    });

    await expect(client.infer('prompt')).rejects.toThrow(
      'LLM inference failed after 3 attempts',
    );
  });

  it('throws when no assistant message found', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [{ role: 'user', content: 'only user message' }],
    });

    await expect(client.infer('prompt')).rejects.toThrow(
      'LLM inference failed after 3 attempts',
    );
  });

  it('retries on transient failure then succeeds', async () => {
    api.mockRun
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue({ runId: 'run-2' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'recovered' }],
    });

    const result = await client.infer('prompt');

    expect(result).toBe('recovered');
    expect(api.mockRun).toHaveBeenCalledTimes(2);
  });

  it('cleans up session after successful call', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });
    api.mockGetSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'ok' }],
    });

    await client.infer('prompt');

    expect(api.mockDeleteSession).toHaveBeenCalled();
  });
});

describe('inferAndDeliver', () => {
  let api: ReturnType<typeof createMockApi>;
  let client: ReturnType<typeof createSubagentLlmClient>;

  beforeEach(() => {
    api = createMockApi();
    client = createSubagentLlmClient(api, 'test-meeting');
  });

  it('calls subagent.run with deliver:true', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-deliver-1' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });

    await client.inferAndDeliver!('Please send this summary to the user:\n\nHello');

    expect(api.mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        deliver: true,
        message: 'Please send this summary to the user:\n\nHello',
      }),
    );
  });

  it('waits for run but does not call getSessionMessages', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-deliver-2' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });

    await client.inferAndDeliver!('summary prompt');

    expect(api.mockWaitForRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-deliver-2' }),
    );
    expect(api.mockGetSessionMessages).not.toHaveBeenCalled();
  });

  it('resolves to void on success', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-deliver-3' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });

    const result = await client.inferAndDeliver!('prompt');
    expect(result).toBeUndefined();
  });

  it('throws when subagent.run rejects', async () => {
    api.mockRun.mockRejectedValue(new Error('delivery error'));

    await expect(client.inferAndDeliver!('prompt')).rejects.toThrow('delivery error');
  });

  it('uses a unique session key containing the meetingId', async () => {
    api.mockRun.mockResolvedValue({ runId: 'run-deliver-4' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });

    await client.inferAndDeliver!('prompt');

    const key = api.mockRun.mock.calls[0][0].sessionKey as string;
    expect(key).toContain('test-meeting');
    expect(key).toMatch(/^meetingclaw:test-meeting:llm:\d+$/);
  });

  it('uses a session key without meetingId when none provided', async () => {
    const clientNoMeeting = createSubagentLlmClient(api);
    api.mockRun.mockResolvedValue({ runId: 'run-deliver-5' });
    api.mockWaitForRun.mockResolvedValue({ status: 'ok' });

    await clientNoMeeting.inferAndDeliver!('prompt');

    const key = api.mockRun.mock.calls[0][0].sessionKey as string;
    expect(key).toMatch(/^meetingclaw:llm:\d+$/);
  });
});
