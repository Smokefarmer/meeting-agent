# MeetingAgent - Edge Cases & Error Handling

## Overview

This document covers failure modes, edge cases, and how to handle them gracefully.

---

## 1. Audio Input Issues

### 1.1 Poor Audio Quality

**Problem**: Background noise, echo, low volume
**Detection**: Whisper confidence < 0.7 on many segments
**Handling**:
```python
if segment.confidence < 0.7:
    segment.needs_review = True
    segment.text = f"[LOW CONFIDENCE] {segment.text}"
```
**User notification**: "⚠️ Parts of this meeting had poor audio quality. Please review flagged sections."

### 1.2 No Audio / Silent Meeting

**Problem**: Recording started but no speech detected
**Detection**: < 10 words transcribed in 5+ minute recording
**Handling**:
- Mark meeting as "failed"
- Notify user: "No speech detected. Was audio input configured correctly?"
- Suggest troubleshooting steps

### 1.3 Audio File Corruption

**Problem**: File unreadable, truncated, wrong format
**Detection**: ffmpeg/whisper throws exception
**Handling**:
```python
try:
    transcript = transcribe(audio_path)
except AudioProcessingError as e:
    meeting.status = "failed"
    meeting.error_message = f"Audio processing failed: {e}"
    notify_user(f"Could not process audio: {e}")
```

### 1.4 Very Long Meetings

**Problem**: 3+ hour meetings
**Detection**: `duration > 10800` seconds
**Handling**:
- Process in chunks (30 min segments)
- Use streaming transcription if available
- Warn user about longer processing time
- Consider memory limits for local Whisper

---

## 2. Speaker Diarization Issues

### 2.1 Unknown Speakers

**Problem**: Can't map SPEAKER_00 to real name
**Detection**: No name mentioned, no meeting metadata
**Handling**:
```python
if not speaker.name:
    speaker.name = f"Participant {speaker.speaker_id[-2:]}"
    # Try to infer from context
    speaker.name = infer_speaker_from_context(transcript)
```
**Options**:
- Ask user to label speakers post-meeting
- Use voice fingerprinting if seen before
- Default to "Participant 1", "Participant 2"

### 2.2 Wrong Speaker Attribution

**Problem**: Diarization assigns wrong speaker
**Detection**: Hard to detect automatically
**Handling**:
- Allow manual correction in UI
- Lower confidence on speaker-specific actions
- "Tom said he'd do X" → verify Tom was actually speaking

### 2.3 Overlapping Speech

**Problem**: Multiple people talking at once
**Detection**: Diarization marks overlapping segments
**Handling**:
- Flag as `[OVERLAPPING]`
- Skip action extraction for these segments
- Or transcribe but mark low confidence

### 2.4 Similar Voices

**Problem**: Two speakers with similar voices merged
**Detection**: Unrealistic speaking patterns (one person talks 95%)
**Handling**:
- Alert user: "Speaker identification may be inaccurate"
- Use meeting platform's speaker labels if available (Recall.ai)

---

## 3. Intent Extraction Issues

### 3.1 False Positives

**Problem**: "I'll kill that bug" → misinterpreted
**Detection**: Unusual word combinations, slang
**Handling**:
- High confidence threshold (0.85) for auto-actions
- Flag ambiguous items for human review
- Context window: consider surrounding sentences

**Examples of tricky phrases**:
| Phrase | Misinterpretation | Correct |
|--------|-------------------|---------|
| "Let's table this" | Create table? | Postpone discussion |
| "I'll shoot you an email" | Violence? | Send email |
| "Can you ping me?" | Network ping? | Send message |
| "Kill the server" | Delete server? | Stop the process |

### 3.2 False Negatives

**Problem**: Action item not detected
**Detection**: User reports missing item
**Handling**:
- Allow manual addition
- Learn from corrections
- Lower threshold for less common phrases

### 3.3 Wrong Priority/Severity

**Problem**: "Critical bug" marked as low severity
**Detection**: User escalates manually
**Handling**:
- Default to higher severity when uncertain
- "When in doubt, escalate"

### 3.4 Sarcasm / Jokes

**Problem**: "Yeah, let's just delete the database" (sarcastic)
**Detection**: Tone analysis, context, laughter
**Handling**:
- Very high threshold for destructive-sounding actions
- Flag obviously extreme statements
- Consider sentiment analysis

### 3.5 Hypotheticals

**Problem**: "If we had time, we could add dark mode"
**Detection**: Conditional language: "if", "could", "might", "would"
**Handling**:
```python
if contains_conditional(text):
    intent.confidence *= 0.5
    intent.is_hypothetical = True
```

### 3.6 Multiple Intents in One Statement

**Problem**: "Tom, fix the bug and update the docs by Friday"
**Detection**: Multiple verbs, multiple objects
**Handling**:
- Split into separate intents
- Link them as related
- Same deadline applies to both

---

## 4. Name Resolution Issues

### 4.1 Nicknames / Multiple Names

**Problem**: "Tommy" vs "Tom" vs "Thomas"
**Handling**:
```yaml
user_aliases:
  tom@example.com:
    names: ["Tom", "Tommy", "Thomas"]
    github: tomhanks
    telegram: "@tom"
```

### 4.2 Common Names

**Problem**: Two "John"s in the meeting
**Detection**: Multiple participants with same first name
**Handling**:
- Use full names when available
- Ask for clarification: "Which John? John S. or John D.?"
- Use speaker voice as tiebreaker

### 4.3 No Name Mentioned

**Problem**: "Someone should do this"
**Handling**:
- Create unassigned task
- Or assign to meeting host
- Flag for manual assignment

