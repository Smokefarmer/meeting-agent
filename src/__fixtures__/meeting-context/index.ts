import type { MockMeetingContextBundle } from '../../models.js';

import assistantQuestionOnly from './assistant-question-only.js';
import baselineActiveSession from './baseline-active-session.js';
import calendarPermissionDenied from './calendar-permission-denied.js';
import githubPermissionDenied from './github-permission-denied.js';

export {
  assistantQuestionOnly,
  baselineActiveSession,
  calendarPermissionDenied,
  githubPermissionDenied,
};

export const meetingContextFixtures: MockMeetingContextBundle[] = [
  assistantQuestionOnly,
  baselineActiveSession,
  calendarPermissionDenied,
  githubPermissionDenied,
];
