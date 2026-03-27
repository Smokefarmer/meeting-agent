# MeetingAgent - Intent Definitions

## Intent Categories

```
INTENTS
├── ACTION_ITEMS
│   ├── TODO
│   ├── BUG
│   ├── FEATURE
│   └── ASSIGNMENT
├── SCHEDULING
│   ├── MEETING_REQUEST
│   └── DEADLINE_MENTION
├── INFORMATION
│   ├── DECISION
│   ├── QUESTION
│   └── ANSWER
└── META
    ├── MEETING_START
    └── MEETING_END
```

---

## 1. TODO

**Description**: A task that needs to be done

### Trigger Phrases
- "We need to..."
- "Someone should..."
- "Let's make sure to..."
- "Don't forget to..."
- "Action item:..."
- "TODO:..."
- "Can you [do something]?"
- "I'll [do something]"

### Examples

| Utterance | Extracted |
|-----------|-----------|
| "We need to update the documentation" | TODO: Update documentation |
| "Tom, can you review the PR?" | TODO: Review PR, Owner: Tom |
| "I'll send the report by Friday" | TODO: Send report, Owner: Speaker, Deadline: Friday |
| "Let's make sure to test on mobile" | TODO: Test on mobile |

### Schema
```json
{
  "type": "TODO",
  "text": "string - the task description",
  "owner": "string|null - assigned person",
  "deadline": "string|null - ISO date or relative",
  "priority": "low|medium|high|critical",
  "source_segment": "number - transcript segment index",
  "confidence": "number 0-1"
}
```

---

## 2. BUG

**Description**: A software bug or issue reported

### Trigger Phrases
- "There's a bug..."
- "It's broken..."
- "Users are reporting..."
- "It doesn't work..."
- "We found an issue..."
- "The [feature] is failing..."
- "Error when..."
- "Crash on..."

### Examples

| Utterance | Extracted |
|-----------|-----------|
| "There's a bug where users can't log in" | BUG: Users can't log in |
| "The payment system is broken on mobile" | BUG: Payment broken, Platform: mobile |
| "We're seeing crashes on Android 14" | BUG: Crashes, Platform: Android 14 |
| "Error 500 when submitting the form" | BUG: Error 500 on form submit |

### Schema
```json
{
  "type": "BUG",
  "description": "string - bug description",
  "severity": "low|medium|high|critical",
  "platform": "string|null - affected platform",
  "reproduction_steps": "string|null - if mentioned",
  "mentioned_by": "string - speaker name",
  "source_segment": "number"
}
```

### Severity Detection

| Signal | Severity |
|--------|----------|
| "critical", "urgent", "blocking" | critical |
| "important", "serious", "major" | high |
| "should fix", "when possible" | medium |
| "minor", "cosmetic", "low priority" | low |
| No signal | medium (default) |

---

## 3. FEATURE

**Description**: A feature request or enhancement idea

### Trigger Phrases
- "It would be nice if..."
- "We should add..."
- "Users are asking for..."
- "Feature request:..."
- "Can we make it so..."
- "What if we added..."
- "Enhancement:..."

### Examples

| Utterance | Extracted |
|-----------|-----------|
| "It would be nice if users could export to PDF" | FEATURE: PDF export |
| "We should add dark mode" | FEATURE: Dark mode |
| "Users are asking for notifications" | FEATURE: Notifications |

### Schema
```json
{
  "type": "FEATURE",
  "description": "string - feature description",
  "requester": "string - who requested",
  "priority": "low|medium|high",
  "user_facing": "boolean",
  "source_segment": "number"
}
```

---

## 4. ASSIGNMENT

**Description**: Explicit task assignment to a person

### Trigger Phrases
- "[Name], can you..."
- "[Name] will handle..."
- "Assigned to [Name]"
- "[Name] is responsible for..."
- "Let's have [Name] do..."

### Examples

| Utterance | Extracted |
|-----------|-----------|
| "Tom, can you take care of the API?" | ASSIGNMENT: API work → Tom |
| "Anna will handle the design review" | ASSIGNMENT: Design review → Anna |
| "Let's have Mike do the testing" | ASSIGNMENT: Testing → Mike |

### Schema
```json
{
  "type": "ASSIGNMENT",
  "task": "string - what is assigned",
  "assignee": "string - who it's assigned to",
  "deadline": "string|null",
  "source_segment": "number"
}
```

---

## 5. MEETING_REQUEST

**Description**: Request to schedule a follow-up meeting

