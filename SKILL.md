---
name: meeting_claw
description: >
  MeetingClaw — joins a live Google Meet call as an AI participant. Listens to the conversation in real time, detects bugs, tasks, features, and decisions, creates GitHub issues automatically, speaks confirmations back into the call via ElevenLabs voice, and sends a summary when the meeting ends.
  Activate when a user sends a message containing a Google Meet URL (meet.google.com/...) and wants the bot to join the call.
  Examples: "join this meeting: meet.google.com/abc-defg-hij", "can you join meet.google.com/xxx", "please join this call: https://meet.google.com/abc-defg-hij"
metadata:
  openclaw:
    emoji: "🎙️"
---

# MeetingClaw Skill

MeetingClaw joins live Google Meet calls as an AI participant. It listens, acts, and speaks back.

## When to activate

Activate when the user's message contains a Google Meet URL (`meet.google.com/...`) and they want the bot to join the call.

Trigger phrases (examples):
- "join this meeting: meet.google.com/abc-defg-hij"
- "can you join https://meet.google.com/xxx-yyyy-zzz"
- "please join this call"
- Any message containing a `meet.google.com/` URL

## What this skill does

1. Extracts the Google Meet URL from the user's message
2. Invokes the `join_meeting` tool registered by the OpenClaw plugin
3. Bot joins the call via Recall.ai API as a named participant
4. Listens to live transcript via Recall.ai webhook events
5. Extracts intents (BUG, FEATURE, TODO, DECISION) via Claude Haiku
6. Creates GitHub issues automatically for BUG/FEATURE intents
7. Speaks confirmations back into the call via ElevenLabs TTS
8. Sends a summary to the user when the meeting ends

## Plugin mode

MeetingClaw runs as an OpenClaw plugin. On load, `plugin.ts` calls `registerMeetingClaw(api)` which:

- Registers the `join_meeting` tool via `api.registerTool`
- Registers HTTP routes via `api.registerHttpRoute` for webhook delivery:
  - `POST /webhook/transcript` — receives Recall.ai transcript events
  - `POST /webhook/bot-done` — triggered when the bot leaves the meeting

The agent invokes the `join_meeting` tool with a `meetingUrl` parameter to start a session.

## Required environment variables

All must be set in the environment before starting the OpenClaw server:

| Variable | Description |
|---|---|
| `RECALL_API_KEY` | Recall.ai API key for joining calls |
| `RECALL_WEBHOOK_SECRET` | HMAC secret for verifying Recall.ai webhook signatures |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key |
| `GITHUB_TOKEN` | GitHub personal access token |
| `GITHUB_REPO` | Target repo for issues (e.g. `owner/repo`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (for summary delivery) |
| `TELEGRAM_CHAT_ID` | Telegram chat ID (for summary delivery) |
| `OPENCLAW_INSTANCE_NAME` | Bot name shown in the meeting (e.g. `MeetingClaw`) |
| `CONFIDENCE_THRESHOLD` | Min confidence for auto-actions (default: `0.85`) |

## Tool: join_meeting

Registered via `api.registerTool`. The agent calls this tool to start a meeting session.

**Input schema:**
```json
{
  "meetingUrl": "<Google Meet URL>"
}
```

**What it does:**
1. Validates the meeting URL format
2. Calls Recall.ai API to join the call as a bot participant
3. Registers the session with the webhook handlers
4. Returns a confirmation message

## Execution flow

### Step 1 — Extract URL
Parse the Google Meet URL from the user's message using regex:
`/https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i`

If no URL found: reply "I don't see a Google Meet URL in your message. Please share the full link."

### Step 2 — Invoke join_meeting tool
The agent calls the `join_meeting` tool with the extracted URL.

### Step 3 — Receive transcript events
Recall.ai sends webhook events to `POST /webhook/transcript` as the meeting progresses.
Each event is processed to detect intents and wake words.

### Step 4 — Meeting ends
When the bot leaves, Recall.ai sends a `POST /webhook/bot-done` event.
The plugin generates a summary and delivers it to the user.

## User-facing replies

| Event | Reply |
|---|---|
| Joining | "Joining the call now..." |
| Joined successfully | "[InstanceName] has joined the meeting." |
| Join failed | "Failed to join meeting: [error]" |
| No URL found | "I don't see a Google Meet URL. Please share the full link." |

## Notes

- The bot runs for the duration of the meeting, driven by Recall.ai webhook events
- Meeting ends when the bot is removed or the call closes (Recall.ai sends bot-done event)
- Summary is automatically delivered to the user on meeting end
- All credentials come from environment variables — never hardcode secrets
