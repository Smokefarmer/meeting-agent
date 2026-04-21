# MeetingAgent implementation roadmap and testing strategy

## Current repo state

The repo is past pure ideation. It already contains a TypeScript plugin skeleton, meeting session state, Recall join/listen paths, intent extraction, routing, summary generation, webhook handlers, and a substantial Vitest suite.

What is still missing is a clear staged delivery plan that matches the current codebase instead of the older hackathon planning docs.

Observed status from this run:
- `src/` already contains the core runtime modules and tests
- `npm run check` currently fails in lint on `src/plugin.ts` because of an explicit `any`
- The project is therefore in an "early integrated prototype" phase, not just a design-only phase

## Delivery goal

Ship MeetingAgent as a safe, testable OpenClaw meeting assistant in four phases:
1. stable local/plugin prototype
2. reliable meeting transport and session handling
3. safe action execution and summaries
4. production hardening and privacy-gated real deployment

## Guiding principles

- Keep the entry path thin: join, stream, extract, route, summarize
- Prefer text-first behavior over conversational voice by default
- Treat external meeting transport as unreliable and test for degradation
- Make actions idempotent or at least deduplicated where possible
- Keep privacy/security approval as a release gate for real meeting use

## Phase roadmap

### Phase 0, stabilization of the current prototype

Goal: make the existing TypeScript codebase consistently green and easier to extend.

Scope:
- fix `npm run check`
- align docs with the real TypeScript architecture
- confirm environment loading and config validation paths
- confirm webhook server and plugin registration behavior
- remove dead assumptions from older docs that still describe a Python MVP

Exit criteria:
- `npm run check` passes locally
- README and docs describe the current TypeScript/OpenClaw plugin architecture
- one documented happy-path demo works end to end with mocks or synthetic inputs

### Phase 1, meeting transport and session reliability

Goal: make joining, transcript ingestion, and session lifecycle dependable.

Scope:
- harden Recall join flow and error handling
- finish webhook delivery and session registration lifecycle
- improve reconnect and timeout behavior in transcript streaming
- make checkpointing and end-of-meeting closure deterministic
- support both realtime transcript and no-websocket fallback paths cleanly

Exit criteria:
- synthetic meeting session can start, ingest transcript events, and close cleanly
- reconnect/disconnect scenarios are covered by tests
- summary generation still runs after stream failure or partial transcript loss

### Phase 2, extraction and action execution

Goal: produce trustworthy structured intents and execute only safe actions.

Scope:
- harden JSON extraction validation
- refine deduplication and confidence gating
- make route handlers clearly separated by integration type
- add dry-run or audit mode for actions
- ensure partial failures do not break the meeting pipeline

Exit criteria:
- known transcript fixtures produce stable structured intents
- duplicate transcript chunks do not create repeated actions
- failed GitHub or downstream actions are isolated and surfaced in summary output

### Phase 3, post-meeting artifact pipeline

Goal: make the meeting summary a first-class artifact, not an afterthought.

Scope:
- emit canonical structured meeting artifact
- render markdown notes from that artifact
- produce separate action-items output
- support partial-transcript warnings and confidence markers
- define retention/deletion boundaries for stored data

Exit criteria:
- one meeting run emits structured summary artifacts consistently
- action extraction can be reviewed independently from raw transcript text
- post-meeting outputs remain useful even when some automations fail

### Phase 4, production hardening and guarded rollout

Goal: make the system safe to run in real environments after privacy approval.

Scope:
- privacy/security gate completion before real participant content
- operational logging and audit trail
- rate limiting and provider backoff
- secret handling review
- packaging, deployment, and recovery documentation
- benchmark latency for browser-first versus bot-participant modes

Exit criteria:
- production runbook exists
- privacy/security gate is explicitly satisfied for real meetings
- deployment and rollback are documented
- representative non-synthetic pilot succeeds

## Recommended work order by module

1. `config.ts`, `plugin.ts`, `join.ts`
   - stabilize boot, config, and registration
2. `listen.ts`, `webhook-server.ts`, `webhook-handlers.ts`, `session.ts`
   - stabilize transcript/session lifecycle
3. `detect.ts`, `prompts.ts`, `dedup.ts`, `route.ts`, `extract-and-route.ts`
   - stabilize extraction and routing correctness
4. `summary.ts`, output persistence, docs
   - stabilize durable meeting artifacts
5. `speak.ts`, `converse.ts`
   - keep optional until text-first path is reliable

## Testing strategy

Use a layered strategy. Most confidence should come from deterministic local tests, not live meeting runs.

### 1. Unit tests

Target modules:
- `config.ts`
- `session.ts`
- `detect.ts`
- `dedup.ts`
- `route.ts`
- `summary.ts`
- `converse.ts`
- `speak.ts`

What to verify:
- schema validation
- transcript accumulation
- confidence thresholds
- dedup behavior
- safe error formatting
- summary rendering from known inputs

### 2. integration tests with mocks

Target flows:
- plugin registration
- join flow
- transcript stream handling
- webhook handling
- extract-and-route pipeline
- end-of-meeting summary path

Mock boundaries:
- Recall API
- WebSocket transcript feed
- LLM client
- GitHub and other downstream integrations
- ElevenLabs

What to verify:
- join success and failure paths
- duplicate transcript chunks do not double-trigger actions
- pipeline keeps running when one action fails
- summary generation still runs in `finally`

### 3. fixture-based transcript tests

Add or expand fixtures for:
- clean bug report mention
- mixed TODO plus decision meeting
- ambiguous ownership
- repeated partial and final transcript chunks
- wake-word addressed speech that should bypass extraction
- low-confidence statements that should not auto-act

These fixtures should drive both extraction assertions and final summary assertions.

### 4. contract tests for action payloads

For each integration, validate the produced outbound payload shape before any live call.

Examples:
- GitHub issue title/body/labels
- summary output object shape
- webhook payload normalization
- speech request payload

This is the best defense against runtime breakage when providers change.

### 5. smoke tests

Keep one lightweight smoke suite that runs:
- plugin registration
- synthetic join result
- synthetic transcript ingestion
- extract-and-route with mocked LLM
- summary generation

This should be fast enough for every PR.

## CI recommendation

Required on every PR:
- `npm run typecheck`
- `npm run lint`
- `npm run test`

Recommended next additions:
- coverage threshold for core modules
- one fixture-driven smoke workflow
- optional nightly longer integration suite

## Risk register

### Highest risks now
- docs and implementation diverging, especially Python MVP versus current TypeScript plugin
- transport instability around Recall/webhook/session lifecycle
- duplicate or unsafe downstream actions from transcript noise
- privacy/security ambiguity if real meeting handling starts before the gate is cleared
- voice features adding complexity before the text-first path is reliable

### Mitigations
- update docs now
- prefer mocked integration coverage before live testing
- keep action confidence thresholds strict
- keep TTS optional until core pipeline is stable
- treat real-content rollout as a separate approval milestone

## Immediate next actions

1. Fix the current lint failure in `src/plugin.ts`
2. Update README and architecture docs to remove stale Python-first assumptions
3. Add or tighten fixture-based tests for duplicate transcript chunks and partial failures
4. Define the canonical post-meeting artifact shape in docs and code
5. Only then expand live meeting transport coverage

## Definition of done for this planning issue

This issue should be considered complete when the team agrees on:
- the phased roadmap above
- the layered testing strategy above
- the immediate priority order: stabilize current prototype first, then transport, then actions, then production hardening
