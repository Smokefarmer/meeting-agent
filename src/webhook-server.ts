/**
 * Recall.ai webhook server — receives real-time transcript events and drives the pipeline.
 * Listens on a configurable port, exposed via ngrok.
 */

import express from 'express';
import crypto from 'node:crypto';
import type { OpenClawConfig } from './config.js';
import type { MeetingSession } from './session.js';
import type { TranscriptSegment } from './models.js';
import { extractAndRoute } from './extract-and-route.js';
import { detectWakeWord, handleAddressedSpeech } from './converse.js';
import { generateAndSendSummary } from './summary.js';
import { safeErrorMessage } from './errors.js';

const EXTRACTION_INTERVAL_WORDS = 50;

interface SessionState {
  session: MeetingSession;
  buffer: string;
  wordCount: number;
}

// Active meeting sessions keyed by botId
const sessions = new Map<string, SessionState>();

let serverStarted = false;

/**
 * Verify Recall.ai webhook signature (HMAC-SHA256).
 * Returns true if RECALL_WEBHOOK_SECRET is not set (allows unsigned dev mode).
 */
function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) return true; // No secret configured — skip verification (dev mode)
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
 * Register a session so the webhook server can process its transcript.
 */
export function registerSession(session: MeetingSession): void {
  if (!session.botId) throw new Error('Cannot register session without botId');
  sessions.set(session.botId, { session, buffer: '', wordCount: 0 });
  console.log(`[webhook] Session registered for bot ${session.botId}`);
}

export function unregisterSession(botId: string): void {
  sessions.delete(botId);
}

function createApp(config: OpenClawConfig): express.Express {
  const app = express();

  // Parse JSON but also keep raw body for signature verification
  app.use(express.json({
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  /**
   * POST / — Recall.ai sends transcript.data events here
   */
  app.post('/', async (req: express.Request & { rawBody?: Buffer }, res: express.Response) => {
    const signature = req.headers['x-recall-signature'] as string | undefined;
    if (!verifySignature(req.rawBody ?? Buffer.alloc(0), signature)) {
      res.sendStatus(401);
      return;
    }

    res.sendStatus(200);

    const event = req.body;
    if (event?.event !== 'transcript.data') return;

    const botId: string | undefined = event?.data?.bot?.id;
    if (!botId) return;

    const state = sessions.get(botId);
    if (!state) return;

    const words: Array<{ text: string }> = event?.data?.data?.words ?? [];
    const text = words.map((w: { text: string }) => w.text).join(' ').trim();
    if (!text) return;

    const speakerName: string | null = event?.data?.data?.participant?.name ?? null;
    const segment: TranscriptSegment = {
      text,
      speaker: speakerName,
      timestamp: Date.now(),
    };

    state.session.addSegment(segment);
    console.log(`[webhook] ${speakerName ?? 'Unknown'}: ${text}`);

    // Check wake word first
    const question = detectWakeWord(segment, config.instanceName);
    if (question !== null && question.length > 0) {
      console.log(`[webhook] Wake word detected: "${question}"`);
      handleAddressedSpeech(question, state.session, config).catch((err) => {
        console.error('[webhook] Q&A handler failed:', safeErrorMessage(err));
      });
      return;
    }

    // Accumulate buffer for intent extraction
    state.buffer += ' ' + text;
    state.wordCount += words.length;

    if (state.wordCount >= EXTRACTION_INTERVAL_WORDS) {
      const chunk = state.buffer;
      state.buffer = '';
      state.wordCount = 0;

      try {
        await extractAndRoute(chunk, state.session, config);
      } catch (err) {
        console.error('[webhook] Extraction error:', safeErrorMessage(err));
      }
    }
  });

  /**
   * POST /bot-done — called when bot leaves the meeting
   */
  app.post('/bot-done', async (req: express.Request & { rawBody?: Buffer }, res: express.Response) => {
    const signature = req.headers['x-recall-signature'] as string | undefined;
    if (!verifySignature(req.rawBody ?? Buffer.alloc(0), signature)) {
      res.sendStatus(401);
      return;
    }

    res.sendStatus(200);

    const botId: string | undefined = req.body?.bot?.id;
    if (!botId) return;

    const state = sessions.get(botId);
    if (!state) return;

    // Process any remaining buffer
    const remaining = state.buffer.trim();
    if (remaining) {
      try {
        await extractAndRoute(remaining, state.session, config);
      } catch (err) {
        console.error('[webhook] Final extraction error:', safeErrorMessage(err));
      }
    }

    try {
      await generateAndSendSummary(state.session, config);
    } catch (err) {
      console.error('[webhook] Summary generation failed:', safeErrorMessage(err));
    }

    unregisterSession(botId);
    console.log(`[webhook] Session ended for bot ${botId}`);
  });

  return app;
}

/**
 * Start the webhook server. No-op if already started.
 */
export function startWebhookServer(port: number, config: OpenClawConfig): void {
  if (serverStarted) return;
  serverStarted = true;

  const app = createApp(config);
  app.listen(port, () => {
    console.log(`[webhook] Server listening on port ${port}`);
  });
}

// Exported for testing
export { createApp, sessions as _sessions };
