/**
 * ElevenLabs TTS + Skribby audio injection.
 * Issue #5 — Smokefarmer.
 * Stub — full implementation in feature/issue-5-elevenlabs-tts branch.
 */

import type { OpenClawConfig } from './config.js';

export async function speak(
  _text: string,
  _config: OpenClawConfig,
): Promise<void> {
  // TODO: Issue #5 — ElevenLabs TTS → Skribby audio output
  // Silent degradation: never throw, always catch
  console.warn('speak() not implemented — see Issue #5');
}
