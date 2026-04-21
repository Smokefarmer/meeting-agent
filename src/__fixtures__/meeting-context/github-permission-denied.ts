import type { MockMeetingContextBundle } from '../../models.js';

const githubPermissionDenied: MockMeetingContextBundle = {
  fixtureId: 'github-permission-denied',
  description: 'Meeting context where GitHub issue creation is blocked by missing permission.',
  mockContext: {
    permissions: {
      github: 'denied',
      calendar: 'granted',
      telegram: 'granted',
    },
    expectedMode: 'manual_review',
  },
  session: {
    meetingId: 'meeting-github-denied-001',
    url: 'https://meet.google.com/github-denied-demo',
    startTime: '2026-04-19T20:15:00.000Z',
    botId: 'bot-github-denied',
    websocketUrl: 'wss://recall.example.test/meeting-github-denied-001',
    isActive: true,
    transcriptBuffer: [
      { speaker: 'Tom', text: 'Can someone log the auth callback bug in GitHub?', timestamp: 1713557700000 },
      { speaker: 'Claude', text: 'I can capture it for review, but GitHub permissions are missing.', timestamp: 1713557760000 },
    ],
    intents: [
      {
        id: 'intent-bug-2',
        type: 'BUG',
        text: 'Investigate auth callback failure after OAuth redirect',
        owner: null,
        deadline: null,
        priority: 'high',
        confidence: 0.94,
        sourceQuote: 'Can someone log the auth callback bug in GitHub?',
      },
    ],
    createdIssues: [],
    decisions: ['Keep auth callback bug in the meeting summary until GitHub access is restored.'],
  },
};

export default githubPermissionDenied;
