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
  ngrokUrl: z.string().url().nullable().default(null),
});

export type OpenClawConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(pluginConfig?: Record<string, unknown>): OpenClawConfig {
  return ConfigSchema.parse({
    instanceName: (pluginConfig?.instanceName as string) ?? process.env.OPENCLAW_INSTANCE_NAME ?? '',
    recallApiKey: (pluginConfig?.recallApiKey as string) ?? process.env.RECALL_API_KEY ?? '',
    elevenLabsApiKey: (pluginConfig?.elevenLabsApiKey as string | undefined) ?? (process.env.ELEVENLABS_API_KEY || null),
    githubToken: (pluginConfig?.githubToken as string | undefined) ?? (process.env.GITHUB_TOKEN || null),
    githubRepo: (pluginConfig?.githubRepo as string | undefined) ?? (process.env.GITHUB_REPO || null),
    telegramBotToken: (pluginConfig?.telegramBotToken as string | undefined) ?? (process.env.TELEGRAM_BOT_TOKEN || null),
    telegramChatId: (pluginConfig?.telegramChatId as string | undefined) ?? (process.env.TELEGRAM_CHAT_ID || null),
    confidenceThreshold: Number((pluginConfig?.confidenceThreshold as number | undefined) ?? process.env.CONFIDENCE_THRESHOLD ?? '0.85'),
    ngrokUrl: (pluginConfig?.ngrokUrl as string | undefined) ?? (process.env.NGROK_URL || null),
  });
}
