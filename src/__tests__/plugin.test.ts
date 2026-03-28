/**
 * Tests for plugin.ts — OpenClaw plugin entry point idempotency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing the module under test.
// The module-level `registered` flag persists across imports so we use
// _resetRegistered() in beforeEach instead of re-importing.

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    instanceName: 'TestBot',
    recallApiKey: 'test-key',
    elevenLabsApiKey: null,
    githubToken: null,
    githubRepo: null,
    telegramBotToken: null,
    telegramChatId: null,
    confidenceThreshold: 0.85,
  }),
}));

vi.mock('../llm.js', () => ({
  createSubagentLlmClient: vi.fn().mockReturnValue({ infer: vi.fn() }),
}));

vi.mock('../webhook-server.js', () => ({
  startWebhookServer: vi.fn(),
  registerSession: vi.fn(),
}));

vi.mock('../webhook-handlers.js', () => ({
  handleTranscriptWebhook: vi.fn().mockResolvedValue(undefined),
  handleBotDoneWebhook: vi.fn().mockResolvedValue(undefined),
  registerSession: vi.fn(),
  unregisterSession: vi.fn(),
  sessions: new Map(),
}));

vi.mock('../session.js', () => ({
  MeetingSession: vi.fn().mockImplementation((url: string, cfg: unknown) => ({
    meetingId: 'mock-meeting-id',
    url,
    config: cfg,
    botId: null,
    websocketUrl: null,
    transcriptBuffer: [],
    intents: [],
    createdIssues: [],
    decisions: [],
    isActive: true,
    startTime: new Date(),
    addSegment: vi.fn(),
    addIntent: vi.fn(),
    addCreatedIssue: vi.fn(),
    getTranscriptText: vi.fn().mockReturnValue(''),
    end: vi.fn(),
  })),
}));

vi.mock('../join.js', () => ({
  joinMeeting: vi.fn().mockResolvedValue({
    botId: 'bot-abc-123',
    websocketUrl: null,
  }),
}));

vi.mock('../pipeline.js', () => ({
  runPipeline: vi.fn().mockReturnValue(Promise.resolve()),
}));

vi.mock('../errors.js', () => ({
  safeErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

import { loadConfig } from '../config.js';
import { startWebhookServer } from '../webhook-server.js';
import { handleTranscriptWebhook, handleBotDoneWebhook } from '../webhook-handlers.js';
import { registerMeetingClaw, _resetRegistered, extractMeetUrl } from '../plugin.js';
import type { PluginApi, ToolDefinition, HttpRouteDefinition } from '../llm.js';

function createMockApi(): PluginApi {
  return {
    runtime: {
      subagent: {
        run: vi.fn(),
        waitForRun: vi.fn(),
        getSessionMessages: vi.fn(),
        deleteSession: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

function createMockApiWithTools(): PluginApi & {
  registerTool: ReturnType<typeof vi.fn>;
  registerHttpRoute: ReturnType<typeof vi.fn>;
} {
  return {
    ...createMockApi(),
    registerTool: vi.fn(),
    registerHttpRoute: vi.fn(),
  };
}

describe('registerMeetingClaw', () => {
  beforeEach(() => {
    _resetRegistered();
    vi.clearAllMocks();
    // Restore default mock return value after clearAllMocks resets it
    vi.mocked(loadConfig).mockReturnValue({
      instanceName: 'TestBot',
      recallApiKey: 'test-key',
      elevenLabsApiKey: null,
      githubToken: null,
      githubRepo: null,
      telegramBotToken: null,
      telegramChatId: null,
      confidenceThreshold: 0.85,
    });
  });

  it('calls loadConfig on first registration', () => {
    const api = createMockApi();

    registerMeetingClaw(api);

    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  it('calls startWebhookServer on first registration', () => {
    const api = createMockApi();

    registerMeetingClaw(api);

    expect(startWebhookServer).toHaveBeenCalledTimes(1);
    expect(startWebhookServer).toHaveBeenCalledWith(4000, expect.any(Object), expect.any(Object));
  });

  it('is idempotent — second call is a no-op', () => {
    const api = createMockApi();

    registerMeetingClaw(api);
    registerMeetingClaw(api);

    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(startWebhookServer).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — third call is also a no-op', () => {
    const api = createMockApi();

    registerMeetingClaw(api);
    registerMeetingClaw(api);
    registerMeetingClaw(api);

    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(startWebhookServer).toHaveBeenCalledTimes(1);
  });

  it('allows re-registration after _resetRegistered', () => {
    const api = createMockApi();

    registerMeetingClaw(api);
    _resetRegistered();
    registerMeetingClaw(api);

    expect(loadConfig).toHaveBeenCalledTimes(2);
    expect(startWebhookServer).toHaveBeenCalledTimes(2);
  });

  it('accepts different api instances across registrations after reset', () => {
    const api1 = createMockApi();
    const api2 = createMockApi();

    registerMeetingClaw(api1);
    _resetRegistered();
    vi.mocked(loadConfig).mockReturnValue({
      instanceName: 'TestBot',
      recallApiKey: 'test-key',
      elevenLabsApiKey: null,
      githubToken: null,
      githubRepo: null,
      telegramBotToken: null,
      telegramChatId: null,
      confidenceThreshold: 0.85,
    });
    registerMeetingClaw(api2);

    // Both calls should have gone through
    expect(startWebhookServer).toHaveBeenCalledTimes(2);
  });

  it('calls api.registerTool when registerTool is available', () => {
    const api = createMockApiWithTools();

    registerMeetingClaw(api);

    expect(api.registerTool).toHaveBeenCalledTimes(1);
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'join_meeting' }),
    );
  });

  it('does not crash when registerTool is undefined', () => {
    const api = createMockApi(); // no registerTool

    expect(() => registerMeetingClaw(api)).not.toThrow();
  });

  it('registers exactly 2 HTTP routes when registerHttpRoute is available', () => {
    const api = createMockApiWithTools();

    registerMeetingClaw(api);

    expect(api.registerHttpRoute).toHaveBeenCalledTimes(2);
  });

  it('registers POST /webhook/transcript route', () => {
    const api = createMockApiWithTools();

    registerMeetingClaw(api);

    const calls = vi.mocked(api.registerHttpRoute).mock.calls;
    const transcriptRoute = calls.find(
      ([def]: [HttpRouteDefinition]) => def.path === '/webhook/transcript',
    );
    expect(transcriptRoute).toBeDefined();
    expect(transcriptRoute![0].method).toBe('POST');
  });

  it('registers POST /webhook/bot-done route', () => {
    const api = createMockApiWithTools();

    registerMeetingClaw(api);

    const calls = vi.mocked(api.registerHttpRoute).mock.calls;
    const botDoneRoute = calls.find(
      ([def]: [HttpRouteDefinition]) => def.path === '/webhook/bot-done',
    );
    expect(botDoneRoute).toBeDefined();
    expect(botDoneRoute![0].method).toBe('POST');
  });

  it('falls back to startWebhookServer when registerHttpRoute is not available', () => {
    const api = createMockApi(); // no registerHttpRoute

    registerMeetingClaw(api);

    expect(startWebhookServer).toHaveBeenCalledTimes(1);
    expect(startWebhookServer).toHaveBeenCalledWith(4000, expect.any(Object), expect.any(Object));
  });

  it('does not call startWebhookServer when registerHttpRoute is available', () => {
    const api = createMockApiWithTools();

    registerMeetingClaw(api);

    expect(startWebhookServer).not.toHaveBeenCalled();
  });

  it('/webhook/transcript handler delegates to handleTranscriptWebhook', async () => {
    const api = createMockApiWithTools();

    registerMeetingClaw(api);

    const calls = vi.mocked(api.registerHttpRoute).mock.calls;
    const [transcriptDef] = calls.find(
      ([def]: [HttpRouteDefinition]) => def.path === '/webhook/transcript',
    )!;

    const result = await transcriptDef.handler({
      body: { event: 'transcript.data' },
      headers: {},
    });

    expect(handleTranscriptWebhook).toHaveBeenCalledWith(
      { event: 'transcript.data' },
      expect.any(Map),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result).toEqual({ status: 200 });
  });

  it('/webhook/bot-done handler delegates to handleBotDoneWebhook', async () => {
    const api = createMockApiWithTools();

    registerMeetingClaw(api);

    const calls = vi.mocked(api.registerHttpRoute).mock.calls;
    const [botDoneDef] = calls.find(
      ([def]: [HttpRouteDefinition]) => def.path === '/webhook/bot-done',
    )!;

    const result = await botDoneDef.handler({
      body: { bot: { id: 'bot-123' } },
      headers: {},
    });

    expect(handleBotDoneWebhook).toHaveBeenCalledWith(
      { bot: { id: 'bot-123' } },
      expect.any(Map),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result).toEqual({ status: 200 });
  });
});

describe('extractMeetUrl', () => {
  it('extracts a valid Google Meet URL from a message', () => {
    const message = 'Join us here: https://meet.google.com/abc-defg-hij';

    const result = extractMeetUrl(message);

    expect(result).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('returns null when no Meet URL is present', () => {
    const result = extractMeetUrl('No meeting link here, just text.');

    expect(result).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractMeetUrl('')).toBeNull();
  });

  it('extracts the URL when it appears mid-sentence', () => {
    const message = 'Please join https://meet.google.com/xyz-abcd-efg for the standup.';

    const result = extractMeetUrl(message);

    expect(result).toBe('https://meet.google.com/xyz-abcd-efg');
  });

  it('returns null for a Zoom URL (not Google Meet)', () => {
    const result = extractMeetUrl('https://zoom.us/j/123456789');

    expect(result).toBeNull();
  });

  it('returns null for a malformed Meet URL missing segment structure', () => {
    // Missing the three-part xxx-xxxx-xxx slug
    const result = extractMeetUrl('https://meet.google.com/toolong');

    expect(result).toBeNull();
  });
});
