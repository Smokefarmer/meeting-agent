/**
 * Recall.ai webhook server — receives real-time transcript events and drives the pipeline.
 * Listens on port 4000, exposed via ngrok.
 */

import express from 'express';
import { loadConfig } from './config.js';
import { MeetingSession } from './session.js';
import { extractIntents } from './detect.js';
import { routeIntent } from './route.js';
import { isDuplicate } from './dedup.js';
import { detectWakeWord, handleAddressedSpeech } from './converse.js';
import { generateAndSendSummary } from './summary.js';
import type { TranscriptSegment } from './models.js';

const app = express();
app.use(express.json());

// Active meeting sessions keyed by botId
const sessions = new Map<string, MeetingSession>();

// Rolling transcript buffer per session
const buffers = new Map<string, string>();
const EXTRACTION_INTERVAL_WORDS = 50; // extract after ~50 words
const wordCounts = new Map<string, number>();

const config = loadConfig();

/**
 * Register a session so the webhook server can process its transcript.
 */
export function registerSession(session: MeetingSession): void {
  sessions.set(session.botId!, session);
  buffers.set(session.botId!, '');
  wordCounts.set(session.botId!, 0);
  console.log(`[webhook] Session registered for bot ${session.botId}`);
}

export function unregisterSession(botId: string): void {
  sessions.delete(botId);
  buffers.delete(botId);
  wordCounts.delete(botId);
}

/**
 * POST / — Recall.ai sends transcript.data events here
 */
app.post('/', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately

  const event = req.body;
  if (event?.event !== 'transcript.data') return;

  const botId = event?.data?.bot?.id;
  if (!botId) return;

  const session = sessions.get(botId);
  if (!session) return;

  // Extract text from words array
  const words: Array<{ text: string }> = event?.data?.data?.words ?? [];
  const text = words.map((w) => w.text).join(' ').trim();
  if (!text) return;

  const speakerName: string = event?.data?.data?.participant?.name ?? null;
  const segment: TranscriptSegment = {
    text,
    speaker: speakerName,
    timestamp: Date.now(),
  };

  session.addSegment(segment);
  console.log(`[webhook] ${speakerName ?? 'Unknown'}: ${text}`);

  // Check wake word first
  const question = detectWakeWord(segment, config.instanceName);
  if (question !== null && question.length > 0) {
    console.log(`[webhook] Wake word detected: "${question}"`);
    handleAddressedSpeech(question, session, config).catch(console.error);
    return; // Don't also run intent extraction on this segment
  }

  // Accumulate buffer for intent extraction
  const current = (buffers.get(botId) ?? '') + ' ' + text;
  buffers.set(botId, current);
  const count = (wordCounts.get(botId) ?? 0) + words.length;
  wordCounts.set(botId, count);

  if (count >= EXTRACTION_INTERVAL_WORDS) {
    buffers.set(botId, '');
    wordCounts.set(botId, 0);
    try {
      const intents = await extractIntents(current, config);
      for (const intent of intents) {
        if (!isDuplicate(intent, session)) {
          session.addIntent(intent);
          await routeIntent(intent, session, config);
        }
      }
    } catch (err) {
      console.error('[webhook] Extraction error:', err instanceof Error ? err.message : err);
    }
  }
});

/**
 * POST /bot-done — called when bot leaves the meeting
 */
app.post('/bot-done', async (req, res) => {
  res.sendStatus(200);
  const botId = req.body?.bot?.id;
  if (!botId) return;
  const session = sessions.get(botId);
  if (!session) return;

  // Process any remaining buffer
  const remaining = buffers.get(botId) ?? '';
  if (remaining.trim()) {
    try {
      const intents = await extractIntents(remaining, config);
      for (const intent of intents) {
        if (!isDuplicate(intent, session)) {
          session.addIntent(intent);
          await routeIntent(intent, session, config);
        }
      }
    } catch (err) {
      console.error('[webhook] Final extraction error:', err instanceof Error ? err.message : err);
    }
  }

  await generateAndSendSummary(session, config);
  unregisterSession(botId);
  console.log(`[webhook] Session ended for bot ${botId}`);
});

export function startWebhookServer(port = 4000): void {
  app.listen(port, () => {
    console.log(`[webhook] Server listening on port ${port}`);
  });
}
