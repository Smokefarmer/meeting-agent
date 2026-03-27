---
name: meeting_claw
description: >
  MeetingClaw — joins a live Google Meet call as an AI participant. Listens to the conversation in real time, detects bugs, tasks, features, and decisions, creates GitHub issues automatically, speaks confirmations back into the call via ElevenLabs voice, and sends a summary to Telegram when the meeting ends.
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
2. Calls the MeetingClaw skill entry point (`src/skill.ts` in the meeting-agent repo)
3. Bot joins the call via Skribby API as a named participant
4. Listens to live transcript via Skribby WebSocket
5. Extracts intents (BUG, FEATURE, TODO, DECISION) via Claude Haiku
6. Creates GitHub issues automatically for BUG/FEATURE intents
7. Speaks confirmations back into the call via ElevenLabs TTS
8. Sends a summary to Telegram + saves locally when the meeting ends

## How to run it

The skill is installed at: `/tmp/meeting-agent-skill/`

If not installed yet, run setup first:
```bash
if [ ! -d /tmp/meeting-agent-skill ]; then
  git clone https://github.com/Smokefarmer/meeting-agent.git /tmp/meeting-agent-skill
  cd /tmp/meeting-agent-skill && npm install
fi
```

Then trigger the skill:
```bash
cd /tmp/meeting-agent-skill && MEET_URL="<extracted-url>" node -e "
import('./src/skill.js').then(({ handleMessage }) => {
  handleMessage(process.env.MEET_URL, async (msg) => {
    console.log('[reply]', msg);
  });
});
"
```

## Required environment variables

All must be set in the environment or `.env` file at `/tmp/meeting-agent-skill/.env`:

| Variable | Description |
|---|---|
| `SKRIBBY_API_KEY` | Skribby meeting bot API key |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `GITHUB_TOKEN` | GitHub personal access token |
| `GITHUB_REPO` | Target repo for issues (e.g. `Smokefarmer/meeting-agent`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (for summary) |
| `TELEGRAM_CHAT_ID` | Telegram chat ID (for summary) |
| `OPENCLAW_INSTANCE_NAME` | Bot name shown in the meeting (e.g. `NostraAI`) |
| `CONFIDENCE_THRESHOLD` | Min confidence for actions (default: `0.85`) |

## Execution flow

### Step 1 — Extract URL
Parse the Google Meet URL from the user's message using regex:
`/https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i`

If no URL found: reply "I don't see a Google Meet URL in your message. Please share the full link."

### Step 2 — Check setup
```bash
if [ ! -d /tmp/meeting-agent-skill/node_modules ]; then
  cd /tmp/meeting-agent-skill && npm install
fi
```

### Step 3 — Run the skill
```bash
cd /tmp/meeting-agent-skill
npx tsx --env-file=.env -e "
import { handleMessage } from './src/skill.js';
handleMessage('<MEET_URL>', async (msg) => console.log(msg));
" &
```

Run in background — the process runs for the duration of the meeting.

### Step 4 — Reply to user
Relay the skill's reply messages back to the user on the same gateway channel.

## User-facing replies

| Event | Reply |
|---|---|
| Joining | "Joining the call now..." |
| Joined successfully | "✅ [InstanceName] has joined the meeting." |
| Join failed | "❌ Failed to join meeting: [error]" |
| No URL found | "I don't see a Google Meet URL. Please share the full link." |

## Notes

- The skill process runs in background for the duration of the meeting
- Meeting ends when the user sends "end meeting" or closes the Meet call (Skribby closes the WebSocket with code 1000)
- Summary is automatically sent to Telegram on meeting end
- All credentials come from the `.env` file — never hardcode
