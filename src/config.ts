import { z } from 'zod';
import 'dotenv/config';

const ConfigSchema = z.object({
  instanceName: z.string().min(1).max(50).regex(/^[a-zA-Z0-9 _-]+$/),
  recallApiKey: z.string().min(1),
  elevenLabsApiKey: z.string().nullable().default(null),
  githubToken: z.string().nullable().default(null),
  githubRepo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).nullable().default(null),
  telegramBotToken: z.string().nullable().default(null),
  telegramChatId: z.string().nullable().default(null),
  confidenceThreshold: z.number().min(0.5).max(1).default(0.85),
});

export type OpenClawConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): OpenClawConfig {
  return ConfigSchema.parse({
    instanceName: process.env.OPENCLAW_INSTANCE_NAME ?? '',
    recallApiKey: process.env.RECALL_API_KEY ?? '',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || null,
    githubToken: process.env.GITHUB_TOKEN || null,
    githubRepo: process.env.GITHUB_REPO || null,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD ?? '0.85'),
  });
}
