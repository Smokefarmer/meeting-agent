/**
 * Pure webhook handler functions — transport-agnostic.
 *
 * Extracted from webhook-server.ts so the same logic can be driven by either:
 * - Express (standalone server, fallback)
 * - OpenClaw registerHttpRoute (gateway, production)
 */

import crypto from 'node:crypto';
import type { OpenClawConfig } from './config.js';
import type { MeetingSession } from './session.js';
import type { TranscriptSegment } from './models.js';
import type { LlmClient } from './llm.js';
import { extractAndRoute } from './extract-and-route.js';
import { detectWakeWord, handleAddressedSpeech } from './converse.js';
import { generateAndSendSummary } from './summary.js';
import { safeErrorMessage } from './errors.js';

const EXTRACTION_INTERVAL_WORDS = 50;

/** Max age of a wake word buffer entry before it's discarded. */
const WAKE_BUFFER_TTL_MS = 5_000;

/** How long a bare wake word waits for a follow-up question. */
const PENDING_WAKE_WORD_TTL_MS = 5_000;

interface WakeBufferEntry {
  text: string;
  speaker: string | null;
  timestamp: number;
}

interface PendingWakeWord {
  speaker: string | null;
  timestamp: number;
}

export interface SessionState {
  session: MeetingSession;
  buffer: string;
  wordCount: number;
  wakeBuffer: WakeBufferEntry[];
  pendingWakeWord: PendingWakeWord | null;
}

/** Active meeting sessions keyed by botId — shared between handlers and plugin routes. */
export const sessions = new Map<string, SessionState>();

/**
 * Register a session so the webhook handlers can process its transcript.
 */
export function registerSession(session: MeetingSession): void {
  if (!session.botId) throw new Error('Cannot register session without botId');
  sessions.set(session.botId, {
    session,
    buffer: '',
    wordCount: 0,
    wakeBuffer: [],
    pendingWakeWord: null,
  });
  console.log(`[webhook] Session registered for bot ${session.botId}`);
}

export function unregisterSession(botId: string): void {
  sessions.delete(botId);
}

/**
 * Verify Recall.ai webhook signature (HMAC-SHA256).
 * Returns true if RECALL_WEBHOOK_SECRET is not set (allows unsigned dev mode).
 */
export function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Check the rolling wake buffer for a wake word.
 * Combines recent segment texts into a single string and runs detection.
 * Handles Recall.ai splitting words mid-character across segments.
 */
export function checkWakeBuffer(
  wakeBuffer: WakeBufferEntry[],
  instanceName: string,
): { question: string; matchedUpTo: number } | null {
  if (wakeBuffer.length === 0) return null;

  for (let start = Math.max(0, wakeBuffer.length - 5); start < wakeBuffer.length; start++) {
    const combined = wakeBuffer.slice(start).map((e) => e.text).join(' ');
    const segment: TranscriptSegment = {
      text: combined,
      speaker: wakeBuffer[wakeBuffer.length - 1].speaker,
      timestamp: wakeBuffer[wakeBuffer.length - 1].timestamp,
    };

    const result = detectWakeWord(segment, instanceName);
    if (result !== null) {
      return { question: result, matchedUpTo: wakeBuffer.length };
    }
  }

  return null;
}

/**
 * Handle a Recall.ai transcript.data webhook body.
 * Mutates the session state stored in the provided sessions map.
 */
