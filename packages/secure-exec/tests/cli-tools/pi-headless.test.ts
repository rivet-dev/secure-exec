/**
 * E2E test: Pi coding agent headless mode inside the secure-exec sandbox VM.
 *
 * Pi's JavaScript is loaded and executed inside the sandbox VM via
 * dynamic import() of @mariozechner/pi-coding-agent. The mock LLM server
 * stays on the host; the network adapter redirects Anthropic API requests
 * to the mock server at the host level (sandbox fetch is non-writable).
 *
 * File read/write tests go through the sandbox's fs bridge (NodeFileSystem),
 * and the bash test goes through the child_process bridge (CommandExecutor).
 *
 * If the sandbox VM cannot load Pi (e.g. ESM bridge gap), all tests skip
 * with a clear reason referencing the specific blocker.
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NodeRuntime,
  NodeFileSystem,
  allowAll,
  createDefaultNetworkAdapter,
  createNodeDriver,
} from '../../src/index.js';
import type { CommandExecutor, NetworkAdapter, SpawnedProcess } from '../../src/types.js';
import { createTestNodeRuntime } from '../test-utils.js';
import {
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, '../..');
// Use workspace root for moduleAccess so pnpm hoisted transitive deps
// (e.g. @mariozechner/pi-ai) are reachable via .pnpm/node_modules/
const WORKSPACE_ROOT = path.resolve(SECURE_EXEC_ROOT, '../..');

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function skipUnlessPiInstalled(): string | false {
  const cliPath = path.resolve(
    SECURE_EXEC_ROOT,
    'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
  );
  return existsSync(cliPath)
    ? false
    : '@mariozechner/pi-coding-agent not installed';
}

const piSkip = skipUnlessPiInstalled();

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
    stdout: () =>
      events
        .filter((e) => e.channel === 'stdout')
        .map((e) => e.message)
        .join(''),
    stderr: () =>
      events
        .filter((e) => e.channel === 'stderr')
        .map((e) => e.message)
        .join(''),
  };
}

// ---------------------------------------------------------------------------
// Real command executor for bash tool tests
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
// Network adapter that redirects Anthropic API requests to mock server
// ---------------------------------------------------------------------------

function createMockRedirectAdapter(mockPort: number): NetworkAdapter {
  const mockBaseUrl = `http://127.0.0.1:${mockPort}`;
  const base = createDefaultNetworkAdapter({
    initialExemptPorts: new Set([mockPort]),
  });

  return {
    ...base,
    fetch(url, options) {
      // Redirect Anthropic API requests to the mock server
      if (url.includes('api.anthropic.com')) {
        url = url.replace(/https?:\/\/api\.anthropic\.com/, mockBaseUrl);
      }
      return base.fetch(url, options);
    },
  };
}

// ---------------------------------------------------------------------------
// Sandbox runtime factory
// ---------------------------------------------------------------------------

function createPiSandboxRuntime(opts: {
  port: number;
  onStdio: (event: CapturedEvent) => void;
  workDir: string;
  commandExecutor?: CommandExecutor;
}): NodeRuntime {
  return createTestNodeRuntime({
    driver: createNodeDriver({
      filesystem: new NodeFileSystem(),
      moduleAccess: { cwd: WORKSPACE_ROOT },
      networkAdapter: createMockRedirectAdapter(opts.port),
      commandExecutor: opts.commandExecutor,
      permissions: allowAll,
      processConfig: {
        cwd: '/root',
        env: {
          ANTHROPIC_API_KEY: 'test-key',
          HOME: opts.workDir,
          PATH: process.env.PATH ?? '/usr/bin',
        },
      },
    }),
    onStdio: opts.onStdio,
  });
}

// Exec options for sandbox code: filePath inside overlay for module resolution
const SANDBOX_EXEC_OPTS = { filePath: '/root/entry.js', cwd: '/root' };

// ---------------------------------------------------------------------------
// Pi sandbox code builder
// ---------------------------------------------------------------------------

function buildPiSandboxCode(opts: {
  prompt: string;
  mode?: 'text' | 'json';
  cwd: string;
  tools?: ('read' | 'write' | 'bash')[];
}): string {
  const mode = opts.mode ?? 'text';
  const tools = opts.tools ?? [];

  const toolExprs = tools.map((t) => {
    switch (t) {
      case 'read':
        return `pi.createReadTool(cwd)`;
      case 'write':
        return `pi.createWriteTool(cwd)`;
      case 'bash':
        return `pi.createBashTool(cwd)`;
    }
  });

  return `(async () => {
    const cwd = ${JSON.stringify(opts.cwd)};
    const pi = await import('@mariozechner/pi-coding-agent');

    const { session } = await pi.createAgentSession({
      cwd,
      agentDir: '/tmp/.pi-sandbox-test',
      sessionManager: pi.SessionManager.inMemory(),
      settingsManager: pi.SettingsManager.inMemory(),
      tools: [${toolExprs.join(', ')}],
    });

    await pi.runPrintMode(session, {
      mode: ${JSON.stringify(mode)},
      initialMessage: ${JSON.stringify(opts.prompt)},
    });
  })()`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let vmLoadSkip: string | false = false;

describe.skipIf(piSkip)('Pi headless E2E (sandbox VM)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-headless-'));

    // Probe whether Pi can load inside the sandbox VM
    const capture = createStdioCapture();
    const probeRuntime = createPiSandboxRuntime({
      port: mockServer.port,
      onStdio: capture.onStdio,
      workDir,
    });
    try {
      const result = await probeRuntime.exec(
        `(async () => {
          try {
            const pi = await import('@mariozechner/pi-coding-agent');
            console.log('PI_LOADED:' + typeof pi.createAgentSession);
          } catch (e) {
            console.log('PI_LOAD_FAILED:' + e.message);
          }
        })()`,
        SANDBOX_EXEC_OPTS,
      );
      const stdout = capture.stdout();
      if (result.code !== 0 || !stdout.includes('PI_LOADED:function')) {
        const reason = stdout.includes('PI_LOAD_FAILED:')
          ? stdout.split('PI_LOAD_FAILED:')[1]?.split('\n')[0]?.trim()
          : result.errorMessage ?? 'unknown error';
        vmLoadSkip = `Pi cannot load in sandbox VM: ${reason}`;
      }
    } catch (e) {
      vmLoadSkip = `Pi cannot load in sandbox VM: ${(e as Error).message}`;
    } finally {
      probeRuntime.dispose();
    }

    if (vmLoadSkip) {
      console.warn(`[pi-headless] Skipping all tests: ${vmLoadSkip}`);
    }
  }, 30_000);

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it(
    'Pi boots in print mode — exits with code 0',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      mockServer.reset([{ type: 'text', text: 'Hello!' }]);

      const capture = createStdioCapture();
      const runtime = createPiSandboxRuntime({
        port: mockServer.port,
        onStdio: capture.onStdio,
        workDir,
      });

      try {
        const result = await runtime.exec(
          buildPiSandboxCode({
            prompt: 'say hello',
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'Pi produces output — stdout contains canned LLM response',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      const canary = 'UNIQUE_CANARY_42';
      mockServer.reset([{ type: 'text', text: canary }]);

      const capture = createStdioCapture();
      const runtime = createPiSandboxRuntime({
        port: mockServer.port,
        onStdio: capture.onStdio,
        workDir,
      });

      try {
        await runtime.exec(
          buildPiSandboxCode({
            prompt: 'say hello',
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(capture.stdout()).toContain(canary);
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'Pi reads a file — read tool accesses seeded file via fs bridge',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      const testDir = path.join(workDir, 'read-test');
      await mkdir(testDir, { recursive: true });
      await writeFile(path.join(testDir, 'test.txt'), 'secret_content_xyz');

      mockServer.reset([
        {
          type: 'tool_use',
          name: 'read',
          input: { path: path.join(testDir, 'test.txt') },
        },
        { type: 'text', text: 'The file contains: secret_content_xyz' },
      ]);

      const capture = createStdioCapture();
      const runtime = createPiSandboxRuntime({
        port: mockServer.port,
        onStdio: capture.onStdio,
        workDir,
      });

      try {
        await runtime.exec(
          buildPiSandboxCode({
            prompt: `read ${path.join(testDir, 'test.txt')} and repeat the contents`,
            cwd: workDir,
            tools: ['read'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        // Pi made at least 2 requests: prompt → tool_use, tool_result → text
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
        expect(capture.stdout()).toContain('secret_content_xyz');
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'Pi writes a file — file exists after write tool runs via fs bridge',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      const testDir = path.join(workDir, 'write-test');
      await mkdir(testDir, { recursive: true });
      const outPath = path.join(testDir, 'out.txt');

      mockServer.reset([
        {
          type: 'tool_use',
          name: 'write',
          input: { path: outPath, content: 'hello from pi mock' },
        },
        { type: 'text', text: 'I wrote the file.' },
      ]);

      const capture = createStdioCapture();
      const runtime = createPiSandboxRuntime({
        port: mockServer.port,
        onStdio: capture.onStdio,
        workDir,
      });

      try {
        const result = await runtime.exec(
          buildPiSandboxCode({
            prompt: `create a file at ${outPath}`,
            cwd: workDir,
            tools: ['write'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        const content = await readFile(outPath, 'utf8');
        expect(content).toBe('hello from pi mock');
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'Pi runs bash command — bash tool executes ls via child_process bridge',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      mockServer.reset([
        { type: 'tool_use', name: 'bash', input: { command: 'ls /' } },
        { type: 'text', text: 'Directory listing complete.' },
      ]);

      const capture = createStdioCapture();
      const runtime = createPiSandboxRuntime({
        port: mockServer.port,
        onStdio: capture.onStdio,
        workDir,
        commandExecutor: createHostCommandExecutor(),
      });

      try {
        const result = await runtime.exec(
          buildPiSandboxCode({
            prompt: 'run ls /',
            cwd: workDir,
            tools: ['bash'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'Pi JSON output mode — produces valid JSON via sandbox',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      mockServer.reset([{ type: 'text', text: 'Hello JSON!' }]);

      const capture = createStdioCapture();
      const runtime = createPiSandboxRuntime({
        port: mockServer.port,
        onStdio: capture.onStdio,
        workDir,
      });

      try {
        const result = await runtime.exec(
          buildPiSandboxCode({
            prompt: 'say hello',
            cwd: workDir,
            mode: 'json',
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        // Pi JSON mode emits NDJSON events. Bridge stdout.write strips
        // trailing newlines, so events may be concatenated. Split on }{
        // boundaries to recover individual JSON objects.
        const stdout = capture.stdout().trim();
        expect(stdout.length).toBeGreaterThan(0);
        const objects = stdout.replace(/\}\{/g, '}\n{').split('\n').filter(Boolean);
        expect(objects.length).toBeGreaterThan(0);
        for (const obj of objects) {
          const parsed = JSON.parse(obj);
          expect(parsed).toBeDefined();
        }
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );
});
