# MeetingAgent - LLM Prompts

## Overview

This document contains all LLM prompts used for intent extraction and classification.

---

## 1. Main Extraction Prompt

```
You are an expert meeting analyst. Your job is to extract actionable items from meeting transcripts.

Given a meeting transcript, identify and extract:
1. **TODOs**: Tasks that need to be done
2. **BUGs**: Software bugs or issues reported
3. **FEATUREs**: Feature requests or enhancement ideas
4. **MEETING_REQUESTs**: Requests to schedule follow-up meetings
5. **DECISIONs**: Decisions made during the meeting
6. **QUESTIONs**: Questions raised (especially unanswered ones)

For each item, extract:
- **type**: The category (TODO, BUG, FEATURE, MEETING_REQUEST, DECISION, QUESTION)
- **text**: A clear, concise description
- **owner**: Who is responsible (if mentioned)
- **deadline**: When it should be done (if mentioned)
- **priority**: low, medium, high, or critical (infer from context)
- **source_quote**: The exact quote from the transcript
- **confidence**: Your confidence in this extraction (0.0-1.0)

## Rules:
1. Only extract items that are ACTIONABLE or IMPORTANT
2. Skip small talk, greetings, and irrelevant discussion
3. If someone says "I'll do X", that's a TODO assigned to them
4. If someone says "[Name], can you do X?", that's a TODO assigned to [Name]
5. Words like "bug", "broken", "doesn't work", "error" indicate BUGs
6. Words like "would be nice", "we should add", "feature request" indicate FEATUREs
7. Words like "let's meet", "schedule a call", "sync next week" indicate MEETING_REQUESTs
8. Words like "we decided", "let's go with", "agreed" indicate DECISIONs
9. Be conservative - when in doubt, don't extract
10. Ignore hypotheticals ("if we had time...", "we could...")

## Output Format:
Return a JSON object with this structure:
{
  "items": [
    {
      "type": "TODO",
      "text": "Clear description of the task",
      "owner": "Person Name" or null,
      "deadline": "2026-03-28" or "Friday" or null,
      "priority": "high",
      "source_quote": "Exact quote from transcript",
      "confidence": 0.95
    }
  ],
  "summary": "Brief 2-3 sentence summary of the meeting"
}

## Transcript:
{transcript}
```

---

## 2. Extraction with Context

When we have meeting metadata, include it:

```
You are an expert meeting analyst. Your job is to extract actionable items from meeting transcripts.

## Meeting Context:
- **Title**: {meeting_title}
- **Date**: {meeting_date}
- **Participants**: {participants}
- **Project**: {project}

## Participant Mapping (for owner assignment):
{participant_mapping}

Given this context, analyze the transcript and extract actionable items...

[Rest of prompt same as above]
```

---

## 3. Bug-Specific Extraction

For meetings focused on bug triage:

```
You are a bug triage specialist analyzing a meeting transcript.

Extract all software bugs, issues, and problems mentioned. For each bug:

- **title**: Short, descriptive title
- **description**: Detailed description of the issue
- **severity**: critical, high, medium, low
- **platform**: Where the bug occurs (web, mobile, iOS, Android, etc.)
- **reproduction_steps**: How to reproduce (if mentioned)
- **affected_users**: Who is affected
- **reported_by**: Who reported it
- **workaround**: Any temporary fix mentioned
- **source_quote**: Exact quote

## Severity Guidelines:
- **critical**: System down, data loss, security issue, blocking users
- **high**: Major feature broken, significant user impact
- **medium**: Feature partially works, workaround exists
- **low**: Minor issue, cosmetic, edge case

Return JSON:
{
  "bugs": [...]
}
```

---

## 4. Meeting Summary Prompt

```
You are a professional meeting notes writer.

Given this meeting transcript, write a clear, concise meeting summary.

## Format:
# Meeting: {title}
**Date**: {date}
**Attendees**: {attendees}

## Summary
[2-3 paragraph summary of what was discussed]

## Key Decisions
- Decision 1
- Decision 2

## Action Items
| Owner | Task | Deadline |
|-------|------|----------|
| Name | Task description | Date |

## Open Questions
- Question 1
- Question 2

## Next Steps
- What happens next

---

## Guidelines:
1. Be concise but complete
2. Use bullet points for clarity
3. Include all action items with clear owners
4. Note any unresolved issues
5. Keep professional tone
6. Don't include small talk or off-topic discussion

## Transcript:
{transcript}
```

---

## 5. Intent Classification Prompt

For classifying a single statement:

```
Classify this statement from a meeting transcript.

Statement: "{statement}"
Speaker: {speaker}
Context: {surrounding_context}

Categories:
- TODO: A task to be done
- BUG: A software bug or issue
- FEATURE: A feature request
- MEETING_REQUEST: Request for a follow-up meeting
- DECISION: A decision being made
- QUESTION: A question being asked
- NONE: Not actionable / just discussion

Return JSON:
{
  "category": "TODO",
  "confidence": 0.9,
  "reasoning": "Brief explanation"
}
```

---

