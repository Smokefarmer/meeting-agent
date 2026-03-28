/**
 * LLM inference via Claude CLI subprocess.
 * Uses `claude --print` which is already authenticated via OAuth on the Pi.
 * No API key needed — uses the existing Claude subscription.
 */

import { spawn } from 'node:child_process';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const TIMEOUT_MS = 60_000;

/**
 * Send a prompt to Claude CLI and return the text response.
 * Pipes prompt via stdin to avoid OS arg length limits.
 * Retries on transient failures with exponential backoff.
 */
export async function inferWithClaude(prompt: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await execClaude(prompt);
      if (result.trim().length === 0) {
        throw new Error('Claude CLI returned an empty response');
      }
      return result.trim();
    } catch (err) {
      lastError = err;

      // Don't retry if claude CLI is not found
      if (err instanceof Error && err.message.includes('ENOENT')) {
        throw new Error(
          'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
        );
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(
    `Claude inference failed after ${MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`,
  );
}

function execClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn('claude', ['--print'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
    });

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Claude CLI error: ${err.message}`));
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.trim() || 'Unknown error'}`));
      } else {
        resolve(stdout);
      }
    });

    // Pipe prompt via stdin to avoid arg length limits
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
