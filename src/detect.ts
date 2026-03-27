/**
 * Claude Haiku intent extraction from transcript chunks.
 * Issue #3 — Smokefarmer.
 *
 * Sends transcript chunks to Claude Haiku, parses structured JSON response,
 * validates with Zod, and filters by confidence threshold.
 */

import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Intent } from './models.js';
import type { OpenClawConfig } from './config.js';
import { EXTRACTION_SYSTEM_PROMPT, wrapTranscript } from './prompts.js';

const HAIKU_MODEL = 'claude-3-haiku-20240307';
const MAX_TOKENS = 2048;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

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
 * Extract intents from a transcript chunk using Claude Haiku.
 * Returns only intents above the configured confidence threshold.
 * Retries on transient failures with exponential backoff.
 */
export async function extractIntents(
  transcriptChunk: string,
  config: OpenClawConfig,
): Promise<Intent[]> {
  if (transcriptChunk.trim().length === 0) {
    return [];
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const response = await callWithRetry(client, transcriptChunk);

  const text = extractTextContent(response);
  const parsed = parseExtractionResponse(text);

  return parsed.items
    .filter((item) => item.confidence >= config.confidenceThreshold)
    .map((item) => rawToIntent(item));
}

/**
 * Call Anthropic API with exponential backoff retry on transient errors.
 */
async function callWithRetry(
  client: Anthropic,
  transcriptChunk: string,
): Promise<Anthropic.Message> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: MAX_TOKENS,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: wrapTranscript(transcriptChunk) },
        ],
      });
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === MAX_RETRIES - 1) {
        break;
      }
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw new Error(
    `Intent extraction failed after ${MAX_RETRIES} attempts: ${safeErrorMessage(lastError)}`,
  );
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

/**
 * Extract text content from Anthropic message response.
 */
function extractTextContent(response: Anthropic.Message): string {
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response');
  }
  return textBlock.text;
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

/**
 * Strip markdown code block wrappers if present.
 * Claude sometimes wraps JSON in ```json ... ```
 */
function stripMarkdownCodeBlock(text: string): string {
  const trimmed = text.trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;
}

/**
 * Convert a raw LLM-extracted intent to a full Intent with generated ID.
 * Types are already validated by Zod — no unsafe casts needed.
 */
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
