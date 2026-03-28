/**
 * Recall.ai WebSocket: receive live transcript stream.
 * Connects to the websocket_url provided by the Recall.ai bot.
 * Handles Recall.ai event envelope: { type: "transcript", data: { ... } }
 */

import WebSocket from 'ws';
import { z } from 'zod';
import type { TranscriptSegment } from './models.js';

export type OnSegmentCallback = (segment: TranscriptSegment, isFinal: boolean) => Promise<void>;

// ---------------------------------------------------------------------------
// Zod schemas for Recall.ai WebSocket events
// ---------------------------------------------------------------------------

const RecallEventSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});

const RecallWordSchema = z.object({
  text: z.string(),
  start_time: z.number(),
  end_time: z.number(),
});

const RecallTranscriptDataSchema = z.object({
  original_transcript_id: z.number(),
  speaker: z.string().nullable().optional(),
  speaker_id: z.number().optional(),
  words: z.array(RecallWordSchema),
  is_final: z.boolean(),
  language: z.string().optional(),
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
 * Open a WebSocket to Recall.ai and stream transcript segments to the callback.
 * Uses the websocketUrl provided by the Recall.ai bot.
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
        headers: { Authorization: `Token ${apiKey}` },
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
    const event = RecallEventSchema.parse(parsed);

    if (event.type !== 'transcript') return;

    const transcriptData = RecallTranscriptDataSchema.parse(event.data);

    // Skip empty word arrays
    if (transcriptData.words.length === 0) return;

    const text = transcriptData.words.map((w) => w.text).join(' ');
    const timestamp = transcriptData.words[0].start_time;

    const segment: TranscriptSegment = {
      text,
      speaker: transcriptData.speaker ?? null,
      timestamp,
    };

    onSegment(segment, transcriptData.is_final).catch((err: unknown) => {
      console.error('onSegment callback error:', err instanceof Error ? err.message : err);
    });
  } catch (err: unknown) {
    console.error('Failed to parse transcript message:', err instanceof Error ? err.message : err);
  }
}
