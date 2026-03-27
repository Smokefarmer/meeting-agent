# MeetingAgent - Demo Script

## Overview

This document outlines how to demo MeetingAgent at the hackathon in a compelling, clear way.

**Demo Duration**: 3-5 minutes
**Goal**: Show the problem, solution, and "wow" moment

---

## The Story

### Act 1: The Problem (30 seconds)

> "How many of you have left a meeting with action items that never got done? 
> 
> You take notes, you write down tasks, but then... nothing happens. 
> Meeting notes sit in a doc. No one creates the tickets. No one schedules the follow-up.
> 
> Tools like Otter and Fireflies transcribe your meetings. But they just create *notes*. 
> They don't take *action*.
> 
> What if your meeting assistant could actually DO things?"

### Act 2: The Solution (30 seconds)

> "MeetingAgent doesn't just listen - it ACTS.
> 
> It transcribes your meeting, extracts action items, and then:
> - Creates GitHub issues for bugs
> - Creates calendar events for follow-ups
> - Sends meeting summaries to your team
> 
> No more manual ticket creation. No more forgotten tasks."

### Act 3: The Demo (2-3 minutes)

> "Let me show you. Here's a recording from our sprint planning meeting this morning..."

---

## Demo Setup (Before Presentation)

### Prerequisites
- [ ] Sample audio file ready (`demo-meeting.wav`)
- [ ] Terminal open, correct directory
- [ ] GitHub repo visible in browser (for showing created issues)
- [ ] Config file with tokens ready
- [ ] Backup: Pre-processed results if live fails

### Pre-demo Checklist
```bash
# Test everything works
cd meeting-agent
source .venv/bin/activate
export $(cat .env | xargs)

# Quick test (should not error)
meeting-agent --help

# Verify GitHub access
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user | jq .login
```

---

## Live Demo Script

### Step 1: Show the Audio (15 seconds)

```bash
# Play a snippet of the meeting audio
# (Have 30-second clip ready)
ffplay -autoexit -nodisp demo-meeting.wav 2>/dev/null
```

> "Here's a typical 10-minute sprint planning meeting. People discussing bugs, assigning tasks, planning follow-ups."

### Step 2: Run MeetingAgent (60 seconds)

```bash
meeting-agent process demo-meeting.wav --repo Smokefarmer/meeting-agent-demo
```

**What audience sees:**
```
🎙️  Transcribing meeting...
    Model: whisper-large-v3
    Duration: 10:23
    ████████████████████ 100%

📝 Extracting action items...
    Found 7 items:
    • 3 TODOs
    • 2 BUGs  
    • 1 Feature Request
    • 1 Meeting Request

📋 Extracted Items:
┌────────┬─────────────────────────────┬──────────┬──────────┐
│ Type   │ Description                 │ Owner    │ Deadline │
├────────┼─────────────────────────────┼──────────┼──────────┤
│ BUG    │ Login broken on mobile      │ Tom      │ Friday   │
│ BUG    │ 500 error on checkout       │ -        │ -        │
│ TODO   │ Update API documentation    │ Anna     │ EOW      │
│ TODO   │ Review security settings    │ Mike     │ -        │
│ TODO   │ Deploy to staging           │ Tom      │ Today    │
│ FEATURE│ Add dark mode               │ -        │ -        │
│ MEETING│ Follow-up on mobile issues  │ Team     │ Tuesday  │
└────────┴─────────────────────────────┴──────────┴──────────┘

Create GitHub issues? [Y/n]: y

✅ Created: #1 - Bug: Login broken on mobile
   → https://github.com/Smokefarmer/meeting-agent-demo/issues/1
   
✅ Created: #2 - Bug: 500 error on checkout
   → https://github.com/Smokefarmer/meeting-agent-demo/issues/2
   
✅ Created: #3 - Feature: Add dark mode
   → https://github.com/Smokefarmer/meeting-agent-demo/issues/3

📅 Calendar event created: "Follow-up: Mobile Issues" - Tuesday 2pm
   → 3 invites sent

📤 Meeting summary sent to team Telegram

Done! Processing time: 2m 34s
```

### Step 3: Show Results (45 seconds)

**Switch to browser - GitHub:**
> "Here are the issues that were automatically created..."

Show:
- Issue title and body
- Labels applied (bug, critical, mobile)
- Assignee set
- Link to meeting transcript

**Switch to Telegram (if implemented):**
> "And here's the meeting summary that went to our team channel..."

### Step 4: The Kicker (15 seconds)

> "That was a 10-minute meeting. Processed in under 3 minutes.
> 
> 3 bug tickets created. 3 tasks assigned. Follow-up scheduled.
> Zero manual work.
> 
> That's MeetingAgent."

