/**
 * Interactive Q&A — detect when the bot is addressed and respond conversationally.
 * Issue #8 — Smokefarmer.
 *
 * Detects wake-word in transcript segments, routes addressed speech to Claude
 * for a conversational response using meeting context, and speaks the answer.
 */

import { z } from 'zod';
import type { TranscriptSegment } from './models.js';
import type { MeetingSession } from './session.js';
import type { OpenClawConfig } from './config.js';
import { inferWithClaude } from './claude-llm.js';
import { respond } from './speak.js';
import { CONVERSATION_SYSTEM_PROMPT, buildMeetingContext } from './prompts.js';
const MAX_RESPONSE_LENGTH = 200;
const QA_COOLDOWN_MS = 5_000;
const QA_MAX_PER_SESSION = 30;

const ConversationResponseSchema = z.object({
  answer: z.string().min(1).max(MAX_RESPONSE_LENGTH * 2),
});

export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;

/** Per-session Q&A rate limiting state. */
const sessionCooldowns = new Map<string, { lastCall: number; count: number }>();

/**
 * Check if a transcript segment is addressing the bot by name.
 * Uses word-boundary matching to avoid false triggers on substrings.
 * Returns the text after the wake-word, or null if not addressed.
 */
export function detectWakeWord(
  segment: TranscriptSegment,
  instanceName: string,
): string | null {
  const text = segment.text.toLowerCase();
  const name = instanceName.toLowerCase();

  const patterns = [
    `hey ${name}`,
    `hi ${name}`,
    `ok ${name}`,
    `okay ${name}`,
    name,
  ];

  for (const pattern of patterns) {
    const index = text.indexOf(pattern);
    if (index !== -1) {
      // Word-boundary check: ensure the match isn't part of a longer word
      const charAfter = text[index + pattern.length];
      if (charAfter && /[a-z0-9]/i.test(charAfter)) continue;

      const afterWake = segment.text.slice(index + pattern.length).trim();
      if (afterWake.length > 0) {
        return afterWake;
      }
      if (index === 0 || text.slice(0, index).trim().length === 0) {
        return '';
      }
    }
  }

  return null;
}

/**
 * Generate a conversational response to a question using meeting context.
 */
export async function generateResponse(
  question: string,
  session: MeetingSession,
  _config: OpenClawConfig,
): Promise<ConversationResponse> {
  const context = buildMeetingContext(session);
  const prompt = CONVERSATION_SYSTEM_PROMPT + '\n\n' + context + '\n\nQuestion: ' + question;
  const text = await inferWithClaude(prompt);

  return parseConversationResponse(text);
}

/**
 * Parse and validate the conversation response JSON.
 */
export function parseConversationResponse(text: string): ConversationResponse {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : trimmed;

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    // If Claude didn't return JSON, treat the whole response as the answer
    return { answer: trimmed.slice(0, MAX_RESPONSE_LENGTH) };
  }

  return ConversationResponseSchema.parse(raw);
}

/**
 * Handle an addressed segment: generate response and speak it.
 * Never throws — errors are logged and the meeting continues.
 * Rate-limited: min 5s between calls, max 30 per session.
 */
export async function handleAddressedSpeech(
  question: string,
  session: MeetingSession,
  config: OpenClawConfig,
): Promise<void> {
  if (!session.botId || !question.trim()) return;

  // Rate limiting
  const state = sessionCooldowns.get(session.meetingId) ?? { lastCall: 0, count: 0 };
  const now = Date.now();
  if (now - state.lastCall < QA_COOLDOWN_MS || state.count >= QA_MAX_PER_SESSION) {
    return;
  }
  state.lastCall = now;
  state.count++;
  sessionCooldowns.set(session.meetingId, state);

  try {
    const response = await generateResponse(question, session, config);

    const spokenAnswer = response.answer.length > MAX_RESPONSE_LENGTH
      ? response.answer.slice(0, MAX_RESPONSE_LENGTH - 3) + '...'
      : response.answer;

    await respond(spokenAnswer, config, session.botId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Q&A response failed:', message);
  }
}
