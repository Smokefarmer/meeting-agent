/**
 * Tests for the MeetingSession class — in-memory meeting state.
 */

import { MeetingSession } from './session.js';
import type { OpenClawConfig } from './config.js';
import type { Intent, CreatedIssue, TranscriptSegment } from './models.js';

/** Minimal valid config for constructing sessions. */
function makeConfig(overrides: Partial<OpenClawConfig> = {}): OpenClawConfig {
  return {
    instanceName: 'test-bot',
    recallApiKey: 'sk-recall-test',
    elevenLabsApiKey: 'sk-eleven-test',
    openclawGatewayPort: 18789,
    openclawHooksToken: 'test-token',
    githubToken: null,
    githubRepo: null,
    telegramBotToken: null,
    telegramChatId: null,
    confidenceThreshold: 0.85,
    ...overrides,
  };
}

function makeIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: 'intent-1',
    type: 'TODO',
    text: 'Write tests',
    owner: null,
    deadline: null,
    priority: 'medium',
    confidence: 0.9,
    sourceQuote: 'We need to write tests',
    ...overrides,
  };
}

function makeSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    text: 'Hello everyone.',
    speaker: 'Alice',
    timestamp: 0.0,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<CreatedIssue> = {}): CreatedIssue {
  return {
    intentText: 'Fix the bug',
    issueUrl: 'https://github.com/org/repo/issues/1',
    issueNumber: 1,
    title: 'Bug: something is broken',
    ...overrides,
  };
}

