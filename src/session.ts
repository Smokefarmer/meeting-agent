import { randomUUID } from 'node:crypto';
import type { Intent, CreatedIssue, TranscriptSegment } from './models.js';
import type { OpenClawConfig } from './config.js';

/**
 * In-memory state for a single meeting session.
 * One instance per meeting — no database, no persistence beyond meeting lifetime.
 */
export class MeetingSession {
  readonly meetingId: string;
  readonly url: string;
  readonly startTime: Date;
  readonly config: OpenClawConfig;

  botId: string | null = null;
  websocketUrl: string | null = null;
  wsConnection: import('ws').WebSocket | null = null; // active WebSocket for sending actions
  transcriptBuffer: TranscriptSegment[] = [];
  intents: Intent[] = [];
  createdIssues: CreatedIssue[] = [];
  decisions: string[] = [];
  isActive: boolean = true;

  constructor(url: string, config: OpenClawConfig) {
    this.meetingId = randomUUID();
    this.url = url;
    this.startTime = new Date();
    this.config = config;
  }

  addSegment(segment: TranscriptSegment): void {
    this.transcriptBuffer.push(segment);
  }

  addIntent(intent: Intent): void {
    this.intents.push(intent);
    if (intent.type === 'DECISION') {
      this.decisions.push(intent.text);
    }
  }

  addCreatedIssue(issue: CreatedIssue): void {
    this.createdIssues.push(issue);
  }

  getTranscriptText(): string {
    return this.transcriptBuffer
      .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
      .join('\n');
  }

  end(): void {
    this.isActive = false;
  }
}
