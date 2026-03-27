/**
 * Recall.ai API: create bot and join a meeting call.
 * Returns bot ID and WebSocket URL for real-time transcript streaming.
 */

import axios from 'axios';
import { z } from 'zod';

const RECALL_API_BASE = 'https://us-east-1.recall.ai/api/v1';

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
  const websocketUrl = `wss://us-east-1.recall.ai/api/v1/bot/${parsed.id}/transcript`;

  return {
    botId: parsed.id,
    websocketUrl,
  };
}
