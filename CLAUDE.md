# Claude Code Instructions

This file provides guidelines for Claude agents working on this codebase.

## Project Overview

MeetingAgent is an OpenClaw Skill that transforms meeting audio into automated actions:

- **Core**: TypeScript (Node.js 22) as an OpenClaw Skill
- **Transcription**: Recall.ai WebSocket for live transcripts
- **Extraction**: Claude Haiku for intent detection
- **TTS**: ElevenLabs for voice responses
- **Integrations**: GitHub, CalDAV, Telegram, Email

## Developer Guides

Always read these before making changes:

- Architecture: docs/ARCHITECTURE.md
- Agents: docs/AGENTS.md
- Intents: docs/INTENTS.md
- Integrations: docs/INTEGRATIONS.md
- Data Models: docs/DATA-MODELS.md
- LLM Prompts: docs/PROMPTS.md
- MVP Scope: docs/MVP-SCOPE.md

---

## Tech Stack

- **Language**: TypeScript (Node.js 22)
- **Entry Point**: OpenClaw skill entry point
- **Transcription**: Recall.ai WebSocket (live call transcripts)
- **LLM**: OpenClaw built-in agent via hooks API (no external API key needed)
- **Validation**: Zod (runtime schema validation)
- **Database**: None — in-memory MeetingSession only
- **HTTP**: axios
- **TTS**: ElevenLabs via @elevenlabs/elevenlabs-js
- **WebSocket**: ws

## Project Structure

```
meeting-agent/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── src/
│   ├── skill.ts          # OpenClaw entry point
│   ├── session.ts        # MeetingSession class
│   ├── models.ts         # TypeScript interfaces
│   ├── config.ts         # Zod config loader
│   ├── join.ts           # Recall.ai API: join call
│   ├── listen.ts         # Recall.ai WebSocket transcript
│   ├── detect.ts         # Intent extraction via OpenClaw LLM
│   ├── openclaw-llm.ts   # OpenClaw hooks API LLM client
│   ├── dedup.ts          # Intent deduplication
│   ├── route.ts          # Intent → action router
│   ├── speak.ts          # ElevenLabs TTS
│   ├── converse.ts       # Interactive Q&A (wake-word + response)
│   ├── summary.ts        # Meeting summary generator
│   ├── pipeline.ts       # Main pipeline orchestrator
│   ├── prompts.ts        # LLM prompt templates
│   └── errors.ts         # Shared error utilities
├── data/meetings/        # Local summary files
└── docs/                 # Planning docs
```

## Implementation Pipeline

All code changes follow TDD:

1. **Tests first**: Write failing tests before implementation
2. **Minimal implementation**: Make tests pass with simplest code
3. **Refactor**: Clean up while keeping tests green
4. **Verify**: `vitest run && tsc --noEmit && eslint src/`

## Configuration

All configuration is loaded from environment variables, validated by Zod in `src/config.ts`. See `.env.example` for required variables:

```bash
# .env.example
RECALL_API_KEY=...
ELEVENLABS_API_KEY=...
GITHUB_TOKEN=ghp_...
GITHUB_DEFAULT_REPO=owner/repo
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_HOOKS_TOKEN=meetingclaw-internal
```

---

## Clean Code Rules

### File Size Limits

| Layer | Target max lines | Action when exceeded |
|-------|------------------|----------------------|
| TypeScript modules | 400 | Split into focused modules |
| Functions | 40 | Extract sub-functions |
| Classes | 300 | Split responsibilities |
| Test files | 500 | Split by feature |

### Single Responsibility Principle

1. **One reason to change** - Every file, class, function should have exactly one reason to change
2. **Functions under 40 lines** - If a function exceeds 40 lines, extract sub-functions
3. **No god classes** - A class handling 3+ unrelated concerns must be split
4. **Name signals scope** - If you can't name something without "and" or "or", it does too much

### DRY (Don't Repeat Yourself)

1. **Extract on second occurrence** - If a pattern appears twice, extract to a shared utility
2. **Shared helpers over copy-paste** - Especially for: API calls, error parsing, config loading, prompt formatting
3. **Parameterize, don't duplicate** - When multiple functions differ only in a config value, use a single generic function with parameters
4. **Extract constants** - Magic numbers/strings → named constants in `config.ts`

### Code Organization

1. **Colocation** - Keep related code close together; helpers belong near their callers
2. **Flat over nested** - Prefer shallow directory structures; avoid deeply nested folders
3. **Barrel exports** - Use `index.ts` barrel exports to define a module's public API
4. **Constants in config** - Magic numbers and strings belong in config files, not inline

### Type Safety

1. **All public functions** must have explicit TypeScript types
2. **Use Zod** for runtime data validation (config, LLM output, API responses)
3. **Run `tsc --noEmit`** before committing

### Error Handling

1. **Specific errors** - Catch specific error types, not bare `catch(e)`
2. **Graceful degradation** - One failed action shouldn't crash the pipeline
3. **Logging** - Use structured logging, not `console.log`
4. **User feedback** - Show clear error messages to the caller

---

## Testing

### Test Structure

