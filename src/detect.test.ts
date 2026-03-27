import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { parseExtractionResponse, extractIntents } from './detect.js';
import { EXTRACTION_SYSTEM_PROMPT, wrapTranscript } from './prompts.js';
import type { OpenClawConfig } from './config.js';

// ---------------------------------------------------------------------------
// Mock Gemini SDK
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.fn();

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const mockConfig: OpenClawConfig = {
  instanceName: 'test',
  recallApiKey: 'sk-test',
  elevenLabsApiKey: 'sk-test',
  geminiApiKey: 'sk-test-key',
  githubToken: null,
  githubRepo: null,
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

function makeGeminiResponse(text: string) {
  return {
    response: { text: () => text },
  };
}

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
      items: [
        {
          type: 'BUG',
          text: 'Login broken',
          confidence: 0.9,
        },
      ],
    });
    const wrapped = '```json\n' + json + '\n```';

    const result = parseExtractionResponse(wrapped);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('BUG');
  });

  it('strips ``` code blocks without json label and parses', () => {
    const json = JSON.stringify({
      items: [
        {
          type: 'FEATURE',
          text: 'Add dark mode',
          confidence: 0.88,
        },
      ],
    });
    const wrapped = '```\n' + json + '\n```';

    const result = parseExtractionResponse(wrapped);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('FEATURE');
  });

  it('throws on invalid JSON string', () => {
    expect(() => parseExtractionResponse('not json {')).toThrow(
      'Failed to parse extraction JSON',
    );
  });

  it('throws ZodError when items field is missing', () => {
    const input = JSON.stringify({ results: [] });

    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('throws ZodError for invalid intent type', () => {
    const input = JSON.stringify({
      items: [
        {
          type: 'INVALID_TYPE',
          text: 'Something',
          confidence: 0.9,
        },
      ],
    });

    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('throws ZodError when required field text is missing', () => {
    const input = JSON.stringify({
      items: [
        {
          type: 'TODO',
          confidence: 0.9,
        },
      ],
    });

    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('throws ZodError when required field confidence is missing', () => {
    const input = JSON.stringify({
      items: [
        {
          type: 'TODO',
          text: 'Do something',
        },
      ],
    });

    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('applies default values for optional fields', () => {
    const input = JSON.stringify({
      items: [
        {
          type: 'DECISION',
          text: 'Use React',
          confidence: 0.92,
        },
      ],
    });

    const result = parseExtractionResponse(input);
    const item = result.items[0];

    expect(item.priority).toBe('medium');
    expect(item.owner).toBeNull();
    expect(item.deadline).toBeNull();
    expect(item.sourceQuote).toBe('');
  });

  it('throws ZodError when confidence exceeds 1', () => {
    const input = JSON.stringify({
      items: [
        {
          type: 'TODO',
          text: 'Something',
          confidence: 1.5,
        },
      ],
    });

    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });

  it('throws ZodError when confidence is below 0', () => {
    const input = JSON.stringify({
      items: [
        {
          type: 'TODO',
          text: 'Something',
          confidence: -0.1,
        },
      ],
    });

    expect(() => parseExtractionResponse(input)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// extractIntents
// ---------------------------------------------------------------------------

describe('extractIntents', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it('filters intents by confidence threshold', async () => {
    const responseJson = JSON.stringify({
      items: [
        { type: 'TODO', text: 'High confidence', confidence: 0.95, sourceQuote: 'a' },
        { type: 'BUG', text: 'At threshold', confidence: 0.85, sourceQuote: 'b' },
        { type: 'FEATURE', text: 'Below threshold', confidence: 0.70, sourceQuote: 'c' },
      ],
    });

    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(responseJson));

    const result = await extractIntents('Some transcript text', mockConfig);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('High confidence');
    expect(result[0].confidence).toBe(0.95);
    expect(result[1].text).toBe('At threshold');
    expect(result[1].confidence).toBe(0.85);

    // Each returned intent should have an id
    for (const intent of result) {
      expect(intent.id).toBeDefined();
      expect(typeof intent.id).toBe('string');
      expect(intent.id.length).toBeGreaterThan(0);
    }
  });

  it('returns empty array for empty transcript without calling API', async () => {
    const result = await extractIntents('', mockConfig);

    expect(result).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only transcript without calling API', async () => {
    const result = await extractIntents('   \n\t  ', mockConfig);

    expect(result).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('throws when Gemini API call fails', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('API unavailable'));

    await expect(
      extractIntents('Some transcript', mockConfig),
    ).rejects.toThrow('Intent extraction failed after 3 attempts');
  });

  it('sends transcript to Gemini generateContent', async () => {
    const responseJson = JSON.stringify({ items: [] });
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(responseJson));

    await extractIntents('Test transcript', mockConfig);

    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const callArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(callArg).toContain('Test transcript');
  });

  it('wraps transcript in <transcript> tags', async () => {
    const responseJson = JSON.stringify({ items: [] });
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(responseJson));

    const transcript = 'Alice said hello';
    await extractIntents(transcript, mockConfig);

    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const callArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(callArg).toBe(wrapTranscript(transcript));
  });
});