### 4.4 External Parties

**Problem**: "Tell the client about this"
**Detection**: Name not in participant list
**Handling**:
- Create action without owner
- Note: "Owner: External (client)"
- Don't try to send them notifications

---

## 5. Date/Time Resolution Issues

### 5.1 Ambiguous Dates

**Problem**: "Next Tuesday" - which Tuesday?
**Handling**:
- Always relative to meeting date
- "Next Tuesday" = first Tuesday after meeting date
- If meeting is on Tuesday, "next Tuesday" = next week

### 5.2 Timezone Issues

**Problem**: "3pm" - which timezone?
**Handling**:
- Default to meeting's timezone
- If participants span timezones, clarify
- Store as UTC internally

### 5.3 Impossible Dates

**Problem**: "By yesterday" (meeting was today)
**Detection**: Deadline < meeting date
**Handling**:
- Flag as invalid
- Ask for clarification
- Default to "ASAP"

### 5.4 Vague Deadlines

**Problem**: "Soon", "ASAP", "when you have time"
**Handling**:
```python
deadline_mapping = {
    "asap": meeting_date + timedelta(days=1),
    "soon": meeting_date + timedelta(days=3),
    "when you have time": None,  # No deadline
    "end of week": next_friday(meeting_date),
    "end of month": last_day_of_month(meeting_date),
}
```

---

## 6. Integration Failures

### 6.1 GitHub API Rate Limit

**Problem**: 429 Too Many Requests
**Handling**:
```python
try:
    create_issue(...)
except RateLimitError:
    action.status = "retry"
    action.retry_after = rate_limit_reset_time
    # Queue for later
```

### 6.2 GitHub Auth Failure

**Problem**: Token expired or revoked
**Detection**: 401 Unauthorized
**Handling**:
- Mark all GitHub actions as "pending"
- Notify user: "GitHub authentication failed. Please re-authenticate."
- Retry after re-auth

### 6.3 Calendar Conflict

**Problem**: Proposed time already has event
**Detection**: CalDAV returns conflict
**Handling**:
- Find next available slot
- Propose alternatives: "Tuesday 2pm is busy. How about 3pm?"
- Create anyway if user confirms

### 6.4 Email Delivery Failure

**Problem**: SMTP error, invalid address
**Handling**:
- Retry 3 times with backoff
- If persistent, notify user
- Log which participants didn't receive summary

### 6.5 Telegram Bot Blocked

**Problem**: User blocked the bot
**Detection**: 403 Forbidden
**Handling**:
- Mark channel as unavailable
- Fall back to email
- Note in action log

---

## 7. Privacy & Security Issues

### 7.1 Sensitive Information Detected

**Problem**: SSN, credit card, password mentioned
**Detection**: Regex patterns, PII detection
**Handling**:
```python
if contains_pii(text):
    segment.text = redact_pii(segment.text)
    segment.contains_sensitive = True
    # Don't include in summaries sent externally
```

### 7.2 Confidential Meeting

**Problem**: "This is off the record"
**Detection**: Trigger phrases
**Handling**:
- Pause recording/processing
- Mark section as confidential
- Don't create external actions

### 7.3 GDPR / Data Retention

**Problem**: User requests data deletion
**Handling**:
```python
def delete_meeting_data(meeting_id: str):
    # Delete audio
    os.remove(f"data/meetings/{meeting_id}/audio.wav")
    # Delete transcript
    db.execute("DELETE FROM transcripts WHERE meeting_id = ?", meeting_id)
    # Delete intents
    db.execute("DELETE FROM intents WHERE meeting_id = ?", meeting_id)
    # Anonymize actions (keep for audit but remove PII)
    db.execute("UPDATE actions SET request_payload = '{}' WHERE intent_id IN (...)")
```

---

## 8. System Issues

### 8.1 Out of Memory (Local Whisper)

**Problem**: Large model + long audio = OOM
**Detection**: MemoryError exception
**Handling**:
- Fall back to smaller model
- Process in chunks
- Use API instead of local

### 8.2 Disk Full

**Problem**: Can't save audio/transcript
**Detection**: IOError, ENOSPC
**Handling**:
- Alert immediately
- Delete old processed meetings (with user consent)
- Compress audio files

### 8.3 Network Timeout

**Problem**: API calls hang
**Handling**:
- Timeout after 30s
- Retry with exponential backoff
- Queue for later if offline

### 8.4 Concurrent Meeting Processing

**Problem**: Two meetings processed simultaneously
**Handling**:
- Queue-based processing (one at a time for MVP)
- Or use locking:
```python
with meeting_lock(meeting_id):
    process_meeting(meeting_id)
```

---

## Error Notification Strategy

| Severity | Example | Notification |
|----------|---------|--------------|
| Critical | All APIs down | Telegram + Email immediately |
| High | GitHub auth failed | Telegram within 5 min |
| Medium | One action failed | Include in meeting summary |
| Low | Confidence warning | Show in UI only |

---

## Recovery Procedures

### Manual Retry
```bash
# Retry failed actions for a meeting
python -m meeting_agent.retry --meeting-id abc123

# Reprocess transcript (if extraction failed)
python -m meeting_agent.reprocess --meeting-id abc123 --stage extract
```

### Bulk Recovery
```bash
# Retry all failed actions from last 24h
python -m meeting_agent.recover --since 24h
```

---

## Monitoring Checklist

- [ ] Transcription success rate > 95%
- [ ] Intent extraction confidence avg > 0.8
- [ ] Action success rate > 90%
- [ ] API error rate < 5%
- [ ] Processing time < 2x meeting duration
- [ ] No PII in external actions
