/**
 * Interactive Q&A — detect when the bot is addressed and respond conversationally.
 * Issue #8 — Smokefarmer.
 *
 * Detects wake-word in transcript segments, routes addressed speech to Claude
 * for a conversational response using meeting context, and speaks the answer.
 *
 * Actions returned by Claude (create_issue, schedule_followup) are now
 * executed automatically via the intent router.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { TranscriptSegment } from './models.js';
import type { MeetingSession } from './session.js';
import type { OpenClawConfig } from './config.js';
import { speak } from './speak.js';
import { CONVERSATION_SYSTEM_PROMPT, buildMeetingContext } from './prompts.js';
import { routeIntent } from './route.js';
import { randomUUID } from 'crypto';

const HAIKU_MODEL = 'claude-3-haiku-20240307';
const MAX_TOKENS = 512;
const MAX_RESPONSE_LENGTH = 200;

const ConversationResponseSchema = z.object({
  answer: z.string().min(1),
  action: z.enum(['none', 'create_issue', 'schedule_followup']).default('none'),
  actionDetail: z.string().nullable().default(null),
});

export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;

/**
 * Check if a transcript segment is addressing the bot by name.
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
      const afterWake = segment.text.slice(index + pattern.length).trim();
      // Only trigger if there's actual content after the wake word
      // or the wake word is a direct address like "Hey OpenClaw"
      if (afterWake.length > 0) {
        return afterWake;
      }
      // Wake word at end of segment — might be start of a multi-segment command
      if (index === 0 || text.slice(0, index).trim().length === 0) {
        return '';
      }
    }
  }

  return null;
}

/**
 * Generate a conversational response to a question using meeting context.
 * Returns a structured response with optional action.
 */
export async function generateResponse(
  question: string,
  session: MeetingSession,
  config: OpenClawConfig,
): Promise<ConversationResponse> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const context = buildMeetingContext(session);

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: MAX_TOKENS,
    system: CONVERSATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response');
  }

  return parseConversationResponse(textBlock.text);
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
    return { answer: trimmed.slice(0, MAX_RESPONSE_LENGTH), action: 'none', actionDetail: null };
  }

  return ConversationResponseSchema.parse(raw);
}

/**
 * Execute a conversation action returned by Claude.
 * Converts create_issue → BUG intent, schedule_followup → MEETING_REQUEST intent.
 * Never throws — errors are logged and the meeting continues.
 */
async function executeConversationAction(
  response: ConversationResponse,
  session: MeetingSession,
  config: OpenClawConfig,
): Promise<void> {
  if (response.action === 'none' || !response.actionDetail) return;

  if (response.action === 'create_issue') {
    const intent = {
      id: randomUUID(),
      type: 'BUG' as const,
      text: response.actionDetail,
      owner: null,
      deadline: null,
      priority: 'medium' as const,
      confidence: 1.0, // User explicitly requested — skip threshold check
      sourceQuote: response.actionDetail,
    };
    try {
      await routeIntent(intent, session, config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('converse: create_issue action failed:', message);
    }
    return;
  }

  if (response.action === 'schedule_followup') {
    const intent = {
      id: randomUUID(),
      type: 'MEETING_REQUEST' as const,
      text: response.actionDetail,
      owner: null,
      deadline: null,
      priority: 'medium' as const,
      confidence: 1.0,
      sourceQuote: response.actionDetail,
    };
    try {
      await routeIntent(intent, session, config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('converse: schedule_followup action failed:', message);
    }
  }
}

/**
 * Handle an addressed segment: generate response, speak it, and execute any action.
 * Never throws — errors are logged and the meeting continues.
 */
export async function handleAddressedSpeech(
  question: string,
  session: MeetingSession,
  config: OpenClawConfig,
): Promise<void> {
  if (!session.botId || !question.trim()) return;

  try {
    const response = await generateResponse(question, session, config);

    // Truncate long answers for voice
    const spokenAnswer = response.answer.length > MAX_RESPONSE_LENGTH
      ? response.answer.slice(0, MAX_RESPONSE_LENGTH - 3) + '...'
      : response.answer;

    await speak(spokenAnswer, config, session.botId);

    // Execute any action Claude decided on (fire-and-forget, errors logged internally)
    executeConversationAction(response, session, config).catch((err) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('converse: action execution error:', message);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Q&A response failed:', message);
  }
}
