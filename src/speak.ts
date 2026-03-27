/**
 * Bot response delivery — Recall.ai chat message (primary) + ElevenLabs TTS (optional).
 *
 * sendChatMessage(): Posts text to Google Meet chat via Recall.ai REST API.
 * speakTTS(): ElevenLabs TTS + Recall.ai audio injection.
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

/** Output format suitable for Recall.ai playback. */
const OUTPUT_FORMAT = 'mp3_44100_128' as const;

/** Max text length for TTS. */
const MAX_TEXT_LENGTH = 200;

/** Google Meet chat message character limit. */
const CHAT_MESSAGE_MAX_LENGTH = 500;

const RECALL_BASE_URL = 'https://us-east-1.recall.ai/api/v1';

/**
 * Send a text message into the Google Meet chat via Recall.ai REST API.
 *
 * Google Meet has a 500-character limit — text is truncated with ellipsis
 * if it exceeds that.
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

    const truncated = text.length > CHAT_MESSAGE_MAX_LENGTH
      ? `${text.slice(0, CHAT_MESSAGE_MAX_LENGTH - 1)}…`
      : text;

    await axios.post(
      `${RECALL_BASE_URL}/bot/${botId}/send_chat_message/`,
      { message: truncated },
      {
        headers: {
          Authorization: `Token ${config.recallApiKey}`,
          'Content-Type': 'application/json',
        },
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
  await sendChatMessage(text, config, botId);

  if (config.elevenLabsApiKey) {
    await speakTTS(text, config.elevenLabsApiKey, config.recallApiKey, botId);
  }
}

/**
 * Generate TTS audio via ElevenLabs and POST it to Recall.ai so the meeting
 * participants hear the bot speak.
 *
 * **Never throws** — all errors are caught and logged.
 */
async function speakTTS(
  text: string,
  elevenLabsApiKey: string,
  recallApiKey: string,
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
    const b64Data = audioBuffer.toString('base64');

    await axios.post(
      `${RECALL_BASE_URL}/bot/${botId}/output_audio/`,
      { kind: 'mp3', b64_data: b64Data },
      {
        headers: {
          Authorization: `Token ${recallApiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`speakTTS() failed (silent degradation): ${message}`);
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
    `${config.instanceName} is here. I'll handle action items as we go.`,
    config,
    botId,
  );
}
