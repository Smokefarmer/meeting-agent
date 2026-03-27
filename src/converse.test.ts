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
import type { TranscriptSegment, Intent, CreatedIssue } from './models.js';

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock speak module
// ---------------------------------------------------------------------------

const mockSpeak = vi.fn();

vi.mock('./speak.js', () => {
  return {
    speak: (...args: unknown[]) => mockSpeak(...args),
  };
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeConfig(): OpenClawConfig {
  return {
    instanceName: 'MeetingClaw',
    skribbyApiKey: 'sk-test',
    elevenLabsApiKey: 'sk-test',
    anthropicApiKey: 'sk-test-key',
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

function makeAnthropicResponse(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

// ---------------------------------------------------------------------------
// detectWakeWord
// ---------------------------------------------------------------------------

describe('detectWakeWord', () => {
  it('detects "Hey MeetingClaw" prefix and returns text after it', () => {
    const segment = makeSegment('Hey MeetingClaw what was decided?');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe('what was decided?');
  });

  it('detects "Hi MeetingClaw" prefix and returns text after it', () => {
    const segment = makeSegment('Hi MeetingClaw summarize');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe('summarize');
  });

  it('detects "Ok MeetingClaw" prefix and returns text after it', () => {
    const segment = makeSegment('Ok MeetingClaw create an issue');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe('create an issue');
  });

  it('detects bare instance name at the start and returns text after it', () => {
    const segment = makeSegment("MeetingClaw what's the status?");
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe("what's the status?");
  });

  it('is case insensitive for both segment text and instance name', () => {
    const segment = makeSegment('hey MEETINGCLAW help');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe('help');
  });

  it('returns null when wake word is not present', () => {
    const segment = makeSegment("Let's discuss the bug");
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBeNull();
  });

  it('returns empty string when wake word is at the end with no trailing text (direct address)', () => {
    const segment = makeSegment('Hey MeetingClaw');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe('');
  });

  it('works with a different instance name', () => {
    const segment = makeSegment('Hey Jarvis help');
    const result = detectWakeWord(segment, 'Jarvis');
    expect(result).toBe('help');
  });

  it('returns null for empty text', () => {
    const segment = makeSegment('');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBeNull();
  });

  it('detects "Okay MeetingClaw" prefix', () => {
    const segment = makeSegment('Okay MeetingClaw list the todos');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe('list the todos');
  });

  it('handles extra whitespace between wake word and question', () => {
    const segment = makeSegment('Hey MeetingClaw   what happened?');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe('what happened?');
  });

  it('detects wake word case-insensitively in the original text but preserves case of trailing text', () => {
    const segment = makeSegment('hey meetingclaw Create An Issue');
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBe('Create An Issue');
  });

  it('returns null when instance name appears only as a substring of another word', () => {
    const segment = makeSegment('I said MeetingClawsome is cool');
    // Word-boundary check: "meetingclaw" is followed by "some" (alphanumeric),
    // so it should NOT trigger the wake word
    const result = detectWakeWord(segment, 'MeetingClaw');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseConversationResponse
// ---------------------------------------------------------------------------

describe('parseConversationResponse', () => {
  it('parses valid JSON and returns ConversationResponse with answer only', () => {
    const input = JSON.stringify({
      answer: 'We decided to use React.',
    });

    const result = parseConversationResponse(input);

    expect(result).toEqual({
      answer: 'We decided to use React.',
    });
  });

  it('strips ```json code blocks and parses', () => {
    const json = JSON.stringify({
      answer: 'Three decisions were made.',
    });
    const wrapped = '```json\n' + json + '\n```';

    const result = parseConversationResponse(wrapped);

    expect(result.answer).toBe('Three decisions were made.');
  });

  it('strips ``` code blocks without json label and parses', () => {
    const json = JSON.stringify({
      answer: 'Here is the summary.',
    });
    const wrapped = '```\n' + json + '\n```';

    const result = parseConversationResponse(wrapped);

    expect(result.answer).toBe('Here is the summary.');
  });

  it('treats non-JSON text as plain answer', () => {
    const plainText = 'We discussed three main topics today.';

    const result = parseConversationResponse(plainText);

    expect(result.answer).toBe(plainText);
  });

  it('parses JSON with only an answer field', () => {
    const input = JSON.stringify({
      answer: 'The meeting is going well.',
    });

    const result = parseConversationResponse(input);

    expect(result.answer).toBe('The meeting is going well.');
  });

  it('throws ZodError when answer is empty string', () => {
    const input = JSON.stringify({
      answer: '',
      action: 'none',
    });

    expect(() => parseConversationResponse(input)).toThrow(ZodError);
  });

  it('throws ZodError when answer field is missing', () => {
    const input = JSON.stringify({
      action: 'none',
    });

    expect(() => parseConversationResponse(input)).toThrow(ZodError);
  });

  it('truncates long non-JSON text to 200 chars', () => {
    const longText = 'A'.repeat(300);

    const result = parseConversationResponse(longText);

    expect(result.answer).toHaveLength(200);
    expect(result.answer).toBe('A'.repeat(200));
  });
});

// ---------------------------------------------------------------------------
// handleAddressedSpeech
// ---------------------------------------------------------------------------

describe('handleAddressedSpeech', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockSpeak.mockReset();
    mockSpeak.mockResolvedValue(undefined);
  });

  it('generates a response and calls speak with the answer', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    const responseJson = JSON.stringify({
      answer: 'We decided to use TypeScript.',
    });
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(responseJson));

    await handleAddressedSpeech('what was decided?', session, config);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockSpeak).toHaveBeenCalledOnce();
    expect(mockSpeak).toHaveBeenCalledWith(
      'We decided to use TypeScript.',
      config,
      'bot-123',
    );
  });

  it('returns without calling API when question is empty', async () => {
    const config = makeConfig();
    const session = makeSession(config);

    await handleAddressedSpeech('', session, config);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('returns without calling API when question is whitespace only', async () => {
    const config = makeConfig();
    const session = makeSession(config);

    await handleAddressedSpeech('   ', session, config);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('returns without calling API when session has no botId', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    session.botId = null;

    await handleAddressedSpeech('what happened?', session, config);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('catches API errors and does not throw', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    mockCreate.mockRejectedValueOnce(new Error('API rate limited'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      handleAddressedSpeech('summarize', session, config),
    ).resolves.toBeUndefined();

    expect(mockSpeak).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Q&A response failed:',
      'API rate limited',
    );
    consoleSpy.mockRestore();
  });

  it('catches non-Error exceptions and does not throw', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    mockCreate.mockRejectedValueOnce('string error');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      handleAddressedSpeech('test', session, config),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Q&A response failed:',
      'Unknown error',
    );
    consoleSpy.mockRestore();
  });

  it('truncates long answers to 200 chars before speaking', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    const longAnswer = 'B'.repeat(250);
    const responseJson = JSON.stringify({
      answer: longAnswer,
    });
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(responseJson));

    await handleAddressedSpeech('give me details', session, config);

    expect(mockSpeak).toHaveBeenCalledOnce();
    const spokenText = mockSpeak.mock.calls[0][0] as string;
    // 200 - 3 for "..." + 3 for "..." = 200 total
    expect(spokenText.length).toBeLessThanOrEqual(200);
    expect(spokenText.endsWith('...')).toBe(true);
  });

  it('does not truncate answers that are exactly 200 chars', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    const exactAnswer = 'C'.repeat(200);
    const responseJson = JSON.stringify({
      answer: exactAnswer,
    });
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(responseJson));

    await handleAddressedSpeech('short question', session, config);

    expect(mockSpeak).toHaveBeenCalledOnce();
    const spokenText = mockSpeak.mock.calls[0][0] as string;
    expect(spokenText).toBe(exactAnswer);
    expect(spokenText).not.toContain('...');
  });

  it('catches speak errors and does not throw', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    const responseJson = JSON.stringify({
      answer: 'Test answer.',
    });
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(responseJson));
    mockSpeak.mockRejectedValueOnce(new Error('TTS failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      handleAddressedSpeech('question', session, config),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Q&A response failed:',
      'TTS failed',
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// generateResponse
// ---------------------------------------------------------------------------

describe('generateResponse', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('sends CONVERSATION_SYSTEM_PROMPT as system prompt', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    const responseJson = JSON.stringify({
      answer: 'Answer.',
    });
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(responseJson));

    await generateResponse('test question', session, config);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toBe(CONVERSATION_SYSTEM_PROMPT);
  });

  it('includes meeting context and question in the user message', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    const responseJson = JSON.stringify({
      answer: 'Here you go.',
    });
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(responseJson));

    await generateResponse('what decisions were made?', session, config);

    const callArgs = mockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).toContain('Question: what decisions were made?');
    expect(userContent).toContain(session.meetingId);
  });

  it('throws when API returns no text content', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    mockCreate.mockResolvedValueOnce({ content: [] });

    await expect(
      generateResponse('test', session, config),
    ).rejects.toThrow('No text content in Claude response');
  });

  it('returns parsed ConversationResponse from API', async () => {
    const config = makeConfig();
    const session = makeSession(config);
    const responseJson = JSON.stringify({
      answer: 'Two bugs were found.',
    });
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(responseJson));

    const result = await generateResponse('any bugs?', session, config);

    expect(result.answer).toBe('Two bugs were found.');
  });
});

