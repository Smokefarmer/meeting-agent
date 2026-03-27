# MeetingAgent - Data Models

## Core Entities

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA MODEL                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────┐     ┌───────────┐     ┌───────────┐             │
│  │  Meeting  │────▶│ Transcript│────▶│  Segment  │             │
│  └───────────┘     └───────────┘     └───────────┘             │
│       │                                    │                     │
│       │                                    ▼                     │
│       │                            ┌───────────┐                │
│       │                            │   Intent  │                │
│       │                            └───────────┘                │
│       │                                    │                     │
│       ▼                    ┌───────────────┼───────────┐        │
│  ┌───────────┐             ▼               ▼           ▼        │
│  │Participant│       ┌──────────┐   ┌──────────┐ ┌──────────┐  │
│  └───────────┘       │ActionItem│   │ Decision │ │ Question │  │
│                      └──────────┘   └──────────┘ └──────────┘  │
│                            │                                    │
│                            ▼                                    │
│                      ┌──────────┐                               │
│                      │  Action  │                               │
│                      └──────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Meeting

The root entity for a recorded meeting.

```typescript
interface Meeting {
  id: string;                    // UUID
  title: string;                 // "Sprint Planning"
  scheduled_start: Date | null;  // If from calendar
  actual_start: Date;            // When recording started
  actual_end: Date | null;       // When recording ended
  duration_seconds: number | null;
  
  // Source
  source: "recall" | "upload" | "stream";
  source_url: string | null;     // Zoom/Meet URL if applicable
  platform: "zoom" | "meet" | "teams" | "other" | null;
  
  // Audio
  audio_path: string;            // Path to audio file
  audio_format: "wav" | "mp3" | "webm";
  audio_channels: number;
  audio_sample_rate: number;
  
  // Participants
  participants: Participant[];
  
  // Processing status
  status: "recording" | "processing" | "complete" | "failed";
  processing_started_at: Date | null;
  processing_completed_at: Date | null;
  error_message: string | null;
  
  // Metadata
  tags: string[];
  project: string | null;
  created_at: Date;
  updated_at: Date;
}
```

### Example
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Sprint Planning - Week 13",
  "scheduled_start": "2026-03-27T10:00:00Z",
  "actual_start": "2026-03-27T10:02:15Z",
  "actual_end": "2026-03-27T11:05:30Z",
  "duration_seconds": 3795,
  "source": "recall",
  "source_url": "https://zoom.us/j/123456789",
  "platform": "zoom",
  "audio_path": "/data/meetings/550e8400/audio.wav",
  "audio_format": "wav",
  "participants": [...],
  "status": "complete",
  "tags": ["sprint", "planning"],
  "project": "treasure-hunter"
}
```

---

## 2. Participant

A person who participated in the meeting.

```typescript
interface Participant {
  id: string;                    // UUID
  meeting_id: string;            // FK to Meeting
  
  // Identity
  name: string;                  // Display name
  email: string | null;          // If known
  speaker_id: string;            // From diarization: "SPEAKER_00"
  
  // Mapping
  github_username: string | null;
  telegram_id: string | null;
  
  // Stats
  speaking_time_seconds: number;
  segment_count: number;
  
  // Role
  is_host: boolean;
  is_external: boolean;          // Guest vs team member
}
```

### Example
```json
{
  "id": "participant-001",
  "meeting_id": "550e8400-...",
  "name": "Tom",
  "email": "tom@example.com",
  "speaker_id": "SPEAKER_00",
  "github_username": "tomhanks",
  "telegram_id": "123456789",
  "speaking_time_seconds": 1200,
  "segment_count": 45,
  "is_host": true,
  "is_external": false
}
```

---

## 3. Transcript

The full transcript of a meeting.

```typescript
interface Transcript {
  id: string;                    // UUID
  meeting_id: string;            // FK to Meeting
  
  // Metadata
  language: string;              // "en", "de", etc.
  language_confidence: number;   // 0-1
  
  // Processing info
  engine: string;                // "whisper-large-v3"
  engine_version: string;
  processing_time_seconds: number;
  
  // Content
  segments: TranscriptSegment[];
  full_text: string;             // Concatenated for search
  word_count: number;
  
