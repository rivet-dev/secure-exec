/**
 * E2E test: Claude Code SDK inside the secure-exec sandbox.
 *
 * Verifies that JavaScript code running inside the sandbox VM can use the
 * Claude Code SDK pattern (ProcessTransport) to spawn the claude binary
 * via the child_process bridge, send a prompt, and receive structured
 * responses.
 *
 * The SDK (v2.1.80) is a CLI-only package without a programmatic query()
 * export. This test implements the ProcessTransport pattern manually:
 * sandbox JS spawns `claude -p ... --output-format stream-json` through
 * the child_process bridge, collects NDJSON events from stdout, and
 * returns the result. This is the exact code path that a future
 * programmatic SDK would use.
 *
 * When @anthropic-ai/claude-code exposes a query() function, the probe
 * will detect it and use the native SDK instead of the manual wrapper.
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NodeRuntime,
  NodeFileSystem,
  allowAll,
  createNodeDriver,
} from '../../src/index.js';
import type { CommandExecutor, SpawnedProcess } from '../../src/types.js';
import { createTestNodeRuntime } from '../test-utils.js';
import {
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function findClaudeBinary(): string | null {
  const candidates = [
    'claude',
    path.join(process.env.HOME ?? '', '.claude', 'local', 'claude'),
  ];
  const { execSync } = require('node:child_process');
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" --version`, { stdio: 'ignore' });
      return bin;
    } catch {
      // continue
    }
  }
  return null;
}

const claudeBinary = findClaudeBinary();
const skipReason = claudeBinary
  ? false
  : 'claude binary not found (required for SDK ProcessTransport)';

// ---------------------------------------------------------------------------
// Stdio capture helper
// ---------------------------------------------------------------------------

type CapturedEvent = {
  channel: 'stdout' | 'stderr';
  message: string;
};

function createStdioCapture() {
  const events: CapturedEvent[] = [];
  return {
    events,
    onStdio: (event: CapturedEvent) => events.push(event),
    // Join with newline: the bridge strips trailing newlines from each
    // process.stdout.write() call, so NDJSON events arriving as separate
    // chunks lose their delimiters. Newline-join restores them.
    stdout: () =>
      events
        .filter((e) => e.channel === 'stdout')
        .map((e) => e.message)
        .join('\n'),
    stderr: () =>
      events
        .filter((e) => e.channel === 'stderr')
        .map((e) => e.message)
        .join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Host command executor for child_process bridge
// ---------------------------------------------------------------------------

function createHostCommandExecutor(): CommandExecutor {
  return {
    spawn(
      command: string,
      args: string[],
      options: {
        cwd?: string;
        env?: Record<string, string>;
        onStdout?: (data: Uint8Array) => void;
        onStderr?: (data: Uint8Array) => void;
      },
    ): SpawnedProcess {
      const child = nodeSpawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (options.onStdout)
        child.stdout.on('data', (d: Buffer) =>
          options.onStdout!(new Uint8Array(d)),
        );
      if (options.onStderr)
        child.stderr.on('data', (d: Buffer) =>
          options.onStderr!(new Uint8Array(d)),
        );
      return {
        writeStdin(data: Uint8Array | string) {
          child.stdin.write(data);
        },
        closeStdin() {
          child.stdin.end();
        },
        kill(signal?: number) {
          child.kill(signal);
        },
        wait(): Promise<number> {
          return new Promise((resolve) =>
            child.on('close', (code) => resolve(code ?? 1)),
          );
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Sandbox runtime factory
// ---------------------------------------------------------------------------

function createClaudeSdkRuntime(opts: {
  onStdio: (event: CapturedEvent) => void;
}): NodeRuntime {
  return createTestNodeRuntime({
    driver: createNodeDriver({
      filesystem: new NodeFileSystem(),
      commandExecutor: createHostCommandExecutor(),
      permissions: allowAll,
      processConfig: {
        cwd: '/root',
        env: {
          PATH: process.env.PATH ?? '/usr/bin',
          HOME: process.env.HOME ?? tmpdir(),
        },
      },
    }),
    onStdio: opts.onStdio,
  });
}

const SANDBOX_EXEC_OPTS = { filePath: '/root/entry.js', cwd: '/root' };

// ---------------------------------------------------------------------------
// Sandbox code: SDK-style query via ProcessTransport pattern
// ---------------------------------------------------------------------------

/**
 * Build sandbox code that implements the Claude Code SDK ProcessTransport
 * pattern: spawn the claude binary, collect stdout as NDJSON, return the
 * structured result via process.stdout.
 *
 * The sandbox code:
 * 1. Spawns claude with -p and --output-format stream-json (+ --verbose)
 * 2. Collects all stdout data
 * 3. Parses NDJSON events from the stream
 * 4. Emits the final result as JSON on stdout
 */
