# MeetingAgent - Integrations

## Integration Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEETING AGENT                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INPUT                    PROCESSING              OUTPUT         │
│  ─────                    ──────────              ──────         │
│                                                                  │
│  ┌──────────┐                                    ┌──────────┐   │
│  │ Recall.ai│ ───┐                          ┌──▶│  GitHub  │   │
│  └──────────┘    │                          │   └──────────┘   │
│  ┌──────────┐    │     ┌──────────────┐     │   ┌──────────┐   │
│  │  Whisper │ ───┼────▶│    AGENT     │─────┼──▶│ Calendar │   │
│  └──────────┘    │     │    CORE      │     │   └──────────┘   │
│  ┌──────────┐    │     └──────────────┘     │   ┌──────────┐   │
│  │  WebRTC  │ ───┘                          ├──▶│ Telegram │   │
│  └──────────┘                               │   └──────────┘   │
│                                             │   ┌──────────┐   │
│                                             ├──▶│  Email   │   │
│                                             │   └──────────┘   │
│                                             │   ┌──────────┐   │
│                                             └──▶│  Tasks   │   │
│                                                 └──────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Whisper (Transcription)

### Option A: Local Whisper (Recommended for Privacy)

**Setup**
```bash
# Using faster-whisper (optimized)
pip install faster-whisper

# Or whisper.cpp for CPU
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make
```

**Usage**
```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cuda")  # or "cpu"

segments, info = model.transcribe("meeting.wav", 
    language="en",
    beam_size=5,
    word_timestamps=True
)

for segment in segments:
    print(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
```

### Option B: OpenAI Whisper API

**API Call**
```python
import openai

client = openai.OpenAI(api_key="...")

with open("meeting.wav", "rb") as f:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=f,
        response_format="verbose_json",
        timestamp_granularities=["word", "segment"]
    )
```

**Cost**: $0.006 per minute

### Configuration
```yaml
transcription:
  provider: local  # or openai
  model: large-v3
  language: auto  # or specific like "en", "de"
  api_key: ${OPENAI_API_KEY}  # if using API
```

---

## 2. Speaker Diarization (pyannote)

**Setup**
```bash
pip install pyannote.audio
# Requires Hugging Face token for model access
```

**Usage**
```python
from pyannote.audio import Pipeline

pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token="HF_TOKEN"
)

diarization = pipeline("meeting.wav")

for turn, _, speaker in diarization.itertracks(yield_label=True):
    print(f"{turn.start:.1f}s - {turn.end:.1f}s: {speaker}")
```

**Output**
```
0.0s - 5.2s: SPEAKER_00
5.2s - 12.8s: SPEAKER_01
12.8s - 15.0s: SPEAKER_00
```

### Merging with Transcript
```python
def merge_transcript_with_speakers(transcript, diarization):
    result = []
    for segment in transcript.segments:
        # Find speaker at segment midpoint
        midpoint = (segment.start + segment.end) / 2
        speaker = get_speaker_at_time(diarization, midpoint)
        result.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
            "speaker": speaker
        })
    return result
```

---

## 3. Recall.ai (Meeting Bot)

**What it does**: Sends a bot into Zoom/Meet/Teams to record

**Setup**
```bash
# Get API key from https://recall.ai
export RECALL_API_KEY="..."
```

**Create Bot**
```python
import requests

response = requests.post(
    "https://api.recall.ai/api/v1/bot/",
    headers={"Authorization": f"Token {RECALL_API_KEY}"},
    json={
        "meeting_url": "https://zoom.us/j/123456789",
        "bot_name": "Meeting Notes Bot",
        "transcription_options": {
            "provider": "meeting_captions"
        }
    }
)

bot_id = response.json()["id"]
```

**Get Transcript**
```python
response = requests.get(
    f"https://api.recall.ai/api/v1/bot/{bot_id}/transcript/",
    headers={"Authorization": f"Token {RECALL_API_KEY}"}
)

transcript = response.json()
# Returns segments with speaker labels from meeting platform
```

**Cost**: ~$0.10/minute

**Supported Platforms**
- Zoom ✅
- Google Meet ✅
- Microsoft Teams ✅
- Webex ✅

---

## 4. GitHub

### Authentication

**Option A: Personal Access Token**
```bash
export GITHUB_TOKEN="ghp_..."
```

**Option B: GitHub App (Recommended for orgs)**
```python
# Generate installation token
```

### Create Issue

```python
import requests

def create_github_issue(repo: str, title: str, body: str, labels: list, assignee: str = None):
    response = requests.post(
        f"https://api.github.com/repos/{repo}/issues",
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json"
        },
        json={
            "title": title,
            "body": body,
            "labels": labels,
            "assignees": [assignee] if assignee else []
        }
    )
    return response.json()

# Example
issue = create_github_issue(
    repo="owner/repo",
    title="Bug: Users can't log in on mobile",
    body="""## Description
Reported in Sprint Planning meeting (2026-03-27)

**Reported by**: Anna
**Severity**: Critical

## Details
Users are experiencing login failures on mobile devices.

---
*Created automatically by MeetingAgent*
""",
    labels=["bug", "critical", "mobile"],
    assignee="tomhanks"
)
```

