# MeetingAgent - MVP Scope (24h Hackathon)

## Philosophy

**Build something that works end-to-end, not something half-finished.**

A complete demo of: Audio → Transcript → Extract → Action is worth more than perfect transcription alone.

---

## MVP Features (Must Have)

### ✅ Core Pipeline

| Feature | Time Est. | Priority |
|---------|-----------|----------|
| Audio file upload (wav/mp3) | 1h | P0 |
| Whisper transcription (local) | 2h | P0 |
| LLM intent extraction | 3h | P0 |
| GitHub issue creation | 2h | P0 |
| Basic CLI interface | 1h | P0 |

**Total Core: ~9 hours**

### ✅ Demo Polish

| Feature | Time Est. | Priority |
|---------|-----------|----------|
| Sample meeting recording | 0.5h | P0 |
| Demo script | 0.5h | P0 |
| README with screenshots | 1h | P0 |

**Total Polish: ~2 hours**

---

## Nice to Have (If Time Permits)

### 🔶 Extended Actions (P1)

| Feature | Time Est. | Priority |
|---------|-----------|----------|
| Telegram notification | 1h | P1 |
| Calendar event creation | 2h | P1 |
| Meeting summary generation | 1h | P1 |
| Email distribution | 2h | P1 |

### 🔶 Better UX (P1)

| Feature | Time Est. | Priority |
|---------|-----------|----------|
| Simple web UI | 3h | P1 |
| Live progress indicator | 1h | P1 |
| Manual intent editing | 2h | P1 |

### 🔶 Real-time (P2)

| Feature | Time Est. | Priority |
|---------|-----------|----------|
| Recall.ai integration | 3h | P2 |
| Live transcription | 4h | P2 |
| Speaker diarization | 2h | P2 |

---

## NOT in MVP (Future)

❌ Multi-language support (beyond EN/DE)
❌ Voice fingerprinting
❌ Trello/Notion/Linear integration  
❌ Slack integration
❌ Mobile app
❌ User authentication
❌ Multi-tenant
❌ Scheduled follow-ups (cron)
❌ OpenClaw skill packaging

---

## MVP Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MVP ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   INPUT          PROCESS           OUTPUT                    │
│   ─────          ───────           ──────                    │
│                                                              │
│   ┌────────┐     ┌────────┐       ┌────────┐               │
│   │ Audio  │────▶│Whisper │──────▶│ GitHub │               │
│   │ File   │     │        │       │ Issue  │               │
│   └────────┘     └────────┘       └────────┘               │
│                       │                                      │
│                       ▼                                      │
│                  ┌────────┐       ┌────────┐               │
│                  │  LLM   │──────▶│Telegram│  (P1)         │
│                  │Extract │       │  Msg   │               │
│                  └────────┘       └────────┘               │
│                       │                                      │
│                       ▼                                      │
│                  ┌────────┐                                  │
│                  │Summary │  (P1)                           │
│                  │  .md   │                                  │
│                  └────────┘                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack (MVP)

| Component | Choice | Why |
|-----------|--------|-----|
| Language | Python 3.11+ | Fast prototyping, good ML libs |
| Transcription | faster-whisper | Fast, local, no API cost |
| LLM | Claude API (Haiku) | Cheap, fast, good extraction |
| Database | SQLite | Zero config, single file |
| CLI | Click | Simple, powerful |
| HTTP | requests | Familiar, reliable |

---

## File Structure (MVP)

```
meeting-agent/
├── README.md
├── requirements.txt
├── setup.py
├── meeting_agent/
│   ├── __init__.py
│   ├── cli.py              # Main CLI entry
│   ├── transcribe.py       # Whisper integration
│   ├── extract.py          # LLM intent extraction
│   ├── actions/
│   │   ├── __init__.py
│   │   ├── github.py       # Create issues
│   │   └── telegram.py     # Send messages (P1)
│   ├── models.py           # Data models
│   └── prompts.py          # LLM prompts
├── data/
│   └── meetings/           # Meeting data
├── config.yaml             # User config
└── docs/                   # Planning docs
```

---

## MVP User Flow

```
1. User records meeting (Zoom, etc.)
   └── Downloads audio file

2. User runs CLI
   └── meeting-agent process meeting.wav --repo owner/repo

3. Agent processes
   ├── Transcribes with Whisper (2-5 min)
   ├── Extracts intents with LLM (30 sec)
   ├── Shows extracted items to user
   └── User confirms (or edits)

4. Agent takes actions
   ├── Creates GitHub issues
   ├── (P1) Sends Telegram summary
   └── Saves meeting summary

5. Done!
   └── User sees links to created issues
```

---

## MVP CLI Commands

```bash
# Process a meeting
meeting-agent process meeting.wav --repo owner/repo

# Process with config
meeting-agent process meeting.wav --config config.yaml

# Dry run (show what would be created)
meeting-agent process meeting.wav --dry-run

# Just transcribe (no actions)
meeting-agent transcribe meeting.wav -o transcript.json

# Just extract (from existing transcript)
meeting-agent extract transcript.json -o intents.json
```

---

## MVP Configuration

```yaml
# config.yaml - Minimal MVP config

# GitHub
github:
  token: ${GITHUB_TOKEN}
  default_repo: owner/repo

# LLM
llm:
  provider: anthropic
  model: claude-3-haiku-20240307
  api_key: ${ANTHROPIC_API_KEY}

# Whisper
whisper:
  model: large-v3
  device: auto  # cuda if available, else cpu
  language: auto

# Optional: Telegram (P1)
telegram:
  bot_token: ${TELEGRAM_BOT_TOKEN}
  chat_id: ${TELEGRAM_CHAT_ID}
```

---

## Time Budget (24h)

| Phase | Hours | Activities |
|-------|-------|------------|
| Setup | 2h | Repo, deps, config |
| Transcription | 2h | Whisper integration |
| Extraction | 3h | LLM prompts, parsing |
| GitHub | 2h | Issue creation |
| Integration | 2h | Wire everything together |
| Testing | 2h | Fix bugs, edge cases |
| Demo Prep | 2h | Recording, README, slides |
| Buffer | 3h | Unexpected issues |
| Sleep | 6h | Actually sleep! |

**Total: 24h**

---

## Definition of Done (MVP)

- [ ] Can process a 30-min meeting audio file
- [ ] Extracts at least 3 types of intents (TODO, BUG, DECISION)
- [ ] Creates real GitHub issues
- [ ] Shows meeting summary
- [ ] Works on demo laptop
- [ ] README explains how to use
- [ ] 2-minute demo video/script ready

---

## Demo Checklist

- [ ] Pre-recorded sample meeting (5-10 min, clear audio)
- [ ] GitHub repo with some existing issues (for context)
- [ ] Config file ready with tokens
- [ ] Backup: pre-processed results if live demo fails
- [ ] Slides: Problem → Solution → Demo → Future

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Whisper too slow on CPU | Use smaller model (medium) |
| LLM extraction unreliable | Pre-test prompts, have fallback |
| GitHub rate limit | Use dry-run during testing |
| No GPU at venue | Ensure CPU fallback works |
| Wifi issues | Pre-download models, offline mode |
