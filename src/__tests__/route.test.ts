/**
 * Tests for route.ts — intent router with GitHub issue creation.
 * Issue #4 — NostraAIAgent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Intent } from '../models.js';
import type { OpenClawConfig } from '../config.js';

// Hoist mock functions so they're initialized before vi.mock factories run
const { mockCreate, mockRespond, mockIsDuplicate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockRespond: vi.fn(),
  mockIsDuplicate: vi.fn(),
}));

// Mock @octokit/rest with the class returning our mock
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    issues: {
      create: mockCreate,
    },
  })),
}));

// Mock dependencies
vi.mock('../dedup.js', () => ({
  isDuplicate: mockIsDuplicate,
}));

vi.mock('../speak.js', () => ({
  respond: mockRespond,
}));

// Import after mocks
import { routeIntent } from '../route.js';
import { MeetingSession } from '../session.js';

const mockConfig: OpenClawConfig = {
  instanceName: 'test-bot',
  recallApiKey: 'test-recall',
  elevenLabsApiKey: 'test-eleven',
  openclawGatewayPort: 18789,
  openclawHooksToken: 'test-token',
  githubToken: 'ghp_test123',
  githubRepo: 'owner/repo',
  telegramBotToken: null,
  telegramChatId: null,
  confidenceThreshold: 0.85,
};

const createIntent = (overrides: Partial<Intent> = {}): Intent => ({
  id: 'intent-1',
  type: 'BUG',
  text: 'Users cannot log in on mobile',
  owner: 'Tom',
  deadline: null,
  priority: 'high',
  confidence: 0.92,
  sourceQuote: 'There is a bug where users cannot log in on mobile',
  ...overrides,
});

describe('routeIntent', () => {
  let session: MeetingSession;

  beforeEach(() => {
    vi.clearAllMocks();
    session = new MeetingSession('https://meet.google.com/abc', mockConfig);
    session.botId = 'bot-123';
    mockIsDuplicate.mockReturnValue(false);
    mockRespond.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue({
      data: {
        html_url: 'https://github.com/owner/repo/issues/42',
        number: 42,
        title: 'Bug: Users cannot log in on mobile',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deduplication', () => {
    it('should skip duplicate intents without action', async () => {
      mockIsDuplicate.mockReturnValue(true);
      const intent = createIntent();

      await routeIntent(intent, session, mockConfig);

      expect(mockIsDuplicate).toHaveBeenCalledWith(intent, session);
      expect(session.intents).toHaveLength(0);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockRespond).not.toHaveBeenCalled();
    });

    it('should add non-duplicate intent to session', async () => {
      const intent = createIntent();

      await routeIntent(intent, session, mockConfig);

      expect(session.intents).toContain(intent);
    });
  });

  describe('GitHub configuration checks', () => {
    it('should speak error when githubToken is missing', async () => {
      const configNoToken = { ...mockConfig, githubToken: null };
      const intent = createIntent();

      await routeIntent(intent, session, configNoToken);

      expect(mockRespond).toHaveBeenCalledWith(
        "I don't have GitHub connected. I noted it locally.",
        configNoToken,
        'bot-123',
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should speak error when githubRepo is missing', async () => {
      const configNoRepo = { ...mockConfig, githubRepo: null };
      const intent = createIntent();

      await routeIntent(intent, session, configNoRepo);

      expect(mockRespond).toHaveBeenCalledWith(
        "I don't have GitHub connected. I noted it locally.",
        configNoRepo,
        'bot-123',
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('confidence threshold', () => {
    it('should skip issue creation when confidence below threshold', async () => {
      const intent = createIntent({ confidence: 0.70 });

      await routeIntent(intent, session, mockConfig);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('confidence'),
        mockConfig,
        'bot-123',
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should create issue when confidence equals threshold', async () => {
      const intent = createIntent({ confidence: 0.85 });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should create issue when confidence exceeds threshold', async () => {
      const intent = createIntent({ confidence: 0.95 });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('GitHub issue creation for BUG', () => {
    it('should create GitHub issue with correct API call', async () => {
      const intent = createIntent({ type: 'BUG', text: 'Login fails on mobile' });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: expect.stringContaining('Login fails on mobile'),
        body: expect.any(String),
        labels: expect.arrayContaining(['bug']),
      });
    });

    it('should add critical label for critical priority', async () => {
      const intent = createIntent({ type: 'BUG', priority: 'critical' });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(['bug', 'priority:critical']),
        }),
      );
    });

    it('should add high priority label', async () => {
      const intent = createIntent({ type: 'BUG', priority: 'high' });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(['bug', 'priority:high']),
        }),
      );
    });

    it('should add created issue to session on success', async () => {
      const intent = createIntent();

      await routeIntent(intent, session, mockConfig);

      expect(session.createdIssues).toHaveLength(1);
      expect(session.createdIssues[0]).toEqual({
        intentText: intent.text,
        issueUrl: 'https://github.com/owner/repo/issues/42',
        issueNumber: 42,
        title: 'Bug: Users cannot log in on mobile',
      });
    });

    it('should speak confirmation on successful issue creation', async () => {
      const intent = createIntent();

      await routeIntent(intent, session, mockConfig);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('#42'),
        mockConfig,
        'bot-123',
      );
    });
  });

  describe('GitHub issue creation for FEATURE', () => {
    it('should create GitHub issue with enhancement label', async () => {
      const intent = createIntent({ type: 'FEATURE', text: 'Add dark mode' });
      mockCreate.mockResolvedValue({
        data: {
          html_url: 'https://github.com/owner/repo/issues/43',
          number: 43,
          title: 'Feature: Add dark mode',
        },
      });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: expect.stringContaining('Add dark mode'),
        body: expect.any(String),
        labels: expect.arrayContaining(['enhancement']),
      });
    });
  });

  describe('non-GitHub intent types', () => {
    it('should add TODO intent without creating GitHub issue', async () => {
      const intent = createIntent({ type: 'TODO' });

      await routeIntent(intent, session, mockConfig);

      expect(session.intents).toContain(intent);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should add DECISION intent without creating GitHub issue', async () => {
      const intent = createIntent({ type: 'DECISION' });

      await routeIntent(intent, session, mockConfig);

      expect(session.intents).toContain(intent);
      expect(session.decisions).toContain(intent.text);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should add MEETING_REQUEST intent without creating GitHub issue', async () => {
      const intent = createIntent({ type: 'MEETING_REQUEST' });

      await routeIntent(intent, session, mockConfig);

      expect(session.intents).toContain(intent);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should speak error on GitHub API failure', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));
      const intent = createIntent();

      await routeIntent(intent, session, mockConfig);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        mockConfig,
        'bot-123',
      );
      expect(session.createdIssues).toHaveLength(0);
    });

    it('should not throw on GitHub API failure', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));
      const intent = createIntent();

      await expect(routeIntent(intent, session, mockConfig)).resolves.not.toThrow();
    });
  });

  describe('issue body content', () => {
    it('should include source quote in issue body', async () => {
      const intent = createIntent({
        sourceQuote: 'The login button does not work on iOS',
      });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('The login button does not work on iOS'),
        }),
      );
    });

    it('should include owner in issue body when present', async () => {
      const intent = createIntent({ owner: 'Alice' });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Alice'),
        }),
      );
    });

    it('should include deadline in issue body when present', async () => {
      const intent = createIntent({ deadline: '2026-04-01' });

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('2026-04-01'),
        }),
      );
    });

    it('should include session URL in issue body', async () => {
      const intent = createIntent();

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('https://meet.google.com/abc'),
        }),
      );
    });

    it('should include MeetingClaw attribution in body', async () => {
      const intent = createIntent();

      await routeIntent(intent, session, mockConfig);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('MeetingClaw'),
        }),
      );
    });
  });

  describe('respond is fire-and-forget', () => {
    it('should not await respond calls (fire-and-forget)', async () => {
      // respond is mocked to return a Promise that rejects
      mockRespond.mockRejectedValue(new Error('TTS failed'));
      const intent = createIntent();

      // This should not throw even though speak rejects
      await expect(routeIntent(intent, session, mockConfig)).resolves.not.toThrow();
    });
  });
});
