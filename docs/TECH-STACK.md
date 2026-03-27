# MeetingAgent - Tech Stack

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        TECH STACK                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LAYER              TECHNOLOGY           PURPOSE                 │
│  ─────              ──────────           ───────                 │
│                                                                  │
│  CLI                Click                User interface          │
│  Web (P1)           FastAPI + HTMX       Simple web UI           │
│                                                                  │
│  Transcription      faster-whisper       Audio → Text            │
│  Diarization        pyannote.audio       Speaker identification  │
│                                                                  │
│  Extraction         Claude/GPT           Intent detection        │
│  NLP                spaCy (optional)     NER, date parsing       │
│                                                                  │
│  Storage            SQLite               Meeting data            │
│  Files              Local filesystem     Audio, transcripts      │
│                                                                  │
│  Integrations       requests             API calls               │
│  Scheduling         APScheduler (P2)     Follow-up reminders     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Dependencies

### requirements.txt (MVP)

```txt
# Transcription
faster-whisper>=1.0.0
# Alternative: openai-whisper

# LLM
anthropic>=0.18.0
# Alternative: openai>=1.0.0

# CLI
click>=8.0.0
rich>=13.0.0  # Pretty console output

# HTTP
requests>=2.31.0

# Data
pydantic>=2.0.0  # Data validation

# Audio processing
soundfile>=0.12.0
pydub>=0.25.0  # Audio format conversion

# Config
python-dotenv>=1.0.0
pyyaml>=6.0.0

# Utils
python-dateutil>=2.8.0  # Date parsing
```

### requirements-dev.txt

```txt
pytest>=7.0.0
pytest-asyncio>=0.21.0
black>=23.0.0
ruff>=0.1.0
mypy>=1.0.0
```

### requirements-full.txt (All Features)

```txt
# Include MVP requirements
-r requirements.txt

# Speaker diarization
pyannote.audio>=3.1.0
torch>=2.0.0

# Web UI
fastapi>=0.109.0
uvicorn>=0.27.0
jinja2>=3.1.0
python-multipart>=0.0.6

# Calendar
caldav>=1.3.0
icalendar>=5.0.0

# Email
aiosmtplib>=3.0.0

# Scheduling
apscheduler>=3.10.0

# Database (if upgrading from SQLite)
asyncpg>=0.29.0  # PostgreSQL
sqlalchemy>=2.0.0

# Recall.ai
httpx>=0.26.0  # Async HTTP
```

---

## Component Details

### 1. Transcription: faster-whisper

**Why faster-whisper over openai-whisper:**
- 4x faster on GPU
- 2x faster on CPU
- Same accuracy
- Lower memory usage

**Installation:**
```bash
# CPU only
pip install faster-whisper

# With CUDA (recommended)
pip install faster-whisper[cuda]
# Requires: CUDA 11.x, cuDNN 8.x
```

**Usage:**
```python
from faster_whisper import WhisperModel

# Models: tiny, base, small, medium, large-v3
model = WhisperModel("large-v3", device="cuda", compute_type="float16")

segments, info = model.transcribe(
    "meeting.wav",
    beam_size=5,
    language="en",  # or None for auto
    word_timestamps=True,
    vad_filter=True,  # Remove silence
)
```

**Model Sizes:**

| Model | VRAM | Speed | Accuracy |
|-------|------|-------|----------|
| tiny | 1GB | 32x | ⭐⭐ |
| base | 1GB | 16x | ⭐⭐⭐ |
| small | 2GB | 6x | ⭐⭐⭐⭐ |
| medium | 5GB | 2x | ⭐⭐⭐⭐ |
| large-v3 | 10GB | 1x | ⭐⭐⭐⭐⭐ |

### 2. Speaker Diarization: pyannote.audio

**Why pyannote:**
- State-of-the-art accuracy
- Easy to use
- Integrates well with Whisper output

**Installation:**
```bash
pip install pyannote.audio
# Requires Hugging Face token
```

**Usage:**
```python
from pyannote.audio import Pipeline

# Need to accept terms on HuggingFace first
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token="hf_..."
)

# Can specify number of speakers if known
diarization = pipeline(
    "meeting.wav",
    num_speakers=3,  # Optional
    min_speakers=2,  # Optional
    max_speakers=10, # Optional
)
```

### 3. LLM: Claude (Anthropic)

**Why Claude:**
- Excellent at structured extraction
- Follows instructions well
- Good price/performance (Haiku)

**Models:**

| Model | Cost (input) | Cost (output) | Speed | Quality |
|-------|--------------|---------------|-------|---------|
| Haiku | $0.25/MTok | $1.25/MTok | Fast | Good |
| Sonnet | $3/MTok | $15/MTok | Medium | Better |
| Opus | $15/MTok | $75/MTok | Slow | Best |

