/**
 * Skribby API: create bot and join a Google Meet call.
 * Returns bot ID and WebSocket URL for real-time transcript streaming.
 */

import axios from 'axios';
import { z } from 'zod';

const SKRIBBY_API_BASE = 'https://platform.skribby.io/api/v1';

/**
 * Zod schema for Skribby API bot creation response.
 */
const SkribbyJoinResponseSchema = z.object({
  id: z.string().min(1),
  websocket_url: z.string().url().nullable().optional(),
  websocket_read_only_url: z.string().url().nullable().optional(),
});

export interface JoinResult {
  botId: string;
  websocketUrl: string | null;
}

export async function joinMeeting(
  meetingUrl: string,
  botName: string,
  apiKey: string,
): Promise<JoinResult> {
  const response = await axios.post(
    `${SKRIBBY_API_BASE}/bot`,
    {
      meeting_url: meetingUrl,
      bot_name: botName,
      service: 'gmeet',
      transcription_model: 'openai/whisper-large-v3',
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );

  const parsed = SkribbyJoinResponseSchema.parse(response.data);
  return {
    botId: parsed.id,
    websocketUrl: parsed.websocket_url ?? parsed.websocket_read_only_url ?? null,
  };
}
