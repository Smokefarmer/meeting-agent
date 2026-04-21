import type { MockMeetingContextBundle } from '../../models.js';

const baselineActiveSession: MockMeetingContextBundle = {
  fixtureId: 'baseline-active-session',
  description: 'Active product sync with extracted intents and one created GitHub issue.',
  mockContext: {
    permissions: {
      github: 'granted',
      calendar: 'granted',
      telegram: 'granted',
    },
    expectedMode: 'auto',
  },
  session: {
    meetingId: 'meeting-baseline-001',
    url: 'https://meet.google.com/baseline-demo',
    startTime: '2026-04-19T20:00:00.000Z',
    botId: 'bot-baseline',
    websocketUrl: 'wss://recall.example.test/meeting-baseline-001',
    isActive: true,
    transcriptBuffer: [
      { speaker: 'Tom', text: 'The mobile login flow is still broken for invited users.', timestamp: 1713556800000 },
      { speaker: 'Anna', text: 'Please open a bug and I will update the docs after the call.', timestamp: 1713556860000 },
    ],
    intents: [
      {
        id: 'intent-bug-1',
        type: 'BUG',
        text: 'Fix invited-user mobile login flow',
        owner: null,
        deadline: null,
        priority: 'high',
        confidence: 0.96,
        sourceQuote: 'The mobile login flow is still broken for invited users.',
      },
      {
        id: 'intent-todo-1',
        type: 'TODO',
        text: 'Update login troubleshooting docs',
        owner: 'Anna',
        deadline: null,
        priority: 'medium',
        confidence: 0.93,
        sourceQuote: 'I will update the docs after the call.',
      },
    ],
    createdIssues: [
      {
        intentText: 'Fix invited-user mobile login flow',
        issueUrl: 'https://github.com/Genesis-Archive/meeting-agent/issues/42',
        issueNumber: 42,
        title: 'Bug: invited-user mobile login flow fails',
      },
    ],
    decisions: ['Treat invited-user mobile login as the top bug for the next sprint.'],
  },
};

export default baselineActiveSession;
