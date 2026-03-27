/**
 * OpenClaw skill entry point.
 * Handles incoming gateway messages, detects Meet URLs, and boots the pipeline.
 */

import type { OpenClawConfig } from './config.js';
import { MeetingSession } from './session.js';
import { joinMeeting } from './join.js';
import { runPipeline } from './pipeline.js';

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

const MEET_URL_REGEX = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

export function extractMeetUrl(message: string): string | null {
  const match = message.match(MEET_URL_REGEX);
  return match ? match[0] : null;
}

export async function handleMessage(
  message: string,
  config: OpenClawConfig,
  replyFn: (msg: string) => Promise<void>,
): Promise<void> {
  const meetUrl = extractMeetUrl(message);
  if (!meetUrl) return;

  const session = new MeetingSession(meetUrl, config);

  await replyFn('Joining the call now...');

  try {
    session.botId = await joinMeeting(meetUrl, config.instanceName, config.skribbyApiKey);
    await replyFn(`${config.instanceName} has joined the meeting.`);
  } catch (err) {
    console.error('Join failed:', safeErrorMessage(err));
    await replyFn('Failed to join meeting. Please check config and try again.');
    return;
  }

  runPipeline(session).catch((err) => {
    console.error('Pipeline error:', safeErrorMessage(err));
  });
}