  // Diarization
  diarization_model: string | null;
  speaker_count: number;
}
```

---

## 4. TranscriptSegment

A single segment of transcribed speech.

```typescript
interface TranscriptSegment {
  id: number;                    // Sequence within transcript
  transcript_id: string;         // FK to Transcript
  
  // Timing
  start_seconds: number;
  end_seconds: number;
  
  // Content
  text: string;
  
  // Speaker
  speaker_id: string;            // "SPEAKER_00"
  speaker_name: string | null;   // Resolved name if known
  
  // Quality
  confidence: number;            // 0-1
  
  // Words (for fine-grained timestamps)
  words: Word[] | null;
}

interface Word {
  text: string;
  start_seconds: number;
  end_seconds: number;
  confidence: number;
}
```

### Example
```json
{
  "id": 42,
  "transcript_id": "transcript-001",
  "start_seconds": 125.5,
  "end_seconds": 132.8,
  "text": "We need to fix the login bug on mobile before Friday.",
  "speaker_id": "SPEAKER_01",
  "speaker_name": "Anna",
  "confidence": 0.94,
  "words": [
    {"text": "We", "start_seconds": 125.5, "end_seconds": 125.7, "confidence": 0.98},
    {"text": "need", "start_seconds": 125.7, "end_seconds": 125.9, "confidence": 0.97}
    // ...
  ]
}
```

---

## 5. Intent (Extracted Item)

An extracted intent from the transcript.

```typescript
interface Intent {
  id: string;                    // UUID
  meeting_id: string;            // FK to Meeting
  
  // Type
  type: IntentType;
  
  // Source
  source_segment_id: number;     // Which segment triggered this
  source_text: string;           // Relevant quote
  
  // Confidence
  confidence: number;            // 0-1
  extraction_method: "rule" | "llm" | "hybrid";
  
  // Status
  status: "pending" | "actioned" | "dismissed" | "error";
  actioned_at: Date | null;
  
  // Data (type-specific)
  data: ActionItemData | BugData | FeatureData | MeetingRequestData | DecisionData | QuestionData;
  
  created_at: Date;
}

type IntentType = "TODO" | "BUG" | "FEATURE" | "MEETING_REQUEST" | "DECISION" | "QUESTION" | "ASSIGNMENT";
```

---

## 6. ActionItem

Specific data for TODO/ASSIGNMENT intents.

```typescript
interface ActionItemData {
  title: string;                 // Short description
  description: string | null;    // Longer description
  
  // Assignment
  owner_name: string | null;     // "Tom"
  owner_email: string | null;    // Resolved email
  owner_participant_id: string | null;
  
  // Timing
  deadline: Date | null;
  deadline_raw: string | null;   // "by Friday"
  
  // Priority
  priority: "low" | "medium" | "high" | "critical";
  
  // Links
  related_bug_id: string | null;
  related_feature_id: string | null;
}
```

---

## 7. Bug

Specific data for BUG intents.

```typescript
interface BugData {
  title: string;
  description: string;
  
  // Severity
  severity: "low" | "medium" | "high" | "critical";
  
  // Context
  platform: string | null;       // "mobile", "web", "android"
  component: string | null;      // "login", "payment"
  reproduction_steps: string | null;
  
  // Reporter
  reported_by_name: string;
  reported_by_participant_id: string | null;
}
```

---

## 8. Feature

Specific data for FEATURE intents.

```typescript
interface FeatureData {
  title: string;
  description: string;
  
  // Context
  requested_by_name: string;
  requested_by_participant_id: string | null;
  
  // Classification
  priority: "low" | "medium" | "high";
  user_facing: boolean;
  estimated_effort: "small" | "medium" | "large" | null;
}
```

---

## 9. MeetingRequest

Specific data for MEETING_REQUEST intents.

```typescript
interface MeetingRequestData {
  topic: string;
  
  // Timing
  proposed_time_raw: string;     // "next Tuesday at 2pm"
  proposed_time: Date | null;    // Resolved datetime
  duration_minutes: number;
  
  // Participants
  participants: string[];        // Names mentioned
  participant_emails: string[];  // Resolved emails
  
  // Type
  recurring: boolean;
  recurrence_pattern: string | null;  // "weekly"
}
```

---

## 10. Decision

Specific data for DECISION intents.

```typescript
interface DecisionData {
  text: string;                  // The decision
  context: string | null;        // Why/how it was decided
  
