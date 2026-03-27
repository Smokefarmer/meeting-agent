/**
 * Skribby API: create bot and join a Google Meet call.
 * Issue #1 — implementation shared between NostraAI (gateway) and Smokefarmer (join logic).
 */

import axios from 'axios';

const SKRIBBY_API_BASE = 'https://api.skribby.io/v1';

/**
 * Skribby API response shape.
 * Note: Skribby may return snake_case (bot_id) — verify against API docs
 * and add a Zod parse layer when implementing Issue #1.
 */
export interface JoinResult {
  botId: string;
}

export async function joinMeeting(
  meetingUrl: string,
  botName: string,
  apiKey: string,
): Promise<string> {
  const response = await axios.post<JoinResult>(
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

  return response.data.botId;
}
