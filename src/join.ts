/**
 * Skribby API: create bot and join a Google Meet call.
 * Issue #1 — implementation shared between NostraAI (gateway) and Smokefarmer (join logic).
 */

import axios from 'axios';
import { z } from 'zod';

const SKRIBBY_API_BASE = 'https://platform.skribby.io/api/v1';

/**
 * Zod schema for Skribby API response.
 * Skribby returns an id field for the bot.
 */
const SkribbyJoinResponseSchema = z.object({
  id: z.string().min(1),
});

export async function joinMeeting(
  meetingUrl: string,
  botName: string,
  apiKey: string,
): Promise<string> {
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
  return parsed.id;
}
