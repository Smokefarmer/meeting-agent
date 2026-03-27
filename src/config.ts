import { z } from 'zod';
import 'dotenv/config';

const ConfigSchema = z.object({
  instanceName: z.string().min(1),
  skribbyApiKey: z.string().min(1),
  elevenLabsApiKey: z.string().min(1),
  anthropicApiKey: z.string().min(1),
  githubToken: z.string().nullable().default(null),
  githubRepo: z.string().nullable().default(null),
  telegramBotToken: z.string().nullable().default(null),
  telegramChatId: z.string().nullable().default(null),
  confidenceThreshold: z.number().min(0.5).max(1).default(0.85),
});

export type OpenClawConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): OpenClawConfig {
  return ConfigSchema.parse({
    instanceName: process.env.OPENCLAW_INSTANCE_NAME ?? '',
    skribbyApiKey: process.env.SKRIBBY_API_KEY ?? '',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    githubToken: process.env.GITHUB_TOKEN || null,
    githubRepo: process.env.GITHUB_REPO || null,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD ?? '0.85'),
  });
}
