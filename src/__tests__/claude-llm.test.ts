/**
 * Tests for claude-llm.ts — Claude CLI subprocess LLM client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable, Readable } from 'node:stream';

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { inferWithClaude } from '../claude-llm.js';

interface MockProcess extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
}

function createMockProcess(stdout: string, exitCode: number, stderr = ''): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  const stdoutStream = new Readable({ read() {} });
  const stderrStream = new Readable({ read() {} });
  const stdinStream = new Writable({ write(_chunk, _enc, cb) { cb(); } });

  proc.stdin = stdinStream;
  proc.stdout = stdoutStream;
  proc.stderr = stderrStream;

  // Push data first, then close — using setImmediate for proper ordering
  setImmediate(() => {
    if (stdout) stdoutStream.push(Buffer.from(stdout));
    stdoutStream.push(null);
    if (stderr) stderrStream.push(Buffer.from(stderr));
    stderrStream.push(null);
    // Delay close slightly to let data events propagate
    setImmediate(() => proc.emit('close', exitCode));
  });

  return proc;
}

function createErrorProcess(errorMessage: string): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  const stdoutStream = new Readable({ read() {} });
  const stderrStream = new Readable({ read() {} });
  const stdinStream = new Writable({ write(_chunk, _enc, cb) { cb(); } });

  proc.stdin = stdinStream;
  proc.stdout = stdoutStream;
  proc.stderr = stderrStream;

  setImmediate(() => proc.emit('error', new Error(errorMessage)));

  return proc;
}

describe('inferWithClaude', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls claude --print and returns stdout', async () => {
    mockSpawn.mockImplementationOnce(() => createMockProcess('The answer is 42.', 0));

    const result = await inferWithClaude('What is the answer?');

    expect(result).toBe('The answer is 42.');
    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['--print', '--model', 'claude-haiku-4-5'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    );
  });

  it('trims whitespace from response', async () => {
    mockSpawn.mockImplementationOnce(() => createMockProcess('  hello world  \n', 0));

    const result = await inferWithClaude('test');

    expect(result).toBe('hello world');
  });

  it('pipes prompt via stdin', async () => {
    const stdinChunks: string[] = [];
    mockSpawn.mockImplementationOnce(() => {
      const proc = new EventEmitter() as MockProcess;
      const stdoutStream = new Readable({ read() {} });
      const stderrStream = new Readable({ read() {} });
      const stdinStream = new Writable({
        write(chunk, _enc, cb) { stdinChunks.push(chunk.toString()); cb(); },
      });
      proc.stdin = stdinStream;
      proc.stdout = stdoutStream;
      proc.stderr = stderrStream;

      setImmediate(() => {
        stdoutStream.push(Buffer.from('response'));
        stdoutStream.push(null);
        stderrStream.push(null);
        setImmediate(() => proc.emit('close', 0));
      });

      return proc;
    });

    const result = await inferWithClaude('my long prompt');

    expect(stdinChunks.join('')).toBe('my long prompt');
    expect(result).toBe('response');
  });

  it('throws on empty response after retries', async () => {
    mockSpawn.mockImplementation(() => createMockProcess('', 0));

    await expect(inferWithClaude('test')).rejects.toThrow(
      'Claude inference failed after 3 attempts',
    );
  });

  it('throws on non-zero exit code after retries', async () => {
    mockSpawn.mockImplementation(() => createMockProcess('', 1, 'some error'));

    await expect(inferWithClaude('test')).rejects.toThrow(
      'Claude inference failed after 3 attempts',
    );
  });

  it('throws immediately when claude CLI is not found (ENOENT)', async () => {
    mockSpawn.mockImplementationOnce(() => createErrorProcess('spawn claude ENOENT'));

    await expect(inferWithClaude('test')).rejects.toThrow(
      'Claude CLI not found',
    );
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure then succeeds', async () => {
    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createMockProcess('', 1, 'temporary error');
      return createMockProcess('success', 0);
    });

    const result = await inferWithClaude('test');

    expect(result).toBe('success');
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries exhausted', async () => {
    mockSpawn.mockImplementation(() => createMockProcess('', 1, 'fail'));

    await expect(inferWithClaude('test')).rejects.toThrow(
      'Claude inference failed after 3 attempts',
    );
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  it('includes stderr in error message on failure', async () => {
    mockSpawn.mockImplementation(() => createMockProcess('', 1, 'rate limit exceeded'));

    await expect(inferWithClaude('test')).rejects.toThrow('rate limit exceeded');
  });
});
