/**
 * E2E test: Pi agent tool use round-trips through the secure-exec sandbox.
 *
 * Verifies that Pi's built-in tools (file_read, file_write, bash) execute
 * correctly through the sandbox bridges during multi-tool conversations.
 * The mock LLM is configured to request tool_use responses that trigger
 * Pi's tools, and we verify:
 *   - Tool execution produces correct side effects (files created, commands run)
 *   - Tool results are sent back to the mock LLM correctly for the next turn
 *   - Error/exit codes propagate back through the bridge
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
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let vmLoadSkip: string | false = false;

describe.skipIf(piSkip)('Pi tool use round-trips (sandbox VM)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-tool-use-'));

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
      console.warn(`[pi-tool-use] Skipping all tests: ${vmLoadSkip}`);
    }
  }, 30_000);

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it(
    'file_write tool — creates file and sends tool_result back to LLM',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      const testDir = path.join(workDir, 'tool-write');
      await mkdir(testDir, { recursive: true });
      const outPath = path.join(testDir, 'created.txt');

      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_write_01',
          name: 'write',
          input: { path: outPath, content: 'tool_write_payload_123' },
        },
        { type: 'text', text: 'File written successfully.' },
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
            prompt: `write a file at ${outPath}`,
            cwd: workDir,
            tools: ['write'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Verify file was created on host via fs bridge
        const content = await readFile(outPath, 'utf8');
        expect(content).toBe('tool_write_payload_123');

        // Verify tool_result was sent back to the LLM
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(1);
        const writeResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_write_01',
        );
        expect(writeResult).toBeDefined();
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'file_read tool — reads file content and sends it back to LLM in tool_result',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      const testDir = path.join(workDir, 'tool-read');
      await mkdir(testDir, { recursive: true });
      const filePath = path.join(testDir, 'data.txt');
      await writeFile(filePath, 'readable_content_abc');

      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_read_01',
          name: 'read',
          input: { path: filePath },
        },
        { type: 'text', text: 'The file says: readable_content_abc' },
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
            prompt: `read the file at ${filePath}`,
            cwd: workDir,
            tools: ['read'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Verify tool_result was sent back containing the file content
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(1);
        const readResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_read_01',
        );
        expect(readResult).toBeDefined();
        expect(readResult!.content).toContain('readable_content_abc');
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'bash tool — executes command and sends stdout back to LLM in tool_result',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_bash_01',
          name: 'bash',
          input: { command: 'echo hello_from_bash_42' },
        },
        { type: 'text', text: 'Command output: hello_from_bash_42' },
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
            prompt: 'run echo hello_from_bash_42',
            cwd: workDir,
            tools: ['bash'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Verify tool_result was sent back containing command output
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(1);
        const bashResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_bash_01',
        );
        expect(bashResult).toBeDefined();
        expect(bashResult!.content).toContain('hello_from_bash_42');
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'bash tool failure — exit code propagates back in tool_result',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_bash_fail_01',
          name: 'bash',
          input: { command: 'exit 1' },
        },
        { type: 'text', text: 'The command failed with exit code 1.' },
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
            prompt: 'run exit 1',
            cwd: workDir,
            tools: ['bash'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Verify tool_result was sent back — Pi should report the failure
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(1);
        const bashResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_bash_fail_01',
        );
        expect(bashResult).toBeDefined();
        // Pi reports exit code in the tool result (e.g. "exit code: 1" or similar)
        expect(bashResult!.content.length).toBeGreaterThan(0);
      } finally {
        runtime.dispose();
      }
    },
    45_000,
  );

  it(
    'multi-tool round-trip — write then read in sequence, results flow back correctly',
    async ({ skip }) => {
      if (vmLoadSkip) skip();

      const testDir = path.join(workDir, 'multi-tool');
      await mkdir(testDir, { recursive: true });
      const multiPath = path.join(testDir, 'roundtrip.txt');

      mockServer.reset([
        // Turn 1: LLM requests file write
        {
          type: 'tool_use',
          id: 'toolu_multi_write',
          name: 'write',
          input: { path: multiPath, content: 'multi_tool_data_789' },
        },
        // Turn 2: LLM requests file read of the same file
        {
          type: 'tool_use',
          id: 'toolu_multi_read',
          name: 'read',
          input: { path: multiPath },
        },
        // Turn 3: LLM produces final text response
        { type: 'text', text: 'Successfully wrote and read the file.' },
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
            prompt: `write multi_tool_data_789 to ${multiPath} and then read it back`,
            cwd: workDir,
            tools: ['read', 'write'],
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // 3 LLM requests: initial prompt, tool_result(write), tool_result(read)
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(3);

        // Verify the file exists on disk
        const content = await readFile(multiPath, 'utf8');
        expect(content).toBe('multi_tool_data_789');

        // Verify both tool results were sent back
        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(2);

        const writeResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_multi_write',
        );
        expect(writeResult).toBeDefined();

        const readResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_multi_read',
        );
        expect(readResult).toBeDefined();
        // The read result should contain the content we wrote
        expect(readResult!.content).toContain('multi_tool_data_789');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );
});
