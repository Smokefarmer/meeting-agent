# MeetingClaw — Implementation Plan

**Date:** 2026-03-27
**Language:** TypeScript (Node.js 22)
**Timeline:** 24h hackathon

---

## Phase 0 — Repo Setup (30 min, both)

- [ ] Initialize `package.json` with `type: "module"`
- [ ] `tsconfig.json` with `strict: true`, `target: ES2022`, `module: NodeNext`
- [ ] Install dependencies:
  ```bash
  npm install @anthropic-ai/sdk elevenlabs @octokit/rest ws axios zod dotenv
  npm install -D typescript tsx @types/ws @types/node
  ```
- [ ] Create `src/` structure with empty files
- [ ] Create `.env.example`:
  ```
  SKRIBBY_API_KEY=
  ELEVENLABS_API_KEY=
  ANTHROPIC_API_KEY=
  GITHUB_TOKEN=
  GITHUB_REPO=owner/repo
  TELEGRAM_BOT_TOKEN=
  TELEGRAM_CHAT_ID=
  OPENCLAW_INSTANCE_NAME=
  CONFIDENCE_THRESHOLD=0.85
  ```
- [ ] Rotate Skribby key (old one was shared in chat) — create new one at skribby.io
- [ ] Confirm ElevenLabs API key works

---

## Phase 1 — Foundations (parallel, ~2h)

### [NostraAI] — `models.ts` + `session.ts` + `config.ts` + `skill.ts`
**GitHub Issue: #1**

#### `config.ts`
```typescript
import { z } from 'zod';
import 'dotenv/config';

const ConfigSchema = z.object({
  instanceName: z.string(),
  skribbyApiKey: z.string(),
  elevenLabsApiKey: z.string(),
  anthropicApiKey: z.string(),
  githubToken: z.string().nullable().default(null),
  githubRepo: z.string().nullable().default(null),
  telegramBotToken: z.string().nullable().default(null),
  telegramChatId: z.string().nullable().default(null),
  confidenceThreshold: z.number().default(0.85),
});

export function loadConfig(): OpenClawConfig {
  return ConfigSchema.parse({
    instanceName: process.env.OPENCLAW_INSTANCE_NAME,
    skribbyApiKey: process.env.SKRIBBY_API_KEY,
    // ... etc
  });
}
```

#### `skill.ts` — OpenClaw entry point
```typescript
export async function handleMessage(message: string, replyFn: (msg: string) => Promise<void>) {
  const meetUrl = extractMeetUrl(message); // regex for meet.google.com URLs
  if (!meetUrl) return; // not a join request

  const config = loadConfig();
  const session = new MeetingSession(meetUrl, config);

  await replyFn(`Joining the call now...`);

  try {
    session.botId = await joinMeeting(meetUrl, config.instanceName, config.skribbyApiKey);
    await replyFn(`✅ ${config.instanceName} has joined the meeting.`);
  } catch (err) {
    await replyFn(`❌ Failed to join meeting: ${err.message}`);
    return;
  }

  // Start pipeline (non-blocking — runs for duration of meeting)
  runPipeline(session, config).catch(console.error);
}
```

---

### [Smokefarmer] — `join.ts` + `listen.ts`
**GitHub Issues: #1 (join) + #2 (stream)**

#### `join.ts`
```typescript
export async function joinMeeting(
  url: string,
  botName: string,
  apiKey: string
): Promise<string> {
  // POST https://api.skribby.io/v1/bots
  // Body: { meeting_url: url, bot_display_name: botName }
  // Returns: bot_id string
}
```

#### `listen.ts`
```typescript
export async function streamTranscript(
  botId: string,
  apiKey: string,
  onSegment: (text: string, speaker: string | null) => void
): Promise<void> {
  // Connect to Skribby WebSocket
  // ws://... with API key auth
  // On each message: parse segment, call onSegment()
  // On close/error: reconnect with exponential backoff (max 3 retries, 1s/2s/4s)
  // Never throw — log errors, reconnect silently
}
```

---

## Phase 2 — Intent Extraction (sequential, ~1.5h)

### [Smokefarmer] — `detect.ts` + `dedup.ts` + `prompts.ts`
**GitHub Issue: #3**

#### `prompts.ts`
```typescript
export const EXTRACTION_PROMPT = `
You are an expert meeting analyst...
[Port from docs/PROMPTS.md - Main Extraction Prompt]
Return JSON: { items: [...], summary: "..." }
`;
```

#### `detect.ts`
```typescript
export async function extractIntents(
  transcriptChunk: string,
  config: OpenClawConfig
): Promise<Intent[]> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const response = await client.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1024,
    messages: [{ role: 'user', content: EXTRACTION_PROMPT + transcriptChunk }],
  });
  const parsed = JSON.parse(response.content[0].text);
  // Filter: only confidence >= config.confidenceThreshold
  return parsed.items.filter((i: any) => i.confidence >= config.confidenceThreshold);
}
```

#### `dedup.ts`
```typescript
export function isDuplicate(intent: Intent, session: MeetingSession): boolean {
  // Normalize: lowercase, strip punctuation
  // Compare against all session.intents using string similarity
  // Return true if similarity > 0.80
}

// Simple similarity: Jaccard on word sets (no external lib needed)
function similarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(' '));
  const setB = new Set(b.toLowerCase().split(' '));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
```

---

## Phase 3 — Actions + Voice (parallel, ~2h)

### [NostraAI] — `route.ts`
**GitHub Issue: #4**

