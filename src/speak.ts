/**
 * ElevenLabs TTS + Skribby audio injection.
 * Issue #5 — Generates speech from text via ElevenLabs and sends the audio
 * buffer to the Skribby bot so the meeting participants hear confirmations.
 *
 * CRITICAL: Every public function in this module MUST silently degrade on
 * failure.  The meeting pipeline must never crash because TTS failed.
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import axios from 'axios';
import type { OpenClawConfig } from './config.js';

/** Default voice — "Rachel", a clear female narration voice. */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/** Model optimised for lowest latency. */
const TTS_MODEL_ID = 'eleven_turbo_v2_5';

/** Output format suitable for Skribby playback. */
const OUTPUT_FORMAT = 'mp3_44100_128' as const;

/** Warn if text exceeds this character count. */
const MAX_TEXT_LENGTH = 200;

const SKRIBBY_BASE_URL = 'https://platform.skribby.io/api/v1';

/**
 * Collect a web-standard `ReadableStream<Uint8Array>` into a single `Buffer`.
 */
async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks);
}

/**
 * Generate TTS audio via ElevenLabs and POST it to Skribby so the meeting
 * participants hear the bot speak.
 *
 * **Never throws** — all errors are caught and logged.
 */
export async function speak(
  text: string,
  config: OpenClawConfig,
  botId: string,
): Promise<void> {
  try {
    if (!text.trim()) {
      return;
    }

    if (text.length > MAX_TEXT_LENGTH) {
      console.warn(
        `speak(): text is ${text.length} chars (>${MAX_TEXT_LENGTH}). ` +
          'Consider shortening for faster TTS.',
      );
    }

    const client = new ElevenLabsClient({ apiKey: config.elevenLabsApiKey });

    const audioStream: ReadableStream<Uint8Array> = await client.textToSpeech.convert(
      DEFAULT_VOICE_ID,
      {
        text,
        modelId: TTS_MODEL_ID,
        outputFormat: OUTPUT_FORMAT,
      },
    );

    const audioBuffer = await collectStream(audioStream);

    await axios.post(
      `${SKRIBBY_BASE_URL}/bot/${botId}/speak`,
      audioBuffer,
      {
        headers: {
          Authorization: `Bearer ${config.skribbyApiKey}`,
          'Content-Type': 'audio/mpeg',
        },
        maxBodyLength: Infinity,
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`speak() failed (silent degradation): ${message}`);
  }
}

/**
 * Speak the standard greeting when the bot joins a meeting.
 *
 * **Never throws** — delegates to {@link speak} which handles all errors.
 */
export async function speakGreeting(
  config: OpenClawConfig,
  botId: string,
): Promise<void> {
  await speak(
    `${config.instanceName} is here. I'll handle action items as we go.`,
    config,
    botId,
  );
}
