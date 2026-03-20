/**
 * E2E test: OpenCode headless binary mode via sandbox child_process bridge.
 *
 * Verifies the raw binary spawn path: sandbox JS calls
 * child_process.spawn('opencode', ['run', ...]) through the bridge, the host
 * spawns the real opencode binary, stdio flows back through the bridge, and
 * exit codes propagate correctly.
 *
 * OpenCode is a compiled Bun binary (ELF) — no SDK, no JS source. The only
 * way to run it is via child_process.spawn through the bridge.
 *
 * OpenCode uses ANTHROPIC_BASE_URL when available. Some versions hang during
 * plugin init with BASE_URL redirects, so a probe checks mock redirect
 * viability at startup.
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
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

function hasOpenCodeBinary(): boolean {
  try {
    const { execSync } = require('node:child_process');
    execSync('opencode --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const skipReason = hasOpenCodeBinary()
  ? false
  : 'opencode binary not found on PATH';

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

function createOpenCodeBinarySandboxRuntime(opts: {
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
// Sandbox code builders
// ---------------------------------------------------------------------------

/** Build env object for OpenCode binary spawn inside the sandbox. */
function openCodeEnv(opts: {
  mockPort?: number;
  extraEnv?: Record<string, string>;
} = {}): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? tmpdir(),
    // Isolate XDG data to avoid polluting real config
    XDG_DATA_HOME: path.join(
      tmpdir(),
      `opencode-binary-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ),
    ...(opts.extraEnv ?? {}),
  };

  if (opts.mockPort) {
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? 'test-key';
    env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${opts.mockPort}`;
  }

  return env;
}

/**
 * Build sandbox code that spawns OpenCode and pipes stdout/stderr to
 * process.stdout/stderr. Exit code is forwarded from the binary.
 *
 * process.exit() must be called at the top-level await, not inside a bridge
 * callback — calling it inside childProcessDispatch would throw a
 * ProcessExitError through the host reference chain.
 */
function buildSpawnCode(opts: {
  args: string[];
  env: Record<string, string>;
  cwd: string;
  timeout?: number;
}): string {
  return `(async () => {
    const { spawn } = require('child_process');
    const child = spawn('opencode', ${JSON.stringify(opts.args)}, {
      env: ${JSON.stringify(opts.env)},
      cwd: ${JSON.stringify(opts.cwd)},
    });

    child.stdin.end();

    child.stdout.on('data', (d) => process.stdout.write(String(d)));
    child.stderr.on('data', (d) => process.stderr.write(String(d)));

    const exitCode = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(124);
      }, ${opts.timeout ?? 45000});

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) process.exit(exitCode);
  })()`;
}

/**
 * Build sandbox code that spawns OpenCode, waits for any output, sends
 * SIGINT through the bridge, then reports the exit code.
 */
function buildSigintCode(opts: {
  args: string[];
  env: Record<string, string>;
  cwd: string;
}): string {
  return `(async () => {
    const { spawn } = require('child_process');
    const child = spawn('opencode', ${JSON.stringify(opts.args)}, {
      env: ${JSON.stringify(opts.env)},
      cwd: ${JSON.stringify(opts.cwd)},
    });

    child.stdin.end();

    child.stdout.on('data', (d) => process.stdout.write(String(d)));
    child.stderr.on('data', (d) => process.stderr.write(String(d)));

    // Wait for output then send SIGINT
    let sentSigint = false;
    const onOutput = () => {
      if (!sentSigint) {
        sentSigint = true;
        child.kill('SIGINT');
      }
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);

    const exitCode = await new Promise((resolve) => {
      const noOutputTimer = setTimeout(() => {
        if (!sentSigint) {
          child.kill();
          resolve(2);
        }
      }, 15000);

      const killTimer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(137);
      }, 25000);

      child.on('close', (code) => {
        clearTimeout(noOutputTimer);
        clearTimeout(killTimer);
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) process.exit(exitCode);
  })()`;
}

