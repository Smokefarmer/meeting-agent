import type { MockMeetingContextBundle } from '../../models.js';

const assistantQuestionOnly: MockMeetingContextBundle = {
  fixtureId: 'assistant-question-only',
  description: 'Read-only meeting context for spoken Q&A with no provider writes.',
  mockContext: {
    permissions: {
      github: 'not_needed',
      calendar: 'not_needed',
      telegram: 'not_needed',
    },
    expectedMode: 'read_only',
  },
  session: {
    meetingId: 'meeting-question-only-001',
    url: 'https://meet.google.com/question-only-demo',
    startTime: '2026-04-19T20:45:00.000Z',
    botId: 'bot-question-only',
    websocketUrl: 'wss://recall.example.test/meeting-question-only-001',
    isActive: true,
    transcriptBuffer: [
      { speaker: 'Tom', text: 'Claude, what did we decide about the release train?', timestamp: 1713559500000 },
      { speaker: 'Anna', text: 'We agreed to ship the staging cut on Friday.', timestamp: 1713559560000 },
    ],
    intents: [
      {
        id: 'intent-decision-1',
        type: 'DECISION',
        text: 'Ship the staging cut on Friday',
        owner: null,
        deadline: 'Friday',
        priority: 'medium',
        confidence: 0.95,
        sourceQuote: 'We agreed to ship the staging cut on Friday.',
      },
    ],
    createdIssues: [],
    decisions: ['Ship the staging cut on Friday.'],
  },
};

export default assistantQuestionOnly;
