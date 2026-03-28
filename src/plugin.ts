/**
 * OpenClaw plugin entry point for MeetingClaw.
 * Uses api.runtime.subagent for LLM inference — full dashboard + session support.
 *
 * Registers a `join_meeting` tool that the OpenClaw agent can invoke.
 * Registers HTTP routes via OpenClaw gateway when available, otherwise falls back
 * to a standalone Express server (needs ngrok).
 */

import type { PluginApi } from './llm.js';
import { createSubagentLlmClient } from './llm.js';
import { loadConfig } from './config.js';
import { MeetingSession } from './session.js';
import { joinMeeting } from './join.js';
import { runPipeline } from './pipeline.js';
import { startWebhookServer, registerSession } from './webhook-server.js';
import {
  handleTranscriptWebhook,
  handleBotDoneWebhook,
  sessions,
} from './webhook-handlers.js';
import { safeErrorMessage } from './errors.js';

const MEET_URL_REGEX = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

let registered = false;

export function extractMeetUrl(message: string): string | null {
  const match = message.match(MEET_URL_REGEX);
  return match ? match[0] : null;
}

/** Reset registration flag (for tests only). */
export function _resetRegistered(): void {
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    throw new Error('_resetRegistered is only available in test environments');
  }
  registered = false;
}

/**
 * Register MeetingClaw as an OpenClaw plugin.
 * Idempotent — repeated calls are no-ops.
 */
export function registerMeetingClaw(api: PluginApi): void {
  if (registered) return;
  registered = true;

  const config = loadConfig(api.pluginConfig);
  const llmClient = createSubagentLlmClient(api);

  // Register the join_meeting tool if the platform supports it
  if (api.registerTool) {
    api.registerTool({
      name: 'join_meeting',
      label: 'Join Meeting',
      description: 'Join a Google Meet call and start listening for action items, bugs, features, and decisions',
      parameters: {
        type: 'object',
        properties: {
          meeting_url: {
            type: 'string',
            description: 'Google Meet URL (e.g. https://meet.google.com/abc-defg-hij)',
          },
        },
        required: ['meeting_url'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const meetUrl = String(params['meeting_url'] ?? '');
        await joinMeetingFlow(meetUrl, api, async (msg) => {
          console.log(`[MeetingClaw] ${msg}`);
        });
        return {
          content: [{ type: 'text' as const, text: `Joined meeting: ${meetUrl}` }],
          details: { status: 'joined', meeting_url: meetUrl },
        };
      },
    } as any);
  }

  // Register HTTP routes via OpenClaw gateway, or fall back to Express
  if (api.registerHttpRoute) {
    api.registerHttpRoute({
      method: 'POST',
      path: '/webhook/transcript',
      handler: async (req) => {
        await handleTranscriptWebhook(req.body, sessions, config, llmClient);
        return { status: 200 };
      },
    });

    api.registerHttpRoute({
      method: 'POST',
      path: '/webhook/bot-done',
      handler: async (req) => {
        await handleBotDoneWebhook(req.body, sessions, config, llmClient);
        return { status: 200 };
      },
    });
  } else {
    // Fallback: standalone Express server (needs ngrok)
    startWebhookServer(4000, config, llmClient);
  }

  console.log(`[MeetingClaw] Plugin registered (instance: ${config.instanceName})`);
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
  const session = new MeetingSession(meetUrl, config);
  const llmClient = createSubagentLlmClient(api, session.meetingId);

  const ngrokUrl = config.ngrokUrl ?? undefined;

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

    await replyFn(`${config.instanceName} has joined the meeting.`);
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
