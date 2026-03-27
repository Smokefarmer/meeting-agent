/**
 * Skribby API: create bot and join a Google Meet call.
 * Issue #1 — implementation shared between NostraAI (gateway) and Smokefarmer (join logic).
 */

import axios from 'axios';
import { z } from 'zod';

const SKRIBBY_API_BASE = 'https://api.skribby.io/v1';

/**
 * Zod schema for Skribby API response.
 * Skribby returns snake_case (bot_id) — we transform to camelCase.
 */
const SkribbyJoinResponseSchema = z.object({
  bot_id: z.string().min(1),
});

export interface JoinResult {
  botId: string;
}

export async function joinMeeting(
  meetingUrl: string,
  botName: string,
  apiKey: string,
): Promise<string> {
  const response = await axios.post(
    `${SKRIBBY_API_BASE}/bots`,
    {
      meeting_url: meetingUrl,
      bot_display_name: botName,
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
  return parsed.bot_id;
}