### Configuration
```yaml
github:
  token: ${GITHUB_TOKEN}
  default_repo: owner/repo
  issue_template: |
    ## Description
    {description}
    
    **Reported by**: {reporter}
    **Meeting**: {meeting_title}
    
    ---
    *Created by MeetingAgent*
  label_mapping:
    BUG: [bug]
    FEATURE: [enhancement]
    critical: [priority:critical]
```

---

## 5. Calendar (CalDAV)

### Supported Providers
- Nextcloud ✅
- iCloud ✅
- Google (via CalDAV) ✅
- FastMail ✅

### Setup
```python
from caldav import DAVClient

client = DAVClient(
    url="https://cloud.example.com/remote.php/dav/calendars/user/",
    username="user",
    password="app-password"
)

calendar = client.principal().calendars()[0]
```

### Create Event
```python
from datetime import datetime, timedelta
from icalendar import Calendar, Event

def create_calendar_event(
    calendar,
    title: str,
    start: datetime,
    duration_minutes: int,
    description: str,
    attendees: list
):
    cal = Calendar()
    event = Event()
    
    event.add("summary", title)
    event.add("dtstart", start)
    event.add("dtend", start + timedelta(minutes=duration_minutes))
    event.add("description", description)
    
    for attendee in attendees:
        event.add("attendee", f"mailto:{attendee}")
    
    cal.add_component(event)
    
    calendar.save_event(cal.to_ical())
    return event

# Example
create_calendar_event(
    calendar=calendar,
    title="Follow-up: Mobile Bug Discussion",
    start=datetime(2026, 4, 1, 14, 0),
    duration_minutes=30,
    description="Discuss mobile login issues from sprint planning",
    attendees=["tom@example.com", "anna@example.com"]
)
```

### Configuration
```yaml
calendar:
  provider: caldav  # or google, outlook
  url: https://cloud.example.com/remote.php/dav/calendars/user/
  username: ${CALDAV_USER}
  password: ${CALDAV_PASS}
  default_calendar: personal
  default_duration: 30  # minutes
```

---

## 6. Telegram

### Setup
```bash
# Create bot via @BotFather
export TELEGRAM_BOT_TOKEN="123456:ABC..."
export TELEGRAM_CHAT_ID="-100123456789"  # Group or channel
```

### Send Message
```python
import requests

def send_telegram_message(chat_id: str, message: str, parse_mode: str = "Markdown"):
    response = requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={
            "chat_id": chat_id,
            "text": message,
            "parse_mode": parse_mode
        }
    )
    return response.json()

# Example: Meeting summary
send_telegram_message(
    chat_id=TELEGRAM_CHAT_ID,
    message="""📋 *Meeting Summary: Sprint Planning*

*Decisions:*
• Prioritize mobile bug fixes
• Use React for frontend

*Action Items:*
• Fix login bug (Tom, due Friday)
• Update documentation (Anna)

*Next Meeting:* Tuesday 2pm

---
_Generated by MeetingAgent_
"""
)
```

### Configuration
```yaml
telegram:
  bot_token: ${TELEGRAM_BOT_TOKEN}
  default_chat_id: ${TELEGRAM_CHAT_ID}
  notify_on:
    - meeting_end  # Send summary
    - urgent_bug   # Immediate notification
    - reminder     # Task reminders
```

---

## 7. Email (SMTP)

### Setup
```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(to: list, subject: str, body_html: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = ", ".join(to)
    
    msg.attach(MIMEText(body_html, "html"))
    
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM, to, msg.as_string())
```

### Configuration
```yaml
email:
  provider: smtp  # or sendgrid, ses
  host: smtp.example.com
  port: 465
  username: ${SMTP_USER}
  password: ${SMTP_PASS}
  from_address: meetings@example.com
  from_name: MeetingAgent
```

---

## 8. Task Management

### Nextcloud Tasks (CalDAV)
```python
# Same as Calendar but with VTODO instead of VEVENT
from icalendar import Calendar, Todo

def create_task(calendar, title: str, due: datetime, priority: int = 5):
    cal = Calendar()
    todo = Todo()
    
    todo.add("summary", title)
    todo.add("due", due)
    todo.add("priority", priority)  # 1=high, 5=medium, 9=low
    
    cal.add_component(todo)
    calendar.save_event(cal.to_ical())
```

### Trello
```python
import requests

def create_trello_card(list_id: str, name: str, desc: str, due: str = None):
    response = requests.post(
        "https://api.trello.com/1/cards",
        params={
            "key": TRELLO_API_KEY,
            "token": TRELLO_TOKEN,
            "idList": list_id,
            "name": name,
            "desc": desc,
            "due": due
        }
    )
    return response.json()
```

### Configuration
```yaml
tasks:
  provider: nextcloud  # or trello, notion, linear
  # Provider-specific config
  nextcloud:
    url: https://cloud.example.com/...
    calendar: tasks
  trello:
    api_key: ${TRELLO_KEY}
    token: ${TRELLO_TOKEN}
    default_list: "To Do"
```

---

## Integration Priority (MVP)

For 24h hackathon, implement in this order:

| Priority | Integration | Why |
|----------|-------------|-----|
| 1 | Whisper (local) | Core functionality |
| 2 | GitHub | High-impact demo |
| 3 | Telegram | Quick notifications |
| 4 | CalDAV | Meeting scheduling |
| 5 | Email | Meeting minutes |
| 6 | Recall.ai | Polish (if time) |
| 7 | Trello/Notion | Nice-to-have |
