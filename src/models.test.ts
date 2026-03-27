/**
 * Type-shape assertions for all interfaces exported from models.ts.
 * These tests verify that the type definitions compile correctly and that
 * objects conforming to the interfaces have the expected properties.
 */

import type {
  IntentType,
  Priority,
  Intent,
  CreatedIssue,
  TranscriptSegment,
  MeetingSummary,
} from './models.js';

describe('models', () => {
  describe('IntentType', () => {
    it('accepts all valid intent types', () => {
      const types: IntentType[] = ['BUG', 'FEATURE', 'TODO', 'DECISION', 'MEETING_REQUEST'];
      expect(types).toHaveLength(5);
    });

    it('each value is a string', () => {
      const bug: IntentType = 'BUG';
      const feature: IntentType = 'FEATURE';
      const todo: IntentType = 'TODO';
      const decision: IntentType = 'DECISION';
      const meetingRequest: IntentType = 'MEETING_REQUEST';

      expect(typeof bug).toBe('string');
      expect(typeof feature).toBe('string');
      expect(typeof todo).toBe('string');
      expect(typeof decision).toBe('string');
      expect(typeof meetingRequest).toBe('string');
    });
  });

  describe('Priority', () => {
    it('accepts all valid priority levels', () => {
      const priorities: Priority[] = ['low', 'medium', 'high', 'critical'];
      expect(priorities).toHaveLength(4);
    });
  });

  describe('Intent', () => {
    it('has the correct shape with all required fields', () => {
      const intent: Intent = {
        id: 'abc-123',
        type: 'BUG',
        text: 'Fix the login button',
        owner: 'alice',
        deadline: '2026-04-01',
        priority: 'high',
        confidence: 0.95,
        sourceQuote: 'We need to fix the login button ASAP',
      };

      expect(intent.id).toBe('abc-123');
      expect(intent.type).toBe('BUG');
      expect(intent.text).toBe('Fix the login button');
      expect(intent.owner).toBe('alice');
      expect(intent.deadline).toBe('2026-04-01');
      expect(intent.priority).toBe('high');
      expect(intent.confidence).toBe(0.95);
      expect(intent.sourceQuote).toBe('We need to fix the login button ASAP');
    });

    it('allows null for owner and deadline', () => {
      const intent: Intent = {
        id: 'abc-456',
        type: 'TODO',
        text: 'Refactor auth module',
        owner: null,
        deadline: null,
        priority: 'medium',
        confidence: 0.88,
        sourceQuote: 'Someone should refactor the auth module',
      };

      expect(intent.owner).toBeNull();
      expect(intent.deadline).toBeNull();
    });
  });

  describe('CreatedIssue', () => {
    it('has the correct shape with all required fields', () => {
      const issue: CreatedIssue = {
        intentText: 'Fix the login button',
        issueUrl: 'https://github.com/org/repo/issues/42',
        issueNumber: 42,
        title: 'Bug: login button broken',
      };

      expect(issue.intentText).toBe('Fix the login button');
      expect(issue.issueUrl).toBe('https://github.com/org/repo/issues/42');
      expect(issue.issueNumber).toBe(42);
      expect(issue.title).toBe('Bug: login button broken');
    });
  });

  describe('TranscriptSegment', () => {
    it('has the correct shape with a speaker', () => {
      const segment: TranscriptSegment = {
        text: 'Let us discuss the roadmap.',
        speaker: 'Alice',
        timestamp: 12.5,
      };

      expect(segment.text).toBe('Let us discuss the roadmap.');
      expect(segment.speaker).toBe('Alice');
      expect(segment.timestamp).toBe(12.5);
    });

    it('allows null for speaker', () => {
      const segment: TranscriptSegment = {
        text: 'Unknown speaker fragment.',
        speaker: null,
        timestamp: 30.0,
      };

      expect(segment.speaker).toBeNull();
    });
  });

  describe('MeetingSummary', () => {
    it('has the correct shape with all required fields', () => {
      const now = new Date();
      const later = new Date(now.getTime() + 3600_000);

      const summary: MeetingSummary = {
        meetingId: 'meeting-789',
        startTime: now,
        endTime: later,
        intents: [],
        createdIssues: [],
        decisions: [],
        markdown: '# Meeting Summary\n\nNo intents detected.',
      };

      expect(summary.meetingId).toBe('meeting-789');
      expect(summary.startTime).toBe(now);
      expect(summary.endTime).toBe(later);
      expect(summary.intents).toEqual([]);
      expect(summary.createdIssues).toEqual([]);
      expect(summary.decisions).toEqual([]);
      expect(summary.markdown).toContain('Meeting Summary');
    });

    it('holds populated intents and issues arrays', () => {
      const intent: Intent = {
        id: 'i-1',
        type: 'FEATURE',
        text: 'Add dark mode',
        owner: 'bob',
        deadline: null,
        priority: 'medium',
        confidence: 0.9,
        sourceQuote: 'We should add dark mode',
      };

      const issue: CreatedIssue = {
        intentText: 'Add dark mode',
        issueUrl: 'https://github.com/org/repo/issues/10',
        issueNumber: 10,
        title: 'Feature: dark mode',
      };

      const summary: MeetingSummary = {
        meetingId: 'meeting-abc',
        startTime: new Date(),
        endTime: new Date(),
        intents: [intent],
        createdIssues: [issue],
        decisions: ['Ship dark mode by Q3'],
        markdown: '# Summary',
      };

      expect(summary.intents).toHaveLength(1);
      expect(summary.intents[0]).toBe(intent);
      expect(summary.createdIssues).toHaveLength(1);
      expect(summary.createdIssues[0]).toBe(issue);
      expect(summary.decisions).toEqual(['Ship dark mode by Q3']);
    });
  });
});
