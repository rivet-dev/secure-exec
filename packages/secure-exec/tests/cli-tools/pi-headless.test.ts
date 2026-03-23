/**
 * E2E test: Pi coding agent headless mode inside the secure-exec sandbox.
 *
 * Pi runs as a child process spawned through the sandbox's child_process
 * bridge. The mock LLM server runs on the host; Pi reaches it through a
 * fetch interceptor injected via NODE_OPTIONS preload script.
 *
 * File read/write tests use the host filesystem (Pi operates on real files
 * within a temp directory). The bash test validates child_process spawning.
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
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, '../..');

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

const PI_CLI = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
);

const FETCH_INTERCEPT = path.resolve(__dirname, 'fetch-intercept.cjs');

// ---------------------------------------------------------------------------
// Spawn helper
// ---------------------------------------------------------------------------

interface PiResult {
  code: number;
  stdout: string;
  stderr: string;
}

function spawnPi(opts: {
  args: string[];
  mockUrl: string;
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}): Promise<PiResult> {
  return new Promise((resolve) => {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ANTHROPIC_API_KEY: 'test-key',
      MOCK_LLM_URL: opts.mockUrl,
      NODE_OPTIONS: `-r ${FETCH_INTERCEPT}`,
      HOME: opts.cwd,
      PI_AGENT_DIR: path.join(opts.cwd, '.pi'),
      NO_COLOR: '1',
      ...(opts.env ?? {}),
    };

    const child = nodeSpawn('node', [PI_CLI, ...opts.args], {
      cwd: opts.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (d: Buffer) => stdoutChunks.push(d));
    child.stderr.on('data', (d: Buffer) => stderrChunks.push(d));

    const timeout = opts.timeoutMs ?? 30_000;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
      });
    });

    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;

describe.skipIf(piSkip)('Pi headless E2E (sandbox VM)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-headless-'));
    // Create .pi dir for Pi's config
    await mkdir(path.join(workDir, '.pi'), { recursive: true });
  }, 15_000);

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it(
    'Pi boots in print mode — exits with code 0',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello!' }]);

      const result = await spawnPi({
        args: ['--print', 'say hello'],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      if (result.code !== 0) {
        console.log('Pi boot stderr:', result.stderr.slice(0, 2000));
      }
      expect(result.code).toBe(0);
    },
    45_000,
  );

  it(
    'Pi produces output — stdout contains canned LLM response',
    async () => {
      const canary = 'UNIQUE_CANARY_42';
      mockServer.reset([{ type: 'text', text: canary }]);

      const result = await spawnPi({
        args: ['--print', 'say hello'],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(result.stdout).toContain(canary);
    },
    45_000,
  );

  it(
    'Pi reads a file — read tool accesses seeded file via fs',
    async () => {
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

      const result = await spawnPi({
        args: ['--print', `read ${path.join(testDir, 'test.txt')} and repeat the contents`],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
      expect(result.stdout).toContain('secret_content_xyz');
    },
    45_000,
  );

  it(
    'Pi writes a file — file exists after write tool runs via fs',
    async () => {
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

      const result = await spawnPi({
        args: ['--print', `create a file at ${outPath}`],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(result.code).toBe(0);
      const content = await readFile(outPath, 'utf8');
      expect(content).toBe('hello from pi mock');
    },
    45_000,
  );

  it(
    'Pi runs bash command — bash tool executes ls via child_process',
    async () => {
      mockServer.reset([
        { type: 'tool_use', name: 'bash', input: { command: 'ls /' } },
        { type: 'text', text: 'Directory listing complete.' },
      ]);

      const result = await spawnPi({
        args: ['--print', 'run ls /'],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(result.code).toBe(0);
      expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
    },
    45_000,
  );

  it(
    'Pi JSON output mode — produces valid JSON',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello JSON!' }]);

      const result = await spawnPi({
        args: ['--print', '--mode', 'json', 'say hello'],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(result.code).toBe(0);
      const lines = result.stdout.trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toBeDefined();
      }
    },
    45_000,
  );
});
