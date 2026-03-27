/**
 * Intent extraction from transcript chunks via OpenClaw built-in LLM.
 * Uses the OpenClaw hooks API — no external API key needed.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Intent } from './models.js';
import type { OpenClawConfig } from './config.js';
import { inferWithOpenClaw } from './openclaw-llm.js';
import { EXTRACTION_SYSTEM_PROMPT, wrapTranscript } from './prompts.js';

const IntentTypeEnum = z.enum(['BUG', 'FEATURE', 'TODO', 'DECISION', 'MEETING_REQUEST']);
const PriorityEnum = z.enum(['low', 'medium', 'high', 'critical']);

const RawIntentSchema = z.object({
  type: IntentTypeEnum,
  text: z.string().min(1),
  owner: z.string().nullable().default(null),
  deadline: z.string().nullable().default(null),
  priority: PriorityEnum.default('medium'),
  confidence: z.number().min(0).max(1),
  sourceQuote: z.string().default(''),
});

const ExtractionResponseSchema = z.object({
  items: z.array(RawIntentSchema),
});

export type RawIntent = z.infer<typeof RawIntentSchema>;

/**
 * Extract intents from a transcript chunk using the OpenClaw LLM.
 * Returns only intents above the configured confidence threshold.
 */
export async function extractIntents(
  transcriptChunk: string,
  config: OpenClawConfig,
): Promise<Intent[]> {
  if (transcriptChunk.trim().length === 0) return [];

  const prompt = EXTRACTION_SYSTEM_PROMPT + '\n\n' + wrapTranscript(transcriptChunk);
  const text = await inferWithOpenClaw(prompt, config);
  const parsed = parseExtractionResponse(text);

  return parsed.items
    .filter((item) => item.confidence >= config.confidenceThreshold)
    .map((item) => rawToIntent(item));
}

/**
 * Parse and validate the JSON extraction response.
 * Handles JSON wrapped in markdown code blocks.
 */
export function parseExtractionResponse(text: string): z.infer<typeof ExtractionResponseSchema> {
  const jsonStr = stripMarkdownCodeBlock(text);

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse extraction JSON: ${jsonStr.slice(0, 200)}`);
  }

  return ExtractionResponseSchema.parse(raw);
}

function stripMarkdownCodeBlock(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

function rawToIntent(raw: RawIntent): Intent {
  return {
    id: randomUUID(),
    type: raw.type,
    text: raw.text,
    owner: raw.owner,
    deadline: raw.deadline,
    priority: raw.priority,
    confidence: raw.confidence,
    sourceQuote: raw.sourceQuote,
  };
}
