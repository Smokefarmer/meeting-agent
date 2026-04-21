import { describe, expect, it } from 'vitest';

import type { MockMeetingContextBundle } from '../models.js';
import assistantQuestionOnly from '../__fixtures__/meeting-context/assistant-question-only.js';
import baselineActiveSession from '../__fixtures__/meeting-context/baseline-active-session.js';
import calendarPermissionDenied from '../__fixtures__/meeting-context/calendar-permission-denied.js';
import githubPermissionDenied from '../__fixtures__/meeting-context/github-permission-denied.js';

const fixtures: MockMeetingContextBundle[] = [
  assistantQuestionOnly,
  baselineActiveSession,
  calendarPermissionDenied,
  githubPermissionDenied,
];

describe('meeting context fixtures', () => {
  it('all fixtures match the expected typed meeting-context bundle shape', () => {
    for (const fixture of fixtures) {
      expect(fixture.fixtureId.length).toBeGreaterThan(0);
      expect(fixture.description.length).toBeGreaterThan(0);
      expect(fixture.session.url.startsWith('https://')).toBe(true);
      expect(Number.isFinite(Date.parse(fixture.session.startTime))).toBe(true);
    }
  });

  it('covers the baseline, read-only, and denied-permission cases needed for mock context tests', () => {
    const fixtureIds = new Set(fixtures.map((fixture) => fixture.fixtureId));

    expect(fixtureIds).toEqual(new Set([
      'assistant-question-only',
      'baseline-active-session',
      'calendar-permission-denied',
      'github-permission-denied',
    ]));
  });

  it('keeps denied-permission cases in manual review mode instead of auto execution', () => {
    const deniedCases = fixtures.filter((fixture) =>
      Object.values(fixture.mockContext.permissions).includes('denied'),
    );

    expect(deniedCases).toHaveLength(2);
    expect(deniedCases.every((fixture) => fixture.mockContext.expectedMode === 'manual_review')).toBe(true);
  });

  it('keeps the assistant-question-only fixture free of write-required integrations', () => {
    expect(assistantQuestionOnly.mockContext.permissions).toEqual({
      github: 'not_needed',
      calendar: 'not_needed',
      telegram: 'not_needed',
    });
    expect(assistantQuestionOnly.mockContext.expectedMode).toBe('read_only');
  });
});
