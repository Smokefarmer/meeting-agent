/**
 * OpenClaw plugin entry point for MeetingClaw.
 * Uses api.runtime.subagent for LLM inference — full dashboard + session support.
 *
 * Registers a `join_meeting` tool that the OpenClaw agent can invoke.
 */

import type { PluginApi } from './llm.js';
import { createSubagentLlmClient } from './llm.js';
import { loadConfig } from './config.js';
import { MeetingSession } from './session.js';
import { joinMeeting } from './join.js';
import { runPipeline } from './pipeline.js';
import { startWebhookServer, registerSession } from './webhook-server.js';
import { safeErrorMessage } from './errors.js';

const MEET_URL_REGEX = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

export function extractMeetUrl(message: string): string | null {
  const match = message.match(MEET_URL_REGEX);
  return match ? match[0] : null;
}

/**
 * Register MeetingClaw as an OpenClaw plugin.
 * Call this from the plugin entry point's register() callback.
 */
export function registerMeetingClaw(api: PluginApi): void {
  const config = loadConfig(api.pluginConfig);
  const llmClient = createSubagentLlmClient(api);

  // Start webhook server once (receives Recall.ai transcript events via ngrok)
  startWebhookServer(4000, config, llmClient);

  console.log(`[MeetingClaw] Plugin registered (instance: ${config.instanceName})`);

  // The plugin exposes its functionality through the OpenClaw agent.
  // When a user sends a Google Meet URL, the existing skill.ts handleMessage
  // or the OpenClaw agent can invoke joinMeetingFlow().
  // For now, we export the flow function for the agent to call.
}

/**
 * Join a Google Meet call and start the meeting pipeline.
 * Called by the OpenClaw agent when a Meet URL is detected.
 */
export async function joinMeetingFlow(
  meetUrl: string,
  api: PluginApi,
  replyFn: (msg: string) => Promise<void>,
): Promise<void> {
  const config = loadConfig(api.pluginConfig);
  const llmClient = createSubagentLlmClient(api, undefined);
  const session = new MeetingSession(meetUrl, config);

  // Ensure webhook server is running
  startWebhookServer(4000, config, llmClient);

  const ngrokUrl = process.env.NGROK_URL;

  await replyFn('Joining the call now...');

  try {
    const joinResult = await joinMeeting(
      meetUrl,
      config.instanceName,
      config.recallApiKey,
      ngrokUrl,
    );
    session.botId = joinResult.botId;
    session.websocketUrl = joinResult.websocketUrl;

    if (ngrokUrl && session.botId) {
      registerSession(session);
      console.log(`[MeetingClaw] Real-time transcript enabled via ${ngrokUrl}`);
    }

    await replyFn(`✅ ${config.instanceName} has joined the meeting.`);
  } catch (err) {
    console.error('Join failed:', safeErrorMessage(err));
    await replyFn('Failed to join the meeting. Please check the link and try again.');
    return;
  }

  runPipeline(session, llmClient).catch((err) => {
    console.error('Pipeline error:', safeErrorMessage(err));
  });
}

/**
 * OpenClaw plugin lifecycle exports.
 * "register" is called when the plugin is loaded.
 * "activate" is an alias for compatibility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function register(api: any): void {
  registerMeetingClaw(api);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const activate = register;