---

## Sample Meeting Script

Record this for the demo (5-10 minutes):

```
[Participant 1 - "Tom"]:
"Okay, let's start our sprint planning. First, what's blocking us?"

[Participant 2 - "Anna"]:
"There's a critical bug - users can't log in on mobile at all. 
It started yesterday after the deploy."

[Tom]:
"That's bad. I'll fix that by Friday. What else?"

[Participant 3 - "Mike"]:
"We're also seeing 500 errors on the checkout page. 
Not sure what's causing it yet."

[Tom]:
"Can you look into that, Mike?"

[Mike]:
"Sure, I'll investigate today."

[Anna]:
"On the feature side - users keep asking for dark mode."

[Tom]:
"Yeah, we should add that eventually. Not this sprint though."

[Anna]:
"Oh, and the API documentation is really outdated. 
I'll update it by end of week."

[Tom]:
"Great. Let's meet again Tuesday to check on the mobile bug. 
Same time work for everyone?"

[All]:
"Works for me."

[Tom]:
"Cool. Mike, can you also review the security settings 
before we go to production?"

[Mike]:
"Will do."

[Tom]:
"Alright, that's it. Thanks everyone!"
```

---

## Backup Plans

### If Transcription Fails
- Have pre-transcribed JSON ready
- Run: `meeting-agent extract transcript.json --repo ...`

### If LLM Extraction Fails
- Have pre-extracted intents JSON ready
- Show the intents manually, explain what would happen

### If GitHub API Fails
- Use `--dry-run` flag
- Show what WOULD be created
- Have screenshots of pre-created issues

### If No Internet
- Run everything locally with cached models
- Have screenshots ready

---

## Presentation Slides (Optional)

### Slide 1: Title
```
🎙️ MeetingAgent
   
"AI that takes action, not just notes"

OpenClaw Hack_001 - Vienna 2026
```

### Slide 2: Problem
```
📊 The Meeting Productivity Problem

• Average meeting: 30 action items discussed
• Actually created as tickets: 5
• Followed up on: 2

Existing tools (Otter, Fireflies):
✅ Transcribe → ❌ Act
```

### Slide 3: Solution
```
🤖 MeetingAgent

Audio → Transcript → Extract → ACT

• Bug mentioned → GitHub issue created
• Task assigned → Ticket with owner
• Follow-up needed → Calendar event sent
• Meeting ends → Summary to team
```

### Slide 4: Architecture
```
[Simple diagram from ARCHITECTURE.md]
```

### Slide 5: Demo
```
🎬 Live Demo

[Switch to terminal]
```

### Slide 6: Future
```
🔮 What's Next

• Real-time transcription (Recall.ai)
• More integrations (Jira, Linear, Notion)
• OpenClaw skill for everyone
• Enterprise self-hosted option
```

### Slide 7: Team
```
👥 Built by

[Team member names]

github.com/Smokefarmer/meeting-agent
```

---

## Talking Points for Q&A

**Q: How accurate is the extraction?**
> "We use Claude for extraction with a confidence threshold. Items below 85% confidence are flagged for human review. In testing, we get about 90% accuracy on clear action items."

**Q: What about privacy?**
> "Everything runs locally by default - Whisper transcription on your machine, data never leaves. The only external call is to the LLM API, and that can be replaced with local models if needed."

**Q: How is this different from Otter/Fireflies?**
> "They transcribe and extract, but stop there. MeetingAgent actually creates the GitHub issues, sends the calendar invites, posts to Telegram. It's the difference between a to-do list and a personal assistant."

**Q: What integrations do you support?**
> "MVP: GitHub, Telegram, Calendar. Planned: Slack, Jira, Linear, Notion, Email."

**Q: Can it join meetings live?**
> "Not in the MVP - we process recordings. But we have Recall.ai integration planned which can send a bot into Zoom/Meet/Teams to record and transcribe live."

---

## Demo Checklist

### 1 Hour Before
- [ ] Test full pipeline end-to-end
- [ ] Verify all API keys work
- [ ] Check GitHub repo is accessible
- [ ] Prepare backup files
- [ ] Charge laptop

### 10 Minutes Before
- [ ] Close unnecessary apps
- [ ] Open terminal in correct directory
- [ ] Open browser to GitHub repo
- [ ] Mute notifications
- [ ] Deep breath 😊

### During Demo
- [ ] Speak slowly and clearly
- [ ] Point to what's happening on screen
- [ ] Pause for "wow" moments
- [ ] Handle errors gracefully ("and here's where we show error handling...")
