# MeetingAgent - Agent Definitions

## Agent Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT ORCHESTRATOR                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ TRANSCRIBER  │  │  EXTRACTOR   │  │   ROUTER     │          │
│  │    AGENT     │──│    AGENT     │──│   AGENT      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                              │                   │
│         ┌────────────────────────────────────┼──────────┐       │
│         │                    │               │          │       │
│         ▼                    ▼               ▼          ▼       │
│  ┌────────────┐      ┌────────────┐  ┌────────────┐ ┌────────┐ │
│  │   GITHUB   │      │  CALENDAR  │  │    TASK    │ │SUMMARY │ │
│  │   AGENT    │      │   AGENT    │  │   AGENT    │ │ AGENT  │ │
│  └────────────┘      └────────────┘  └────────────┘ └────────┘ │
│                                                                  │
│                     ┌────────────┐                              │
│                     │  FOLLOWUP  │                              │
│                     │   AGENT    │                              │
│                     └────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Transcriber Agent

**Role**: Convert audio to text with speaker identification

### Input
```json
{
  "audio_source": "file|stream|recall",
  "audio_path": "/path/to/audio.wav",
  "language": "auto|en|de|...",
  "meeting_id": "uuid"
}
```

### Output
```json
{
  "meeting_id": "uuid",
  "duration_seconds": 3600,
  "language": "en",
  "speakers": ["Speaker 1", "Speaker 2"],
  "segments": [
    {
      "start": 0.0,
      "end": 5.2,
      "speaker": "Speaker 1",
      "text": "Let's start with the bug reports.",
      "confidence": 0.95
    }
  ]
}
```

### Tools
- `whisper` - OpenAI Whisper (local or API)
- `pyannote` - Speaker diarization
- `ffmpeg` - Audio preprocessing

### Configuration
```yaml
transcriber:
  engine: whisper-large-v3  # or whisper-api
  language: auto
  diarization: true
  max_speakers: 10
```

---

## 2. Extractor Agent

**Role**: Analyze transcript and extract structured intents

### Input
```json
{
  "meeting_id": "uuid",
  "transcript": { /* from Transcriber */ },
  "context": {
    "meeting_title": "Sprint Planning",
    "participants": ["tom@example.com", "anna@example.com"],
    "project": "treasure-hunter"
  }
}
```

### Output
```json
{
  "meeting_id": "uuid",
  "items": [
    {
      "type": "TODO",
      "text": "Fix the login bug",
      "owner": "Tom",
      "deadline": "2026-03-28",
      "priority": "high",
      "source_segment": 42,
      "confidence": 0.92
    },
    {
      "type": "BUG",
      "description": "Users can't log in on mobile",
      "severity": "critical",
      "mentioned_by": "Anna",
      "source_segment": 42
    },
    {
      "type": "MEETING_REQUEST",
      "topic": "Follow-up on mobile issues",
      "proposed_time": "next Tuesday",
      "participants": ["Tom", "Anna"],
      "source_segment": 87
    }
  ],
  "decisions": [
    {
      "text": "We will prioritize mobile fixes over new features",
      "participants": ["Tom", "Anna"],
      "source_segment": 65
    }
  ],
  "summary": "Sprint planning focused on mobile bug fixes..."
}
```

### Tools
- `llm` - Claude/GPT-4 for extraction
- `ner` - Named entity recognition for names/dates

### Prompt Strategy
See PROMPTS.md for detailed prompts.

---

## 3. Router Agent

**Role**: Route extracted items to appropriate action agents

### Input
```json
{
  "items": [ /* from Extractor */ ],
  "config": {
    "github_enabled": true,
    "calendar_enabled": true,
    "auto_create_issues": true
  }
}
```

### Routing Rules

| Item Type | Condition | Target Agent |
|-----------|-----------|--------------|
| BUG | severity >= medium | GitHub Agent |
| FEATURE | always | GitHub Agent |
| TODO | has owner | Task Agent |
| TODO | no owner | Task Agent (unassigned) |
| MEETING_REQUEST | has time | Calendar Agent |
| DECISION | always | Summary Agent |
| QUESTION | unanswered | Follow-up Agent |

### Output
```json
{
  "routed_items": [
    {
      "item_id": "uuid",
      "target_agent": "github",
      "priority": 1
    }
  ]
}
```

---

## 4. GitHub Agent

**Role**: Create issues, apply labels, assign owners

### Input
```json
{
  "action": "create_issue",
  "repo": "owner/repo",
  "title": "Bug: Users can't log in on mobile",
  "body": "## Description\n\nReported in meeting...",
  "labels": ["bug", "critical", "mobile"],
  "assignee": "tomhanks"
}
```