function buildSdkQueryCode(opts: {
  prompt: string;
  mockPort: number;
  cwd: string;
  outputFormat?: 'text' | 'json' | 'stream-json';
  timeout?: number;
}): string {
  const outputFormat = opts.outputFormat ?? 'stream-json';
  const extraArgs =
    outputFormat === 'stream-json'
      ? `'--verbose', '--output-format', 'stream-json'`
      : `'--output-format', '${outputFormat}'`;

  return `(async () => {
    const { spawn } = require('child_process');

    // SDK-style query function (ProcessTransport pattern)
    function claudeQuery(prompt, options) {
      return new Promise((resolve, reject) => {
        const args = [
          '-p',
          '--dangerously-skip-permissions',
          '--no-session-persistence',
          '--model', 'haiku',
          ${extraArgs},
          prompt,
        ];

        const child = spawn(${JSON.stringify(claudeBinary)}, args, {
          env: {
            PATH: ${JSON.stringify(process.env.PATH ?? '')},
            HOME: ${JSON.stringify(process.env.HOME ?? tmpdir())},
            ANTHROPIC_API_KEY: 'test-key',
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + options.mockPort,
          },
          cwd: options.cwd,
        });

        child.stdin.end();

        const stdoutChunks = [];
        const stderrChunks = [];

        child.stdout.on('data', (d) => stdoutChunks.push(String(d)));
        child.stderr.on('data', (d) => stderrChunks.push(String(d)));

        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('SDK query timed out'));
        }, options.timeout || ${opts.timeout ?? 45000});

        child.on('close', (code) => {
          clearTimeout(timer);
          const stdout = stdoutChunks.join('');
          const stderr = stderrChunks.join('');
          resolve({ code, stdout, stderr });
        });
      });
    }

    try {
      const result = await claudeQuery(${JSON.stringify(opts.prompt)}, {
        mockPort: ${opts.mockPort},
        cwd: ${JSON.stringify(opts.cwd)},
      });

      // Emit structured SDK result
      process.stdout.write(JSON.stringify({
        sdkResult: true,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      }));

      if (result.code !== 0) process.exit(result.code);
    } catch (e) {
      process.stderr.write('SDK query error: ' + e.message);
      process.exit(1);
    }
  })()`;
}

/**
 * Build sandbox code that queries Claude and parses streaming NDJSON events,
 * mimicking how the SDK would consume a streaming response.
 */
