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

export type PermissionState = 'granted' | 'denied' | 'not_needed';
export type MockContextMode = 'auto' | 'manual_review' | 'read_only';

export interface SerializedMeetingSession {
  meetingId: string;
  url: string;
  startTime: string;
  botId: string | null;
  websocketUrl: string | null;
  isActive: boolean;
  transcriptBuffer: TranscriptSegment[];
  intents: Intent[];
  createdIssues: CreatedIssue[];
  decisions: string[];
}

export interface MockMeetingContext {
  permissions: {
    github: PermissionState;
    calendar: PermissionState;
    telegram: PermissionState;
  };
  expectedMode: MockContextMode;
}

export interface MockMeetingContextBundle {
  fixtureId: string;
  description: string;
  mockContext: MockMeetingContext;
  session: SerializedMeetingSession;
}
