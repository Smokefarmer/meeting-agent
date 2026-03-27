/**
 * Recall.ai API: create bot and join a meeting call.
 * Returns bot ID and WebSocket URL for real-time transcript streaming.
 */

import axios from 'axios';
import { z } from 'zod';

const RECALL_API_BASE = 'https://eu-central-1.recall.ai/api/v1';

/**
 * Zod schema for Recall.ai bot creation response.
 */
const RecallJoinResponseSchema = z.object({
  id: z.string().uuid(),
});

export interface JoinResult {
  botId: string;
  websocketUrl: string;
}

export async function joinMeeting(
  meetingUrl: string,
  botName: string,
  apiKey: string,
  webhookUrl?: string,
): Promise<JoinResult> {
  const recordingConfig = webhookUrl ? {
    transcript: {
      provider: {
        recallai_streaming: {
          mode: 'prioritize_low_latency',
          language_code: 'en',
        },
      },
    },
    realtime_endpoints: [
      {
        type: 'webhook',
        url: webhookUrl,
        events: ['transcript.data'],
      },
    ],
  } : undefined;

  const response = await axios.post(
    `${RECALL_API_BASE}/bot/`,
    {
      meeting_url: meetingUrl,
      bot_name: botName,
      ...(recordingConfig ? { recording_config: recordingConfig } : {}),
      // Required to enable on-demand output_audio endpoint for ElevenLabs TTS injection
      automatic_audio_output: {
        in_call_recording: {
          data: {
            kind: 'mp3',
            b64_data: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV6urq6urq6urq6urq6urq6urq6urq6urq6v////////////////////////////////8AAAAATGF2YzU4LjM1AAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA',
          },
        },
      },
    },
    {
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );

  const parsed = RecallJoinResponseSchema.parse(response.data);
  const botId = parsed.id;

  // Wait for bot to be in_call_recording before returning WebSocket URL
  // Recall.ai bot needs time to join the meeting (~10-30s)
  await waitForRecording(botId, apiKey);

  const websocketUrl = `wss://eu-central-1.recall.ai/api/v1/bot/${botId}/transcript`;

  return {
    botId,
    websocketUrl,
  };
}

/**
 * Poll bot status until it reaches 'in_call_recording'.
 * Recall.ai WebSocket only works once the bot is actively recording.
 */
async function waitForRecording(botId: string, apiKey: string, maxWaitMs = 60_000): Promise<void> {
  const interval = 3_000;
  const maxAttempts = Math.ceil(maxWaitMs / interval);

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(interval);
    try {
      const res = await axios.get(`${RECALL_API_BASE}/bot/${botId}/`, {
        headers: { Authorization: `Token ${apiKey}` },
      });
      const status = res.data?.status_changes?.at(-1)?.code ?? res.data?.status;
      console.log(`[Recall.ai] Bot status: ${status}`);
      if (status === 'in_call_recording') return;
      if (status === 'done' || status === 'fatal') throw new Error(`Bot stopped before recording: ${status}`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Bot stopped')) throw err;
      console.warn('[Recall.ai] Status poll error:', err instanceof Error ? err.message : err);
    }
  }
  // Timeout — try anyway
  console.warn('[Recall.ai] Timed out waiting for in_call_recording — connecting anyway');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
