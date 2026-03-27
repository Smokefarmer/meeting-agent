/**
 * LLM inference via OpenClaw built-in agent — no external API key needed.
 * Calls the OpenClaw hooks API on localhost.
 */

import axios from 'axios';
import type { OpenClawConfig } from './config.js';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const TIMEOUT_SECONDS = 30;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

/**
 * Send a prompt to the OpenClaw hooks agent and return the text response.
 * Retries on 429 (rate limit) and 503 (gateway unavailable) with exponential backoff.
 */
export async function inferWithOpenClaw(
  prompt: string,
  config: OpenClawConfig,
): Promise<string> {
  const url = `http://localhost:${config.openclawGatewayPort}/hooks/agent`;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(
        url,
        { message: prompt, deliver: false, timeoutSeconds: TIMEOUT_SECONDS },
        {
          headers: {
            Authorization: `Bearer ${config.openclawHooksToken}`,
            'Content-Type': 'application/json',
          },
          timeout: (TIMEOUT_SECONDS + 5) * 1000,
        },
      );

      const response = res.data?.response;
      if (typeof response !== 'string' || response.length === 0) {
        throw new Error('OpenClaw returned an empty or invalid response');
      }

      return response;
    } catch (err) {
      lastError = err;

      // ECONNREFUSED — gateway not running, don't retry
      if (axios.isAxiosError(err) && err.code === 'ECONNREFUSED') {
        throw new Error(
          `OpenClaw gateway not running on port ${config.openclawGatewayPort}. Start it with: openclaw gateway restart`,
        );
      }

      // Retry only on 429/503
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status && RETRYABLE_STATUS_CODES.has(status) && attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }

      // Non-retryable error or last attempt — throw
      if (!status || !RETRYABLE_STATUS_CODES.has(status)) {
        throw err;
      }
    }
  }

  throw new Error(
    `OpenClaw inference failed after ${MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