### Trigger Phrases
- "Let's schedule a meeting..."
- "We should meet again..."
- "Can we set up a call..."
- "Let's sync next week..."
- "I'll set up a meeting..."
- "Follow-up meeting..."

### Examples

| Utterance | Extracted |
|-----------|-----------|
| "Let's meet again next Tuesday" | MEETING: Next Tuesday |
| "Can we set up a call for Friday afternoon?" | MEETING: Friday PM |
| "We should sync in 2 weeks" | MEETING: In 2 weeks |
| "Let's do a quick 15-minute standup tomorrow" | MEETING: Tomorrow, 15 min |

### Schema
```json
{
  "type": "MEETING_REQUEST",
  "topic": "string - meeting topic",
  "proposed_time": "string - relative or absolute",
  "duration": "number|null - minutes",
  "participants": ["string"] ,
  "recurring": "boolean",
  "source_segment": "number"
}
```

### Time Parsing Examples

| Input | Parsed |
|-------|--------|
| "next Tuesday" | Next Tuesday relative to meeting date |
| "in 2 weeks" | Meeting date + 14 days |
| "end of the month" | Last business day of current month |
| "tomorrow at 2" | Next day, 14:00 |
| "Friday afternoon" | Next Friday, 14:00-17:00 range |

---

## 6. DEADLINE_MENTION

**Description**: A deadline mentioned for a task

### Trigger Phrases
- "By [date]..."
- "Due on [date]..."
- "Deadline is [date]..."
- "Need this by [date]..."
- "Has to be done before [date]..."

### Examples

| Utterance | Extracted |
|-----------|-----------|
| "This needs to be done by Friday" | DEADLINE: Friday |
| "The release is on March 30th" | DEADLINE: 2026-03-30 |
| "EOD today" | DEADLINE: Today 18:00 |

### Schema
```json
{
  "type": "DEADLINE_MENTION",
  "deadline": "string - ISO date",
  "related_task": "string - what the deadline is for",
  "hard_deadline": "boolean - is it flexible?",
  "source_segment": "number"
}
```

---

## 7. DECISION

**Description**: A decision made during the meeting

### Trigger Phrases
- "We decided to..."
- "Let's go with..."
- "The decision is..."
- "We'll do..."
- "Agreed:..."
- "Final decision:..."

### Examples

| Utterance | Extracted |
|-----------|-----------|
| "We decided to postpone the launch" | DECISION: Postpone launch |
| "Let's go with option B" | DECISION: Option B selected |
| "We'll use React for the frontend" | DECISION: React for frontend |

### Schema
```json
{
  "type": "DECISION",
  "text": "string - the decision",
  "context": "string - why this decision",
  "participants": ["string"] ,
  "reversible": "boolean",
  "source_segment": "number"
}
```

---

## 8. QUESTION

**Description**: A question raised during the meeting

### Trigger Phrases
- Questions ending with "?"
- "What about..."
- "How do we..."
- "Who is..."
- "When will..."
- "Can someone explain..."

### Schema
```json
{
  "type": "QUESTION",
  "text": "string - the question",
  "asker": "string - who asked",
  "answered": "boolean",
  "answer": "string|null",
  "source_segment": "number"
}
```

---

## 9. ANSWER

**Description**: An answer to a previously asked question

### Schema
```json
{
  "type": "ANSWER",
  "text": "string - the answer",
  "answerer": "string - who answered",
  "question_ref": "number - source_segment of question",
  "source_segment": "number"
}
```

---

## Intent Detection Pipeline

```python
def detect_intents(transcript: Transcript) -> List[Intent]:
    """
    Multi-pass intent detection:
    1. Rule-based quick scan (high-confidence patterns)
    2. LLM extraction (nuanced understanding)
    3. Cross-reference and merge
    4. Confidence scoring
    """
    
    # Pass 1: Rule-based
    rule_intents = apply_rules(transcript)
    
    # Pass 2: LLM extraction
    llm_intents = llm_extract(transcript)
    
    # Pass 3: Merge and dedupe
    merged = merge_intents(rule_intents, llm_intents)
    
    # Pass 4: Confidence scoring
    scored = score_confidence(merged, transcript)
    
    return scored
```

---

## Confidence Thresholds

| Action | Minimum Confidence |
|--------|-------------------|
| Create GitHub Issue | 0.85 |
| Create Calendar Event | 0.80 |
| Create Task | 0.75 |
| Send Notification | 0.70 |
| Include in Summary | 0.60 |

Items below threshold → flagged for human review
