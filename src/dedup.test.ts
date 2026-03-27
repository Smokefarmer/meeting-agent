/**
 * Tests for intent deduplication — Jaccard similarity, text normalization, and
 * duplicate detection against a MeetingSession.
 */

import { jaccardSimilarity, normalizeText, isDuplicate } from './dedup.js';
import { MeetingSession } from './session.js';
import type { OpenClawConfig } from './config.js';
import type { Intent } from './models.js';

/** Minimal valid config for constructing sessions. */
function makeConfig(overrides: Partial<OpenClawConfig> = {}): OpenClawConfig {
  return {
    instanceName: 'test-bot',
    skribbyApiKey: 'sk-skribby-test',
    elevenLabsApiKey: 'sk-eleven-test',
    anthropicApiKey: 'sk-ant-test',
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
    id: 'test-id',
    type: 'BUG',
    text: 'Login page crashes on mobile',
    owner: null,
    deadline: null,
    priority: 'high',
    confidence: 0.95,
    sourceQuote: 'The login page crashes on mobile',
    ...overrides,
  };
}

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1.0);
  });

  it('returns 0.0 for completely different words', () => {
    expect(jaccardSimilarity('hello world', 'foo bar')).toBe(0.0);
  });

  it('returns correct ratio for partial overlap', () => {
    // "hello world" vs "hello there" => sets {hello, world} and {hello, there}
    // intersection = {hello} size 1, union = {hello, world, there} size 3
    // 1/3 ≈ 0.333
    const result = jaccardSimilarity('hello world', 'hello there');

    expect(result).toBeCloseTo(1 / 3, 5);
  });

  it('returns 1.0 when both strings are empty', () => {
    expect(jaccardSimilarity('', '')).toBe(1.0);
  });

  it('returns 0.0 when one string is empty and the other is not', () => {
    expect(jaccardSimilarity('', 'hello')).toBe(0.0);
    expect(jaccardSimilarity('hello', '')).toBe(0.0);
  });

  it('returns 1.0 for same words in different order', () => {
    expect(jaccardSimilarity('hello world foo', 'foo hello world')).toBe(1.0);
  });

  it('returns 0.5 for two words with one in common', () => {
    // {a, b} vs {b, c} => intersection 1, union 3 => 1/3
    // Actually: {the, cat} vs {the, dog} => intersection {the}=1, union {the,cat,dog}=3
    const result = jaccardSimilarity('the cat', 'the dog');

    expect(result).toBeCloseTo(1 / 3, 5);
  });

  it('handles duplicate words within a string (set semantics)', () => {
    // "hello hello hello" => set {hello}, "hello" => set {hello}
    // intersection = 1, union = 1 => 1.0
    expect(jaccardSimilarity('hello hello hello', 'hello')).toBe(1.0);
  });

  it('returns correct ratio for larger overlap', () => {
    // {a, b, c, d} vs {a, b, c, e} => intersection 3, union 5 => 3/5 = 0.6
    const result = jaccardSimilarity('a b c d', 'a b c e');

    expect(result).toBeCloseTo(3 / 5, 5);
  });
});