## 6. Date/Time Resolution Prompt

```
Convert this relative time reference to an absolute date.

Reference: "{time_reference}"
Meeting Date: {meeting_date}
Current Day of Week: {day_of_week}

Examples:
- "next Tuesday" → First Tuesday after meeting date
- "end of week" → Friday of that week
- "in 2 weeks" → Meeting date + 14 days
- "tomorrow" → Meeting date + 1 day
- "by Friday" → That Friday

Return JSON:
{
  "interpreted_date": "2026-03-28",
  "is_deadline": true,
  "confidence": 0.95
}
```

---

## 7. Owner Resolution Prompt

```
Identify who is responsible for this task.

Task: "{task_description}"
Statement: "{full_statement}"
Participants: {participant_list}
Speaker: {speaker_name}

Rules:
1. If someone says "I'll do X", owner is the speaker
2. If someone says "[Name], can you X?", owner is [Name]
3. If someone says "We need to X", owner is unclear (return null)
4. Match names to participants list when possible

Return JSON:
{
  "owner_name": "Tom",
  "owner_email": "tom@example.com",
  "confidence": 0.9,
  "reasoning": "Tom said 'I will handle this'"
}
```

---

## 8. GitHub Issue Body Prompt

```
Create a GitHub issue body from this meeting-extracted bug/feature.

Type: {type}
Title: {title}
Description: {description}
Meeting: {meeting_title}
Date: {meeting_date}
Reported By: {reporter}
Severity: {severity}

Format the issue body in Markdown:

## Description
[Detailed description]

## Context
- Reported in: {meeting_title} ({meeting_date})
- Reported by: {reporter}
[If BUG] - Severity: {severity}

## Details
[Any additional details from the transcript]

[If reproduction steps exist]
## Reproduction Steps
1. Step 1
2. Step 2

---
*This issue was automatically created by MeetingAgent*
```

---

## 9. Confidence Calibration

Add to any prompt when confidence is important:

```
## Confidence Guidelines:
- 0.95-1.0: Explicit, unambiguous statement ("I will fix the bug by Friday")
- 0.85-0.94: Clear implication ("Can you handle the API?" → TODO for that person)
- 0.70-0.84: Reasonable inference from context
- 0.50-0.69: Possible but uncertain
- Below 0.50: Don't extract, too uncertain

When in doubt, lower your confidence rather than miss-classifying.
```

---

## 10. Multi-language Support

```
You are analyzing a meeting transcript that may contain multiple languages.

Primary language: {detected_language}
Secondary languages detected: {other_languages}

## Instructions:
1. Extract items regardless of language
2. Translate item descriptions to {output_language}
3. Keep original names/terms that shouldn't be translated
4. Note the original language if relevant

[Rest of extraction prompt]
```

---

## Prompt Engineering Tips

### 1. Few-shot Examples

Add 2-3 examples to improve accuracy:

```
## Examples:

Transcript segment:
"Tom: I'll update the documentation by Friday."

Extracted:
{
  "type": "TODO",
  "text": "Update the documentation",
  "owner": "Tom",
  "deadline": "Friday",
  "priority": "medium",
  "confidence": 0.95
}

---

Transcript segment:
"Anna: The login page is completely broken on mobile."

Extracted:
{
  "type": "BUG",
  "text": "Login page broken on mobile",
  "severity": "high",
  "platform": "mobile",
  "reported_by": "Anna",
  "confidence": 0.98
}
```

### 2. Chain of Thought

For complex extractions:

```
Before extracting, analyze the transcript:
1. First, identify all speakers and their roles
2. Then, scan for action-oriented language
3. Group related statements together
4. Finally, extract structured items

Show your reasoning briefly, then output the JSON.
```

### 3. Handling Ambiguity

```
If a statement is ambiguous:
1. Consider the surrounding context
2. Consider who said it and their role
3. If still uncertain, include it with lower confidence
4. Add a "notes" field explaining the ambiguity

Example:
{
  "type": "TODO",
  "text": "Review the security settings",
  "owner": null,
  "confidence": 0.65,
  "notes": "Unclear who should do this - mentioned but not assigned"
}
```

---

## Testing Prompts

### Test Cases

1. **Clear TODO**: "Tom, can you fix the header by tomorrow?"
   - Expected: TODO, owner=Tom, deadline=tomorrow

2. **Self-assignment**: "I'll take care of the deployment"
   - Expected: TODO, owner=speaker

3. **Bug report**: "Users are getting a 500 error on checkout"
   - Expected: BUG, severity=high

4. **Feature request**: "It would be amazing if we had dark mode"
   - Expected: FEATURE

5. **Hypothetical (should skip)**: "If we had more budget, we could hire someone"
   - Expected: No extraction (hypothetical)

6. **Meeting request**: "Let's sync again next Tuesday"
   - Expected: MEETING_REQUEST, proposed_time=next Tuesday

7. **Decision**: "Okay, we're going with option B"
   - Expected: DECISION

8. **Question**: "How does the caching work?"
   - Expected: QUESTION or skip (depends on if it was answered)