describe('MeetingSession', () => {
  const testUrl = 'https://meet.google.com/abc-defg-hij';
  const config = makeConfig();

  describe('constructor', () => {
    it('assigns a UUID as meetingId', () => {
      const session = new MeetingSession(testUrl, config);

      expect(session.meetingId).toBeDefined();
      expect(typeof session.meetingId).toBe('string');
      // UUID v4 format: 8-4-4-4-12 hex chars
      expect(session.meetingId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('stores the provided url', () => {
      const session = new MeetingSession(testUrl, config);

      expect(session.url).toBe(testUrl);
    });

    it('sets startTime to approximately now', () => {
      const before = new Date();
      const session = new MeetingSession(testUrl, config);
      const after = new Date();

      expect(session.startTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.startTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('stores the provided config', () => {
      const session = new MeetingSession(testUrl, config);

      expect(session.config).toBe(config);
    });

    it('sets isActive to true', () => {
      const session = new MeetingSession(testUrl, config);

      expect(session.isActive).toBe(true);
    });

    it('initializes botId as null', () => {
      const session = new MeetingSession(testUrl, config);

      expect(session.botId).toBeNull();
    });

    it('initializes all arrays as empty', () => {
      const session = new MeetingSession(testUrl, config);

      expect(session.transcriptBuffer).toEqual([]);
      expect(session.intents).toEqual([]);
      expect(session.createdIssues).toEqual([]);
      expect(session.decisions).toEqual([]);
    });

    it('generates unique meetingIds for different sessions', () => {
      const session1 = new MeetingSession(testUrl, config);
      const session2 = new MeetingSession(testUrl, config);

      expect(session1.meetingId).not.toBe(session2.meetingId);
    });
  });

  describe('addSegment', () => {
    it('appends a segment to transcriptBuffer', () => {
      const session = new MeetingSession(testUrl, config);
      const segment = makeSegment();

      session.addSegment(segment);

      expect(session.transcriptBuffer).toHaveLength(1);
      expect(session.transcriptBuffer[0]).toBe(segment);
    });

    it('preserves insertion order for multiple segments', () => {
      const session = new MeetingSession(testUrl, config);
      const seg1 = makeSegment({ text: 'First', timestamp: 0 });
      const seg2 = makeSegment({ text: 'Second', timestamp: 5 });
      const seg3 = makeSegment({ text: 'Third', timestamp: 10 });

      session.addSegment(seg1);
      session.addSegment(seg2);
      session.addSegment(seg3);

      expect(session.transcriptBuffer).toHaveLength(3);
      expect(session.transcriptBuffer[0].text).toBe('First');
      expect(session.transcriptBuffer[1].text).toBe('Second');
      expect(session.transcriptBuffer[2].text).toBe('Third');
    });
  });

  describe('addIntent', () => {
    it('appends an intent to the intents array', () => {
      const session = new MeetingSession(testUrl, config);
      const intent = makeIntent({ type: 'BUG' });

      session.addIntent(intent);

      expect(session.intents).toHaveLength(1);
      expect(session.intents[0]).toBe(intent);
    });

    it('does not add non-DECISION intents to decisions', () => {
      const session = new MeetingSession(testUrl, config);

      session.addIntent(makeIntent({ type: 'BUG' }));
      session.addIntent(makeIntent({ type: 'FEATURE' }));
      session.addIntent(makeIntent({ type: 'TODO' }));
      session.addIntent(makeIntent({ type: 'MEETING_REQUEST' }));

      expect(session.intents).toHaveLength(4);
      expect(session.decisions).toHaveLength(0);
    });

    it('adds DECISION intents to both intents and decisions', () => {
      const session = new MeetingSession(testUrl, config);
      const decision = makeIntent({
        type: 'DECISION',
        text: 'Ship feature by Friday',
      });

      session.addIntent(decision);

      expect(session.intents).toHaveLength(1);
      expect(session.intents[0]).toBe(decision);
      expect(session.decisions).toHaveLength(1);
      expect(session.decisions[0]).toBe('Ship feature by Friday');
    });

    it('correctly tracks mixed intent types', () => {
      const session = new MeetingSession(testUrl, config);

      session.addIntent(makeIntent({ type: 'BUG', text: 'Fix login' }));
      session.addIntent(makeIntent({ type: 'DECISION', text: 'Use React' }));
      session.addIntent(makeIntent({ type: 'TODO', text: 'Write docs' }));
      session.addIntent(makeIntent({ type: 'DECISION', text: 'Deploy Friday' }));

      expect(session.intents).toHaveLength(4);
      expect(session.decisions).toHaveLength(2);
      expect(session.decisions).toEqual(['Use React', 'Deploy Friday']);
    });
  });

  describe('addCreatedIssue', () => {
    it('appends an issue to createdIssues', () => {
      const session = new MeetingSession(testUrl, config);
      const issue = makeIssue();

      session.addCreatedIssue(issue);

      expect(session.createdIssues).toHaveLength(1);
      expect(session.createdIssues[0]).toBe(issue);
    });

    it('preserves insertion order for multiple issues', () => {
      const session = new MeetingSession(testUrl, config);
      const issue1 = makeIssue({ issueNumber: 1, title: 'First' });
      const issue2 = makeIssue({ issueNumber: 2, title: 'Second' });

      session.addCreatedIssue(issue1);
      session.addCreatedIssue(issue2);

      expect(session.createdIssues).toHaveLength(2);
      expect(session.createdIssues[0].title).toBe('First');
      expect(session.createdIssues[1].title).toBe('Second');
    });
  });

  describe('getTranscriptText', () => {
    it('returns empty string for empty buffer', () => {
      const session = new MeetingSession(testUrl, config);

      expect(session.getTranscriptText()).toBe('');
    });

    it('formats segments with speakers as "Speaker: text"', () => {
      const session = new MeetingSession(testUrl, config);
      session.addSegment(makeSegment({ speaker: 'Alice', text: 'Hello' }));

      expect(session.getTranscriptText()).toBe('Alice: Hello');
    });

    it('formats segments without speakers as plain text', () => {
      const session = new MeetingSession(testUrl, config);
      session.addSegment(makeSegment({ speaker: null, text: 'Unknown voice' }));

      expect(session.getTranscriptText()).toBe('Unknown voice');
    });

    it('joins multiple segments with newlines', () => {
      const session = new MeetingSession(testUrl, config);
      session.addSegment(makeSegment({ speaker: 'Alice', text: 'Hi everyone', timestamp: 0 }));
      session.addSegment(makeSegment({ speaker: 'Bob', text: 'Hey Alice', timestamp: 2 }));
      session.addSegment(makeSegment({ speaker: null, text: '(inaudible)', timestamp: 5 }));

      const expected = 'Alice: Hi everyone\nBob: Hey Alice\n(inaudible)';
      expect(session.getTranscriptText()).toBe(expected);
    });

    it('handles a single segment without speaker', () => {
      const session = new MeetingSession(testUrl, config);
      session.addSegment(makeSegment({ speaker: null, text: 'Just text' }));

      expect(session.getTranscriptText()).toBe('Just text');
    });
  });

  describe('end', () => {
    it('sets isActive to false', () => {
      const session = new MeetingSession(testUrl, config);
      expect(session.isActive).toBe(true);

      session.end();

      expect(session.isActive).toBe(false);
    });

    it('can be called multiple times without error', () => {
      const session = new MeetingSession(testUrl, config);

      session.end();
      session.end();

      expect(session.isActive).toBe(false);
    });
  });
});