describe('normalizeText', () => {
  it('lowercases text', () => {
    expect(normalizeText('Hello World')).toBe('hello world');
  });

  it('strips punctuation', () => {
    expect(normalizeText('Hello, world!')).toBe('hello world');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello world  ')).toBe('hello world');
  });

  it('handles all normalizations together', () => {
    expect(normalizeText('  Hello,  World!  ')).toBe('hello world');
  });

  it('removes various punctuation marks', () => {
    expect(normalizeText('hello... world? yes!')).toBe('hello world yes');
  });

  it('preserves underscores (\\w includes underscores)', () => {
    expect(normalizeText('hello_world')).toBe('hello_world');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  it('handles string of only punctuation and spaces', () => {
    expect(normalizeText('!@#$%^&*()')).toBe('');
  });

  it('collapses spaces left by removed punctuation', () => {
    expect(normalizeText('a - b - c')).toBe('a b c');
  });
});

describe('isDuplicate', () => {
  const config = makeConfig();
  const testUrl = 'https://meet.google.com/abc-defg-hij';

  function makeSession(): MeetingSession {
    return new MeetingSession(testUrl, config);
  }

  it('returns false when session has no existing intents', () => {
    const session = makeSession();
    const intent = makeIntent();

    expect(isDuplicate(intent, session)).toBe(false);
  });

  it('returns true for same type and identical text', () => {
    const session = makeSession();
    session.addIntent(makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' }));

    const incoming = makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' });

    expect(isDuplicate(incoming, session)).toBe(true);
  });

  it('returns true for same type and similar text above 0.80 threshold', () => {
    const session = makeSession();
    // "login page crashes on mobile" => 5 words
    session.addIntent(makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' }));

    // "Login page crashes on tablet" => 5 words
    // Overlap: {login, page, crashes, on} = 4, Union: {login, page, crashes, on, mobile, tablet} = 6
    // Jaccard = 4/6 = 0.667 — below threshold, so use a closer match:
    // "Login page crashes on mobile devices" => 6 words
    // Overlap with original (5 words): {login, page, crashes, on, mobile} = 5, Union = 6
    // Jaccard = 5/6 ≈ 0.833 — above 0.80
    const incoming = makeIntent({ type: 'BUG', text: 'Login page crashes on mobile devices' });

    expect(isDuplicate(incoming, session)).toBe(true);
  });

  it('returns false for same type but different text below threshold', () => {
    const session = makeSession();
    session.addIntent(makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' }));

    // Completely different text
    const incoming = makeIntent({ type: 'BUG', text: 'Database connection timeout during sync' });

    expect(isDuplicate(incoming, session)).toBe(false);
  });

  it('returns false for different type but identical text', () => {
    const session = makeSession();
    session.addIntent(makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' }));

    const incoming = makeIntent({ type: 'FEATURE', text: 'Login page crashes on mobile' });

    expect(isDuplicate(incoming, session)).toBe(false);
  });

  it('returns true when one of multiple intents in session matches', () => {
    const session = makeSession();
    session.addIntent(makeIntent({ type: 'FEATURE', text: 'Add dark mode support' }));
    session.addIntent(makeIntent({ type: 'TODO', text: 'Write unit tests for auth module' }));
    session.addIntent(makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' }));

    const incoming = makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' });

    expect(isDuplicate(incoming, session)).toBe(true);
  });

  it('ignores case and punctuation when comparing text', () => {
    const session = makeSession();
    session.addIntent(makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' }));

    const incoming = makeIntent({ type: 'BUG', text: 'LOGIN PAGE CRASHES ON MOBILE!' });

    expect(isDuplicate(incoming, session)).toBe(true);
  });

  it('returns false when multiple intents exist but none match type and text', () => {
    const session = makeSession();
    session.addIntent(makeIntent({ type: 'FEATURE', text: 'Add dark mode support' }));
    session.addIntent(makeIntent({ type: 'TODO', text: 'Write unit tests' }));
    session.addIntent(makeIntent({ type: 'DECISION', text: 'Use PostgreSQL' }));

    const incoming = makeIntent({ type: 'BUG', text: 'Login page crashes on mobile' });

    expect(isDuplicate(incoming, session)).toBe(false);
  });

  it('returns false when type matches but text similarity is just below threshold', () => {
    const session = makeSession();
    // "fix the login page" => 4 words
    session.addIntent(makeIntent({ type: 'BUG', text: 'fix the login page' }));

    // "fix the registration form completely" => 5 words
    // Overlap: {fix, the} = 2, Union: {fix, the, login, page, registration, form, completely} = 7
    // Jaccard = 2/7 ≈ 0.286 — well below threshold
    const incoming = makeIntent({ type: 'BUG', text: 'fix the registration form completely' });

    expect(isDuplicate(incoming, session)).toBe(false);
  });
});
