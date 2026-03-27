/**
 * Google Gemini intent extraction from transcript chunks.
 * Uses gemini-2.0-flash — free tier, fast, good structured extraction.
 */

import { randomUUID } from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import type { Intent } from './models.js';
import type { OpenClawConfig } from './config.js';
import { EXTRACTION_SYSTEM_PROMPT, wrapTranscript } from './prompts.js';

const GEMINI_MODEL = 'gemini-2.0-flash';
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
 * Extract intents from a transcript chunk using Gemini Flash.
 * Returns only intents above the configured confidence threshold.
 */
export async function extractIntents(
  transcriptChunk: string,
  config: OpenClawConfig,
): Promise<Intent[]> {
  if (transcriptChunk.trim().length === 0) return [];

  const text = await callWithRetry(transcriptChunk, config.geminiApiKey);
  const parsed = parseExtractionResponse(text);

  return parsed.items
    .filter((item) => item.confidence >= config.confidenceThreshold)
    .map((item) => rawToIntent(item));
}

async function callWithRetry(chunk: string, apiKey: string): Promise<string> {
  let lastError: unknown;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: EXTRACTION_SYSTEM_PROMPT,
  });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(wrapTranscript(chunk));
      return result.response.text();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(
    `Intent extraction failed after ${MAX_RETRIES} attempts: ${safeErrorMessage(lastError)}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
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
