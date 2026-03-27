/**
 * In-memory intent deduplication using Jaccard text similarity.
 * Issue #3 — Smokefarmer.
 *
 * Compares new intents against already-seen intents in the session.
 * Uses word-set Jaccard similarity — no external libs needed.
 */

import type { Intent } from './models.js';
import type { MeetingSession } from './session.js';

const SIMILARITY_THRESHOLD = 0.80;

/**
 * Check if an intent is a duplicate of any already-seen intent in the session.
 * Two intents are duplicates if they have the same type AND their text
 * similarity exceeds the threshold.
 */
export function isDuplicate(intent: Intent, session: MeetingSession): boolean {
  return session.intents.some(
    (existing) =>
      existing.type === intent.type &&
      jaccardSimilarity(normalizeText(existing.text), normalizeText(intent.text)) >= SIMILARITY_THRESHOLD,
  );
}

/**
 * Jaccard similarity coefficient on word sets.
 * Returns 0.0 (completely different) to 1.0 (identical word sets).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = toWordSet(a);
  const setB = toWordSet(b);

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const word of setA) {
    if (setB.has(word)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Normalize text for comparison: lowercase, strip punctuation.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert a string to a set of unique words.
 */
function toWordSet(text: string): Set<string> {
  const words = text.split(' ').filter((w) => w.length > 0);
  return new Set(words);
}
