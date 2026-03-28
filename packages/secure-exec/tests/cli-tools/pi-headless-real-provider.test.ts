/**
 * Pi headless real-provider E2E — proves both filesystem and subprocess
 * tool actions through the Pi CLI in print mode with live Anthropic traffic.
 *
 * Coverage:
 *   [real-provider/tool-use]  Pi CLI --print mode with real Anthropic API
 *                             performing write + bash tools, verifying
 *                             file on disk and subprocess output in stdout
 *
 * Pi runs as a host child process (not inside NodeRuntime). Real credentials
 * are loaded from exported env vars or ~/misc/env.txt. No mock LLM server.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { loadRealProviderEnv } from './real-provider-env.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, '../..');
const REAL_PROVIDER_FLAG = 'SECURE_EXEC_PI_REAL_PROVIDER_E2E';

const PI_CLI = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
);

function skipUnlessPiInstalled(): string | false {
  return existsSync(PI_CLI)
    ? false
    : '@mariozechner/pi-coding-agent not installed';
}

interface PiResult {
  code: number;
  stdout: string;
  stderr: string;
}

function spawnPi(opts: {
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs?: number;
}): Promise<PiResult> {
  return new Promise((resolve) => {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HOME: opts.cwd,
      PI_AGENT_DIR: path.join(opts.cwd, '.pi'),
      NO_COLOR: '1',
      ...opts.env,
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

    const timeout = opts.timeoutMs ?? 120_000;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);

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

function getSkipReason(): string | false {
  const piSkip = skipUnlessPiInstalled();
  if (piSkip) return piSkip;

  if (process.env[REAL_PROVIDER_FLAG] !== '1') {
    return `${REAL_PROVIDER_FLAG}=1 required for real provider headless E2E`;
  }

  return loadRealProviderEnv(['ANTHROPIC_API_KEY']).skipReason ?? false;
}

const skipReason = getSkipReason();

describe.skipIf(skipReason)('Pi headless real-provider E2E (tool-use)', () => {
  let workDir: string | undefined;

  afterAll(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it(
    '[real-provider/tool-use] performs both filesystem and subprocess actions via Pi print mode',
    async () => {
      const providerEnv = loadRealProviderEnv(['ANTHROPIC_API_KEY']);
      expect(providerEnv.skipReason).toBeUndefined();

      workDir = await mkdtemp(path.join(tmpdir(), 'pi-headless-real-provider-'));
      const fsCanary = `FS_HEADLESS_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const bashCanary = `BASH_HEADLESS_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const targetFile = path.join(workDir, 'tool-output.txt');

      const result = await spawnPi({
        args: [
          '--print',
          [
            `Do exactly these two things in order:`,
            `1) Create a file at ${targetFile} with the exact content '${fsCanary}'.`,
            `2) Run this bash command: echo '${bashCanary}'`,
            `After both, report the exact echo output verbatim.`,
          ].join(' '),
        ],
        cwd: workDir,
        env: providerEnv.env!,
        timeoutMs: 120_000,
      });

      expect(result.code, `stderr: ${result.stderr.slice(0, 2000)}`).toBe(0);

      // Verify filesystem action: file exists on disk with correct content
      expect(existsSync(targetFile), 'tool-output.txt was not created on disk').toBe(true);
      const fileContent = await readFile(targetFile, 'utf8');
      expect(fileContent).toContain(fsCanary);

      // Verify subprocess action: bash canary in Pi's response stdout
      expect(result.stdout).toContain(bashCanary);
    },
    150_000,
  );
});
