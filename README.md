# MeetingAgent - OpenClaw Skill

AI Meeting Assistant that **takes action**, not just notes.

## What it does

1. **Transcribes** meetings in real-time (Whisper)
2. **Extracts** action items, decisions, deadlines with speaker attribution
3. **Acts immediately**:
   - Bug discussed → GitHub Issue created
   - Feature idea → Issue with label
   - "Let's meet next week" → Calendar event + invites
   - "Tom, can you do X by Friday?" → Task assigned + reminder scheduled
   - Meeting ends → Minutes sent to all participants

## Why it's different

| Feature | Otter/Fireflies | MeetingAgent |
|---------|-----------------|--------------|
| Transcription | ✅ | ✅ |
| Action Item Extraction | ✅ | ✅ |
| **Auto GitHub Issue** | ❌ | ✅ |
| **Auto Calendar Event** | ❌ | ✅ |
| **Auto Follow-up** | ❌ | ✅ |
| **Intelligent Routing** | ❌ | ✅ |
| **Self-Hosted** | ❌ | ✅ |
| **Open Source** | ❌ | ✅ |

## Status

🚧 **Early prototype with active planning**

Key planning docs:
- `docs/IMPLEMENTATION-SHORTLIST.md` - ranked build order from the research set
- `docs/IMPLEMENTATION-ROADMAP.md` - phased delivery and testing plan
- `docs/MARKET-RESEARCH.md` - positioning and competitor analysis

## Team

- Built at OpenClaw Hack_001
- OpenClaw Skill for autonomous meeting actions
