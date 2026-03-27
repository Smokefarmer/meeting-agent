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
): Promise<JoinResult> {
  const response = await axios.post(
    `${RECALL_API_BASE}/bot/`,
    {
      meeting_url: meetingUrl,
      bot_name: botName,
      // Required to enable on-demand output_audio endpoint for ElevenLabs TTS injection
      // See: https://docs.recall.ai/docs/output-audio-in-meetings
      automatic_audio_output: {
        in_call_recording: {
          data: {
            kind: 'mp3',
            // Silent 1s MP3 — placeholder required to unlock output_audio endpoint
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
  const websocketUrl = `wss://eu-central-1.recall.ai/api/v1/bot/${parsed.id}/transcript`;

  return {
    botId: parsed.id,
    websocketUrl,
  };
}
