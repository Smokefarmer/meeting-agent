/**
 * Bot response delivery — Skribby chat message (primary) + ElevenLabs TTS (optional).
 *
 * sendChatMessage(): Posts text to Google Meet chat via Skribby — works on all plans.
 * speak(): ElevenLabs TTS + Skribby audio injection — requires paid Skribby.
 *
 * CRITICAL: Every public function in this module MUST silently degrade on
 * failure. The meeting pipeline must never crash because response delivery failed.
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import axios from 'axios';
import type { OpenClawConfig } from './config.js';

/** Voice ID from ElevenLabs voice library (paid plan). */
const DEFAULT_VOICE_ID = 'aOcS60CY8CoaVaZfqqb5';

/** Model optimised for lowest latency. */
const TTS_MODEL_ID = 'eleven_turbo_v2_5';

/** Output format suitable for Skribby playback. */
const OUTPUT_FORMAT = 'mp3_44100_128' as const;

/** Max text length for TTS. */
const MAX_TEXT_LENGTH = 200;

const SKRIBBY_BASE_URL = 'https://platform.skribby.io/api/v1';

/**
 * Send a text message into the Google Meet chat via Skribby.
 * Available on all Skribby plans (free included).
 *
 * **Never throws** — all errors are caught and logged.
 */
export async function sendChatMessage(
  text: string,
  config: OpenClawConfig,
  botId: string,
): Promise<void> {
  try {
    if (!text.trim()) return;

    await axios.post(
      `${SKRIBBY_BASE_URL}/bot/${botId}/chat-message`,
      { message: text },
      {
        headers: {
          Authorization: `Bearer ${config.skribbyApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`sendChatMessage() failed (silent degradation): ${message}`);
  }
}

/**
 * Respond to the meeting — sends a chat message (always) and optionally speaks via TTS.
 * Chat message is the primary delivery; TTS is best-effort on top.
 *
 * **Never throws** — all errors are caught and logged.
 */
export async function respond(
  text: string,
  config: OpenClawConfig,
  botId: string,
): Promise<void> {
  // Always send chat message (works on free Skribby)
  await sendChatMessage(text, config, botId);

  // Optionally speak via TTS if ElevenLabs is configured and Skribby paid
  if (config.elevenLabsApiKey) {
    await speakTTS(text, config.elevenLabsApiKey, config.skribbyApiKey, botId);
  }
}

/**
 * Generate TTS audio via ElevenLabs and POST it to Skribby so the meeting
 * participants hear the bot speak. Requires paid Skribby plan.
 *
 * **Never throws** — all errors are caught and logged.
 */
async function speakTTS(
  text: string,
  elevenLabsApiKey: string,
  skribbyApiKey: string,
  botId: string,
): Promise<void> {
  try {
    if (!text.trim()) return;

    const safeText = text.length > MAX_TEXT_LENGTH
      ? text.slice(0, MAX_TEXT_LENGTH)
      : text;

    const client = new ElevenLabsClient({ apiKey: elevenLabsApiKey });

    const audioStream: ReadableStream<Uint8Array> = await client.textToSpeech.convert(
      DEFAULT_VOICE_ID,
      {
        text: safeText,
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
          Authorization: `Bearer ${skribbyApiKey}`,
          'Content-Type': 'audio/mpeg',
        },
        maxBodyLength: 5 * 1024 * 1024,
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`speak() failed (silent degradation): ${message}`);
  }
}

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
 * Send the standard greeting when the bot joins a meeting.
 *
 * **Never throws** — delegates to {@link respond}.
 */
export async function speakGreeting(
  config: OpenClawConfig,
  botId: string,
): Promise<void> {
  await respond(
    `👋 ${config.instanceName} is here. I'll handle action items as we go.`,
    config,
    botId,
  );
}