```typescript
export async function routeIntent(
  intent: Intent,
  session: MeetingSession,
  config: OpenClawConfig
): Promise<void> {
  if (isDuplicate(intent, session)) return;
  session.intents.push(intent);

  if (intent.type === 'BUG' || intent.type === 'FEATURE') {
    if (!config.githubToken || !config.githubRepo) {
      await speak(`I don't have GitHub connected. I noted it locally.`, config);
      return;
    }
    try {
      const issue = await createGitHubIssue(intent, session, config);
      session.createdIssues.push(issue);
      await speak(`I've logged that — GitHub issue created: ${issue.title}`, config);
    } catch (err) {
      console.error('GitHub issue creation failed:', err);
      await speak(`${config.instanceName} couldn't create that issue — check the log.`, config);
    }
  }

  if (intent.type === 'DECISION') {
    session.decisions.push(intent.text);
  }
}

async function createGitHubIssue(intent: Intent, session: MeetingSession, config: OpenClawConfig): Promise<CreatedIssue> {
  const octokit = new Octokit({ auth: config.githubToken });
  const [owner, repo] = config.githubRepo!.split('/');
  const label = intent.type === 'BUG' ? 'bug' : 'enhancement';
  const body = buildIssueBody(intent, session); // from prompts.ts GitHub Issue Body template
  const { data } = await octokit.issues.create({ owner, repo, title: intent.text, body, labels: [label] });
  return { intentText: intent.text, issueUrl: data.html_url, issueNumber: data.number, title: data.title };
}
```

---

### [Smokefarmer] — `speak.ts`
**GitHub Issue: #5**

```typescript
export async function speak(text: string, config: OpenClawConfig): Promise<void> {
  try {
    const client = new ElevenLabsClient({ apiKey: config.elevenLabsApiKey });
    const audioStream = await client.generate({ text, voice: 'Rachel', model_id: 'eleven_turbo_v2' });
    const audioBuffer = await streamToBuffer(audioStream);
    // POST audio buffer to Skribby bot audio output endpoint
    await axios.post(`https://api.skribby.io/v1/bots/${config.botId}/speak`, audioBuffer, {
      headers: { 'Authorization': `Bearer ${config.skribbyApiKey}`, 'Content-Type': 'audio/mpeg' }
    });
  } catch (err) {
    // Silent degradation — never propagate
    console.error('Voice output failed (silent):', err);
  }
}
```

---

## Phase 4 — Summary (sequential, ~1h)

### [NostraAI] — `summary.ts`
**GitHub Issue: #6**

```typescript
export async function generateAndSendSummary(
  session: MeetingSession,
  config: OpenClawConfig
): Promise<void> {
  const md = buildMarkdownSummary(session);

  // Save locally
  const filename = `data/meetings/${format(session.startTime, 'yyyy-MM-dd')}-${session.meetingId}.md`;
  await fs.writeFile(filename, md, 'utf-8');

  // Send via Telegram (OpenClaw config)
  if (config.telegramBotToken && config.telegramChatId) {
    await axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      chat_id: config.telegramChatId,
      text: md,
      parse_mode: 'Markdown',
    });
  }
}

function buildMarkdownSummary(session: MeetingSession): string {
  if (session.intents.length === 0) return 'No action items detected in this meeting.';
  // Build markdown from session.createdIssues + session.decisions
}
```

---

## Main Pipeline (`skill.ts` — `runPipeline`)

```typescript
async function runPipeline(session: MeetingSession, config: OpenClawConfig): Promise<void> {
  // Speak greeting
  await speak(`${config.instanceName} is here. I'll handle action items as we go.`, config);

  // Rolling transcript buffer — extract every ~30 seconds or ~500 tokens
  let buffer = '';

  await streamTranscript(session.botId!, config.skribbyApiKey, async (text, speaker) => {
    buffer += `${speaker ? speaker + ': ' : ''}${text}\n`;

    if (shouldExtract(buffer)) {
      const intents = await extractIntents(buffer, config);
      buffer = ''; // reset after extraction
      for (const intent of intents) {
        await routeIntent(intent, session, config);
      }
    }
  });

  // Meeting ended
  await generateAndSendSummary(session, config);
}
```

---

## Integration Test Checklist

- [ ] Send Meet URL via Telegram → bot joins within 30s
- [ ] Speak into call → transcript visible in logs
- [ ] Say "there's a bug with login on mobile" → BUG intent extracted, confidence ≥ 0.85
- [ ] GitHub issue appears within 10s
- [ ] Bot speaks confirmation within 3s of issue creation
- [ ] Say same bug twice → only 1 GitHub issue created
- [ ] End meeting → Telegram summary received + local file exists
- [ ] Kill ElevenLabs key → pipeline continues silently
- [ ] Voice response latency ≤ 3s end-to-end

---

## Demo Script (2 min)

1. Show Google Meet call with 2-3 people
2. Send `"join this call: meet.google.com/xxx"` to OpenClaw via Telegram
3. Bot joins, speaks: *"[InstanceName] is here. I'll handle action items as we go."*
4. Person says: *"We have a critical bug — the login page crashes on mobile."*
5. ~5s later: bot speaks *"I've logged that — GitHub issue created: Login page crashes on mobile."*
6. Show GitHub repo — issue is there, labelled `bug`
7. End meeting → Telegram summary lands

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Google Meet blocks Skribby | Test 24h before demo. Backup: screen share + mic capture |
| ElevenLabs latency > 3s | Use `eleven_turbo_v2` (fastest model). Short confirmation text. |
| Claude false positives | Confidence threshold 0.90 for demo. Use curated demo script. |
| Skribby WebSocket drops | Exponential backoff in `listen.ts` |
| `speak()` blocks pipeline | All TTS calls must be fire-and-forget (`speak(...).catch(console.error)`) |
