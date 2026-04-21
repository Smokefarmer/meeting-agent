# GEN-219 Browser capture to artifact pilot contract

Date: 2026-04-20
Status: proposed pilot contract for the current MeetingAgent repo
Scope: synthetic, mock, local-only validation
Sources: `docs/IMPLEMENTATION-SHORTLIST.md`, `docs/IMPLEMENTATION-ROADMAP.md`, `../GEN-209-meeting-agent-ranked-shortlist-2026-04-20.md`, `../GEN-75-meeting-agent-presence-and-join-transport.md`, `../GEN-80-research-meeting-agent-post-meeting-notes-workflow.md`

## Purpose

Define the smallest end-to-end pilot that proves the top-ranked MeetingAgent direction:

1. browser-first local copilot
2. normalized transcript events
3. one canonical post-meeting artifact
4. human-readable outputs rendered from that artifact

This contract is intentionally narrower than a full meeting agent. It proves the browser-capture-to-artifact path before live joins, action side effects, bot attendance, or voice output.

## Hard scope boundaries

Included:
- local or browser-derived caption events from a controlled synthetic source
- transcript normalization into the repo's session model
- meeting close or checkpoint artifact generation
- markdown notes and action-item render outputs
- fixture-driven and local smoke validation

Excluded:
- real participant content
- real meeting joins
- Recall transport expansion for this pilot
- GitHub, calendar, email, or task side effects
- TTS or spoken responses
- bot-participant presence mode

Privacy gate:
- this pilot must stay in the synthetic/local-only lane until GEN-71 approval clears real-content handling

## Pilot outcome

A successful pilot means a local operator or test can feed browser-caption-shaped transcript events into MeetingAgent and reliably receive a reviewable artifact set at checkpoint or wrap-up.

Required output set for each successful run:
- `meeting.json`
- `meeting-notes.md`
- `action-items.json`
- `summary.txt`

## Contract summary

### Input contract

The pilot accepts normalized browser-caption events with these minimum fields:
- `meetingId`
- `eventId`
- `timestamp`
- `speakerName`
- `text`
- `isFinal`
- `source`

Recommended source values for this pilot:
- `browser_caption_stream`
- `synthetic_browser_fixture`

Rules:
- partial and final caption events may both arrive
- duplicate events must not duplicate downstream notes or action items
- empty or whitespace-only text is ignored
- transport-specific fields may exist upstream, but the session pipeline consumes only the normalized event shape

Example minimum event:

```json
{
  "meetingId": "demo-weekly-001",
  "eventId": "evt-0007-final",
  "timestamp": "2026-04-20T10:03:14.000Z",
  "speakerName": "Tom",
  "text": "Lisa will send the revised onboarding checklist by Friday.",
  "isFinal": true,
  "source": "synthetic_browser_fixture"
}
```

### Runtime contract

The pilot runtime must support three actions:

1. ingest transcript event
2. generate checkpoint artifact set
3. close session and generate final artifact set

Expected behavior:
- transcript events append to one meeting session timeline
- meeting state keeps observed speakers, transcript segments, and extracted candidate signals
- wrap-up generation still succeeds when some transcript chunks were partial, duplicated, or missing
- artifact generation is deterministic for a fixed fixture input

### Output contract

#### 1. Canonical artifact: `meeting.json`

This is the durable source of truth.

Minimum top-level sections:
- `meeting`
- `participants`
- `summary`
- `decisions`
- `actionItems`
- `openQuestions`
- `followUps`
- `warnings`
- `source`

Minimum expectations:
- every extracted decision/action item includes source attribution when available
- action items carry `owner` and `deadline` only when explicit or high-confidence
- missing confidence should degrade to `ownerUnknown` or `deadlineUnspecified`, not invention
- warnings include transcript-quality issues such as duplicate suppression, partial coverage, or ambiguous ownership

#### 2. Rendered notes: `meeting-notes.md`

Minimum sections:
- title and metadata
- short summary
- decisions
- action items
- open questions
- follow-up
- warnings

#### 3. Automation payload: `action-items.json`

This file is review-only in the pilot.
It is not permission to execute actions.

Each item should include:
- `task`
- `owner`
- `deadline`
- `confidence`
- `sourceTimestamp`
- `sourceSpeaker`
- `status`, default `review_required`

#### 4. Digest: `summary.txt`

A short operator-facing summary suitable for chat, logs, or a UI preview.

## Acceptance criteria

The pilot is done when all of these are true:

1. A fixture or local browser-caption stub can send normalized transcript events into the current repo.
2. The session pipeline can create one canonical `meeting.json` artifact from those events.
3. The repo renders `meeting-notes.md`, `action-items.json`, and `summary.txt` from the same canonical artifact.
4. Duplicate transcript chunks do not create duplicate extracted outputs.
5. Ambiguous ownership or due dates are preserved as unknown, not guessed.
6. The happy path works without Recall, bot attendance, TTS, or downstream external writes.
7. Tests cover at least:
   - clean decision + action-item extraction
   - duplicate partial/final transcript behavior
   - ambiguous owner handling
   - checkpoint generation before final wrap-up

## Suggested repo shape for this pilot

This contract does not require a full rewrite, but it does require clear boundaries:
- transcript-source normalization boundary
- meeting session state boundary
- summary/artifact generation boundary
- renderers for markdown and action payloads

A minimal implementation can map onto the current repo as:
- transcript ingest adapter or fixture feeding `session.ts`
- artifact builder logic in `summary.ts` or a dedicated artifact module
- fixture tests under `src/__tests__/`
- synthetic transcript fixtures under `src/__fixtures__/`
- artifact output written under a local synthetic meetings folder

## Non-goals and follow-ups

After this pilot is green, the next layers can build on the same contract:
- public skill wrapper and readiness checks
- dry-run action bridge consuming `action-items.json`
- bot-participant fallback transport
- optional speak-back in explicit bot mode

But none of those are part of GEN-219.

## Decision statement

For MeetingAgent, the first pilot contract should be:

browser/local caption capture -> normalized transcript events -> session timeline -> canonical `meeting.json` -> rendered notes and review-only action artifacts.

That is the smallest contract that proves the ranked shortlist direction while staying compatible with the repo's TypeScript architecture and the current synthetic-only privacy gate.
