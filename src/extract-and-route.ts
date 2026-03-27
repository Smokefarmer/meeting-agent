/**
 * Shared extraction + dedup + routing logic.
 * Used by both pipeline.ts (WebSocket) and webhook-server.ts (HTTP webhook).
 */

import type { MeetingSession } from './session.js';
import type { OpenClawConfig } from './config.js';
import { extractIntents } from './detect.js';
import { isDuplicate } from './dedup.js';
import { routeIntent } from './route.js';
/**
 * Extract intents from a transcript chunk, deduplicate, and route to actions.
 * Returns the number of new intents routed.
 */
export async function extractAndRoute(
  chunk: string,
  session: MeetingSession,
  config: OpenClawConfig,
): Promise<number> {
  const intents = await extractIntents(chunk, config);
  let routed = 0;

  for (const intent of intents) {
    if (!isDuplicate(intent, session)) {
      session.addIntent(intent);
      await routeIntent(intent, session, config);
      routed++;
    }
  }

  return routed;
}
