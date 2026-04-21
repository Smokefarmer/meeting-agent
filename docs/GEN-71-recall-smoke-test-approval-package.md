# GEN-71 Recall smoke-test approval package

Status: draft
Recommendation: do not approve for live Recall smoke testing yet
Prepared by: OpenClaw run 74b89ef9-3530-432d-8cec-c151eee266d5
Date: 2026-04-20 UTC

## What this package is for

This package is the approval gate for a limited Recall.ai smoke test of the MeetingAgent plugin.

The goal is not general release approval. The goal is to decide whether the current codebase is safe enough to run a tightly-scoped end-to-end Recall smoke test and to make the approval decision explicit.

## Proposed smoke-test scope

Run one controlled meeting using a non-production test account and synthetic or explicitly-consented content, then verify:

1. plugin registration succeeds
2. meeting join flow succeeds against Recall.ai
3. transcript delivery reaches the webhook/session layer
4. extraction and routing run without duplicate or unsafe actions
5. post-meeting summary artifacts are produced
6. failures degrade safely without crashing the whole run

## Evidence reviewed

Repository sources reviewed:
- `README.md`
- `CLAUDE.md`
- `docs/IMPLEMENTATION-ROADMAP.md`
- `docs/INTEGRATIONS.md`
- `src/plugin.ts`
- existing unit/integration-style test suite

Relevant project guidance already in repo:
- `docs/IMPLEMENTATION-ROADMAP.md` says privacy/security approval is a release gate for real meeting use
- the same roadmap defines a smoke suite covering plugin registration, synthetic join result, synthetic transcript ingestion, extract-and-route, and summary generation
- `CLAUDE.md` requires mocked integration coverage and graceful degradation for failures

## Current verification snapshot

Commands run locally from this workspace:

```bash
npm run check
npm test
```

Observed results:

### 1. Quality gate does not pass
`npm run check` fails at lint.

Current lint blocker:
- `src/plugin.ts:73` uses `any`

### 2. Test suite does not fully pass
`npm test` reports:
- 20 test files passed
- 1 test file failed
- 389 tests passed
- 6 tests failed

All 6 failures are in `src/__tests__/plugin.test.ts`.

Failure pattern:
- expected HTTP route registration is not happening
- tests expect `registerHttpRoute` to register:
  - `POST /webhook/transcript`
  - `POST /webhook/bot-done`
- current `src/plugin.ts` always starts the standalone Express webhook server on port 4000 instead of using gateway route registration when available

### 3. Meaning of the current failure
This is not a minor cosmetic issue.

The smoke-test gate specifically depends on the plugin, webhook, and Recall transcript path behaving in the intended deployment model. Right now there is a documented mismatch between:
- test expectations, which assume gateway HTTP route registration when available
- implementation, which unconditionally falls back to the standalone webhook server

That mismatch weakens confidence in the exact Recall ingress path we want to approve.

## Approval decision

### Decision
Do not approve live Recall smoke testing yet.

### Why
Approval should be blocked until the webhook ingress path is internally consistent and the quality gate is green enough to trust the smoke-test result.

Minimum reasons to block:
1. `npm run check` is failing
2. plugin/webhook registration tests are failing in the exact area the Recall smoke test depends on
3. the roadmap already treats privacy-gated real meeting rollout as a separate approval milestone

## Required fixes before approval

1. Resolve the plugin registration mismatch
   - decide whether the supported path is gateway `registerHttpRoute` or standalone Express server
   - align implementation, tests, and docs to one deployment model

2. Make `npm run check` pass
   - remove the `any` usage and cleanup the stale eslint disable if it remains unnecessary

3. Re-run and capture evidence for:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - one fixture-driven smoke workflow for join -> transcript -> extract -> summary

4. Confirm smoke-test guardrails before any live run
   - synthetic or explicitly-consented content only
   - non-production destination accounts
   - actions either dry-run or routed to a disposable test target
   - logs and summary artifact retained for review

## Approval checklist for the eventual smoke test

- [ ] quality gate passes locally
- [ ] plugin ingress path is consistent across code, tests, and docs
- [ ] Recall credentials are loaded from config, not hardcoded
- [ ] webhook authenticity checks are enabled where applicable
- [ ] test meeting uses synthetic or consented content
- [ ] downstream actions point to safe test targets
- [ ] rollback/cleanup steps are written down before the run
- [ ] one operator observes the run live and records pass/fail notes

## Suggested approval comment

Draft package complete. Current recommendation is not approved yet for live Recall smoke testing. Local verification shows the quality gate is still red: `npm run check` fails on `src/plugin.ts`, and `npm test` still has 6 failing plugin-route tests in the webhook registration path that the Recall smoke flow depends on. Next step is to reconcile the supported webhook ingress model, get the suite green, then rerun the smoke-test evidence bundle and request approval again.
