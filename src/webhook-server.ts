/**
 * Recall.ai webhook server — thin Express adapter.
 * Delegates all handler logic to webhook-handlers.ts.
 * Used as a fallback when OpenClaw registerHttpRoute is not available.
 */

import express from 'express';
import type { OpenClawConfig } from './config.js';
import type { MeetingSession } from './session.js';
import type { LlmClient } from './llm.js';
import {
  handleTranscriptWebhook,
  handleBotDoneWebhook,
  verifySignature,
  registerSession as _registerSession,
  unregisterSession as _unregisterSession,
  sessions,
  checkWakeBuffer,
} from './webhook-handlers.js';
import type { SessionState } from './webhook-handlers.js';

export type { SessionState };

let serverStarted = false;

/**
 * Register a session so the webhook server can process its transcript.
 * Delegates to webhook-handlers.ts registerSession.
 */
export function registerSession(session: MeetingSession): void {
  _registerSession(session);
}

export function unregisterSession(botId: string): void {
  _unregisterSession(botId);
}

function createApp(config: OpenClawConfig, llmClient: LlmClient): express.Express {
  const app = express();

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

    await handleTranscriptWebhook(req.body, sessions, config, llmClient);
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

    await handleBotDoneWebhook(req.body, sessions, config, llmClient);
  });

  return app;
}

/**
 * Start the webhook server. No-op if already started.
 */
export function startWebhookServer(port: number, config: OpenClawConfig, llmClient: LlmClient): void {
  if (serverStarted) return;
  serverStarted = true;

  const app = createApp(config, llmClient);
  app.listen(port, () => {
    console.log(`[webhook] Server listening on port ${port}`);
  });
}

// Exported for testing
export { createApp, sessions as _sessions, checkWakeBuffer };
