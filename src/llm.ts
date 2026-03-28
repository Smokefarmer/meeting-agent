/**
 * LLM inference abstraction — decoupled from transport.
 *
 * Two implementations:
 * - SubagentLlmClient: uses OpenClaw api.runtime.subagent (production)
 * - CliLlmClient: uses `claude --print` subprocess (local dev / fallback)
 */

import { spawn } from 'node:child_process';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
const MAX_INFLIGHT = 2;
const CLI_TIMEOUT_MS = 60_000;
const CLI_MODEL = 'claude-haiku-4-5';
const SUBAGENT_TIMEOUT_MS = 60_000;
const SUBAGENT_MODEL = 'anthropic/claude-haiku-4-5';

/**
 * Abstract LLM client interface. All modules call this instead of
 * importing a specific transport.
 */
export interface LlmClient {
  infer(prompt: string): Promise<string>;
  inferAndDeliver?(prompt: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Subagent types — minimal interface matching OpenClaw plugin SDK
// ---------------------------------------------------------------------------

export interface SubagentApi {
  run(params: {
    sessionKey: string;
    message: string;
    deliver?: boolean;
    model?: string;
  }): Promise<{ runId: string }>;

  waitForRun(params: {
    runId: string;
    timeoutMs?: number;
  }): Promise<{ status: 'ok' | 'error' | 'timeout'; error?: string }>;

  getSessionMessages(params: {
    sessionKey: string;
  }): Promise<{ messages: Array<{ role?: string; content?: string | Array<{ type?: string; text?: string }> }> }>;

  deleteSession(params: {
    sessionKey: string;
  }): Promise<void>;
}

export interface PluginRuntime {
  subagent: SubagentApi;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface HttpRouteDefinition {
  method: 'GET' | 'POST';
  path: string;
  handler: (req: {
    body: unknown;
    headers: Record<string, string | undefined>;
    rawBody?: Buffer;
  }) => Promise<{ status: number; body?: unknown }>;
}

export interface PluginApi {
  runtime: PluginRuntime;
  pluginConfig?: Record<string, unknown>;
  registerTool?: (definition: ToolDefinition) => void;
  registerHttpRoute?: (definition: HttpRouteDefinition) => void;
}

// ---------------------------------------------------------------------------
// Rate-limit detection
// ---------------------------------------------------------------------------

const RATE_LIMIT_RE = /\b429\b|rate.?limit|too many requests|overloaded/i;

export function isRateLimitError(err: unknown): boolean {
  return err instanceof Error && RATE_LIMIT_RE.test(err.message);
}

// ---------------------------------------------------------------------------
// Lightweight concurrency limiter — caps inflight LLM calls process-wide.
// Does NOT queue: if at capacity, the call is rejected immediately so the
// meeting pipeline stays responsive instead of piling up stale work.
// ---------------------------------------------------------------------------

let inflight = 0;

export function tryAcquire(): boolean {
  if (inflight >= MAX_INFLIGHT) return false;
  inflight++;
  return true;
}

export function releaseSlot(): void {
  inflight = Math.max(0, inflight - 1);
}

/** Visible for tests only. */
export function _getInflight(): number { return inflight; }
export function _resetInflight(): void {
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    throw new Error('_resetInflight is only available in test environments');
  }
  inflight = 0;
}

// ---------------------------------------------------------------------------
// Subagent LLM client (OpenClaw production)
// ---------------------------------------------------------------------------

let subagentCounter = 0;

function makeSessionKey(meetingId?: string): string {
  const counter = ++subagentCounter;
  return meetingId
    ? `meetingclaw:${meetingId}:llm:${counter}`
    : `meetingclaw:llm:${counter}`;
}

/**
 * Extract text content from a subagent message.
 * Content may be a plain string or an array of content blocks.
 */
function extractTextContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text!)
    .join('\n');
}

export function createSubagentLlmClient(api: PluginApi, meetingId?: string): LlmClient {
  return {
    async infer(prompt: string): Promise<string> {
      if (!tryAcquire()) {
        throw new Error('LLM concurrency limit reached — call dropped to stay responsive');
      }
      try {
        return await subagentInferWithRetry(api, prompt, meetingId);
      } finally {
        releaseSlot();
      }
    },

    async inferAndDeliver(prompt: string): Promise<void> {
      const sessionKey = makeSessionKey(meetingId);

      const { runId } = await api.runtime.subagent.run({
        sessionKey,
        message: prompt,
        deliver: true,
        model: SUBAGENT_MODEL,
      });

      await api.runtime.subagent.waitForRun({
        runId,
        timeoutMs: SUBAGENT_TIMEOUT_MS,
      });
    },
  };
}

async function subagentInferWithRetry(
  api: PluginApi,
  prompt: string,
  meetingId?: string,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const sessionKey = makeSessionKey(meetingId);

    try {
      const { runId } = await api.runtime.subagent.run({
        sessionKey,
        message: prompt,
        deliver: false,
        model: SUBAGENT_MODEL,
      });

      const result = await api.runtime.subagent.waitForRun({
        runId,
        timeoutMs: SUBAGENT_TIMEOUT_MS,
      });

      if (result.status === 'timeout') {
        throw new Error('OpenClaw subagent timed out');
      }
      if (result.status === 'error') {
        const detail = result.error ? String(result.error).slice(0, 120) : 'Unknown';
        throw new Error(`OpenClaw subagent error: ${detail}`);
      }

      const { messages } = await api.runtime.subagent.getSessionMessages({ sessionKey });

      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant');

      const text = extractTextContent(lastAssistant?.content);
      if (text.trim().length === 0) {
        throw new Error('OpenClaw subagent returned an empty response');
      }

      api.runtime.subagent.deleteSession({ sessionKey }).catch(() => {});

      return text.trim();
    } catch (err) {
      lastError = err;

      // 429 / rate-limit: throw immediately — retrying just burns more quota
      if (isRateLimitError(err)) {
        throw new Error(
          `LLM rate-limited: ${err instanceof Error ? err.message.slice(0, 120) : 'Unknown'}`,
        );
      }

      // Transient errors: short backoff
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(
    `LLM inference failed after ${MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`,
  );
}

// ---------------------------------------------------------------------------
// CLI LLM client (local dev / fallback)
// ---------------------------------------------------------------------------

export function createCliLlmClient(): LlmClient {
  return {
    async infer(prompt: string): Promise<string> {
      if (!tryAcquire()) {
        throw new Error('LLM concurrency limit reached — call dropped to stay responsive');
      }
      try {
        return await cliInferWithRetry(prompt);
      } finally {
        releaseSlot();
      }
    },
  };
}

async function cliInferWithRetry(prompt: string): Promise<string> {
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

      if (err instanceof Error && err.message.includes('ENOENT')) {
        throw new Error(
          'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
        );
      }

      if (isRateLimitError(err)) {
        throw new Error(
          `CLI rate-limited: ${err instanceof Error ? err.message.slice(0, 120) : 'Unknown'}`,
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

    const child = spawn('claude', ['--print', '--model', CLI_MODEL], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CLI_TIMEOUT_MS,
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

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
