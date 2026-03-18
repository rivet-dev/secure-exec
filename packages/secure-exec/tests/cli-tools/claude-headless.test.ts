/**
 * E2E test: Claude Code headless mode with mock LLM server.
 *
 * Verifies Claude Code can boot in -p mode, produce output in text/json/
 * stream-json formats, read/write files, and execute bash commands via a
 * mock LLM server that intercepts Anthropic API calls.
 *
 * Claude Code is a native Node.js CLI — tests run it as a host process
 * with ANTHROPIC_BASE_URL pointing at the mock server.
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function findClaudeBinary(): string | null {
  // Check common install locations
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
  : 'claude binary not found';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Run Claude Code as a host process pointing at the mock LLM server. */
function runClaude(
  args: string[],
  opts: { port: number; cwd?: string; timeout?: number },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? tmpdir(),
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${opts.port}`,
    };

    const child = spawn(
      claudeBinary!,
      [
        '-p',
        '--dangerously-skip-permissions',
        '--no-session-persistence',
        '--model', 'haiku',
        ...args,
      ],
      {
        env,
        cwd: opts.cwd ?? tmpdir(),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    child.stdin.end();

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ exitCode: 124, stdout, stderr });
    }, opts.timeout ?? 30_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;

describe.skipIf(skipReason)('Claude Code headless E2E', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'claude-headless-'));
  });

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Boot & output
  // -------------------------------------------------------------------------

  it(
    'Claude boots in headless mode — exits with code 0',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello!' }]);

      const result = await runClaude(['say hello'], {
        port: mockServer.port,
        cwd: workDir,
      });

      if (result.exitCode !== 0) {
        console.log('Claude boot stderr:', result.stderr.slice(0, 2000));
      }
      expect(result.exitCode).toBe(0);
    },
    45_000,
  );

  it(
    'Claude produces text output — stdout contains canned LLM response',
    async () => {
      const canary = 'UNIQUE_CANARY_CC_42';
      mockServer.reset([{ type: 'text', text: canary }]);

      const result = await runClaude(['say hello'], {
        port: mockServer.port,
        cwd: workDir,
      });

      expect(result.stdout).toContain(canary);
    },
    45_000,
  );

  it(
    'Claude JSON output — --output-format json produces valid JSON with result',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello JSON!' }]);

      const result = await runClaude(
        ['--output-format', 'json', 'say hello'],
        { port: mockServer.port, cwd: workDir },
      );

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty('result');
      expect(parsed.type).toBe('result');
    },
    45_000,
  );

  it(
    'Claude stream-json output — --output-format stream-json produces valid NDJSON',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello stream!' }]);

      const result = await runClaude(
        ['--verbose', '--output-format', 'stream-json', 'say hello'],
        { port: mockServer.port, cwd: workDir },
      );

      // stream-json emits NDJSON on stdout; non-JSON lines (errors) are filtered
      const combined = (result.stdout + '\n' + result.stderr).trim();
      const lines = combined.split('\n').filter(Boolean);
      const jsonLines: Array<Record<string, unknown>> = [];
      for (const line of lines) {
        try {
          jsonLines.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // skip non-JSON lines (errors, debug output)
        }
      }
      expect(jsonLines.length).toBeGreaterThan(0);
      const hasTypedEvent = jsonLines.some((e) => e.type !== undefined);
      expect(hasTypedEvent).toBe(true);
    },
    45_000,
  );

  // -------------------------------------------------------------------------
  // File operations
  // -------------------------------------------------------------------------

  it(
    'Claude reads a file — Read tool accesses seeded file',
    async () => {
      const testDir = path.join(workDir, 'read-test');
      await mkdir(testDir, { recursive: true });
      await writeFile(path.join(testDir, 'test.txt'), 'secret_content_xyz');

      mockServer.reset([
        {
          type: 'tool_use',
          name: 'Read',
          input: { file_path: path.join(testDir, 'test.txt') },
        },
        { type: 'text', text: 'The file contains: secret_content_xyz' },
      ]);

      const result = await runClaude(
        [
          '--output-format', 'json',
          `read the file at ${path.join(testDir, 'test.txt')} and repeat its contents`,
        ],
        { port: mockServer.port, cwd: testDir },
      );

      // Claude made at least 2 requests: prompt → tool_use, tool_result → text
      expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
      expect(result.stdout).toContain('secret_content_xyz');
    },
    45_000,
  );

  it(
    'Claude writes a file — file exists in filesystem after Write tool runs',
    async () => {
      const testDir = path.join(workDir, 'write-test');
      await mkdir(testDir, { recursive: true });
      const outPath = path.join(testDir, 'out.txt');

      mockServer.reset([
        {
          type: 'tool_use',
          name: 'Write',
          input: { file_path: outPath, content: 'hello from claude mock' },
        },
        { type: 'text', text: 'I wrote the file.' },
      ]);

      const result = await runClaude(
        ['--output-format', 'json', `create a file at ${outPath}`],
        { port: mockServer.port, cwd: testDir },
      );

      expect(result.exitCode).toBe(0);
      expect(existsSync(outPath)).toBe(true);
      const content = await readFile(outPath, 'utf8');
      expect(content).toBe('hello from claude mock');
    },
    45_000,
  );

  it(
    'Claude runs bash — Bash tool executes command via child_process',
    async () => {
      mockServer.reset([
        { type: 'tool_use', name: 'Bash', input: { command: 'echo hello' } },
        { type: 'text', text: 'Command output: hello' },
      ]);

      const result = await runClaude(
        ['--output-format', 'json', 'run echo hello'],
        { port: mockServer.port, cwd: workDir },
      );

      expect(result.exitCode).toBe(0);
      expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
    },
    45_000,
  );

  // -------------------------------------------------------------------------
  // Exit codes
  // -------------------------------------------------------------------------

  it(
    'Claude exit codes — bad API key exits non-zero',
    async () => {
      // Tiny server that rejects all requests with 401 (simulates invalid API key)
      const rejectServer = http.createServer((req, res) => {
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
      });
      await new Promise<void>((r) =>
        rejectServer.listen(0, '127.0.0.1', r),
      );
      const rejectPort = (rejectServer.address() as AddressInfo).port;

      try {
        const result = await runClaude(['say hello'], {
          port: rejectPort,
          cwd: workDir,
          timeout: 15_000,
        });
        expect(result.exitCode).not.toBe(0);
      } finally {
        await new Promise<void>((resolve, reject) => {
          rejectServer.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
    20_000,
  );

  it(
    'Claude exit codes — good prompt exits 0',
    async () => {
      mockServer.reset([{ type: 'text', text: 'All good!' }]);

      const result = await runClaude(['say hello'], {
        port: mockServer.port,
        cwd: workDir,
      });

      expect(result.exitCode).toBe(0);
    },
    45_000,
  );
});
