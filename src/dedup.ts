/**
 * In-memory intent deduplication using text similarity.
 * Issue #3 — Smokefarmer.
 * Stub — full implementation in feature/issue-3-intent-extraction branch.
 */

import type { Intent } from './models.js';
import type { MeetingSession } from './session.js';

export function isDuplicate(_intent: Intent, _session: MeetingSession): boolean {
  // TODO: Issue #3 — Jaccard similarity on word sets, threshold 0.80
  return false;
}
