/**
 * OpenClaw skill entry point.
 * Handles incoming gateway messages, detects Meet URLs, and boots the pipeline.
 */

import { loadConfig } from './config.js';
import { MeetingSession } from './session.js';
import { joinMeeting } from './join.js';
import { runPipeline } from './pipeline.js';
import { startWebhookServer, registerSession } from './webhook-server.js';
import { safeErrorMessage } from './errors.js';

const MEET_URL_REGEX = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

let webhookServerStarted = false;

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

  // Start webhook server once (receives Recall.ai transcript events)
  if (!webhookServerStarted) {
    startWebhookServer(4000);
    webhookServerStarted = true;
  }

  const ngrokUrl = process.env.NGROK_URL;

  await replyFn('Joining the call now...');

  try {
    const joinResult = await joinMeeting(
      meetUrl,
      config.instanceName,
      config.recallApiKey,
      ngrokUrl, // Pass webhook URL if available — enables real-time transcript
    );
    session.botId = joinResult.botId;
    session.websocketUrl = joinResult.websocketUrl;

    // Register session so webhook server can process its transcript events
    if (ngrokUrl && session.botId) {
      registerSession(session);
      console.log(`[skill] Real-time transcript enabled via ${ngrokUrl}`);
    }

    await replyFn(`✅ ${config.instanceName} has joined the meeting.`);
  } catch (err) {
    console.error('Join failed:', safeErrorMessage(err));
    await replyFn('Failed to join the meeting. Please check the link and try again.');
    return;
  }

  // Run pipeline (handles greeting + post-meeting summary)
  // If ngrokUrl is set, real-time processing happens via webhook server instead
  runPipeline(session).catch((err) => {
    console.error('Pipeline error:', safeErrorMessage(err));
  });
}
