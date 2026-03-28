/**
 * LLM inference via Claude CLI — no external API key needed.
 * Uses the authenticated Claude CLI (`claude --print`) as a subprocess.
 * The CLI uses OpenClaw's existing Claude OAuth credentials.
 */

import { execSync } from 'node:child_process';

const CLAUDE_PATHS = [
  '/home/nostra/.local/bin/claude',
  '/usr/local/bin/claude',
  'claude', // PATH fallback
];
const TIMEOUT_MS = 30_000;

let resolvedClaudePath: string | null = null;

function findClaudePath(): string {
  if (resolvedClaudePath) return resolvedClaudePath;

  for (const path of CLAUDE_PATHS) {
    try {
      execSync(`${path} --version`, { stdio: 'ignore', timeout: 3000 });
      resolvedClaudePath = path;
      return path;
    } catch {
      continue;
    }
  }

  throw new Error(
    'Claude CLI not found. Ensure it is installed and in PATH.',
  );
}

/**
 * Run a prompt through the Claude CLI and return the text response.
 * Synchronous — blocks until Claude responds (max 30s).
 * No API key needed — uses existing Claude OAuth credentials.
 */
export function inferWithClaude(prompt: string): string {
  const claudePath = findClaudePath();

  try {
    const result = execSync(`${claudePath} --print`, {
      input: prompt,
      timeout: TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Claude CLI inference failed: ${message}`);
  }
}
