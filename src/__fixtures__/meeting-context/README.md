# Meeting context fixtures

This fixture set inventories mock meeting-session contexts that future tests can load without wiring live Recall, GitHub, calendar, or chat providers.

## Fixtures

| Fixture | Purpose | Permission posture |
|---|---|---|
| `baseline-active-session.ts` | Normal in-progress meeting with transcript, intents, and one created GitHub issue | All integrations allowed |
| `github-permission-denied.ts` | Meeting context where issue creation should be treated as unavailable | GitHub denied |
| `calendar-permission-denied.ts` | Meeting context where scheduling follow-up requests should stay in review/manual mode | Calendar denied |
| `assistant-question-only.ts` | Conversational context for spoken Q&A without side effects | No write permissions required |

## Permission cases covered

1. GitHub write denied while the meeting still contains BUG and TODO intents.
2. Calendar write denied while the meeting contains a follow-up request.
3. Read-only conversational use where the assistant can answer from context but should not take action.
4. Full-access baseline for happy-path routing and summary generation.

## Notes

- Fixtures are typed `MockMeetingContextBundle` exports that mirror the current `MeetingSession#toJSON()` shape plus a lightweight `mockContext` block for test metadata.
- Provider-local paths, tokens, and tenant-specific identifiers are intentionally omitted.
- These fixtures are intended for unit and integration tests, not production persistence.
