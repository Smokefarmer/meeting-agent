# MeetingAgent Architecture

## Overview

MeetingAgent is a multi-agent system that transforms meeting audio into automated actions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MEETING AGENT SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│   │    AUDIO     │     │  TRANSCRIBE  │     │   EXTRACT    │                │
│   │    INPUT     │────▶│    AGENT     │────▶│    AGENT     │                │
│   │              │     │  (Whisper)   │     │   (LLM)      │                │
│   └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                                          │                         │
│         │                                          ▼                         │
│         │                              ┌──────────────────────┐              │
│         │                              │   INTENT ROUTER      │              │
│         │                              │                      │              │
│         │                              │  ┌────┐ ┌────┐ ┌────┐│              │
│         │                              │  │BUG │ │TASK│ │MEET││              │
│         │                              │  └──┬─┘ └──┬─┘ └──┬─┘│              │
│         │                              └─────┼─────┼─────┼───┘              │
│         │                                    │     │     │                   │
│         │                    ┌───────────────┼─────┼─────┼───────────────┐   │
│         │                    │               ▼     ▼     ▼               │   │
│         │                    │  ┌─────────────────────────────────────┐  │   │
│         │                    │  │         ACTION AGENTS               │  │   │
│         │                    │  │                                     │  │   │
│         │                    │  │  ┌────────┐ ┌────────┐ ┌────────┐  │  │   │
│         │                    │  │  │ GitHub │ │Calendar│ │  Task  │  │  │   │
│         │                    │  │  │ Agent  │ │ Agent  │ │ Agent  │  │  │   │
│         │                    │  │  └────────┘ └────────┘ └────────┘  │  │   │
│         │                    │  │                                     │  │   │
│         │                    │  │  ┌────────┐ ┌────────┐ ┌────────┐  │  │   │
│         │                    │  │  │ Email  │ │Telegram│ │ Follow │  │  │   │
│         │                    │  │  │ Agent  │ │ Agent  │ │  -up   │  │  │   │
│         │                    │  │  └────────┘ └────────┘ └────────┘  │  │   │
│         │                    │  └─────────────────────────────────────┘  │   │
│         │                    │              TOOL LAYER                   │   │
│         │                    └───────────────────────────────────────────┘   │
│         │                                                                    │
│         │                              ┌──────────────────────┐              │
│         └─────────────────────────────▶│   MEETING STORE      │              │
│                (raw audio)             │  (Transcript, Items) │              │
│                                        └──────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. Audio Input
   │
   ├─▶ [Recall.ai Bot] ─────┐
   ├─▶ [Browser WebRTC] ────┼──▶ Audio Stream
   ├─▶ [System Audio] ──────┤
   └─▶ [File Upload] ───────┘
                            │
                            ▼
2. Transcription (Whisper)
   │
   ├─▶ Raw transcript with timestamps
   ├─▶ Speaker diarization (who said what)
   └─▶ Language detection
                            │
                            ▼
3. Intent Extraction (LLM)
   │
   ├─▶ Action Items: [{text, owner, deadline, priority}]
   ├─▶ Decisions: [{text, context, participants}]
   ├─▶ Bugs: [{description, severity, mentioned_by}]
   ├─▶ Features: [{description, requester}]
   ├─▶ Meetings: [{proposed_time, participants, topic}]
   └─▶ Questions: [{text, asker, answered}]
                            │
                            ▼
4. Intent Router
   │
   ├─▶ BUG/FEATURE ──────────▶ GitHub Agent
   ├─▶ MEETING ──────────────▶ Calendar Agent
   ├─▶ TASK ─────────────────▶ Task Agent
   ├─▶ FOLLOW_UP ────────────▶ Follow-up Agent
   └─▶ MEETING_END ──────────▶ Summary Agent
                            │
                            ▼
5. Action Execution
   │
   ├─▶ GitHub: Create issue, assign labels
   ├─▶ Calendar: Create event, send invites
   ├─▶ Tasks: Create task, assign owner
   ├─▶ Email: Send meeting minutes
   └─▶ Telegram: Send reminders
```

## Components

### 1. Audio Input Layer

| Method | Pros | Cons | Implementation |
|--------|------|------|----------------|
| Recall.ai | Easiest, all platforms | Paid ($0.10/min) | API call |
| WebRTC (Browser) | Free, real-time | Browser only | MediaRecorder API |
| System Audio | Free, any app | OS-specific | Loopback device |
| File Upload | Simple, reliable | Post-meeting only | File input |

### 2. Transcription Agent

- **Engine**: OpenAI Whisper (local or API)
- **Features**: 
  - Multi-language support
  - Speaker diarization (pyannote.audio)
  - Timestamp alignment
- **Output**: Structured transcript JSON

### 3. Extraction Agent

- **Engine**: Claude/GPT-4
- **Input**: Transcript + meeting context
- **Output**: Structured intents (see INTENTS.md)

### 4. Action Agents

Each agent is specialized for one integration:

| Agent | Triggers | Actions |
|-------|----------|---------|
| GitHub Agent | BUG, FEATURE | Create issue, add labels |
| Calendar Agent | MEETING_REQUEST | Create event, send invites |
| Task Agent | TODO, ASSIGNMENT | Create task, set deadline |
| Email Agent | MEETING_END | Send meeting minutes |
| Telegram Agent | REMINDER, ALERT | Send message |
| Follow-up Agent | DEADLINE_APPROACHING | Check status, remind |

### 5. Meeting Store

Persistent storage for:
- Raw audio files
- Transcripts
- Extracted items
- Action logs
- Meeting metadata

## OpenClaw Integration

```
~/.openclaw/skills/meeting-agent/
├── SKILL.md              # Skill definition
├── config.yaml           # User configuration
├── scripts/
│   ├── transcribe.py     # Whisper transcription
│   ├── extract.py        # LLM extraction
│   ├── github.py         # GitHub integration
│   ├── calendar.py       # CalDAV integration
│   ├── notify.py         # Email/Telegram
│   └── followup.py       # Scheduled follow-ups
└── data/
    ├── meetings/         # Meeting data
    └── state.json        # Agent state
```

## Deployment Options

### 1. Local (Hackathon MVP)
- Whisper runs locally (whisper.cpp or faster-whisper)
- LLM via API (Claude/OpenAI)
- All data stays local

### 2. Self-Hosted Server
- Docker Compose setup
- Whisper API (local)
- PostgreSQL for storage
- Redis for job queue

### 3. Hybrid
- Transcription local
- LLM via API
- Actions via OpenClaw
