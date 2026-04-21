# GEN-209 Ranked implementation shortlist

This shortlist turns the existing research set into a build order for the current MeetingAgent repo.

Research inputs:
- `GEN-60-self-hosted-meeting-agent-options-review.md`
- `GEN-73-pika-public-skill-patterns-vs-hermes-vexa.md`
- `GEN-75-meeting-agent-presence-and-join-transport.md`
- `GEN-78-meeting-agent-tts-and-stt-strategy.md`
- `GEN-80-research-meeting-agent-post-meeting-notes-workflow.md`
- current repo docs and TypeScript prototype state

Constraint carried forward from the research set:
- real meeting traffic remains gated by the GEN-71 privacy/security approval
- near-term work should stay in synthetic, mock, local-only, and documentation-safe lanes

## Ranking method

Each candidate was scored against five practical criteria for the current repo:
- user value soon
- fit with current TypeScript codebase
- privacy-safe progress before GEN-71 clears
- implementation risk
- reuse across later meeting modes

Score scale: 1 low, 5 high.

## Ranked shortlist

| Rank | Candidate | Value | Feasibility | Risk | Reuse | Total | Why it ranks here |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | Browser-first fast copilot foundation | 5 | 5 | 4 | 5 | 19 | Best privacy and latency direction, matches repo and research consensus |
| 2 | Canonical post-meeting artifact pipeline | 5 | 5 | 4 | 5 | 19 | Gives durable outputs, test fixtures, and safe downstream automation boundary |
| 3 | Public skill wrapper plus readiness checks | 4 | 5 | 4 | 4 | 17 | Fixes packaging and usability without locking architecture to one vendor |
| 4 | Bot participant fallback using self-hosted meeting transport | 4 | 3 | 3 | 4 | 14 | Important for external meetings, but should stay secondary to local/browser-first |
| 5 | Narrow action bridge with dry-run and audit mode | 4 | 3 | 3 | 4 | 14 | Valuable, but should land after transcript and summary boundaries are stable |
| 6 | Audible speak-back via controlled TTS path | 2 | 3 | 3 | 3 | 11 | Useful later, but explicitly not part of the fast-path MVP |
| 7 | Fully self-hosted realtime STT/TTS stack on current server | 2 | 1 | 1 | 3 | 7 | Highest complexity, weakest latency fit on current CPU-only box |

## 1. Browser-first fast copilot foundation

Status: highest priority

What to build:
- a primary `local_companion` presence mode
- a primary `browser_caption_stream` or equivalent normalized transcript source
- transcript event normalization into the existing meeting session pipeline
- text-first responses only, no default voice output

Why first:
- GEN-60, GEN-75, and GEN-78 all converge on browser-first as the best default for privacy and latency
- it aligns with the current TypeScript plugin direction better than a bot-first rebuild
- it allows meaningful progress without requiring real bot attendance before the privacy gate clears

Concrete repo outcomes:
- define transcript source interfaces in code and docs
- add synthetic transcript fixtures that mimic browser caption events
- make the session pipeline consume normalized events independent of transport

## 2. Canonical post-meeting artifact pipeline

Status: tie for highest priority, should run in parallel with item 1 where possible

What to build:
- one structured meeting artifact as the durable source of truth
- markdown notes rendered from that artifact
- separate action-items output and short digest output
- meeting-end and checkpoint generation paths

Why second:
- GEN-80 gives the clearest low-risk path to useful product value before live-meeting approval
- it creates the backbone needed for summaries, actions, review, and testing
- it reduces coupling between transcript ingestion and downstream side effects

Concrete repo outcomes:
- document a canonical `meeting.json` shape
- add summary builder tests from transcript fixtures
- generate `meeting-notes.md`, `action-items.json`, and short digest artifacts

## 3. Public skill wrapper plus readiness checks

Status: next after the core data path is stable

What to build:
- one obvious public-facing `meeting-agent` skill contract
- guided readiness checks for keys, selected mode, and required integrations
- stable artifacts for persona, session state, and outputs

Why third:
- GEN-73 shows the biggest gap versus Pika is packaging discipline, not core architecture
- this improves usability without sacrificing the browser-first and modular direction
- it keeps vendor and deployment details hidden behind one clean entry point

Concrete repo outcomes:
- tighten README and docs around one installable path
- add readiness validation in config or startup
- expose one narrow command surface: join or attach, summarize, extract actions, leave or wrap

## 4. Bot participant fallback using self-hosted meeting transport

Status: important, but not the default product path

What to build:
- a secondary `bot_participant` presence mode
- a fallback transport for external Meet, Zoom, or Teams attendance
- explicit separation from the browser-first path

Why fourth:
- the research set says external meeting presence still matters
- but it adds more moving parts and more privacy surface than the local companion path
- it should be built as a fallback lane, not the foundation

Concrete repo outcomes:
- presence abstraction with `local_companion` and `bot_participant`
- transport abstraction with browser-first and bot worker implementations
- tests for clean degradation when the bot transport fails

## 5. Narrow action bridge with dry-run and audit mode

Status: after artifact generation is reliable

What to build:
- action routing that consumes extracted action items from the canonical artifact
- dry-run mode by default in tests and synthetic demos
- explicit audit output for what would have been created

Why fifth:
- the repo promise is action-taking, but actions should not outrun trust in transcript and summary quality
- this stage keeps side effects controlled and reviewable
- it aligns with the implementation roadmap's safe-action phase

Concrete repo outcomes:
- dry-run route handlers
- contract tests for outbound payloads
- partial-failure handling that never blocks notes generation

## 6. Audible speak-back via controlled TTS path

Status: optional enhancement

What to build:
- optional speech output for visible-bot mode only
- short, explicit speak-back moments
- controlled bridge-based TTS path instead of making voice the default experience

Why sixth:
- GEN-78 is clear that TTS should be secondary and off by default for MVP
- it adds turn-taking and UX complexity without unlocking the core value first

## 7. Fully self-hosted realtime STT/TTS on current server

Status: defer

Why last:
- the research set consistently rejects this as the current default on the CPU-only machine
- it is the highest-complexity path with the weakest short-term payoff
- revisit only if privacy requirements tighten or hardware changes materially

## Recommended execution sequence

### Wave 1, now
1. Define the normalized transcript-source and presence abstractions.
2. Define the canonical meeting artifact and output renders.
3. Add fixture-driven tests covering partial, duplicate, and ambiguous transcript events.

### Wave 2
4. Wrap the repo in one clean public skill contract.
5. Add readiness checks and docs for browser-first fast mode.
6. Add dry-run action routing from extracted artifacts.

### Wave 3
7. Add bot participant fallback transport.
8. Add narrow audible speak-back only for explicit bot-assistant cases.

### Explicitly deferred
9. Full local realtime STT/TTS stack on this server.

## Decision summary

If the team needs one sentence:

Build MeetingAgent around a browser-first, text-first copilot with a canonical post-meeting artifact pipeline, package it as one clean public skill, and keep bot attendance, action side effects, and voice output as later controlled layers rather than the foundation.