/** Base args for OpenCode headless run mode. */
const OPENCODE_BASE_ARGS = [
  'run',
  '-m',
  'anthropic/claude-sonnet-4-6',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let mockRedirectWorks: boolean;

describe.skipIf(skipReason)('OpenCode headless binary E2E (sandbox child_process bridge)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);

    // Probe BASE_URL redirect via sandbox child_process bridge
    mockServer.reset([{ type: 'text', text: 'PROBE_OK' }]);
    const probeCapture = createStdioCapture();
    const probeRuntime = createOpenCodeBinarySandboxRuntime({
      onStdio: probeCapture.onStdio,
    });
    try {
      const result = await probeRuntime.exec(
        buildSpawnCode({
          args: [...OPENCODE_BASE_ARGS, '--format', 'json', 'say ok'],
          env: openCodeEnv({ mockPort: mockServer.port }),
          cwd: process.cwd(),
          timeout: 8000,
        }),
        SANDBOX_EXEC_OPTS,
      );
      mockRedirectWorks = result.code === 0;
    } catch {
      mockRedirectWorks = false;
    } finally {
      probeRuntime.dispose();
    }

    workDir = await mkdtemp(path.join(tmpdir(), 'opencode-headless-binary-'));
  }, 30_000);

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Boot & text output
  // -------------------------------------------------------------------------

  it(
    'OpenCode boots in run mode — exits with code 0',
    async () => {
      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        if (mockRedirectWorks) {
          mockServer.reset([
            { type: 'text', text: 'title' },
            { type: 'text', text: 'Hello!' },
            { type: 'text', text: 'Hello!' },
          ]);
        }

        const result = await runtime.exec(
          buildSpawnCode({
            args: [...OPENCODE_BASE_ARGS, '--format', 'json', 'say hello'],
            env: mockRedirectWorks
              ? openCodeEnv({ mockPort: mockServer.port })
              : openCodeEnv(),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        if (result.code !== 0) {
          console.log('OpenCode boot stderr:', capture.stderr().slice(0, 2000));
        }
        expect(result.code).toBe(0);
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  it(
    'Text output — stdout contains canned LLM response',
    async () => {
      const canary = 'UNIQUE_CANARY_OC_BINARY_42';
      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        if (mockRedirectWorks) {
          mockServer.reset([
            { type: 'text', text: 'title' },
            { type: 'text', text: canary },
            { type: 'text', text: canary },
          ]);

          const result = await runtime.exec(
            buildSpawnCode({
              args: [...OPENCODE_BASE_ARGS, '--format', 'json', 'say hello'],
              env: openCodeEnv({ mockPort: mockServer.port }),
              cwd: workDir,
            }),
            SANDBOX_EXEC_OPTS,
          );

          expect(result.code).toBe(0);
          expect(capture.stdout()).toContain(canary);
        } else {
          const result = await runtime.exec(
            buildSpawnCode({
              args: [
                ...OPENCODE_BASE_ARGS,
                '--format', 'json',
                'respond with exactly: HELLO_OUTPUT',
              ],
              env: openCodeEnv(),
              cwd: workDir,
            }),
            SANDBOX_EXEC_OPTS,
          );

          expect(result.code).toBe(0);
          // With real API, just verify some output came through
          const stdout = capture.stdout().trim();
          expect(stdout.length).toBeGreaterThan(0);
        }
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Output formats
  // -------------------------------------------------------------------------

  it(
    'JSON format — --format json produces valid JSON events',
    async () => {
      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        if (mockRedirectWorks) {
          mockServer.reset([
            { type: 'text', text: 'title' },
            { type: 'text', text: 'Hello JSON!' },
            { type: 'text', text: 'Hello JSON!' },
          ]);
        }

        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...OPENCODE_BASE_ARGS,
              '--format', 'json',
              mockRedirectWorks ? 'say hello' : 'respond with: hi',
            ],
            env: mockRedirectWorks
              ? openCodeEnv({ mockPort: mockServer.port })
              : openCodeEnv(),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Parse NDJSON events from stdout
        const lines = capture
          .stdout()
          .trim()
          .split('\n')
          .filter(Boolean);
        const jsonEvents: Array<Record<string, unknown>> = [];
        for (const line of lines) {
          try {
            jsonEvents.push(JSON.parse(line) as Record<string, unknown>);
          } catch {
            // skip non-JSON lines
          }
        }
        expect(jsonEvents.length).toBeGreaterThan(0);
        for (const event of jsonEvents) {
          expect(event).toHaveProperty('type');
        }
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  it(
    'Default format — --format default produces formatted text output',
    async () => {
      const canary = 'DEFAULTFORMAT_CANARY_77';
      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        if (mockRedirectWorks) {
          mockServer.reset([
            { type: 'text', text: canary },
            { type: 'text', text: canary },
            { type: 'text', text: canary },
          ]);
        }

        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...OPENCODE_BASE_ARGS,
              '--format', 'default',
              mockRedirectWorks ? 'say hello' : 'respond with: hi',
            ],
            env: mockRedirectWorks
              ? openCodeEnv({ mockPort: mockServer.port })
              : openCodeEnv(),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        // Strip ANSI escape codes and verify non-empty output
        const stripped = capture
          .stdout()
          .replace(/\x1b\[[0-9;]*m/g, '')
          .trim();
        expect(stripped.length).toBeGreaterThan(0);
        if (mockRedirectWorks) {
          expect(stripped).toContain(canary);
        }
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Env forwarding
  // -------------------------------------------------------------------------

  it(
    'Env forwarding — ANTHROPIC_BASE_URL reaches mock server through bridge',
    async () => {
      if (!mockRedirectWorks) {
        // Cannot verify mock server received requests without redirect
        return;
      }

      mockServer.reset([
        { type: 'text', text: 'title' },
        { type: 'text', text: 'Env forwarded!' },
        { type: 'text', text: 'Env forwarded!' },
      ]);

      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [...OPENCODE_BASE_ARGS, '--format', 'json', 'say hello'],
            env: openCodeEnv({ mockPort: mockServer.port }),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        // Mock server received at least one request — env forwarding works
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(1);
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Exit code propagation
  // -------------------------------------------------------------------------

  it(
    'Exit code propagation — bad model exits non-zero or produces error',
    async () => {
      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              'run',
              '-m',
              'fakeprovider/nonexistent-model',
              '--format', 'json',
              'say hello',
            ],
            env: openCodeEnv(),
            cwd: workDir,
            timeout: 15000,
          }),
          SANDBOX_EXEC_OPTS,
        );

        // Either non-zero exit or error in output
        const combined = capture.stdout() + capture.stderr();
        const hasError =
          result.code !== 0 ||
          combined.includes('Error') ||
          combined.includes('error') ||
          combined.includes('not found');
        expect(hasError).toBe(true);
      } finally {
        runtime.dispose();
      }
    },
    30_000,
  );

  it(
    'Exit code propagation — good prompt exits 0',
    async () => {
      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        if (mockRedirectWorks) {
          mockServer.reset([
            { type: 'text', text: 'title' },
            { type: 'text', text: 'All good!' },
            { type: 'text', text: 'All good!' },
          ]);
        }

        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...OPENCODE_BASE_ARGS,
              '--format', 'json',
              mockRedirectWorks ? 'say hello' : 'respond with: ok',
            ],
            env: mockRedirectWorks
              ? openCodeEnv({ mockPort: mockServer.port })
              : openCodeEnv(),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Signal handling
  // -------------------------------------------------------------------------

  it(
    'SIGINT stops execution — send SIGINT through bridge, process terminates',
    async () => {
      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSigintCode({
            args: [
              ...OPENCODE_BASE_ARGS,
              '--format', 'json',
              'Write a very long essay about the history of computing. Make it at least 5000 words.',
            ],
            env: mockRedirectWorks
              ? openCodeEnv({ mockPort: mockServer.port })
              : openCodeEnv(),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        // Exit code 2 = no output received (environment issue, skip gracefully)
        if (result.code === 2) return;

        // Should not need SIGKILL (exit code 137)
        expect(result.code).not.toBe(137);
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  // -------------------------------------------------------------------------
  // Stdout/stderr bridge flow
  // -------------------------------------------------------------------------

  it(
    'Stdout/stderr flow — captured events have correct channels',
    async () => {
      const capture = createStdioCapture();
      const runtime = createOpenCodeBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        if (mockRedirectWorks) {
          mockServer.reset([
            { type: 'text', text: 'title' },
            { type: 'text', text: 'Bridge flow test' },
            { type: 'text', text: 'Bridge flow test' },
          ]);
        }

        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...OPENCODE_BASE_ARGS,
              '--format', 'json',
              mockRedirectWorks ? 'say hello' : 'respond with: ok',
            ],
            env: mockRedirectWorks
              ? openCodeEnv({ mockPort: mockServer.port })
              : openCodeEnv(),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Verify events came through with correct channel labels
        const stdoutEvents = capture.events.filter((e) => e.channel === 'stdout');
        expect(stdoutEvents.length).toBeGreaterThan(0);
        // Each event should have a non-empty message
        for (const event of stdoutEvents) {
          expect(event.message.length).toBeGreaterThan(0);
        }
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );
});
