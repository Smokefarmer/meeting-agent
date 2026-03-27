# Claude Code Instructions

This file provides guidelines for Claude agents working on this codebase.

## Project Overview

MeetingAgent is an OpenClaw Skill that transforms meeting audio into automated actions:

- **Core**: Python 3.11+ with Click CLI
- **Transcription**: Whisper (local via faster-whisper or OpenAI API)
- **Extraction**: Claude/GPT for intent detection
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

- **Language**: Python 3.11+
- **CLI**: Click + Rich
- **Transcription**: faster-whisper (local) or OpenAI Whisper API
- **LLM**: Anthropic Claude (Haiku/Sonnet) or OpenAI GPT-4
- **Database**: SQLite (MVP), PostgreSQL (future)
- **HTTP**: requests

## Project Structure

```
meeting-agent/
├── CLAUDE.md              # This file
├── README.md
├── requirements.txt
├── setup.py
├── meeting_agent/
│   ├── __init__.py
│   ├── cli.py             # Main CLI entry
│   ├── transcribe.py      # Whisper integration
│   ├── extract.py         # LLM intent extraction
│   ├── actions/
│   │   ├── __init__.py
│   │   ├── github.py      # Create issues
│   │   ├── calendar.py    # Create events
│   │   ├── telegram.py    # Send messages
│   │   └── email.py       # Send summaries
│   ├── models.py          # Pydantic data models
│   └── prompts.py         # LLM prompts
├── tests/
├── data/                  # Meeting data (gitignored)
├── config.yaml            # User config
└── docs/                  # Planning docs
```

## Implementation Pipeline

All code changes follow TDD:

1. **Tests first**: Write failing tests before implementation
2. **Minimal implementation**: Make tests pass with simplest code
3. **Refactor**: Clean up while keeping tests green
4. **Verify**: `pytest && mypy && ruff check`

## Configuration

```yaml
# config.yaml
github:
  token: ${GITHUB_TOKEN}
  default_repo: owner/repo

llm:
  provider: anthropic
  model: claude-3-haiku-20240307
  api_key: ${ANTHROPIC_API_KEY}

whisper:
  model: large-v3
  device: auto
  language: auto

telegram:
  bot_token: ${TELEGRAM_BOT_TOKEN}
  chat_id: ${TELEGRAM_CHAT_ID}
```

---

## Clean Code Rules

### File Size Limits

| Layer | Target max lines | Action when exceeded |
|-------|------------------|----------------------|
| Python modules | 400 | Split into focused modules |
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
4. **Extract constants** - Magic numbers/strings → named constants in `config.py`

### Code Organization

1. **Colocation** - Keep related code close together; helpers belong near their callers
2. **Flat over nested** - Prefer shallow directory structures; avoid deeply nested folders
3. **`__init__.py` for modules** - Use barrel exports to define a module's public API
4. **Constants in config** - Magic numbers and strings belong in config files, not inline

### Type Hints

1. **All public functions** must have type hints
2. **Use Pydantic** for data models with validation
3. **Run mypy** before committing

### Error Handling

1. **Specific exceptions** - Catch specific errors, not bare `except:`
2. **Graceful degradation** - One failed action shouldn't crash the pipeline
3. **Logging** - Use `logging` module, not print statements
4. **User feedback** - CLI should show clear error messages via Rich

---

## Testing

### Test Structure

```
tests/
├── conftest.py           # Shared fixtures
├── test_transcribe.py    # Transcription tests
├── test_extract.py       # Extraction tests
├── test_actions/
│   ├── test_github.py
│   ├── test_calendar.py
│   └── test_telegram.py
└── fixtures/
    └── sample_transcript.json
```

### Test Requirements

1. **Unit tests** for all business logic
2. **Mock external APIs** (GitHub, Whisper API, LLM)
3. **Integration tests** for full pipeline (with mocks)
4. **Fixtures** for sample transcripts and intents

### Running Tests

```bash
# All tests
pytest

# With coverage
pytest --cov=meeting_agent

# Specific module
pytest tests/test_extract.py -v
```

---

---

## Key Principles

### CLI Layer (Click)

1. **Thin commands** - CLI commands delegate to services, don't contain business logic
2. **Rich for output** - Use Rich console for progress bars, tables, formatted output
3. **Config injection** - Commands load config once, pass to services
4. **Graceful errors** - Catch exceptions, show user-friendly messages via Rich

### Transcription Layer

1. **Engine abstraction** - Support multiple engines (faster-whisper, OpenAI API) behind common interface
2. **Streaming when possible** - For long audio, process in chunks
3. **Speaker diarization optional** - Gracefully degrade if pyannote unavailable

### Extraction Layer (LLM)

1. **Structured output** - Always request JSON, validate with Pydantic
2. **Confidence scores** - Every extracted intent needs a confidence score
3. **Retry with backoff** - Handle rate limits gracefully
4. **Prompt versioning** - Keep prompts in `prompts.py`, version major changes

### Action Layer

1. **One action per module** - `github.py`, `calendar.py`, `telegram.py` each handle one integration
2. **Idempotent when possible** - Check if issue already exists before creating
3. **Fail gracefully** - One failed action shouldn't stop others
4. **Action logging** - Record all actions taken for audit trail

### Data Layer

1. **Pydantic models** - All data structures defined with Pydantic for validation
2. **SQLite for MVP** - Simple, single-file, easy backup
3. **JSON for transcripts** - Store full transcripts as JSON files alongside DB records

---

---

## Security Rules

### API Security
1. **Never store secrets in code** — No hardcoded API keys, tokens, or passwords. Use environment variables or config files (gitignored)
2. **Validate all inputs** — Use Pydantic models with validators. Add `max_length`, `min_length`, `ge`, `le` constraints
3. **Generic error messages** — Never expose internal errors to users. Log full error, show "Operation failed" to user
4. **Rate limit API calls** — Respect provider limits (GitHub, Anthropic, OpenAI). Implement exponential backoff

### Data Security
1. **Audio files are sensitive** — Meeting recordings may contain confidential information. Never upload to third parties without consent
2. **Redact PII** — Detect and redact SSNs, credit cards, passwords before storing or sending summaries
3. **Secure storage** — Transcripts and intents may contain sensitive data. Encrypt at rest if deployed
4. **Audit trail** — Log all actions taken (issues created, emails sent) for accountability

### LLM Security
1. **Prompt injection awareness** — Meeting transcripts are untrusted input. Don't let transcript content escape into system prompts
2. **Output validation** — Always validate LLM JSON output with Pydantic before acting on it
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
- **Verify before commit** — `pytest && mypy && ruff check`
- **Small PRs** — Keep changes focused and reviewable

---

## LLM Prompt Guidelines

When modifying prompts in `prompts.py`:

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
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .

# Development
meeting-agent process audio.wav --repo owner/repo --dry-run
meeting-agent transcribe audio.wav -o transcript.json
meeting-agent extract transcript.json -o intents.json

# Quality
pytest
mypy meeting_agent
ruff check meeting_agent
ruff format meeting_agent

# Pre-commit
pytest && mypy meeting_agent && ruff check meeting_agent
```
