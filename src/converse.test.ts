import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import {
  detectWakeWord,
  parseConversationResponse,
  handleAddressedSpeech,
  generateResponse,
} from './converse.js';
import { buildMeetingContext, CONVERSATION_SYSTEM_PROMPT } from './prompts.js';
import { MeetingSession } from './session.js';
import type { OpenClawConfig } from './config.js';
import type { LlmClient } from './llm.js';
import type { TranscriptSegment, Intent, CreatedIssue } from './models.js';

// ---------------------------------------------------------------------------
// Mock speak module
// ---------------------------------------------------------------------------

const mockRespond = vi.fn();

vi.mock('./speak.js', () => {
  return {
    respond: (...args: unknown[]) => mockRespond(...args),
  };
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const mockInfer = vi.fn();
const mockLlmClient: LlmClient = { infer: mockInfer };

function makeConfig(): OpenClawConfig {
  return {
    instanceName: 'MeetingClaw',
    recallApiKey: 'sk-test',
    elevenLabsApiKey: 'sk-test',
    githubToken: null,
    githubRepo: null,
    telegramBotToken: null,
    telegramChatId: null,
    confidenceThreshold: 0.85,
  };
}

function makeSegment(text: string, speaker: string | null = null): TranscriptSegment {
  return { text, speaker, timestamp: Date.now() };
}

function makeSession(config?: OpenClawConfig): MeetingSession {
  const c = config ?? makeConfig();
  const session = new MeetingSession('https://meet.example.com/test', c);
  session.botId = 'bot-123';
  return session;
}

// ---------------------------------------------------------------------------
// detectWakeWord
// ---------------------------------------------------------------------------

describe('detectWakeWord', () => {
  it('detects "Hey MeetingClaw" prefix and returns text after it', () => {
    expect(detectWakeWord(makeSegment('Hey MeetingClaw what was decided?'), 'MeetingClaw')).toBe('what was decided?');
  });

  it('detects "Hi MeetingClaw" prefix', () => {
    expect(detectWakeWord(makeSegment('Hi MeetingClaw summarize'), 'MeetingClaw')).toBe('summarize');
  });

  it('detects "Ok MeetingClaw" prefix', () => {
    expect(detectWakeWord(makeSegment('Ok MeetingClaw create an issue'), 'MeetingClaw')).toBe('create an issue');
  });

  it('detects bare instance name at the start', () => {
    expect(detectWakeWord(makeSegment("MeetingClaw what's the status?"), 'MeetingClaw')).toBe("what's the status?");
  });

  it('is case insensitive', () => {
    expect(detectWakeWord(makeSegment('hey MEETINGCLAW help'), 'MeetingClaw')).toBe('help');
  });

  it('returns null when wake word is not present', () => {
    expect(detectWakeWord(makeSegment("Let's discuss the bug"), 'MeetingClaw')).toBeNull();
  });

  it('returns empty string when wake word is at the end', () => {
    expect(detectWakeWord(makeSegment('Hey MeetingClaw'), 'MeetingClaw')).toBe('');
  });

  it('works with a different instance name', () => {
    expect(detectWakeWord(makeSegment('Hey Jarvis help'), 'Jarvis')).toBe('help');
  });

  it('returns null for empty text', () => {
    expect(detectWakeWord(makeSegment(''), 'MeetingClaw')).toBeNull();
  });

  it('detects "Okay MeetingClaw" prefix', () => {
    expect(detectWakeWord(makeSegment('Okay MeetingClaw list the todos'), 'MeetingClaw')).toBe('list the todos');
  });

  it('handles extra whitespace between wake word and question', () => {
    expect(detectWakeWord(makeSegment('Hey MeetingClaw   what happened?'), 'MeetingClaw')).toBe('what happened?');
  });

  it('preserves case of trailing text', () => {
    expect(detectWakeWord(makeSegment('hey meetingclaw Create An Issue'), 'MeetingClaw')).toBe('Create An Issue');
  });

  it('returns null when instance name appears only as substring', () => {
    expect(detectWakeWord(makeSegment('I said MeetingClawsome is cool'), 'MeetingClaw')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseConversationResponse
// ---------------------------------------------------------------------------

describe('parseConversationResponse', () => {
  it('parses valid JSON', () => {
    expect(parseConversationResponse(JSON.stringify({ answer: 'We decided to use React.' }))).toEqual({ answer: 'We decided to use React.' });
  });

  it('strips ```json code blocks', () => {
    const json = JSON.stringify({ answer: 'Three decisions.' });
    expect(parseConversationResponse('```json\n' + json + '\n```').answer).toBe('Three decisions.');
  });

  it('strips ``` code blocks without label', () => {
    const json = JSON.stringify({ answer: 'Summary.' });
    expect(parseConversationResponse('```\n' + json + '\n```').answer).toBe('Summary.');
  });

  it('treats non-JSON text as plain answer', () => {
    expect(parseConversationResponse('We discussed topics.').answer).toBe('We discussed topics.');
  });

  it('throws ZodError when answer is empty', () => {
    expect(() => parseConversationResponse(JSON.stringify({ answer: '' }))).toThrow(ZodError);
  });

  it('throws ZodError when answer is missing', () => {
    expect(() => parseConversationResponse(JSON.stringify({ action: 'none' }))).toThrow(ZodError);
  });

  it('truncates long non-JSON text to 200 chars', () => {
    const result = parseConversationResponse('A'.repeat(300));
    expect(result.answer).toHaveLength(200);
  });
});

// ---------------------------------------------------------------------------
// handleAddressedSpeech
// ---------------------------------------------------------------------------

describe('handleAddressedSpeech', () => {
  beforeEach(() => {
    mockInfer.mockReset();
    mockRespond.mockReset();
    mockRespond.mockResolvedValue(undefined);
  });

  it('generates a response and calls speak with the answer', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    mockInfer.mockResolvedValueOnce(JSON.stringify({ answer: 'We decided to use TypeScript.' }));

    await handleAddressedSpeech('what was decided?', session, config, mockLlmClient);

    expect(mockInfer).toHaveBeenCalledOnce();
    expect(mockRespond).toHaveBeenCalledWith('We decided to use TypeScript.', config, 'bot-123');
  });

  it('returns without calling LLM when question is empty', async () => {
    await handleAddressedSpeech('', makeSession(), makeConfig(), mockLlmClient);
    expect(mockInfer).not.toHaveBeenCalled();
  });

  it('returns without calling LLM when question is whitespace', async () => {
    await handleAddressedSpeech('   ', makeSession(), makeConfig(), mockLlmClient);
    expect(mockInfer).not.toHaveBeenCalled();
  });

  it('returns without calling LLM when session has no botId', async () => {
    const session = makeSession();
    session.botId = null;
    await handleAddressedSpeech('what happened?', session, makeConfig(), mockLlmClient);
    expect(mockInfer).not.toHaveBeenCalled();
  });

  it('catches API errors and does not throw', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    mockInfer.mockRejectedValueOnce(new Error('API rate limited'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handleAddressedSpeech('summarize', session, config, mockLlmClient)).resolves.toBeUndefined();

    expect(mockRespond).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Q&A response failed:', 'API rate limited');
    consoleSpy.mockRestore();
  });

  it('catches non-Error exceptions', async () => {
    mockInfer.mockRejectedValueOnce('string error');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handleAddressedSpeech('test', makeSession(), makeConfig(), mockLlmClient)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith('Q&A response failed:', 'Unknown error');
    consoleSpy.mockRestore();
  });

  it('truncates long answers to 200 chars', async () => {
    mockInfer.mockResolvedValueOnce(JSON.stringify({ answer: 'B'.repeat(250) }));
    await handleAddressedSpeech('give details', makeSession(), makeConfig(), mockLlmClient);

    const spokenText = mockRespond.mock.calls[0][0] as string;
    expect(spokenText.length).toBeLessThanOrEqual(200);
    expect(spokenText.endsWith('...')).toBe(true);
  });

  it('does not truncate answers that are exactly 200 chars', async () => {
    const exact = 'C'.repeat(200);
    mockInfer.mockResolvedValueOnce(JSON.stringify({ answer: exact }));
    await handleAddressedSpeech('short', makeSession(), makeConfig(), mockLlmClient);

    expect(mockRespond.mock.calls[0][0]).toBe(exact);
  });

  it('catches speak errors', async () => {
    mockInfer.mockResolvedValueOnce(JSON.stringify({ answer: 'Test answer.' }));
    mockRespond.mockRejectedValueOnce(new Error('TTS failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handleAddressedSpeech('question', makeSession(), makeConfig(), mockLlmClient)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith('Q&A response failed:', 'TTS failed');
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// generateResponse
// ---------------------------------------------------------------------------

describe('generateResponse', () => {
  beforeEach(() => { mockInfer.mockReset(); });

  it('sends prompt with system instructions and question', async () => {
    mockInfer.mockResolvedValueOnce(JSON.stringify({ answer: 'Answer.' }));
    await generateResponse('test question', makeSession(), makeConfig(), mockLlmClient);

    const prompt = mockInfer.mock.calls[0][0] as string;
    expect(prompt).toContain('test question');
    expect(prompt).toContain(CONVERSATION_SYSTEM_PROMPT);
  });

  it('includes question in the prompt', async () => {
    mockInfer.mockResolvedValueOnce(JSON.stringify({ answer: 'Here you go.' }));
    await generateResponse('what decisions were made?', makeSession(), makeConfig(), mockLlmClient);

    expect(mockInfer.mock.calls[0][0]).toContain('Question: what decisions were made?');
  });

  it('throws when LLM call fails', async () => {
    mockInfer.mockRejectedValueOnce(new Error('API rate limited'));
    await expect(generateResponse('test', makeSession(), makeConfig(), mockLlmClient)).rejects.toThrow('API rate limited');
  });

  it('returns parsed ConversationResponse', async () => {
    mockInfer.mockResolvedValueOnce(JSON.stringify({ answer: 'Two bugs found.' }));
    const result = await generateResponse('any bugs?', makeSession(), makeConfig(), mockLlmClient);
    expect(result.answer).toBe('Two bugs found.');
  });
});

// ---------------------------------------------------------------------------
// buildMeetingContext (from prompts.ts)
// ---------------------------------------------------------------------------

describe('buildMeetingContext', () => {
  it('includes meeting ID and start time for empty session', () => {
    const session = makeSession();
    const context = buildMeetingContext(session);
    expect(context).toContain(`Meeting ID: ${session.meetingId}`);
    expect(context).toContain(session.startTime.toISOString());
  });

  it('includes decisions list', () => {
    const session = makeSession();
    session.decisions.push('Use TypeScript', 'Deploy on Friday');
    const context = buildMeetingContext(session);
    expect(context).toContain('1. Use TypeScript');
    expect(context).toContain('2. Deploy on Friday');
  });

  it('includes intents with owner', () => {
    const session = makeSession();
    session.intents.push({ id: 'i1', type: 'BUG', text: 'Login broken', owner: 'Alice', deadline: null, priority: 'high', confidence: 0.95, sourceQuote: '' });
    const context = buildMeetingContext(session);
    expect(context).toContain('[BUG] Login broken');
    expect(context).toContain('(owner: Alice)');
  });

  it('includes intent without owner', () => {
    const session = makeSession();
    session.intents.push({ id: 'i2', type: 'FEATURE', text: 'Add dark mode', owner: null, deadline: null, priority: 'medium', confidence: 0.88, sourceQuote: '' });
    const context = buildMeetingContext(session);
    expect(context).toContain('[FEATURE] Add dark mode');
    expect(context).not.toContain('(owner:');
  });

  it('includes created issues', () => {
    const session = makeSession();
    session.createdIssues.push({ intentText: 'Fix login', issueUrl: 'https://github.com/org/repo/issues/42', issueNumber: 42, title: 'Fix mobile login' });
    const context = buildMeetingContext(session);
    expect(context).toContain('Fix mobile login');
    expect(context).toContain('https://github.com/org/repo/issues/42');
  });

  it('includes recent transcript', () => {
    const session = makeSession();
    session.addSegment({ text: 'Hello', speaker: 'Alice', timestamp: 1000 });
    session.addSegment({ text: 'Hi', speaker: 'Bob', timestamp: 2000 });
    const context = buildMeetingContext(session);
    expect(context).toContain('Alice: Hello');
    expect(context).toContain('Bob: Hi');
  });

  it('truncates long transcript', () => {
    const session = makeSession();
    for (let i = 0; i < 10; i++) session.addSegment({ text: 'X'.repeat(500) + ` seg ${i}`, speaker: 'S', timestamp: i * 1000 });
    const match = buildMeetingContext(session).match(/<context>\n([\s\S]*?)\n<\/context>/);
    expect(match?.[1]?.startsWith('...')).toBe(true);
  });

  it('omits empty sections', () => {
    const context = buildMeetingContext(makeSession());
    expect(context).not.toContain('<context>');
    expect(context).not.toContain('Decisions made:');
    expect(context).not.toContain('Detected intents:');
    expect(context).not.toContain('GitHub issues created:');
  });

  it('includes all sections when populated', () => {
    const session = makeSession();
    session.decisions.push('Ship on Monday');
    session.intents.push({ id: 'i1', type: 'TODO', text: 'Write tests', owner: 'Carol', deadline: 'Friday', priority: 'high', confidence: 0.92, sourceQuote: '' });
    session.createdIssues.push({ intentText: 'Write tests', issueUrl: 'https://github.com/org/repo/issues/99', issueNumber: 99, title: 'Write unit tests' });
    session.addSegment({ text: 'Begin.', speaker: 'Host', timestamp: 0 });
    const context = buildMeetingContext(session);
    expect(context).toContain('Decisions made:');
    expect(context).toContain('Detected intents:');
    expect(context).toContain('GitHub issues created:');
    expect(context).toContain('<context>');
  });
});