  // Participants
  decided_by: string[];          // Who made the decision
  
  // Impact
  reversible: boolean;
  affects_deadline: boolean;
  related_items: string[];       // Related intent IDs
}
```

---

## 11. Action

Record of an action taken based on an intent.

```typescript
interface Action {
  id: string;                    // UUID
  intent_id: string;             // FK to Intent
  
  // Type
  action_type: ActionType;
  
  // Target
  target_service: "github" | "calendar" | "telegram" | "email" | "task";
  target_id: string | null;      // e.g., issue number, event ID
  target_url: string | null;     // Link to created resource
  
  // Status
  status: "pending" | "success" | "failed" | "retry";
  attempts: number;
  last_attempt_at: Date | null;
  error_message: string | null;
  
  // Metadata
  request_payload: object;       // What we sent
  response_payload: object | null; // What we got back
  
  created_at: Date;
  completed_at: Date | null;
}

type ActionType = 
  | "create_github_issue"
  | "create_calendar_event"
  | "create_task"
  | "send_email"
  | "send_telegram"
  | "schedule_reminder";
```

---

## 12. Reminder

Scheduled follow-up reminder.

```typescript
interface Reminder {
  id: string;                    // UUID
  intent_id: string;             // FK to Intent
  
  // Schedule
  scheduled_for: Date;
  
  // Target
  target_channel: "telegram" | "email" | "slack";
  target_recipient: string;      // email or chat ID
  
  // Content
  message_template: string;
  
  // Status
  status: "pending" | "sent" | "cancelled";
  sent_at: Date | null;
}
```

---

## Database Schema (SQLite for MVP)

```sql
-- Core tables
CREATE TABLE meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    scheduled_start DATETIME,
    actual_start DATETIME NOT NULL,
    actual_end DATETIME,
    duration_seconds INTEGER,
    source TEXT NOT NULL,
    source_url TEXT,
    platform TEXT,
    audio_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'recording',
    project TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE participants (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id),
    name TEXT NOT NULL,
    email TEXT,
    speaker_id TEXT,
    github_username TEXT,
    telegram_id TEXT,
    speaking_time_seconds INTEGER DEFAULT 0,
    is_host BOOLEAN DEFAULT FALSE
);

CREATE TABLE transcripts (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id),
    language TEXT NOT NULL,
    engine TEXT NOT NULL,
    full_text TEXT,
    word_count INTEGER
);

CREATE TABLE transcript_segments (
    id INTEGER,
    transcript_id TEXT NOT NULL REFERENCES transcripts(id),
    start_seconds REAL NOT NULL,
    end_seconds REAL NOT NULL,
    text TEXT NOT NULL,
    speaker_id TEXT,
    speaker_name TEXT,
    confidence REAL,
    PRIMARY KEY (transcript_id, id)
);

CREATE TABLE intents (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id),
    type TEXT NOT NULL,
    source_segment_id INTEGER,
    source_text TEXT,
    confidence REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    data JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE actions (
    id TEXT PRIMARY KEY,
    intent_id TEXT NOT NULL REFERENCES intents(id),
    action_type TEXT NOT NULL,
    target_service TEXT NOT NULL,
    target_id TEXT,
    target_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    request_payload JSON,
    response_payload JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    intent_id TEXT NOT NULL REFERENCES intents(id),
    scheduled_for DATETIME NOT NULL,
    target_channel TEXT NOT NULL,
    target_recipient TEXT NOT NULL,
    message_template TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at DATETIME
);

-- Indexes
CREATE INDEX idx_intents_meeting ON intents(meeting_id);
CREATE INDEX idx_intents_status ON intents(status);
CREATE INDEX idx_actions_status ON actions(status);
CREATE INDEX idx_reminders_scheduled ON reminders(scheduled_for, status);
```

---

## File Storage Structure

```
data/
├── meetings/
│   └── {meeting_id}/
│       ├── audio.wav           # Original audio
│       ├── transcript.json     # Full transcript
│       ├── intents.json        # Extracted intents
│       ├── summary.md          # Generated summary
│       └── actions.json        # Action log
├── config/
│   ├── user_mapping.json       # Name → email/github mapping
│   └── integrations.yaml       # API keys, endpoints
└── state.json                  # Agent state
```