```
src/
├── __tests__/
│   ├── setup.ts              # Shared test setup
│   ├── session.test.ts       # Session tests
│   ├── detect.test.ts        # Extraction tests
│   ├── dedup.test.ts         # Deduplication tests
│   ├── config.test.ts        # Config tests
│   ├── listen.test.ts        # WebSocket tests
│   └── pipeline.test.ts      # Pipeline tests
└── __fixtures__/
    └── sample_transcript.json
```

### Test Requirements

1. **Unit tests** for all business logic
2. **Mock external APIs** (GitHub, Recall.ai, LLM, ElevenLabs)
3. **Integration tests** for full pipeline (with mocks)
4. **Fixtures** for sample transcripts and intents

### Running Tests

```bash
# All tests
npx vitest run

# With coverage
npx vitest run --coverage

# Specific module
npx vitest run src/__tests__/detect.test.ts

# Watch mode
npx vitest
```

---

---

## Key Principles

### Skill Entry Point (OpenClaw)

1. **Thin entry point** - `skill.ts` delegates to the pipeline, doesn't contain business logic
2. **Config injection** - Entry point loads config once via Zod, passes to services
3. **Graceful errors** - Catch exceptions, return user-friendly messages to the caller
4. **Session lifecycle** - Create MeetingSession on start, persist summary on end

### Transcription Layer (Recall.ai)

1. **WebSocket streaming** - Connect to Recall.ai WebSocket for real-time transcript chunks
2. **Reconnection logic** - Handle disconnects with exponential backoff
3. **Speaker attribution** - Use Recall.ai speaker labels when available

### Extraction Layer (LLM)

1. **Structured output** - Always request JSON, validate with Zod
2. **Confidence scores** - Every extracted intent needs a confidence score
3. **Retry with backoff** - Handle rate limits gracefully
4. **Prompt versioning** - Keep prompts in `prompts.ts`, version major changes

### Action Layer

1. **Router pattern** - `route.ts` dispatches intents to action handlers
2. **Idempotent when possible** - Check if issue already exists before creating
3. **Fail gracefully** - One failed action shouldn't stop others
4. **Action logging** - Record all actions taken for audit trail

### Data Layer

1. **TypeScript interfaces + Zod** - All data structures defined in `models.ts` with Zod schemas for runtime validation
2. **In-memory MeetingSession** - No database; session state lives in `session.ts`
3. **JSON for summaries** - Persist meeting summaries as JSON files in `data/meetings/`

---

---

## Security Rules

### API Security
1. **Never store secrets in code** — No hardcoded API keys, tokens, or passwords. Use environment variables or config files (gitignored)
2. **Validate all inputs** — Use Zod schemas with refinements. Add `.min()`, `.max()`, `.regex()` constraints
3. **Generic error messages** — Never expose internal errors to users. Log full error, show "Operation failed" to user
4. **Rate limit API calls** — Respect provider limits (GitHub, OpenClaw). Implement exponential backoff

### Data Security
1. **Audio files are sensitive** — Meeting recordings may contain confidential information. Never upload to third parties without consent
2. **Redact PII** — Detect and redact SSNs, credit cards, passwords before storing or sending summaries
3. **Secure storage** — Transcripts and intents may contain sensitive data. Encrypt at rest if deployed
4. **Audit trail** — Log all actions taken (issues created, emails sent) for accountability

### LLM Security
1. **Prompt injection awareness** — Meeting transcripts are untrusted input. Don't let transcript content escape into system prompts
2. **Output validation** — Always validate LLM JSON output with Zod before acting on it
3. **Confidence thresholds** — Never auto-execute actions with confidence < 0.85

---

## Claude Code Tools & Workflows

### Recommended Skills

| Skill | When to use |
|-------|-------------|
| /plan | Before starting any non-trivial implementation — creates step-by-step plan |
| /tdd | When implementing new features — enforces test-first development |
| /fix-build | When type errors or build errors occur — surgical fixes |
| /simplify | After writing code — reviews for reuse, quality, efficiency |
| /security-scan | After changes touching API calls, input handling, or secrets |

### Quick Rules
- **Tests first** — Write failing test, then implement
- **One file at a time** — Don't scatter changes across many files
- **Verify before commit** — `vitest run && tsc --noEmit && eslint src/`
- **Small PRs** — Keep changes focused and reviewable

---

## LLM Prompt Guidelines

When modifying prompts in `prompts.ts`:

1. **Be explicit** - Clear instructions beat clever prompting
2. **Include examples** - Few-shot examples improve accuracy
3. **Define schema** - Always specify expected JSON output format
4. **Set confidence thresholds** - 0.85+ for auto-action, below = human review
5. **Test with edge cases** - Sarcasm, hypotheticals, ambiguous statements

---

## Git Workflow

1. **Branch naming**: `feature/description`, `fix/description`, `docs/description`
2. **Commit messages**: Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`)
3. **PR size**: Keep PRs focused, <400 lines when possible
4. **Tests required**: No PR without tests for new functionality

---

## Common Commands

```bash
# Setup
npm install

# Development
npm run dev           # Run with ts-node in watch mode
npm run build         # Compile TypeScript to dist/

# Quality
npx vitest run        # Run tests
npx tsc --noEmit      # Type check
npx eslint src/       # Lint

# Pre-commit
npx vitest run && npx tsc --noEmit && npx eslint src/
```
