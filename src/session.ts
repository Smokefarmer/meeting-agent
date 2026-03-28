import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import type { Intent, CreatedIssue, TranscriptSegment } from './models.js';
import type { OpenClawConfig } from './config.js';

const CHECKPOINT_DIR = 'data/meetings';
const DEFAULT_CHECKPOINT_INTERVAL_MS = 30_000;

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
  transcriptBuffer: TranscriptSegment[] = [];
  intents: Intent[] = [];
  createdIssues: CreatedIssue[] = [];
  decisions: string[] = [];
  isActive: boolean = true;

  private checkpointInterval: ReturnType<typeof setInterval> | null = null;

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

  /** Serialize all session state to a plain object. */
  toJSON(): Record<string, unknown> {
    return {
      meetingId: this.meetingId,
      url: this.url,
      startTime: this.startTime.toISOString(),
      botId: this.botId,
      websocketUrl: this.websocketUrl,
      isActive: this.isActive,
      transcriptBuffer: this.transcriptBuffer,
      intents: this.intents,
      createdIssues: this.createdIssues,
      decisions: this.decisions,
    };
  }

  /** Write checkpoint JSON to disk. Never throws — file errors are swallowed. */
  async saveCheckpoint(): Promise<void> {
    const path = `${CHECKPOINT_DIR}/${this.meetingId}-checkpoint.json`;
    try {
      await writeFile(path, JSON.stringify(this.toJSON(), null, 2), 'utf-8');
    } catch (err) {
      console.error(
        'Checkpoint write failed (non-fatal):',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /** Remove the checkpoint file. Never throws — file errors are swallowed. */
  async deleteCheckpoint(): Promise<void> {
    const path = `${CHECKPOINT_DIR}/${this.meetingId}-checkpoint.json`;
    try {
      await unlink(path);
    } catch (err) {
      console.error(
        'Checkpoint delete failed (non-fatal):',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /** Start periodic checkpoint writes. */
  startCheckpointing(intervalMs: number = DEFAULT_CHECKPOINT_INTERVAL_MS): void {
    this.checkpointInterval = setInterval(() => {
      this.saveCheckpoint().catch((err) => {
        console.error(
          'Checkpoint interval error:',
          err instanceof Error ? err.message : String(err),
        );
      });
    }, intervalMs);
  }

  /** Deactivate the session, clear checkpoint interval, write a final checkpoint. */
  async end(): Promise<void> {
    this.isActive = false;
    if (this.checkpointInterval !== null) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }
    await this.saveCheckpoint();
  }
}