**Recommendation:** Start with Haiku, upgrade to Sonnet if extraction quality is poor.

**Usage:**
```python
import anthropic

client = anthropic.Anthropic(api_key="...")

response = client.messages.create(
    model="claude-3-haiku-20240307",
    max_tokens=4096,
    messages=[
        {"role": "user", "content": EXTRACTION_PROMPT + transcript}
    ]
)
```

### 4. CLI: Click + Rich

**Why Click:**
- Simple, powerful
- Good documentation
- Widely used

**Why Rich:**
- Beautiful console output
- Progress bars
- Tables
- Syntax highlighting

**Example:**
```python
import click
from rich.console import Console
from rich.progress import Progress

console = Console()

@click.command()
@click.argument('audio_file', type=click.Path(exists=True))
@click.option('--repo', '-r', required=True, help='GitHub repo (owner/repo)')
@click.option('--dry-run', is_flag=True, help='Show what would be created')
def process(audio_file, repo, dry_run):
    """Process a meeting recording."""
    
    with Progress() as progress:
        task = progress.add_task("Transcribing...", total=100)
        # ... transcription code
        progress.update(task, completed=100)
    
    console.print("[green]✓[/green] Transcription complete!")
```

### 5. Data Validation: Pydantic

**Why Pydantic:**
- Type safety
- Automatic validation
- JSON serialization
- Great IDE support

**Example:**
```python
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

class IntentType(str, Enum):
    TODO = "TODO"
    BUG = "BUG"
    FEATURE = "FEATURE"
    MEETING = "MEETING_REQUEST"

class Intent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: IntentType
    text: str
    confidence: float = Field(ge=0, le=1)
    owner: str | None = None
    deadline: datetime | None = None
    source_segment: int
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
```

### 6. Storage: SQLite

**Why SQLite for MVP:**
- Zero configuration
- Single file
- Fast enough
- Easy backup (copy file)

**Future migration path:** PostgreSQL with SQLAlchemy

**Usage:**
```python
import sqlite3
from contextlib import contextmanager

@contextmanager
def get_db():
    conn = sqlite3.connect('data/meetings.db')
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
```

---

## Alternative Technologies

### If faster-whisper has issues:

**OpenAI Whisper (original)**
```bash
pip install openai-whisper
```
Slower but more stable.

**Whisper API (cloud)**
```python
import openai
client = openai.OpenAI()
transcript = client.audio.transcriptions.create(
    model="whisper-1",
    file=open("meeting.wav", "rb")
)
```
No GPU needed, pay per minute ($0.006/min).

### If Claude has issues:

**OpenAI GPT-4**
```python
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4-turbo-preview",
    messages=[{"role": "user", "content": prompt}]
)
```

**Local LLM (Ollama)**
```bash
ollama run llama3:70b
```
Free but requires beefy GPU (24GB+ VRAM).

---

## Development Environment

### Recommended Setup

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install in editable mode
pip install -e .

# Set up pre-commit hooks
pre-commit install
```

### Environment Variables

```bash
# .env file
GITHUB_TOKEN=ghp_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...  # Optional
TELEGRAM_BOT_TOKEN=123456:ABC...  # Optional
TELEGRAM_CHAT_ID=-100123456789  # Optional
HF_TOKEN=hf_...  # For pyannote
```

### VS Code Settings

```json
{
    "python.defaultInterpreterPath": ".venv/bin/python",
    "python.formatting.provider": "black",
    "editor.formatOnSave": true,
    "[python]": {
        "editor.codeActionsOnSave": {
            "source.organizeImports": true
        }
    }
}
```

---

## Hardware Requirements

### Minimum (CPU-only, slow)
- 8GB RAM
- 4 CPU cores
- 10GB disk space
- ~10x realtime processing

### Recommended (GPU)
- 16GB RAM
- NVIDIA GPU with 8GB+ VRAM
- 20GB disk space
- ~2x realtime processing

### Optimal (Fast GPU)
- 32GB RAM
- NVIDIA GPU with 16GB+ VRAM (RTX 3090/4090)
- 50GB disk space
- ~0.5x realtime processing (faster than meeting!)

---

## Docker Setup (Future)

```dockerfile
FROM python:3.11-slim

# Install system deps
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN pip install -e .

ENTRYPOINT ["meeting-agent"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  meeting-agent:
    build: .
    volumes:
      - ./data:/app/data
      - ./config.yaml:/app/config.yaml:ro
    environment:
      - GITHUB_TOKEN
      - ANTHROPIC_API_KEY
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```