// ---------------------------------------------------------------------------
// buildMeetingContext (from prompts.ts)
// ---------------------------------------------------------------------------

describe('buildMeetingContext', () => {
  it('includes meeting ID and start time for an empty session', () => {
    const config = makeConfig();
    const session = makeSession(config);

    const context = buildMeetingContext(session);

    expect(context).toContain(`Meeting ID: ${session.meetingId}`);
    expect(context).toContain('Started:');
    expect(context).toContain(session.startTime.toISOString());
  });

  it('includes decisions list when session has decisions', () => {
    const config = makeConfig();
    const session = makeSession(config);
    session.decisions.push('Use TypeScript for the frontend');
    session.decisions.push('Deploy on Friday');

    const context = buildMeetingContext(session);

    expect(context).toContain('Decisions made:');
    expect(context).toContain('1. Use TypeScript for the frontend');
    expect(context).toContain('2. Deploy on Friday');
  });

  it('includes intents summary when session has intents', () => {
    const config = makeConfig();
    const session = makeSession(config);
    const intent: Intent = {
      id: 'intent-1',
      type: 'BUG',
      text: 'Login page broken on mobile',
      owner: 'Alice',
      deadline: null,
      priority: 'high',
      confidence: 0.95,
      sourceQuote: 'The login page is completely broken on mobile.',
    };
    session.intents.push(intent);

    const context = buildMeetingContext(session);

    expect(context).toContain('Detected intents:');
    expect(context).toContain('[BUG] Login page broken on mobile');
    expect(context).toContain('(owner: Alice)');
  });

  it('includes intent without owner when owner is null', () => {
    const config = makeConfig();
    const session = makeSession(config);
    const intent: Intent = {
      id: 'intent-2',
      type: 'FEATURE',
      text: 'Add dark mode',
      owner: null,
      deadline: null,
      priority: 'medium',
      confidence: 0.88,
      sourceQuote: 'We should add dark mode.',
    };
    session.intents.push(intent);

    const context = buildMeetingContext(session);

    expect(context).toContain('[FEATURE] Add dark mode');
    expect(context).not.toContain('(owner:');
  });

  it('includes created issue URLs when session has created issues', () => {
    const config = makeConfig();
    const session = makeSession(config);
    const issue: CreatedIssue = {
      intentText: 'Fix mobile login',
      issueUrl: 'https://github.com/org/repo/issues/42',
      issueNumber: 42,
      title: 'Fix mobile login page',
    };
    session.createdIssues.push(issue);

    const context = buildMeetingContext(session);

    expect(context).toContain('GitHub issues created:');
    expect(context).toContain('Fix mobile login page');
    expect(context).toContain('https://github.com/org/repo/issues/42');
  });

  it('includes recent transcript when session has transcript segments', () => {
    const config = makeConfig();
    const session = makeSession(config);
    session.addSegment({ text: 'Hello everyone', speaker: 'Alice', timestamp: 1000 });
    session.addSegment({ text: 'Hi Alice', speaker: 'Bob', timestamp: 2000 });

    const context = buildMeetingContext(session);

    expect(context).toContain('<context>');
    expect(context).toContain('</context>');
    expect(context).toContain('Alice: Hello everyone');
    expect(context).toContain('Bob: Hi Alice');
  });

  it('truncates transcript to last 2000 chars with ellipsis prefix', () => {
    const config = makeConfig();
    const session = makeSession(config);
    // Create a transcript longer than 2000 chars
    const longLine = 'X'.repeat(500);
    for (let i = 0; i < 10; i++) {
      session.addSegment({ text: `${longLine} segment ${i}`, speaker: 'Speaker', timestamp: i * 1000 });
    }

    const context = buildMeetingContext(session);
    // Extract content between <context> tags
    const match = context.match(/<context>\n([\s\S]*?)\n<\/context>/);
    const transcriptContent = match ? match[1] : '';

    // Should start with '...' indicating truncation
    expect(transcriptContent.startsWith('...')).toBe(true);
  });

  it('does not include transcript section when there are no segments', () => {
    const config = makeConfig();
    const session = makeSession(config);

    const context = buildMeetingContext(session);

    expect(context).not.toContain('<context>');
  });

  it('does not include decisions section when there are no decisions', () => {
    const config = makeConfig();
    const session = makeSession(config);

    const context = buildMeetingContext(session);

    expect(context).not.toContain('Decisions made:');
  });

  it('does not include intents section when there are no intents', () => {
    const config = makeConfig();
    const session = makeSession(config);

    const context = buildMeetingContext(session);

    expect(context).not.toContain('Detected intents:');
  });

  it('does not include issues section when there are no created issues', () => {
    const config = makeConfig();
    const session = makeSession(config);

    const context = buildMeetingContext(session);

    expect(context).not.toContain('GitHub issues created:');
  });

  it('includes all sections when session has everything populated', () => {
    const config = makeConfig();
    const session = makeSession(config);
    session.decisions.push('Ship on Monday');
    session.intents.push({
      id: 'i1',
      type: 'TODO',
      text: 'Write tests',
      owner: 'Carol',
      deadline: 'Friday',
      priority: 'high',
      confidence: 0.92,
      sourceQuote: 'Carol will write the tests.',
    });
    session.createdIssues.push({
      intentText: 'Write tests',
      issueUrl: 'https://github.com/org/repo/issues/99',
      issueNumber: 99,
      title: 'Write unit tests',
    });
    session.addSegment({ text: 'Let us begin.', speaker: 'Host', timestamp: 0 });

    const context = buildMeetingContext(session);

    expect(context).toContain('Meeting ID:');
    expect(context).toContain('Started:');
    expect(context).toContain('Decisions made:');
    expect(context).toContain('Detected intents:');
    expect(context).toContain('GitHub issues created:');
    expect(context).toContain('<context>');
  });
});
