# MeetingClaw — Architecture Overview

**Project:** meeting-claw
**Mode:** mvp_architecture
**Date:** 2026-03-27
**Language:** TypeScript (Node.js 22)

---

## System Summary

MeetingClaw is a thin OpenClaw skill written in TypeScript. A user sends a Google Meet URL to their OpenClaw agent via any message gateway (Telegram, Discord, etc.). The skill joins the call via Skribby, receives a live transcript stream via WebSocket, runs continuous intent extraction via Claude Haiku, routes detected intents to existing OpenClaw tools (GitHub, Telegram), and speaks action confirmations back into the call via ElevenLabs TTS through Skribby's bot audio output.

The skill has no database, no auth system, no UI. It is a pipeline: **audio in → intent out → action taken → voice back**.

---

## Why TypeScript (not Python)

- OpenClaw is Node.js/TypeScript — skill integrates natively, no language boundary
- All dependencies have first-class TS SDKs: `@anthropic-ai/sdk`, `elevenlabs`, `@octokit/rest`, `ws`
- David's primary stack — faster iteration, no context switch
- All inference is API-based (no local Whisper/GPU needed) — Python ML libs not required
- `async/await` + `ws` in Node is clean for the WebSocket pipeline

---

## System Domains

| Domain | Responsibility |
|--------|----------------|
| **OpenClaw Gateway** | Receives the join message, triggers the skill, routes the summary back |
| **Skribby Integration** | Joins the call, streams transcript via WebSocket, delivers TTS audio |
| **Intent Pipeline** | Buffers transcript, calls Claude Haiku, scores and filters intents |
| **Action Router** | Maps intents to OpenClaw tools (GitHub, Telegram) |
| **Voice Engine** | ElevenLabs TTS → Skribby bot audio output |

---

## Data Flow

```
User → Telegram/Discord
         │
         ▼
   OpenClaw Gateway
   detects "join meeting" intent
         │
         ▼
   MeetingClaw Skill (TypeScript)
   ┌─────────────────────────────────────────────────────┐
   │                                                     │
   │  join.ts ──► Skribby REST API ──► Bot joins Meet    │
   │                │                                    │
   │  listen.ts ◄── Skribby WebSocket (live transcript)  │
   │                │                                    │
   │  detect.ts ──► Claude Haiku (intent extraction)     │
   │                │                                    │
   │  route.ts ──► OpenClaw GitHub skill → GitHub issue  │
   │           └──► OpenClaw Telegram → summary          │
   │                │                                    │
   │  speak.ts ──► ElevenLabs TTS → Skribby audio out   │
   │                                                     │
   └─────────────────────────────────────────────────────┘
         │
         ▼
   Confirmation back to user via same gateway channel
```

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Language | **TypeScript** (strict) | Native to OpenClaw, first-class SDKs, David's primary stack |
| Runtime | **Node.js 22** | Matches OpenClaw runtime |
| Meeting bot | **Skribby API** | Joins Google Meet, streams transcript, delivers bot audio. 5 min setup, 5 free hours. |
| STT | **ElevenLabs Scribe** (via Skribby BYOK) | Real-time, low latency |
| Intent extraction | **Claude Haiku** via `@anthropic-ai/sdk` | Cheap, fast, good structured extraction |
| TTS / Voice out | **ElevenLabs TTS** via `elevenlabs` npm SDK | Natural voice, low latency |
| GitHub | **`@octokit/rest`** | Official GitHub REST client |
| WebSocket | **`ws`** | Skribby transcript stream |
| HTTP | **`axios`** or native `fetch` | API calls |
| Config/validation | **`zod`** + **`dotenv`** | Runtime config validation from env |
| State (in-memory) | **TypeScript class** `MeetingSession` | No DB — state lives only for one meeting |
| Build | **`tsx`** (ts-node replacement) or **`tsc`** | Fast TS execution |

---

## File Structure

