/**
 * Tests for pipeline.ts — runPipeline orchestration.
 * Verifies that partial transcripts only trigger wake-word detection
 * and that final transcripts trigger both wake-word detection and buffer accumulation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OnSegmentCallback } from '../listen.js';
import type { TranscriptSegment } from '../models.js';
import type { MeetingSession } from '../session.js';
import type { LlmClient } from '../llm.js';
import type { OpenClawConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Capture the onSegment callback injected by runPipeline into streamTranscript
// ---------------------------------------------------------------------------

let capturedOnSegment: OnSegmentCallback | null = null;

vi.mock('../listen.js', () => ({
  streamTranscript: vi.fn(async (_url: string, _key: string, onSegment: OnSegmentCallback) => {
    capturedOnSegment = onSegment;
    // Don't resolve — the test will invoke capturedOnSegment manually
    // and then the mock simply returns to simulate clean close
  }),
}));

vi.mock('../extract-and-route.js', () => ({
  extractAndRoute: vi.fn().mockResolvedValue(0),
}));

vi.mock('../summary.js', () => ({
  generateAndSendSummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../converse.js', () => ({
  detectWakeWord: vi.fn().mockReturnValue(null),
  handleAddressedSpeech: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../errors.js', () => ({
  safeErrorMessage: vi.fn((e: unknown) => String(e)),
}));

import { runPipeline } from '../pipeline.js';
import { streamTranscript } from '../listen.js';
import { extractAndRoute } from '../extract-and-route.js';
import { detectWakeWord, handleAddressedSpeech } from '../converse.js';
import { generateAndSendSummary } from '../summary.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG: OpenClawConfig = {
  instanceName: 'TestBot',
  recallApiKey: 'test-key',
  elevenLabsApiKey: null,
  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

function makeSegment(text: string, speaker = 'Alice'): TranscriptSegment {
  return { text, speaker, timestamp: Date.now() };
}

function createMockSession(overrides: Partial<MeetingSession> = {}): MeetingSession {
  return {
    botId: 'bot-1',
    meetingId: 'meeting-1',
    websocketUrl: 'ws://test',
    config: TEST_CONFIG,
    transcriptBuffer: [],
    intents: [],
    createdIssues: [],
    decisions: [],
    isActive: true,
    startTime: new Date(),
    url: 'https://meet.google.com/test',
    addSegment: vi.fn(),
    addIntent: vi.fn(),
    addCreatedIssue: vi.fn(),
    getTranscriptText: vi.fn().mockReturnValue(''),
    startCheckpointing: vi.fn(),
    end: vi.fn(),
    ...overrides,
  } as unknown as MeetingSession;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Runs the pipeline and captures the onSegment callback, then calls the provided
 * fn with it for further assertions.
 */