export async function handleTranscriptWebhook(
  body: unknown,
  sessionMap: Map<string, SessionState>,
  config: OpenClawConfig,
  llmClient: LlmClient,
): Promise<void> {
  const event = body as Record<string, unknown> | null | undefined;
  if (!event) return;
  if (event['event'] !== 'transcript.data') return;

  const data = event['data'] as Record<string, unknown> | undefined;
  const botId: string | undefined = (data?.['bot'] as Record<string, unknown> | undefined)?.['id'] as string | undefined;
  if (!botId) return;

  const state = sessionMap.get(botId);
  if (!state) return;

  const innerData = data?.['data'] as Record<string, unknown> | undefined;
  const words: Array<{ text: string }> = (innerData?.['words'] as Array<{ text: string }> | undefined) ?? [];
  const text = words.map((w) => w.text).join(' ').trim();
  if (!text) return;

  const speakerName: string | null =
    ((innerData?.['participant'] as Record<string, unknown> | undefined)?.['name'] as string | undefined) ?? null;
  const now = Date.now();
  const segment: TranscriptSegment = {
    text,
    speaker: speakerName,
    timestamp: now,
  };

  state.session.addSegment(segment);
  console.log(`[webhook] ${speakerName ?? 'Unknown'}: ${text}`);

  // --- Wake word detection ---

  // 1. Check if there's a pending wake word waiting for a follow-up question
  if (state.pendingWakeWord) {
    const elapsed = now - state.pendingWakeWord.timestamp;
    if (elapsed < PENDING_WAKE_WORD_TTL_MS) {
      state.pendingWakeWord = null;
      console.log(`[webhook] Pending wake word resolved: "${text}"`);
      handleAddressedSpeech(text, state.session, config, llmClient).catch((err) => {
        console.error('[webhook] Q&A handler failed:', safeErrorMessage(err));
      });
      return;
    }
    state.pendingWakeWord = null;
  }

  // 2. Add to rolling wake buffer and prune old entries
  state.wakeBuffer.push({ text, speaker: speakerName, timestamp: now });
  state.wakeBuffer = state.wakeBuffer.filter((e) => now - e.timestamp < WAKE_BUFFER_TTL_MS);

  // 3. Check combined buffer for wake word (handles mid-word splits)
  const wakeMatch = checkWakeBuffer(state.wakeBuffer, config.instanceName);
  if (wakeMatch) {
    state.wakeBuffer = [];

    if (wakeMatch.question.length > 0) {
      console.log(`[webhook] Wake word + question: "${wakeMatch.question}"`);
      handleAddressedSpeech(wakeMatch.question, state.session, config, llmClient).catch((err) => {
        console.error('[webhook] Q&A handler failed:', safeErrorMessage(err));
      });
    } else {
      console.log(`[webhook] Wake word detected, waiting for question...`);
      state.pendingWakeWord = { speaker: speakerName, timestamp: now };
    }
    return;
  }

  // --- Intent extraction accumulation ---
  state.buffer += ' ' + text;
  state.wordCount += words.length;

  if (state.wordCount >= EXTRACTION_INTERVAL_WORDS) {
    const chunk = state.buffer;
    state.buffer = '';
    state.wordCount = 0;

    try {
      await extractAndRoute(chunk, state.session, config, llmClient);
    } catch (err) {
      console.error('[webhook] Extraction error:', safeErrorMessage(err));
    }
  }
}

/**
 * Handle a Recall.ai bot-done webhook body.
 * Flushes remaining transcript buffer, generates summary, and unregisters session.
 */
export async function handleBotDoneWebhook(
  body: unknown,
  sessionMap: Map<string, SessionState>,
  config: OpenClawConfig,
  llmClient: LlmClient,
): Promise<void> {
  const event = body as Record<string, unknown> | null | undefined;
  if (!event) return;

  const botId: string | undefined =
    ((event['bot'] as Record<string, unknown> | undefined)?.['id'] as string | undefined);
  if (!botId) return;

  const state = sessionMap.get(botId);
  if (!state) return;

  const remaining = state.buffer.trim();
  if (remaining) {
    try {
      await extractAndRoute(remaining, state.session, config, llmClient);
    } catch (err) {
      console.error('[webhook] Final extraction error:', safeErrorMessage(err));
    }
  }

  try {
    await generateAndSendSummary(state.session, config, llmClient);
  } catch (err) {
    console.error('[webhook] Summary generation failed:', safeErrorMessage(err));
  }

  unregisterSession(botId);
  console.log(`[webhook] Session ended for bot ${botId}`);
}
