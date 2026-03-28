import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { parseExtractionResponse, extractIntents } from './detect.js';
import { EXTRACTION_SYSTEM_PROMPT, wrapTranscript } from './prompts.js';
import type { OpenClawConfig } from './config.js';

// ---------------------------------------------------------------------------
// Mock Claude CLI
// ---------------------------------------------------------------------------

const mockInferWithClaude = vi.fn();

vi.mock('./claude-llm.js', () => ({
  inferWithClaude: (...args: unknown[]) => mockInferWithClaude(...args),
}));

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const mockConfig: OpenClawConfig = {
  instanceName: 'test',
  recallApiKey: 'sk-test',
  elevenLabsApiKey: 'sk-test',
  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

// ---------------------------------------------------------------------------
// parseExtractionResponse
// ---------------------------------------------------------------------------

describe('parseExtractionResponse', () => {
  it('parses valid JSON with items', () => {
    const input = JSON.stringify({
      items: [
        {
          type: 'TODO',
          text: 'Update docs',
          owner: 'Tom',
          deadline: 'Friday',
          priority: 'high',
          confidence: 0.95,
          sourceQuote: 'I will update the docs by Friday.',
        },
      ],
    });

    const result = parseExtractionResponse(input);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      type: 'TODO',
      text: 'Update docs',
      owner: 'Tom',
      deadline: 'Friday',
      priority: 'high',
      confidence: 0.95,
      sourceQuote: 'I will update the docs by Friday.',
    });
  });

  it('returns empty array for empty items', () => {
    const input = JSON.stringify({ items: [] });
    const result = parseExtractionResponse(input);
    expect(result.items).toEqual([]);
  });

  it('strips ```json code blocks and parses', () => {
    const json = JSON.stringify({
      items: [{ type: 'BUG', text: 'Login broken', confidence: 0.9 }],
    });
    const result = parseExtractionResponse('```json\n' + json + '\n```');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('BUG');
  });

  it('strips ``` code blocks without json label and parses', () => {
    const json = JSON.stringify({
      items: [{ type: 'FEATURE', text: 'Add dark mode', confidence: 0.88 }],
    });
    const result = parseExtractionResponse('```\n' + json + '\n```');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('FEATURE');
  });

  it('throws on invalid JSON string', () => {
    expect(() => parseExtractionResponse('not json {')).toThrow('Failed to parse extraction JSON');
  });

  it('throws ZodError when items field is missing', () => {
    expect(() => parseExtractionResponse(JSON.stringify({ results: [] }))).toThrow(ZodError);
  });

  it('throws ZodError for invalid intent type', () => {
    const input = JSON.stringify({ items: [{ type: 'INVALID_TYPE', text: 'X', confidence: 0.9 }] });
    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('throws ZodError when required field text is missing', () => {
    const input = JSON.stringify({ items: [{ type: 'TODO', confidence: 0.9 }] });
    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('throws ZodError when required field confidence is missing', () => {
    const input = JSON.stringify({ items: [{ type: 'TODO', text: 'Do something' }] });
    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('applies default values for optional fields', () => {
    const input = JSON.stringify({ items: [{ type: 'DECISION', text: 'Use React', confidence: 0.92 }] });
    const item = parseExtractionResponse(input).items[0];
    expect(item.priority).toBe('medium');
    expect(item.owner).toBeNull();
    expect(item.deadline).toBeNull();
    expect(item.sourceQuote).toBe('');
  });

  it('throws ZodError when confidence exceeds 1', () => {
    const input = JSON.stringify({ items: [{ type: 'TODO', text: 'X', confidence: 1.5 }] });
    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('throws ZodError when confidence is below 0', () => {
    const input = JSON.stringify({ items: [{ type: 'TODO', text: 'X', confidence: -0.1 }] });
    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// extractIntents
// ---------------------------------------------------------------------------

describe('extractIntents', () => {
  beforeEach(() => {
    mockInferWithClaude.mockReset();
  });

  it('filters intents by confidence threshold', async () => {
    const responseJson = JSON.stringify({
      items: [
        { type: 'TODO', text: 'High confidence', confidence: 0.95, sourceQuote: 'a' },
        { type: 'BUG', text: 'At threshold', confidence: 0.85, sourceQuote: 'b' },
        { type: 'FEATURE', text: 'Below threshold', confidence: 0.70, sourceQuote: 'c' },
      ],
    });
    mockInferWithClaude.mockResolvedValueOnce(responseJson);

    const result = await extractIntents('Some transcript text', mockConfig);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('High confidence');
    expect(result[1].text).toBe('At threshold');
    for (const intent of result) {
      expect(intent.id).toBeDefined();
      expect(intent.id.length).toBeGreaterThan(0);
    }
  });

  it('returns empty array for empty transcript without calling CLI', async () => {
    const result = await extractIntents('', mockConfig);
    expect(result).toEqual([]);
    expect(mockInferWithClaude).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only transcript without calling CLI', async () => {
    const result = await extractIntents('   \n\t  ', mockConfig);
    expect(result).toEqual([]);
    expect(mockInferWithClaude).not.toHaveBeenCalled();
  });

  it('throws when Claude CLI call fails', async () => {
    mockInferWithClaude.mockRejectedValueOnce(new Error('Claude CLI not found'));
    await expect(extractIntents('Some transcript', mockConfig)).rejects.toThrow('Claude CLI not found');
  });

  it('sends prompt containing system instructions and wrapped transcript', async () => {
    mockInferWithClaude.mockResolvedValueOnce(JSON.stringify({ items: [] }));
    await extractIntents('Test transcript', mockConfig);

    expect(mockInferWithClaude).toHaveBeenCalledOnce();
    const prompt = mockInferWithClaude.mock.calls[0][0] as string;
    expect(prompt).toContain(EXTRACTION_SYSTEM_PROMPT);
    expect(prompt).toContain('<transcript>');
    expect(prompt).toContain('Test transcript');
  });

  it('wraps transcript in <transcript> tags', async () => {
    mockInferWithClaude.mockResolvedValueOnce(JSON.stringify({ items: [] }));
    await extractIntents('Alice said hello', mockConfig);

    const prompt = mockInferWithClaude.mock.calls[0][0] as string;
    expect(prompt).toContain(wrapTranscript('Alice said hello'));
  });
});
