/**
 * Core type definitions for MeetingClaw.
 * All modules import from here — this is the single source of truth for data shapes.
 */

export type IntentType = 'BUG' | 'FEATURE' | 'TODO' | 'DECISION' | 'MEETING_REQUEST';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface Intent {
  id: string;
  type: IntentType;
  text: string;
  owner: string | null;
  deadline: string | null;
  priority: Priority;
  confidence: number;
  sourceQuote: string;
}

export interface CreatedIssue {
  intentText: string;
  issueUrl: string;
  issueNumber: number;
  title: string;
}

export interface TranscriptSegment {
  text: string;
  speaker: string | null;
  timestamp: number;
}

export interface MeetingSummary {
  meetingId: string;
  startTime: Date;
  endTime: Date;
  intents: Intent[];
  createdIssues: CreatedIssue[];
  decisions: string[];
  markdown: string;
}