```
meeting-agent/
├── SKILL.md                        ← OpenClaw skill definition
├── config.yaml                     ← Skill configuration (bot API, voice config)
├── package.json
├── tsconfig.json
├── .env.example                    ← All required env vars (no values)
├── src/
│   ├── skill.ts                    ← OpenClaw entry point (handles gateway message)
│   ├── session.ts                  ← MeetingSession class (shared state)
│   ├── models.ts                   ← TypeScript interfaces/types
│   ├── join.ts                     ← Skribby API: create bot, join call
│   ├── listen.ts                   ← Skribby WebSocket: receive transcript stream
│   ├── detect.ts                   ← Claude Haiku: intent extraction + confidence filter
│   ├── dedup.ts                    ← In-memory deduplication for intents
│   ├── route.ts                    ← Intent router: calls OpenClaw tools
│   ├── speak.ts                    ← ElevenLabs TTS + Skribby audio injection
│   ├── summary.ts                  ← End-of-meeting summary generator
│   ├── prompts.ts                  ← LLM prompt templates
│   └── config.ts                   ← Zod schema + env loader
├── data/
│   └── meetings/                   ← Local summary files (YYYY-MM-DD-<id>.md)
└── docs/                           ← Planning docs
```

---

## Core Types (`models.ts`)

```typescript
export interface Intent {
  id: string;
  type: 'BUG' | 'FEATURE' | 'TODO' | 'DECISION' | 'MEETING_REQUEST';
  text: string;
  owner: string | null;
  deadline: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  sourceQuote: string;
}

export interface CreatedIssue {
  intentText: string;
  issueUrl: string;
  issueNumber: number;
  title: string;
}

export interface OpenClawConfig {
  instanceName: string;
  githubToken: string | null;
  githubRepo: string | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  skribbyApiKey: string;
  elevenLabsApiKey: string;
  anthropicApiKey: string;
  confidenceThreshold: number; // default 0.85
}
```

---

## Shared Foundations

Two foundations underpin all 6 stories — build these first:

### Foundation 1: `models.ts` + `session.ts` + `config.ts`
`MeetingSession` is the shared in-memory object that lives for one meeting. All modules read/write to it.

```typescript
export class MeetingSession {
  meetingId: string;
  url: string;
  botId: string | null = null;
  startTime: Date;
  transcriptBuffer: string[] = [];
  intents: Intent[] = [];
  createdIssues: CreatedIssue[] = [];
  decisions: string[] = [];
  config: OpenClawConfig;
}
```

### Foundation 2: `skill.ts` (OpenClaw entry point)
Triggered by OpenClaw gateway message. Detects Meet URL, loads config, boots the async pipeline, replies to user.

---

## Parallelization

```
Phase 0 (~30min, both):   Repo setup, package.json, tsconfig, .env.example

Phase 1 (parallel, ~2h):
  [NostraAI]                      [Smokefarmer]
  skill.ts + models.ts            join.ts + listen.ts
  session.ts + config.ts          (Issue #1 join + Issue #2 stream)
  (Issue #1 gateway)

Phase 2 (sequential, ~1.5h):
  [Smokefarmer]
  detect.ts + dedup.ts (Issue #3)

Phase 3 (parallel, ~2h):
  [NostraAI]                      [Smokefarmer]
  route.ts                        speak.ts
  GitHub issue creation           ElevenLabs TTS + Skribby audio
  (Issue #4)                      (Issue #5)

Phase 4 (~1h):
  [NostraAI]
  summary.ts + Telegram dispatch (Issue #6)
```

---

## Key Constraints

1. **Everything async/await** — never block the WebSocket stream (Node.js event loop)
2. **No DB** — `MeetingSession` in memory only, one instance per meeting
3. **Config from env** — load via `dotenv` + Zod, never hardcode tokens
4. **ElevenLabs failure = silent** — try/catch all TTS calls, log, continue
5. **GitHub failure = spoken** — on API error, call `speak()` with failure message
6. **Intent dedup** — call `dedup.ts` before `route.ts` on every intent
7. **TypeScript strict** — `"strict": true` in tsconfig