async function withPipeline(
  session: MeetingSession,
  fn: (onSegment: OnSegmentCallback) => Promise<void>,
): Promise<void> {
  capturedOnSegment = null;

  const pipelinePromise = runPipeline(session, { infer: vi.fn() } as LlmClient);

  // Yield to let streamTranscript mock run and capture the callback
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  if (!capturedOnSegment) {
    throw new Error('onSegment was not captured — streamTranscript mock may not have run');
  }

  await fn(capturedOnSegment);

  // Wait for async pipeline teardown
  await pipelinePromise;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pipeline.ts — onSegment callback', () => {
  let session: MeetingSession;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnSegment = null;
    session = createMockSession();
    vi.mocked(detectWakeWord).mockReturnValue(null);
    vi.mocked(extractAndRoute).mockResolvedValue(0);
  });

  it('partial transcripts trigger wake word detection', async () => {
    await withPipeline(session, async (onSegment) => {
      const segment = makeSegment('hey TestBot what is the plan');
      await onSegment(segment, false);
    });

    expect(detectWakeWord).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hey TestBot what is the plan' }),
      TEST_CONFIG.instanceName,
    );
  });

  it('partial transcripts do NOT trigger extraction', async () => {
    // Make the buffer large enough that it would normally trigger extraction
    const longText = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');

    await withPipeline(session, async (onSegment) => {
      await onSegment(makeSegment(longText), false);
    });

    expect(extractAndRoute).not.toHaveBeenCalled();
  });

  it('final transcripts trigger wake word detection', async () => {
    await withPipeline(session, async (onSegment) => {
      await onSegment(makeSegment('hey TestBot how are things'), true);
    });

    expect(detectWakeWord).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hey TestBot how are things' }),
      TEST_CONFIG.instanceName,
    );
  });

  it('final transcripts add to extraction buffer (and extract when threshold met)', async () => {
    // Enough text to exceed MIN_BUFFER_LENGTH (100 chars) but extraction also requires
    // EXTRACTION_INTERVAL_MS (30s) — mock Date.now to override time gating
    const originalDateNow = Date.now;
    let fakeNow = 0;
    Date.now = () => fakeNow;

    try {
      fakeNow = 0; // start time

      await withPipeline(session, async (onSegment) => {
        // Jump time forward past the interval so the time gate passes
        fakeNow = 31_000;

        const longText = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
        await onSegment(makeSegment(longText), true);
      });

      expect(extractAndRoute).toHaveBeenCalled();
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('partial transcripts do NOT add to extraction buffer', async () => {
    const originalDateNow = Date.now;
    let fakeNow = 0;
    Date.now = () => fakeNow;

    try {
      fakeNow = 0;

      await withPipeline(session, async (onSegment) => {
        fakeNow = 31_000;

        // Send many partial segments — none should accumulate for extraction
        const longText = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
        await onSegment(makeSegment(longText), false);
        await onSegment(makeSegment(longText), false);
        await onSegment(makeSegment(longText), false);
      });

      // Buffer should be empty so extraction should not fire
      expect(extractAndRoute).not.toHaveBeenCalled();
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('duplicate wake word on partials only fires handleAddressedSpeech once', async () => {
    vi.mocked(detectWakeWord).mockReturnValue('what is the status');

    await withPipeline(session, async (onSegment) => {
      const segment = makeSegment('hey TestBot what is the status');
      // Two partial segments with the same wake word
      await onSegment(segment, false);
      await onSegment(segment, false);
    });

    // Wait for async handleAddressedSpeech calls
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(handleAddressedSpeech).toHaveBeenCalledTimes(1);
  });

  it('wake word flag resets when a final transcript arrives', async () => {
    vi.mocked(detectWakeWord).mockReturnValue('question here');

    await withPipeline(session, async (onSegment) => {
      const segment = makeSegment('hey TestBot question here');

      // First partial fires the wake word
      await onSegment(segment, false);

      // A final segment resets the dedup flag
      await onSegment(makeSegment('unrelated final'), true);

      // Now a second partial with the same wake word should fire again
      await onSegment(segment, false);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // First partial + second partial (after reset) = 2 calls
    expect(handleAddressedSpeech).toHaveBeenCalledTimes(2);
  });

  it('handleAddressedSpeech is not called when detectWakeWord returns null', async () => {
    vi.mocked(detectWakeWord).mockReturnValue(null);

    await withPipeline(session, async (onSegment) => {
      await onSegment(makeSegment('just regular speech'), false);
      await onSegment(makeSegment('more regular speech'), true);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(handleAddressedSpeech).not.toHaveBeenCalled();
  });

  it('handleAddressedSpeech is called with the question text from a partial wake word', async () => {
    vi.mocked(detectWakeWord).mockReturnValue('can you summarize');

    await withPipeline(session, async (onSegment) => {
      // Partials are the primary wake-word path — they fire handleAddressedSpeech
      await onSegment(makeSegment('hey TestBot can you summarize'), false);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(handleAddressedSpeech).toHaveBeenCalledWith(
      'can you summarize',
      session,
      TEST_CONFIG,
      expect.anything(),
    );
  });

  it('addSegment is called for final transcripts', async () => {
    await withPipeline(session, async (onSegment) => {
      await onSegment(makeSegment('hello world'), true);
    });

    expect(session.addSegment).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello world' }),
    );
  });

  it('addSegment is NOT called for partial transcripts', async () => {
    await withPipeline(session, async (onSegment) => {
      await onSegment(makeSegment('partial speech'), false);
    });

    expect(session.addSegment).not.toHaveBeenCalled();
  });

  it('session.end() is called after streaming completes', async () => {
    await withPipeline(session, async (_onSegment) => {
      // no-op
    });

    expect(session.end).toHaveBeenCalled();
  });

  it('summary is generated after streaming completes', async () => {
    await withPipeline(session, async (_onSegment) => {
      // no-op
    });

    expect(generateAndSendSummary).toHaveBeenCalledWith(session, TEST_CONFIG, expect.objectContaining({ infer: expect.any(Function) }));
  });

  it('throws when session has no botId', async () => {
    const noBot = createMockSession({ botId: null });

    await expect(runPipeline(noBot, { infer: vi.fn() } as LlmClient)).rejects.toThrow(
      'Cannot run pipeline: session has no botId',
    );
  });
});
