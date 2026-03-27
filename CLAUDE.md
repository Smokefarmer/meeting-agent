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

1. **Three strikes rule** - Duplicate code twice = refactor on third occurrence
2. **Extract constants** - Magic numbers/strings → named constants
3. **Shared utilities** - Common patterns go in `utils.py`

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