### Output
```json
{
  "success": true,
  "issue_url": "https://github.com/owner/repo/issues/123",
  "issue_number": 123
}
```

### Tools
- `gh` CLI or GitHub API
- Label mapping configuration

### Configuration
```yaml
github:
  default_repo: "owner/repo"
  label_mapping:
    BUG: ["bug"]
    FEATURE: ["enhancement"]
    critical: ["priority:critical"]
  assignee_mapping:
    "Tom": "tomhanks"
    "Anna": "anna-dev"
```

---

## 5. Calendar Agent

**Role**: Create calendar events, send invites

### Input
```json
{
  "action": "create_event",
  "title": "Follow-up: Mobile Issues",
  "description": "Discuss mobile login bugs",
  "proposed_time": "next Tuesday 2pm",
  "duration_minutes": 30,
  "participants": ["tom@example.com", "anna@example.com"],
  "meeting_link": true
}
```

### Output
```json
{
  "success": true,
  "event_id": "abc123",
  "scheduled_time": "2026-04-01T14:00:00Z",
  "calendar_link": "https://calendar.google.com/...",
  "invites_sent": ["tom@example.com", "anna@example.com"]
}
```

### Tools
- CalDAV (Nextcloud, iCloud)
- Google Calendar API
- Microsoft Graph API

### Time Resolution
```python
# "next Tuesday" → actual datetime
# "in 2 weeks" → actual datetime
# "end of month" → actual datetime
```

---

## 6. Task Agent

**Role**: Create tasks, assign to owners, set deadlines

### Input
```json
{
  "action": "create_task",
  "title": "Fix login bug on mobile",
  "description": "From meeting: Sprint Planning",
  "owner": "tom@example.com",
  "deadline": "2026-03-28",
  "priority": "high",
  "project": "treasure-hunter"
}
```

### Output
```json
{
  "success": true,
  "task_id": "task-456",
  "task_url": "https://tasks.example.com/456"
}
```

### Tools
- Nextcloud Tasks (CalDAV)
- Trello API
- Notion API
- Linear API

---

## 7. Summary Agent

**Role**: Generate and distribute meeting minutes

### Input
```json
{
  "meeting_id": "uuid",
  "transcript": { /* full transcript */ },
  "items": [ /* all extracted items */ ],
  "decisions": [ /* decisions */ ],
  "participants": ["tom@example.com", "anna@example.com"]
}
```

### Output
```json
{
  "summary": "## Meeting: Sprint Planning\n\n### Attendees\n...",
  "format": "markdown",
  "distributed_to": ["tom@example.com", "anna@example.com"],
  "stored_at": "/meetings/2026-03-27-sprint-planning.md"
}
```

### Distribution Channels
- Email (all participants)
- Telegram (configured channel)
- Slack (configured channel)
- File storage (Nextcloud/Drive)

---

## 8. Follow-up Agent

**Role**: Track action items, send reminders before deadlines

### Input
```json
{
  "action": "schedule_reminder",
  "task_id": "task-456",
  "owner": "tom@example.com",
  "deadline": "2026-03-28",
  "reminder_before": "24h"
}
```

### Behaviors
1. **Pre-deadline reminder**: 24h before deadline
2. **Overdue check**: Daily check for overdue items
3. **Status request**: Ask owner for update if no progress

### Output (Reminder)
```json
{
  "type": "reminder",
  "channel": "telegram",
  "recipient": "tom@example.com",
  "message": "⏰ Reminder: 'Fix login bug on mobile' is due tomorrow (March 28)"
}
```

---

## Agent Communication

Agents communicate via a message queue:

```python
# Message format
{
  "from_agent": "extractor",
  "to_agent": "github",
  "message_type": "create_issue",
  "payload": { ... },
  "meeting_id": "uuid",
  "timestamp": "2026-03-27T10:30:00Z"
}
```

### Orchestration Flow

```python
async def process_meeting(audio_path: str):
    # 1. Transcribe
    transcript = await transcriber_agent.process(audio_path)
    
    # 2. Extract
    items = await extractor_agent.process(transcript)
    
    # 3. Route and execute
    for item in items:
        target = router_agent.route(item)
        await target.execute(item)
    
    # 4. Generate summary
    summary = await summary_agent.generate(transcript, items)
    
    # 5. Schedule follow-ups
    for item in items:
        if item.deadline:
            await followup_agent.schedule(item)
```
