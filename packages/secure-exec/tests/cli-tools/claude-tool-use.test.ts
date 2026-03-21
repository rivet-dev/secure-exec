/**
 * E2E test: Claude Code tool use round-trips through the secure-exec sandbox.
 *
 * Verifies that Claude Code's built-in tools (Write, Read, Bash) execute
 * correctly through the sandbox's child_process bridge during multi-tool
 * conversations. The mock LLM returns tool_use responses that trigger
 * Claude's tools, and we verify:
 *   - Tool execution produces correct side effects (files created, commands run)
 *   - Tool results are sent back to the mock LLM correctly for the next turn
 *   - Error/exit codes propagate back through the bridge
 *   - Claude completes the conversation and exits cleanly after tool use
 *
 * Claude Code's tools execute as subprocesses of the claude process, which
 * is itself spawned through the child_process bridge — a nested process
 * scenario.
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
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
const skipReason = claudeBinary ? false : 'claude binary not found';

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

function createClaudeToolUseRuntime(opts: {
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

/** Build env object for Claude binary spawn inside the sandbox. */
function claudeEnv(mockPort: number): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? tmpdir(),
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockPort}`,
  };
}

/** Base args for Claude Code headless mode. */
const CLAUDE_BASE_ARGS = [
  '-p',
  '--dangerously-skip-permissions',
  '--no-session-persistence',
  '--model', 'haiku',
];

/**
 * Build sandbox code that spawns Claude Code in headless mode and pipes
 * stdout/stderr. Exit code is forwarded from the binary.
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
    const child = spawn(${JSON.stringify(claudeBinary)}, ${JSON.stringify(opts.args)}, {
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
          const rec = block as Record<string, unknown>;
          // Claude Code may send content as a string or as an array of blocks
          let text = '';
          if (typeof rec.content === 'string') {
            text = rec.content;
          } else if (Array.isArray(rec.content)) {
            text = (rec.content as Array<Record<string, unknown>>)
              .map((b) => String(b.text ?? ''))
              .join('');
          }
          results.push({
            tool_use_id: String(rec.tool_use_id ?? ''),
            content: text,
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

describe.skipIf(skipReason)('Claude Code tool use round-trips (sandbox child_process bridge)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'claude-tool-use-'));
  });

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Write tool
  // -------------------------------------------------------------------------

  it(
    'Write tool — creates file on host and sends tool_result back to LLM',
    async () => {
      const testDir = path.join(workDir, 'tool-write');
      await mkdir(testDir, { recursive: true });
      const outPath = path.join(testDir, 'created.txt');

      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_write_01',
          name: 'Write',
          input: { file_path: outPath, content: 'tool_write_payload_cc_123' },
        },
        { type: 'text', text: 'File written successfully.' },
      ]);

      const capture = createStdioCapture();
      const runtime = createClaudeToolUseRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...CLAUDE_BASE_ARGS,
              '--output-format', 'json',
              `write tool_write_payload_cc_123 to ${outPath}`,
            ],
            env: claudeEnv(mockServer.port),
            cwd: testDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Verify file was created on host via nested process
        expect(existsSync(outPath)).toBe(true);
        const content = await readFile(outPath, 'utf8');
        expect(content).toBe('tool_write_payload_cc_123');

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
    60_000,
  );

  // -------------------------------------------------------------------------
  // Read tool
  // -------------------------------------------------------------------------

  it(
    'Read tool — reads file content and sends it back to LLM in tool_result',
    async () => {
      const testDir = path.join(workDir, 'tool-read');
      await mkdir(testDir, { recursive: true });
      const filePath = path.join(testDir, 'data.txt');
      await writeFile(filePath, 'readable_content_cc_abc');

      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_read_01',
          name: 'Read',
          input: { file_path: filePath },
        },
        { type: 'text', text: 'The file says: readable_content_cc_abc' },
      ]);

      const capture = createStdioCapture();
      const runtime = createClaudeToolUseRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...CLAUDE_BASE_ARGS,
              '--output-format', 'json',
              `read the file at ${filePath} and repeat its contents`,
            ],
            env: claudeEnv(mockServer.port),
            cwd: testDir,
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
        expect(readResult!.content).toContain('readable_content_cc_abc');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Bash tool — success
  // -------------------------------------------------------------------------

  it(
    'Bash tool — executes command and sends stdout back to LLM in tool_result',
    async () => {
      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_bash_01',
          name: 'Bash',
          input: { command: 'echo hello_from_bash_cc_42' },
        },
        { type: 'text', text: 'Command output: hello_from_bash_cc_42' },
      ]);

      const capture = createStdioCapture();
      const runtime = createClaudeToolUseRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...CLAUDE_BASE_ARGS,
              '--output-format', 'json',
              'run echo hello_from_bash_cc_42',
            ],
            env: claudeEnv(mockServer.port),
            cwd: workDir,
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
        expect(bashResult!.content).toContain('hello_from_bash_cc_42');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Bash tool — failure
  // -------------------------------------------------------------------------

  it(
    'Bash tool failure — exit code propagates back in tool_result',
    async () => {
      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_bash_fail_01',
          name: 'Bash',
          input: { command: 'exit 1' },
        },
        { type: 'text', text: 'The command failed with exit code 1.' },
      ]);

      const capture = createStdioCapture();
      const runtime = createClaudeToolUseRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...CLAUDE_BASE_ARGS,
              '--output-format', 'json',
              'run exit 1',
            ],
            env: claudeEnv(mockServer.port),
            cwd: workDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // Verify tool_result was sent back — Claude should report the failure
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
        const toolResults = extractToolResults(mockServer.getReceivedBodies());
        expect(toolResults.length).toBeGreaterThanOrEqual(1);
        const bashResult = toolResults.find(
          (r) => r.tool_use_id === 'toolu_bash_fail_01',
        );
        expect(bashResult).toBeDefined();
        // Claude reports exit code or error status in the tool result
        expect(bashResult!.content.length).toBeGreaterThan(0);
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Multi-tool round-trip
  // -------------------------------------------------------------------------

  it(
    'Multi-tool round-trip — write then read file, both results flow back to LLM',
    async () => {
      const testDir = path.join(workDir, 'multi-tool');
      await mkdir(testDir, { recursive: true });
      const multiPath = path.join(testDir, 'roundtrip.txt');

      mockServer.reset([
        // Turn 1: LLM requests file write
        {
          type: 'tool_use',
          id: 'toolu_multi_write',
          name: 'Write',
          input: { file_path: multiPath, content: 'multi_tool_data_cc_789' },
        },
        // Turn 2: LLM requests file read of the same file
        {
          type: 'tool_use',
          id: 'toolu_multi_read',
          name: 'Read',
          input: { file_path: multiPath },
        },
        // Turn 3: LLM produces final text response
        { type: 'text', text: 'Successfully wrote and read the file.' },
      ]);

      const capture = createStdioCapture();
      const runtime = createClaudeToolUseRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...CLAUDE_BASE_ARGS,
              '--output-format', 'json',
              `write multi_tool_data_cc_789 to ${multiPath} and then read it back`,
            ],
            env: claudeEnv(mockServer.port),
            cwd: testDir,
            timeout: 60_000,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);

        // 3 LLM requests: initial prompt, tool_result(write), tool_result(read)
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(3);

        // Verify the file exists on disk
        expect(existsSync(multiPath)).toBe(true);
        const content = await readFile(multiPath, 'utf8');
        expect(content).toBe('multi_tool_data_cc_789');

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
        expect(readResult!.content).toContain('multi_tool_data_cc_789');
      } finally {
        runtime.dispose();
      }
    },
    90_000,
  );

  // -------------------------------------------------------------------------
  // Clean exit after tool use
  // -------------------------------------------------------------------------

  it(
    'Claude exits cleanly after tool use — exit code 0 after write + text response',
    async () => {
      const testDir = path.join(workDir, 'clean-exit');
      await mkdir(testDir, { recursive: true });
      const outPath = path.join(testDir, 'exit-test.txt');

      mockServer.reset([
        {
          type: 'tool_use',
          id: 'toolu_exit_01',
          name: 'Write',
          input: { file_path: outPath, content: 'clean exit test' },
        },
        { type: 'text', text: 'Done! File created.' },
      ]);

      const capture = createStdioCapture();
      const runtime = createClaudeToolUseRuntime({ onStdio: capture.onStdio });

      try {
        const result = await runtime.exec(
          buildSpawnCode({
            args: [
              ...CLAUDE_BASE_ARGS,
              '--output-format', 'text',
              `create a file at ${outPath}`,
            ],
            env: claudeEnv(mockServer.port),
            cwd: testDir,
          }),
          SANDBOX_EXEC_OPTS,
        );

        expect(result.code).toBe(0);
        // Claude completed the tool use cycle and exited cleanly
        expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
        expect(capture.stdout()).toContain('Done! File created.');
      } finally {
        runtime.dispose();
      }
    },
    60_000,
  );
});
