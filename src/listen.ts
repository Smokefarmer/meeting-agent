/**
 * Skribby WebSocket: receive live transcript stream.
 * Connects to the websocket_url returned by Skribby bot creation response.
 * Handles Skribby's event envelope: { type: "transcript", data: { ... } }
 */

import WebSocket from 'ws';
import { z } from 'zod';
import type { TranscriptSegment } from './models.js';

export type OnSegmentCallback = (segment: TranscriptSegment) => Promise<void>;

// ---------------------------------------------------------------------------
// Zod schemas for Skribby WebSocket events
// ---------------------------------------------------------------------------

// Skribby wraps all events in { type, data }
const SkribbyEventSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});

// Transcript event data
const SkribbyTranscriptDataSchema = z.object({
  text: z.string(),
  speaker: z.string().nullable().optional().default(null),
  timestamp: z.number().optional(),
  is_final: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const CLEAN_CLOSE_CODE = 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open a WebSocket to Skribby and stream transcript segments to the callback.
 * Uses the websocketUrl returned from joinMeeting() — not a hardcoded URL.
 *
 * - Validates every incoming message with Zod before forwarding.
 * - Auto-reconnects with exponential backoff (1s, 2s, 4s) up to 3 retries.
 * - Resolves when the connection closes cleanly (code 1000 — meeting ended).
 * - Rejects only when retries are exhausted after unexpected disconnects.
 */
export async function streamTranscript(
  websocketUrl: string,
  apiKey: string,
  onSegment: OnSegmentCallback,
): Promise<void> {
  let retries = 0;

  const connect = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(websocketUrl, {
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
        // close event always fires after error — reconnect handled there
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
    const event = SkribbyEventSchema.parse(parsed);

    // Only process transcript events
    if (event.type !== 'transcript') return;

    const transcriptData = SkribbyTranscriptDataSchema.parse(event.data);

    // Only forward final segments to avoid duplicates from partial transcripts
    if (transcriptData.is_final === false) return;

    const segment: TranscriptSegment = {
      text: transcriptData.text,
      speaker: transcriptData.speaker ?? null,
      timestamp: transcriptData.timestamp ?? Date.now(),
    };

    onSegment(segment).catch((err: unknown) => {
      console.error('onSegment callback error:', err instanceof Error ? err.message : err);
    });
  } catch (err: unknown) {
    console.error('Failed to parse transcript message:', err instanceof Error ? err.message : err);
  }
}
