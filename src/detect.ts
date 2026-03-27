/**
 * Claude Haiku intent extraction from transcript chunks.
 * Issue #3 — Smokefarmer.
 * Stub — full implementation in feature/issue-3-intent-extraction branch.
 */

import type { Intent } from './models.js';
import type { OpenClawConfig } from './config.js';

export async function extractIntents(
  _transcriptChunk: string,
  _config: OpenClawConfig,
): Promise<Intent[]> {
  // TODO: Issue #3 — implement Claude Haiku extraction
  throw new Error('Not implemented — see Issue #3');
}
