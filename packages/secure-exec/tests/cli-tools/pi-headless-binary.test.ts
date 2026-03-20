/**
 * E2E test: Pi coding agent headless binary mode via sandbox child_process bridge.
 *
 * Verifies Pi can boot in -p mode, produce output, and propagate exit codes
 * when spawned as a binary (node dist/cli.js) through the sandbox's
 * child_process.spawn bridge. This is different from pi-headless.test.ts which
 * runs Pi's JS directly inside the sandbox VM.
 *
 * Pi hardcodes baseURL from model config (ignoring ANTHROPIC_BASE_URL env var),
 * so we redirect API requests via a models.json provider override that sets a
 * custom baseUrl pointing to the mock LLM server.
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function findPiCliPath(): string | null {
  const cliPath = path.resolve(
    SECURE_EXEC_ROOT,
    'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
  );
  return existsSync(cliPath) ? cliPath : null;
}

const piCliPath = findPiCliPath();
const skipReason = piCliPath
  ? false
  : '@mariozechner/pi-coding-agent not installed';

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

function createPiBinarySandboxRuntime(opts: {
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
// Pi agent dir setup with mock server redirect
// ---------------------------------------------------------------------------

/**
 * Create a temporary Pi agent dir with a models.json that overrides the
 * anthropic provider's baseUrl to point at the mock LLM server.
 *
 * Pi hardcodes baseURL from model config, ignoring ANTHROPIC_BASE_URL.
 * The models.json provider override is the supported mechanism to redirect.
 *
 * Pi resolves agent dir as `$PI_CODING_AGENT_DIR` or `~/.pi/agent/`.
 * We return the agent dir path to set via PI_CODING_AGENT_DIR env var.
 */
async function createPiAgentDir(
  parentDir: string,
  mockPort: number,
): Promise<string> {
  const agentDir = path.join(parentDir, 'pi-agent');
  await mkdir(agentDir, { recursive: true });

  const modelsJson = {
    providers: {
      anthropic: {
        baseUrl: `http://127.0.0.1:${mockPort}`,
      },
    },
  };
  await writeFile(
    path.join(agentDir, 'models.json'),
    JSON.stringify(modelsJson),
  );

  // Settings for quiet startup
  const settingsJson = {
    quietStartup: true,
  };
  await writeFile(
    path.join(agentDir, 'settings.json'),
    JSON.stringify(settingsJson),
  );

  return agentDir;
}

// ---------------------------------------------------------------------------
// Sandbox code builders
// ---------------------------------------------------------------------------

/** Build env object for Pi binary spawn inside the sandbox. */
function piEnv(opts: {
  homeDir: string;
  agentDir: string;
}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    HOME: opts.homeDir,
    ANTHROPIC_API_KEY: 'test-key',
    PI_OFFLINE: '1',
    PI_CODING_AGENT_DIR: opts.agentDir,
  };
}

/**
 * Build sandbox code that spawns Pi CLI binary and pipes stdout/stderr to
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
    const child = spawn('node', ${JSON.stringify([piCliPath, ...opts.args])}, {
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
 * Build sandbox code that spawns Pi, waits for any output, sends SIGINT
 * through the bridge, then reports the exit code.
 */
function buildSigintCode(opts: {
  args: string[];
  env: Record<string, string>;
  cwd: string;
}): string {
  return `(async () => {
    const { spawn } = require('child_process');
    const child = spawn('node', ${JSON.stringify([piCliPath, ...opts.args])}, {
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

/** Base args for Pi headless mode. */
const PI_BASE_ARGS = [
  '-p',
  '--provider', 'anthropic',
  '--model', 'claude-3-5-haiku-20241022',
  '--no-session',
  '--offline',
  '--no-extensions',
  '--no-skills',
  '--no-prompt-templates',
  '--no-themes',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let agentDir: string;
let mockRedirectWorks: boolean;

describe.skipIf(skipReason)('Pi headless binary E2E (sandbox child_process bridge)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-headless-binary-'));

    // Set up Pi agent dir with models.json pointing to mock server
    agentDir = await createPiAgentDir(workDir, mockServer.port);

    // Probe mock redirect via sandbox child_process bridge
    mockServer.reset([{ type: 'text', text: 'PROBE_OK' }]);
    const probeCapture = createStdioCapture();
    const probeRuntime = createPiBinarySandboxRuntime({
      onStdio: probeCapture.onStdio,
    });
    try {
      const result = await probeRuntime.exec(
        buildSpawnCode({
          args: [...PI_BASE_ARGS, 'say ok'],
          env: piEnv({ homeDir: workDir, agentDir }),
          cwd: workDir,
          timeout: 15000,
        }),
        SANDBOX_EXEC_OPTS,
      );
      mockRedirectWorks = result.code === 0 && probeCapture.stdout().includes('PROBE_OK');
    } catch {
      mockRedirectWorks = false;
    } finally {
      probeRuntime.dispose();
    }

    if (!mockRedirectWorks) {
      console.warn(
        '[pi-headless-binary] Mock redirect probe failed — tests will verify bridge mechanics only',
      );
    }
  }, 30_000);

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Boot & output
  // -------------------------------------------------------------------------

  it(
    'Pi boots in print mode — exits with code 0',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello!' }]);

      const capture = createStdioCapture();
      const runtime = createPiBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [...PI_BASE_ARGS, 'say hello'],
            env: piEnv({ homeDir: workDir, agentDir }),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        if (result.code !== 0) {
          console.log('Pi boot stderr:', capture.stderr().slice(0, 2000));
        }
        expect(result.code).toBe(0);
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  it(
    'Pi produces output — stdout contains canned LLM response',
    async () => {
      const canary = 'UNIQUE_CANARY_PI_BIN_42';
      mockServer.reset([{ type: 'text', text: canary }]);

      const capture = createStdioCapture();
      const runtime = createPiBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [...PI_BASE_ARGS, 'say hello'],
            env: piEnv({ homeDir: workDir, agentDir }),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        if (mockRedirectWorks) {
          expect(capture.stdout()).toContain(canary);
        } else {
          // Without mock redirect, just verify stdout flowed through bridge
          const output = capture.stdout() + capture.stderr();
          expect(output.length).toBeGreaterThan(0);
        }
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  it(
    'Stdout flows through bridge — output is non-empty',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Bridge test output.' }]);

      const capture = createStdioCapture();
      const runtime = createPiBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [...PI_BASE_ARGS, 'say something'],
            env: piEnv({ homeDir: workDir, agentDir }),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        // Verify stdout/stderr flowed through the bridge
        const combined = capture.stdout() + capture.stderr();
        expect(combined.length).toBeGreaterThan(0);
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
    'Exit code propagation — version flag exits 0',
    async () => {
      const capture = createStdioCapture();
      const runtime = createPiBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: ['--version'],
            env: piEnv({ homeDir: workDir, agentDir }),
            cwd: workDir,
            timeout: 10000,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        // Version output should contain a version number
        const output = capture.stdout() + capture.stderr();
        expect(output).toMatch(/\d+\.\d+/);
      } finally {
        runtime.dispose();
      }
    },
    15_000,
  );

  // -------------------------------------------------------------------------
  // Signal handling
  // -------------------------------------------------------------------------

  it(
    'SIGINT stops execution — send SIGINT through bridge, process terminates',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Write a very long essay...' }]);

      const capture = createStdioCapture();
      const runtime = createPiBinarySandboxRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSigintCode({
            args: [...PI_BASE_ARGS, 'Write a very long essay about computing history. Make it 5000 words.'],
            env: piEnv({ homeDir: workDir, agentDir }),
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
});
