/**
 * Intent router: maps intents to OpenClaw tools (GitHub, Telegram).
 * Issue #4 — NostraAIAgent.
 * Stub — full implementation in feature/issue-4-github-issues branch.
 */

import type { Intent } from './models.js';
import type { MeetingSession } from './session.js';

export async function routeIntent(
  _intent: Intent,
  _session: MeetingSession,
): Promise<void> {
  // TODO: Issue #4 — route to GitHub, Telegram, etc.
  throw new Error('Not implemented — see Issue #4');
}
