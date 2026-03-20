/**
 * E2E test: npx through the sandbox's child_process bridge.
 *
 * Verifies the full npx flow:
 *   1. Sandbox JS calls child_process.spawn('npx', [...]) through the bridge
 *   2. npx downloads the package from the real npm registry
 *   3. Executes the package's bin entry and produces output on stdout
 *   4. Output flows back through the child_process bridge correctly
 *
 * Uses NodeFileSystem (no root mapping) so the sandbox sees the real host
 * filesystem, and the child_process bridge forwards the actual host cwd to npx.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function findNpxBinary(): string | null {
  const { execSync } = require('node:child_process');
  try {
    execSync('npx --version', { stdio: 'ignore' });
    return 'npx';
  } catch {
    return null;
  }
}

/** Check if npm registry is reachable (5s timeout). */
async function checkNetwork(): Promise<string | false> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    await fetch('https://registry.npmjs.org/', {
      signal: controller.signal,
      method: 'HEAD',
    });
    clearTimeout(timeout);
    return false;
  } catch {
    return 'network not available (cannot reach npm registry)';
  }
}

const npxBinary = findNpxBinary();
const networkSkip = await checkNetwork();
const skipReason = npxBinary
  ? networkSkip
  : 'npx binary not found';

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

function createNpxSandboxRuntime(opts: {
  onStdio: (event: CapturedEvent) => void;
  cwd: string;
}): NodeRuntime {
  return createTestNodeRuntime({
    driver: createNodeDriver({
      filesystem: new NodeFileSystem(),
      commandExecutor: createHostCommandExecutor(),
      permissions: allowAll,
      processConfig: {
        cwd: opts.cwd,
        env: {
          PATH: process.env.PATH ?? '/usr/bin',
          HOME: process.env.HOME ?? tmpdir(),
        },
      },
    }),
    onStdio: opts.onStdio,
  });
}

// ---------------------------------------------------------------------------
// Sandbox code builders
// ---------------------------------------------------------------------------

/**
 * Build sandbox code that spawns npx with given args and pipes stdout/stderr.
 * process.exit() at top-level await, not inside bridge callbacks.
 */
function buildNpxCode(opts: {
  args: string[];
  cwd: string;
  timeout?: number;
}): string {
  return `(async () => {
    const { spawn } = require('child_process');
    const child = spawn('npx', ${JSON.stringify(opts.args)}, {
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '/tmp',
      },
      cwd: ${JSON.stringify(opts.cwd)},
    });

    child.stdin.end();

    child.stdout.on('data', (d) => process.stdout.write(String(d)));
    child.stderr.on('data', (d) => process.stderr.write(String(d)));

    const exitCode = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(124);
      }, ${opts.timeout ?? 30000});

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) process.exit(exitCode);
  })()`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let workDir: string;

describe.skipIf(skipReason)('npx E2E (sandbox child_process bridge)', () => {
  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'npx-sandbox-'));
    // npx needs a package.json to avoid "not in a project" warnings
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({ name: 'test-npx-sandbox', private: true }),
    );
  });

  afterAll(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // npx executes a package and produces output
  // -------------------------------------------------------------------------

  it(
    'npx downloads and executes a package, output flows through bridge',
    async () => {
      const capture = createStdioCapture();
      const runtime = createNpxSandboxRuntime({
        onStdio: capture.onStdio,
        cwd: workDir,
      });

      const execOpts = { filePath: path.join(workDir, 'entry.js'), cwd: workDir };

      try {
        // cowsay is lightweight and produces distinctive stdout
        const result = await runtime.exec(
          buildNpxCode({
            args: ['--yes', 'cowsay', 'hello from sandbox'],
            cwd: workDir,
          }),
          execOpts,
        );

        if (result.code !== 0) {
          console.log('npx stdout:', capture.stdout().slice(0, 2000));
          console.log('npx stderr:', capture.stderr().slice(0, 2000));
          console.log('npx errorMessage:', result.errorMessage?.slice(0, 2000));
        }
        expect(result.code).toBe(0);

        // cowsay output contains the message in an ASCII art box
        const stdout = capture.stdout();
        expect(stdout).toContain('hello from sandbox');
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
    'npx exits with code 0 on successful execution',
    async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'npx-exit-'));
      const execOpts = { filePath: path.join(tempDir, 'entry.js'), cwd: tempDir };

      try {
        await writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ name: 'test-npx-exit', private: true }),
        );

        const capture = createStdioCapture();
        const runtime = createNpxSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: tempDir,
        });

        try {
          // semver --help is lightweight — just check version parsing
          const result = await runtime.exec(
            buildNpxCode({
              args: ['--yes', 'semver', '1.2.3'],
              cwd: tempDir,
            }),
            execOpts,
          );
          expect(result.code).toBe(0);
          expect(capture.stdout()).toContain('1.2.3');
        } finally {
          runtime.dispose();
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Stdout flows through bridge
  // -------------------------------------------------------------------------

  it(
    'npx stdout flows back through the child_process bridge',
    async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'npx-stdout-'));
      const execOpts = { filePath: path.join(tempDir, 'entry.js'), cwd: tempDir };

      try {
        await writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ name: 'test-npx-stdout', private: true }),
        );

        const capture = createStdioCapture();
        const runtime = createNpxSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: tempDir,
        });

        try {
          // cowsay produces distinctive output on stdout
          const result = await runtime.exec(
            buildNpxCode({
              args: ['--yes', 'cowsay', 'bridge test'],
              cwd: tempDir,
            }),
            execOpts,
          );
          expect(result.code).toBe(0);

          const stdout = capture.stdout();
          expect(stdout).toContain('bridge test');
        } finally {
          runtime.dispose();
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // npx with arguments
  // -------------------------------------------------------------------------

  it(
    'npx passes arguments to the executed package correctly',
    async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'npx-args-'));
      const execOpts = { filePath: path.join(tempDir, 'entry.js'), cwd: tempDir };

      try {
        await writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ name: 'test-npx-args', private: true }),
        );

        const capture = createStdioCapture();
        const runtime = createNpxSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: tempDir,
        });

        try {
          // semver with range check: `semver 1.2.3 -r '>1.0.0'` prints 1.2.3
          const result = await runtime.exec(
            buildNpxCode({
              args: ['--yes', 'semver', '1.2.3', '-r', '>1.0.0'],
              cwd: tempDir,
            }),
            execOpts,
          );
          expect(result.code).toBe(0);
          expect(capture.stdout()).toContain('1.2.3');
        } finally {
          runtime.dispose();
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // npx non-zero exit code propagation
  // -------------------------------------------------------------------------

  it(
    'npx propagates non-zero exit code from executed package',
    async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'npx-errcode-'));
      const execOpts = { filePath: path.join(tempDir, 'entry.js'), cwd: tempDir };

      try {
        await writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ name: 'test-npx-errcode', private: true }),
        );

        const capture = createStdioCapture();
        const runtime = createNpxSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: tempDir,
        });

        try {
          // semver with a range that doesn't match exits non-zero
          const result = await runtime.exec(
            buildNpxCode({
              args: ['--yes', 'semver', '1.2.3', '-r', '>99.0.0'],
              cwd: tempDir,
            }),
            execOpts,
          );
          expect(result.code).not.toBe(0);
        } finally {
          runtime.dispose();
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
