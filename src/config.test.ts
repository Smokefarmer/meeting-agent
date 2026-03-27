/**
 * Tests for loadConfig() — Zod-based environment config parsing.
 */

import { ZodError } from 'zod';
import { loadConfig } from './config.js';
import type { OpenClawConfig } from './config.js';

/** Set all required env vars to valid values. */
function setRequiredEnvVars(): void {
  process.env.OPENCLAW_INSTANCE_NAME = 'test-bot';
  process.env.RECALL_API_KEY = 'sk-recall-test';
  // openclawGatewayPort and openclawHooksToken have defaults — no env vars needed
}

/** Remove all config-related env vars so tests start clean. */
function clearConfigEnvVars(): void {
  const keys = [
    'OPENCLAW_INSTANCE_NAME',
    'RECALL_API_KEY',
    'ELEVENLABS_API_KEY',
    'OPENCLAW_GATEWAY_PORT',
    'OPENCLAW_HOOKS_TOKEN',
    'GITHUB_TOKEN',
    'GITHUB_REPO',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'CONFIDENCE_THRESHOLD',
  ];
  for (const key of keys) {
    delete process.env[key];
  }
}

describe('loadConfig', () => {
  beforeEach(() => {
    clearConfigEnvVars();
  });

  afterEach(() => {
    clearConfigEnvVars();
  });

  describe('with all valid env vars', () => {
    it('returns a config object with correct values', () => {
      setRequiredEnvVars();
      process.env.ELEVENLABS_API_KEY = 'sk-eleven-test';
      process.env.GITHUB_TOKEN = 'ghp-test-token';
      process.env.GITHUB_REPO = 'org/repo';
      process.env.TELEGRAM_BOT_TOKEN = 'tg-bot-test';
      process.env.TELEGRAM_CHAT_ID = '12345';
      process.env.CONFIDENCE_THRESHOLD = '0.90';

      const config = loadConfig();

      expect(config.instanceName).toBe('test-bot');
      expect(config.recallApiKey).toBe('sk-recall-test');
      expect(config.elevenLabsApiKey).toBe('sk-eleven-test');
      expect(config.openclawGatewayPort).toBe(18789);
      expect(config.openclawHooksToken).toBe('meetingclaw-internal');
      expect(config.githubToken).toBe('ghp-test-token');
      expect(config.githubRepo).toBe('org/repo');
      expect(config.telegramBotToken).toBe('tg-bot-test');
      expect(config.telegramChatId).toBe('12345');
      expect(config.confidenceThreshold).toBe(0.90);
    });
  });

  describe('missing required vars', () => {
    it('throws ZodError when OPENCLAW_INSTANCE_NAME is missing', () => {
      process.env.RECALL_API_KEY = 'sk-recall-test';
      process.env.ELEVENLABS_API_KEY = 'sk-eleven-test';
      // openclawGatewayPort and openclawHooksToken have defaults — no env vars needed

      expect(() => loadConfig()).toThrow(ZodError);
    });

    it('throws ZodError when RECALL_API_KEY is missing', () => {
      process.env.OPENCLAW_INSTANCE_NAME = 'test-bot';
      process.env.ELEVENLABS_API_KEY = 'sk-eleven-test';
      // openclawGatewayPort and openclawHooksToken have defaults — no env vars needed

      expect(() => loadConfig()).toThrow(ZodError);
    });

    it('defaults elevenLabsApiKey to null when ELEVENLABS_API_KEY is missing', () => {
      process.env.OPENCLAW_INSTANCE_NAME = 'test-bot';
      process.env.RECALL_API_KEY = 'sk-recall-test';
      // openclawGatewayPort and openclawHooksToken have defaults — no env vars needed

      const config = loadConfig();

      expect(config.elevenLabsApiKey).toBeNull();
    });

    it('throws ZodError when all required vars are missing', () => {
      expect(() => loadConfig()).toThrow(ZodError);
    });

    it('includes field paths in ZodError issues', () => {
      try {
        loadConfig();
        expect.fail('Expected loadConfig() to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodErr = err as ZodError;
        const paths = zodErr.issues.map((issue) => issue.path[0]);
        expect(paths).toContain('instanceName');
        expect(paths).toContain('recallApiKey');
        // openclawGatewayPort and openclawHooksToken have defaults, so they won't appear
      }
    });
  });

  describe('default values', () => {
    it('defaults confidenceThreshold to 0.85 when env var is not set', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.confidenceThreshold).toBe(0.85);
    });

    it('defaults openclawGatewayPort to 18789 when env var is not set', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.openclawGatewayPort).toBe(18789);
    });

    it('defaults openclawHooksToken to meetingclaw-internal when env var is not set', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.openclawHooksToken).toBe('meetingclaw-internal');
    });

    it('uses custom openclawGatewayPort when env var is set', () => {
      setRequiredEnvVars();
      process.env.OPENCLAW_GATEWAY_PORT = '9999';

      const config = loadConfig();

      expect(config.openclawGatewayPort).toBe(9999);
    });

    it('uses custom openclawHooksToken when env var is set', () => {
      setRequiredEnvVars();
      process.env.OPENCLAW_HOOKS_TOKEN = 'custom-token';

      const config = loadConfig();

      expect(config.openclawHooksToken).toBe('custom-token');
    });

    it('defaults nullable fields to null when env vars are not set', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.elevenLabsApiKey).toBeNull();
      expect(config.githubToken).toBeNull();
      expect(config.githubRepo).toBeNull();
      expect(config.telegramBotToken).toBeNull();
      expect(config.telegramChatId).toBeNull();
    });

    it('defaults nullable fields to null when env vars are empty strings', () => {
      setRequiredEnvVars();
      process.env.ELEVENLABS_API_KEY = '';
      process.env.GITHUB_TOKEN = '';
      process.env.GITHUB_REPO = '';
      process.env.TELEGRAM_BOT_TOKEN = '';
      process.env.TELEGRAM_CHAT_ID = '';

      const config = loadConfig();

      expect(config.elevenLabsApiKey).toBeNull();
      expect(config.githubToken).toBeNull();
      expect(config.githubRepo).toBeNull();
      expect(config.telegramBotToken).toBeNull();
      expect(config.telegramChatId).toBeNull();
    });
  });

  describe('confidenceThreshold validation', () => {
    it('accepts a valid threshold within range', () => {
      setRequiredEnvVars();
      process.env.CONFIDENCE_THRESHOLD = '0.50';

      const config = loadConfig();

      expect(config.confidenceThreshold).toBe(0.50);
    });

    it('rejects boundary value 0 (minimum is 0.5)', () => {
      setRequiredEnvVars();
      process.env.CONFIDENCE_THRESHOLD = '0';

      expect(() => loadConfig()).toThrow(ZodError);
    });

    it('accepts boundary value 1', () => {
      setRequiredEnvVars();
      process.env.CONFIDENCE_THRESHOLD = '1';

      const config = loadConfig();

      expect(config.confidenceThreshold).toBe(1);
    });
  });

  describe('return type', () => {
    it('returns an object conforming to OpenClawConfig', () => {
      setRequiredEnvVars();

      const config: OpenClawConfig = loadConfig();

      expect(config).toBeDefined();
      expect(typeof config.instanceName).toBe('string');
      expect(typeof config.recallApiKey).toBe('string');
      // elevenLabsApiKey is nullable — string when set, null otherwise
      expect(
        config.elevenLabsApiKey === null || typeof config.elevenLabsApiKey === 'string',
      ).toBe(true);
      expect(typeof config.openclawGatewayPort).toBe('number');
      expect(typeof config.openclawHooksToken).toBe('string');
      expect(typeof config.confidenceThreshold).toBe('number');
    });
  });
});
