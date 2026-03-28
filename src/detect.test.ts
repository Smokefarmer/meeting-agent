import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { parseExtractionResponse, extractIntents } from './detect.js';
import { EXTRACTION_SYSTEM_PROMPT, wrapTranscript } from './prompts.js';
import type { OpenClawConfig } from './config.js';
import type { LlmClient } from './llm.js';

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

const mockInfer = vi.fn();
const mockLlmClient: LlmClient = { infer: mockInfer };

describe('parseExtractionResponse', () => {
  it('parses valid JSON with items', () => {
    const input = JSON.stringify({
      items: [{ type: 'TODO', text: 'Update docs', owner: 'Tom', deadline: 'Friday', priority: 'high', confidence: 0.95, sourceQuote: 'I will update the docs by Friday.' }],
    });
    const result = parseExtractionResponse(input);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ type: 'TODO', text: 'Update docs', owner: 'Tom', deadline: 'Friday', priority: 'high', confidence: 0.95, sourceQuote: 'I will update the docs by Friday.' });
  });

  it('returns empty array for empty items', () => {
    expect(parseExtractionResponse(JSON.stringify({ items: [] })).items).toEqual([]);
  });

  it('strips ```json code blocks and parses', () => {
    const json = JSON.stringify({ items: [{ type: 'BUG', text: 'Login broken', confidence: 0.9 }] });
    expect(parseExtractionResponse('```json\n' + json + '\n```').items[0].type).toBe('BUG');
  });

  it('strips ``` code blocks without json label', () => {
    const json = JSON.stringify({ items: [{ type: 'FEATURE', text: 'Add dark mode', confidence: 0.88 }] });
    expect(parseExtractionResponse('```\n' + json + '\n```').items[0].type).toBe('FEATURE');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseExtractionResponse('not json {')).toThrow('Failed to parse extraction JSON');
  });

  it('throws ZodError when items field is missing', () => {
    expect(() => parseExtractionResponse(JSON.stringify({ results: [] }))).toThrow(ZodError);
  });

  it('throws ZodError for invalid intent type', () => {
    expect(() => parseExtractionResponse(JSON.stringify({ items: [{ type: 'INVALID', text: 'X', confidence: 0.9 }] }))).toThrow(ZodError);
  });

  it('throws ZodError when text is missing', () => {
    expect(() => parseExtractionResponse(JSON.stringify({ items: [{ type: 'TODO', confidence: 0.9 }] }))).toThrow(ZodError);
  });

  it('throws ZodError when confidence is missing', () => {
    expect(() => parseExtractionResponse(JSON.stringify({ items: [{ type: 'TODO', text: 'X' }] }))).toThrow(ZodError);
  });

  it('applies default values for optional fields', () => {
    const item = parseExtractionResponse(JSON.stringify({ items: [{ type: 'DECISION', text: 'Use React', confidence: 0.92 }] })).items[0];
    expect(item.priority).toBe('medium');
    expect(item.owner).toBeNull();
    expect(item.deadline).toBeNull();
    expect(item.sourceQuote).toBe('');
  });

  it('throws ZodError when confidence exceeds 1', () => {
    expect(() => parseExtractionResponse(JSON.stringify({ items: [{ type: 'TODO', text: 'X', confidence: 1.5 }] }))).toThrow(ZodError);
  });

  it('throws ZodError when confidence is below 0', () => {
    expect(() => parseExtractionResponse(JSON.stringify({ items: [{ type: 'TODO', text: 'X', confidence: -0.1 }] }))).toThrow(ZodError);
  });
});

describe('extractIntents', () => {
  beforeEach(() => { mockInfer.mockReset(); });

  it('filters intents by confidence threshold', async () => {
    mockInfer.mockResolvedValueOnce(JSON.stringify({
      items: [
        { type: 'TODO', text: 'High confidence', confidence: 0.95, sourceQuote: 'a' },
        { type: 'BUG', text: 'At threshold', confidence: 0.85, sourceQuote: 'b' },
        { type: 'FEATURE', text: 'Below threshold', confidence: 0.70, sourceQuote: 'c' },
      ],
    }));
    const result = await extractIntents('Some transcript text', mockConfig, mockLlmClient);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('High confidence');
    expect(result[1].text).toBe('At threshold');
    for (const intent of result) {
      expect(intent.id).toBeDefined();
      expect(intent.id.length).toBeGreaterThan(0);
    }
  });

  it('returns empty array for empty transcript without calling LLM', async () => {
    expect(await extractIntents('', mockConfig, mockLlmClient)).toEqual([]);
    expect(mockInfer).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only transcript', async () => {
    expect(await extractIntents('   \n\t  ', mockConfig, mockLlmClient)).toEqual([]);
    expect(mockInfer).not.toHaveBeenCalled();
  });

  it('throws when LLM call fails', async () => {
    mockInfer.mockRejectedValueOnce(new Error('LLM error'));
    await expect(extractIntents('Some transcript', mockConfig, mockLlmClient)).rejects.toThrow('LLM error');
  });

  it('sends prompt containing system instructions and wrapped transcript', async () => {
    mockInfer.mockResolvedValueOnce(JSON.stringify({ items: [] }));
    await extractIntents('Test transcript', mockConfig, mockLlmClient);
    expect(mockInfer).toHaveBeenCalledOnce();
    const prompt = mockInfer.mock.calls[0][0] as string;
    expect(prompt).toContain(EXTRACTION_SYSTEM_PROMPT);
    expect(prompt).toContain('<transcript>');
    expect(prompt).toContain('Test transcript');
  });

  it('wraps transcript in <transcript> tags', async () => {
    mockInfer.mockResolvedValueOnce(JSON.stringify({ items: [] }));
    await extractIntents('Alice said hello', mockConfig, mockLlmClient);
    const prompt = mockInfer.mock.calls[0][0] as string;
    expect(prompt).toContain(wrapTranscript('Alice said hello'));
  });
});
