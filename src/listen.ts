/**
 * Skribby WebSocket: receive live transcript stream.
 * Issue #2 -- connects to Skribby's real-time transcript endpoint,
 * validates incoming messages with Zod, and auto-reconnects on failure.
 */

import WebSocket from 'ws';
import { z } from 'zod';
import type { TranscriptSegment } from './models.js';

export type OnSegmentCallback = (segment: TranscriptSegment) => Promise<void>;

// ---------------------------------------------------------------------------
// Zod schema for incoming Skribby messages
// ---------------------------------------------------------------------------

const SkribbyMessageSchema = z.object({
  text: z.string(),
  speaker: z.string().nullable().default(null),
  timestamp: z.number(),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'wss://api.skribby.io/v1/bots';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const CLEAN_CLOSE_CODE = 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open a WebSocket to Skribby and stream transcript segments to the callback.
 *
 * - Validates every incoming message with Zod before forwarding.
 * - Auto-reconnects with exponential backoff (1 s, 2 s, 4 s) up to 3 retries.
 * - Resolves when the connection closes cleanly (code 1000 -- meeting ended).
 * - Rejects only when retries are exhausted after unexpected disconnects.
 */
export async function streamTranscript(
  botId: string,
  apiKey: string,
  onSegment: OnSegmentCallback,
): Promise<void> {
  let retries = 0;

  const connect = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const url = `${BASE_URL}/${botId}/transcript`;

      const ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        handleMessage(raw, onSegment);
      });

      ws.on('close', (code: number) => {
        if (code === CLEAN_CLOSE_CODE) {
          resolve();
          return;
        }

        // Unexpected close -- attempt reconnect
        if (retries < MAX_RETRIES) {
          const delay = INITIAL_BACKOFF_MS * Math.pow(2, retries);
          retries += 1;
          setTimeout(() => {
            connect().then(resolve, reject);
          }, delay);
        } else {
          reject(new Error(`WebSocket closed unexpectedly (code ${code}) after ${MAX_RETRIES} retries`));
        }
      });

      ws.on('error', () => {
        // The 'close' event always fires after 'error', so reconnect logic
        // is handled there. Swallow the error to prevent unhandled rejection.
      });
    });

  return connect();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function handleMessage(raw: WebSocket.RawData, onSegment: OnSegmentCallback): void {
  try {
    const parsed: unknown = JSON.parse(String(raw));
    const segment = SkribbyMessageSchema.parse(parsed);
    onSegment(segment).catch((err: unknown) => {
      console.error('onSegment callback error:', err instanceof Error ? err.message : err);
    });
  } catch (err: unknown) {
    console.error(
      'Failed to parse transcript message:',
      err instanceof Error ? err.message : err,
    );
  }
}
