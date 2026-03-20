/**
 * E2E test: Multi-turn agentic loop through the secure-exec sandbox for Pi.
 *
 * Simulates a realistic agent workflow: Pi reads a failing test, reads the
 * source file, writes a fix, then runs the test — all driven by a mock LLM
 * and executing through the sandbox's fs and child_process bridges.
 *
 * Each turn uses different bridges and state must persist across turns within
 * the same session.
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
// Helper: extract tool_result content from captured request bodies
// ---------------------------------------------------------------------------

interface AnthropicMessage {
  role: string;
  content: unknown;
}

interface AnthropicRequestBody {
  messages?: AnthropicMessage[];
}

function extractToolResults(bodies: unknown[]): Array<{
  tool_use_id: string;
  content: string;
}> {
  const results: Array<{ tool_use_id: string; content: string }> = [];
  for (const body of bodies) {
    const b = body as AnthropicRequestBody;
    if (!b.messages) continue;
    for (const msg of b.messages) {
      if (msg.role !== 'user') continue;
      const content = msg.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_result'
        ) {
          results.push({
            tool_use_id: String((block as Record<string, unknown>).tool_use_id ?? ''),
            content: String((block as Record<string, unknown>).content ?? ''),
          });
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Project fixture files
// ---------------------------------------------------------------------------

const PROJECT_INDEX_JS_BUGGY = `// index.js — add(a, b) has a bug: subtracts instead of adding
function add(a, b) {
  return a - b; // BUG: should be a + b
}
module.exports = { add };
`;

const PROJECT_INDEX_JS_FIXED = `// index.js — add(a, b) fixed
function add(a, b) {
  return a + b;
}
module.exports = { add };
`;

const PROJECT_INDEX_TEST_JS = `// index.test.js — tests the add function
const { add } = require('./index');
const assert = require('assert');

try {
  assert.strictEqual(add(2, 3), 5, 'add(2, 3) should be 5');
  assert.strictEqual(add(-1, 1), 0, 'add(-1, 1) should be 0');
  assert.strictEqual(add(0, 0), 0, 'add(0, 0) should be 0');
  console.log('ALL TESTS PASSED');
  process.exit(0);
} catch (e) {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
}
`;

const PROJECT_PACKAGE_JSON = JSON.stringify(
  { name: 'test-project', version: '1.0.0', main: 'index.js' },
  null,
  2,
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let vmLoadSkip: string | false = false;

describe.skipIf(piSkip)('Pi multi-turn agentic loop (sandbox VM)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-multi-turn-'));

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
      console.warn(`[pi-multi-turn] Skipping all tests: ${vmLoadSkip}`);
    }
  }, 30_000);

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it(
    'multi-turn agentic loop: read test → read source → write fix → run test',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      // Set up a simple JS project on the host filesystem
      const projectDir = path.join(workDir, 'project');
      await mkdir(projectDir, { recursive: true });
      await writeFile(path.join(projectDir, 'package.json'), PROJECT_PACKAGE_JSON);
      await writeFile(path.join(projectDir, 'index.js'), PROJECT_INDEX_JS_BUGGY);
      await writeFile(path.join(projectDir, 'index.test.js'), PROJECT_INDEX_TEST_JS);

      const testFilePath = path.join(projectDir, 'index.test.js');
      const sourceFilePath = path.join(projectDir, 'index.js');

      // Configure mock LLM with 4 tool-use turns + final text response
      // Turn 1: read the test file
      // Turn 2: read the source file
      // Turn 3: write the fixed source
      // Turn 4: run the test
      // Turn 5: final text response
      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_read_test',
          name: 'read',
          input: { path: testFilePath },
        },
        {
          type: 'tool_use',
          id: 'toolu_read_source',
          name: 'read',
          input: { path: sourceFilePath },
        },
        {
          type: 'tool_use',
          id: 'toolu_write_fix',
          name: 'write',
          input: { path: sourceFilePath, content: PROJECT_INDEX_JS_FIXED },
        },
        {
          type: 'tool_use',
          id: 'toolu_run_test',
          name: 'bash',
          input: { command: `cd ${projectDir} && node index.test.js` },
        },
        { type: 'text', text: 'All tests pass now. The bug was in the add function — it was subtracting instead of adding.' },
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
            prompt: 'The tests in index.test.js are failing. Please read the test file, read the source, fix the bug, and run the tests to verify.',
            cwd: projectDir,
            tools: ['read', 'write', 'bash'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // 5 LLM requests: initial prompt + 4 tool_result follow-ups
        expect(mockServer.requestCount()).toBe(5);

        // Verify all 4 tool results were sent back (count includes repeats
        // from conversation history accumulating across requests)
        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(4);

        // Turn 1: test file content was read and sent back
        const readTestResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_read_test',
        );
        expect(readTestResult).toBeDefined();
        expect(readTestResult!.content).toContain('assert.strictEqual(add(2, 3), 5');

        // Turn 2: source file content was read and sent back
        const readSourceResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_read_source',
        );
        expect(readSourceResult).toBeDefined();
        expect(readSourceResult!.content).toContain('return a - b');

        // Turn 3: fixed source was written
        const writeFixResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_write_fix',
        );
        expect(writeFixResult).toBeDefined();

        // Verify the fix was actually written to disk
        const fixedContent = await readFile(sourceFilePath, 'utf8');
        expect(fixedContent).toBe(PROJECT_INDEX_JS_FIXED);

        // Turn 4: test was run and passed
        const runTestResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_run_test',
        );
        expect(runTestResult).toBeDefined();
        expect(runTestResult!.content).toContain('ALL TESTS PASSED');

        // Verify final text output reached stdout
        const stdout = capture.stdout();
        expect(stdout).toContain('All tests pass now');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  it(
    'state persists across turns — file written in turn 3 is readable in turn 4',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      // This test verifies that the host filesystem state created by an
      // earlier tool turn persists for later turns within the same session.
      const projectDir = path.join(workDir, 'persist-test');
      await mkdir(projectDir, { recursive: true });

      const filePath = path.join(projectDir, 'state.txt');

      // Turn 1: write a file
      // Turn 2: bash cat the file to verify it exists
      // Turn 3: final text
      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_persist_write',
          name: 'write',
          input: { path: filePath, content: 'persisted_state_42' },
        },
        {
          type: 'tool_use',
          id: 'toolu_persist_cat',
          name: 'bash',
          input: { command: `cat ${filePath}` },
        },
        { type: 'text', text: 'File persisted across turns.' },
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
            prompt: 'Write persisted_state_42 to a file and then cat it to verify',
            cwd: projectDir,
            tools: ['write', 'bash'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        expect(mockServer.requestCount()).toBe(3);

        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(2);

        // Turn 2: cat output should contain the file content from turn 1
        const catResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_persist_cat',
        );
        expect(catResult).toBeDefined();
        expect(catResult!.content).toContain('persisted_state_42');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  it(
    'error in one turn does not break subsequent turns',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      const projectDir = path.join(workDir, 'error-recovery');
      await mkdir(projectDir, { recursive: true });

      const outPath = path.join(projectDir, 'recovered.txt');

      // Turn 1: bash command fails (exit 1)
      // Turn 2: write a file (should still work)
      // Turn 3: bash cat the file (should still work)
      // Turn 4: final text
      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_fail_bash',
          name: 'bash',
          input: { command: 'echo "failing" && exit 1' },
        },
        {
          type: 'tool_use',
          id: 'toolu_recover_write',
          name: 'write',
          input: { path: outPath, content: 'recovered_after_error' },
        },
        {
          type: 'tool_use',
          id: 'toolu_recover_cat',
          name: 'bash',
          input: { command: `cat ${outPath}` },
        },
        { type: 'text', text: 'Recovered from the error and wrote the file.' },
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
            prompt: 'Try a failing command, then write and verify a file',
            cwd: projectDir,
            tools: ['write', 'bash'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        expect(mockServer.requestCount()).toBe(4);

        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(3);

        // Turn 1: bash failure was reported back
        const failResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_fail_bash',
        );
        expect(failResult).toBeDefined();
        expect(failResult!.content.length).toBeGreaterThan(0);

        // Turn 2: write succeeded
        const writeResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_recover_write',
        );
        expect(writeResult).toBeDefined();

        // Turn 3: cat shows the file was written
        const catResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_recover_cat',
        );
        expect(catResult).toBeDefined();
        expect(catResult!.content).toContain('recovered_after_error');

        // Verify on disk
        const content = await readFile(outPath, 'utf8');
        expect(content).toBe('recovered_after_error');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );
});
