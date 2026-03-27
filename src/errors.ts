/**
 * Shared error utilities.
 * Extracted per DRY rule — used by skill.ts, detect.ts, pipeline.ts, converse.ts.
 */

/**
 * Safely extract an error message without leaking internal state.
 * Handles unknown error types from catch blocks.
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
