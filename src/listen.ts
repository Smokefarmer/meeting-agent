/**
 * Skribby WebSocket: receive live transcript stream.
 * Issue #2 — Smokefarmer.
 * Stub — full implementation in feature/issue-2-websocket-transcript branch.
 */

import type { TranscriptSegment } from './models.js';

export type OnSegmentCallback = (segment: TranscriptSegment) => Promise<void>;

export async function streamTranscript(
  _botId: string,
  _apiKey: string,
  _onSegment: OnSegmentCallback,
): Promise<void> {
  // TODO: Issue #2 — implement WebSocket client with auto-reconnect
  throw new Error('Not implemented — see Issue #2');
}