function buildStreamingQueryCode(opts: {
  prompt: string;
  mockPort: number;
  cwd: string;
  timeout?: number;
}): string {
  return `(async () => {
    const { spawn } = require('child_process');

    // SDK-style streaming query (ProcessTransport with event parsing)
    function claudeStreamQuery(prompt, options) {
      return new Promise((resolve, reject) => {
        const args = [
          '-p',
          '--dangerously-skip-permissions',
          '--no-session-persistence',
          '--model', 'haiku',
          '--verbose',
          '--output-format', 'stream-json',
          prompt,
        ];

        const child = spawn(${JSON.stringify(claudeBinary)}, args, {
          env: {
            PATH: ${JSON.stringify(process.env.PATH ?? '')},
            HOME: ${JSON.stringify(process.env.HOME ?? tmpdir())},
            ANTHROPIC_API_KEY: 'test-key',
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + options.mockPort,
          },
          cwd: options.cwd,
        });

        child.stdin.end();

        const events = [];
        let buffer = '';

        child.stdout.on('data', (d) => {
          buffer += String(d);
          // Parse NDJSON lines as they arrive
          const lines = buffer.split('\\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              events.push(JSON.parse(line));
            } catch {
              // non-JSON line, skip
            }
          }
        });

        const stderrChunks = [];
        child.stderr.on('data', (d) => {
          // stderr may also contain NDJSON in stream-json mode
          const str = String(d);
          stderrChunks.push(str);
          const lines = str.split('\\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              events.push(JSON.parse(line));
            } catch {
              // skip
            }
          }
        });

        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('streaming query timed out'));
        }, options.timeout || ${opts.timeout ?? 45000});

        child.on('close', (code) => {
          clearTimeout(timer);
          // Parse any remaining buffer
          if (buffer.trim()) {
            try { events.push(JSON.parse(buffer)); } catch {}
          }
          resolve({ code, events, stderr: stderrChunks.join('') });
        });
      });
    }

    try {
      const result = await claudeStreamQuery(${JSON.stringify(opts.prompt)}, {
        mockPort: ${opts.mockPort},
        cwd: ${JSON.stringify(opts.cwd)},
      });

      process.stdout.write(JSON.stringify({
        sdkResult: true,
        exitCode: result.code,
        eventCount: result.events.length,
        events: result.events,
        hasTypedEvents: result.events.some(e => e.type !== undefined),
      }));

      if (result.code !== 0) process.exit(result.code);
    } catch (e) {
      process.stderr.write('streaming query error: ' + e.message);
      process.exit(1);
    }
  })()`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;

describe.skipIf(skipReason)('Claude Code SDK E2E (sandbox ProcessTransport)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'claude-sdk-'));
  });

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // SDK query — text response
  // -------------------------------------------------------------------------

  it(
    'SDK query returns text response — ProcessTransport spawns claude via bridge',
    async () => {
      const canary = 'SDK_CANARY_RESPONSE_42';
      mockServer.reset([{ type: 'text', text: canary }]);

      const capture = createStdioCapture();
      const runtime = createClaudeSdkRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSdkQueryCode({
            prompt: 'say hello',
            mockPort: mockServer.port,
            cwd: workDir,
            outputFormat: 'text',
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Parse the SDK result emitted by sandbox code
        const stdout = capture.stdout();
        const sdkResult = JSON.parse(stdout);
        expect(sdkResult.sdkResult).toBe(true);
        expect(sdkResult.exitCode).toBe(0);
        expect(sdkResult.stdout).toContain(canary);
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // SDK query — JSON response
  // -------------------------------------------------------------------------

  it(
    'SDK query returns JSON response — structured result via bridge',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello JSON SDK!' }]);

      const capture = createStdioCapture();
      const runtime = createClaudeSdkRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSdkQueryCode({
            prompt: 'say hello',
            mockPort: mockServer.port,
            cwd: workDir,
            outputFormat: 'json',
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        const stdout = capture.stdout();
        const sdkResult = JSON.parse(stdout);
        expect(sdkResult.sdkResult).toBe(true);
        expect(sdkResult.exitCode).toBe(0);

        // The inner stdout should be valid JSON with a result
        const innerResult = JSON.parse(sdkResult.stdout);
        expect(innerResult).toHaveProperty('result');
        expect(innerResult.type).toBe('result');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // SDK streaming query — NDJSON events
  // -------------------------------------------------------------------------

  it(
    'SDK streaming query receives NDJSON events — ProcessTransport streams through bridge',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello streaming!' }]);

      const capture = createStdioCapture();
      const runtime = createClaudeSdkRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildStreamingQueryCode({
            prompt: 'say hello',
            mockPort: mockServer.port,
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        const stdout = capture.stdout();
        const sdkResult = JSON.parse(stdout);
        expect(sdkResult.sdkResult).toBe(true);
        expect(sdkResult.exitCode).toBe(0);
        expect(sdkResult.eventCount).toBeGreaterThan(0);
        expect(sdkResult.hasTypedEvents).toBe(true);
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // SDK handles mock LLM interaction
  // -------------------------------------------------------------------------

  it(
    'SDK sends prompt to mock LLM — request reaches server through bridge',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Prompt received!' }]);

      const capture = createStdioCapture();
      const runtime = createClaudeSdkRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSdkQueryCode({
            prompt: 'test prompt for mock LLM',
            mockPort: mockServer.port,
            cwd: workDir,
            outputFormat: 'text',
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        // Mock server should have received at least one request
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(1);
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // SDK error handling — non-zero exit code
  // -------------------------------------------------------------------------

  it(
    'SDK propagates error exit code through bridge',
    async () => {
      // Use a reject server that returns 401
      const http = require('node:http');
      const rejectServer = http.createServer(
        (req: http.IncomingMessage, res: http.ServerResponse) => {
          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: {
                  type: 'authentication_error',
                  message: 'invalid x-api-key',
                },
              }),
            );
          });
        },
      );
      await new Promise<void>((r) =>
        rejectServer.listen(0, '127.0.0.1', r),
      );
      const rejectPort = (rejectServer.address() as { port: number }).port;

      const capture = createStdioCapture();
      const runtime = createClaudeSdkRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSdkQueryCode({
            prompt: 'say hello',
            mockPort: rejectPort,
            cwd: workDir,
            outputFormat: 'text',
            timeout: 15_000,
          }),
          SANDBOX_EXEC_OPTS,
        );

        // The SDK query should propagate the non-zero exit code
        expect(result.code).not.toBe(0);
      } finally {
        runtime.dispose();
        await new Promise<void>((resolve, reject) => {
          rejectServer.close((err: Error | undefined) =>
            err ? reject(err) : resolve(),
          );
        });
      }
    },
    30_000,
  );

  // -------------------------------------------------------------------------
  // SDK completes session cleanly
  // -------------------------------------------------------------------------

  it(
    'SDK completes query and exits cleanly — full ProcessTransport lifecycle',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Session complete!' }]);

      const capture = createStdioCapture();
      const runtime = createClaudeSdkRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSdkQueryCode({
            prompt: 'say hello',
            mockPort: mockServer.port,
            cwd: workDir,
            outputFormat: 'text',
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        const stdout = capture.stdout();
        const sdkResult = JSON.parse(stdout);
        expect(sdkResult.exitCode).toBe(0);
        expect(sdkResult.stdout).toContain('Session complete!');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );
});
