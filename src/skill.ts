/**
 * OpenClaw skill entry point.
 * Handles incoming gateway messages, detects Meet URLs, and boots the pipeline.
 */

import { loadConfig } from './config.js';
import { MeetingSession } from './session.js';
import { joinMeeting } from './join.js';
import { runPipeline } from './pipeline.js';
import { safeErrorMessage } from './errors.js';

const MEET_URL_REGEX = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

export function extractMeetUrl(message: string): string | null {
  const match = message.match(MEET_URL_REGEX);
  return match ? match[0] : null;
}

export async function handleMessage(
  message: string,
  replyFn: (msg: string) => Promise<void>,
): Promise<void> {
  const meetUrl = extractMeetUrl(message);
  if (!meetUrl) return;

  const config = loadConfig();
  const session = new MeetingSession(meetUrl, config);

  await replyFn('Joining the call now...');

  try {
    const joinResult = await joinMeeting(meetUrl, config.instanceName, config.skribbyApiKey);
    session.botId = joinResult.botId;
    session.websocketUrl = joinResult.websocketUrl;
    await replyFn(`✅ ${config.instanceName} has joined the meeting.`);
  } catch (err) {
    const errorMsg = safeErrorMessage(err);
    console.error('Join failed:', errorMsg);
    await replyFn(`❌ Failed to join meeting: ${errorMsg}`);
    return;
  }

  runPipeline(session).catch((err) => {
    console.error('Pipeline error:', safeErrorMessage(err));
  });
}
