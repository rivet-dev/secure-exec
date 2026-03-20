/**
 * E2E test: npm install through the sandbox's child_process bridge.
 *
 * Verifies the full package installation flow:
 *   1. Sandbox JS calls child_process.spawn('npm', ['install']) through the bridge
 *   2. npm downloads the package from the real npm registry
 *   3. node_modules is created with the installed package
 *   4. The installed package is usable via require() in a subsequent exec() call
 *
 * Uses NodeFileSystem (no root mapping) so the sandbox sees the real host
 * filesystem, and the child_process bridge forwards the actual host cwd to npm.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
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

function findNpmBinary(): string | null {
  const { execSync } = require('node:child_process');
  try {
    execSync('npm --version', { stdio: 'ignore' });
    return 'npm';
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

const npmBinary = findNpmBinary();
const networkSkip = await checkNetwork();
const skipReason = npmBinary
  ? networkSkip
  : 'npm binary not found';

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

/**
 * Create a sandbox runtime with full host filesystem access and child_process
 * bridge. The sandbox process cwd is set to the actual host dir so npm spawned
 * via the bridge runs in the correct directory.
 */
function createNpmSandboxRuntime(opts: {
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
 * Build sandbox code that spawns npm install and pipes stdout/stderr.
 * process.exit() at top-level await, not inside bridge callbacks.
 */
function buildNpmInstallCode(opts: {
  cwd: string;
  timeout?: number;
}): string {
  return `(async () => {
    const { spawn } = require('child_process');
    const child = spawn('npm', ['install', '--no-audit', '--no-fund'], {
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

/**
 * Build sandbox code that requires the installed package and prints a result.
 */
function buildRequireCode(opts: {
  packageName: string;
  expression: string;
}): string {
  return `(async () => {
    const mod = require(${JSON.stringify(opts.packageName)});
    const result = ${opts.expression};
    process.stdout.write(String(result));
  })()`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let workDir: string;

describe.skipIf(skipReason)('npm install E2E (sandbox child_process bridge)', () => {
  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'npm-install-sandbox-'));
  });

  afterAll(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // npm install + require
  // -------------------------------------------------------------------------

  it(
    'npm install downloads package and it is usable via require()',
    async () => {
      // Write a minimal package.json with a small dependency
      await writeFile(
        path.join(workDir, 'package.json'),
        JSON.stringify({
          name: 'test-npm-install-sandbox',
          private: true,
          dependencies: { 'is-odd': '3.0.1' },
        }),
      );

      // Step 1: Run npm install through the sandbox child_process bridge
      const installCapture = createStdioCapture();
      const installRuntime = createNpmSandboxRuntime({
        onStdio: installCapture.onStdio,
        cwd: workDir,
      });

      const execOpts = { filePath: path.join(workDir, 'entry.js'), cwd: workDir };

      try {
        const installResult = await installRuntime.exec(
          buildNpmInstallCode({ cwd: workDir }),
          execOpts,
        );

        if (installResult.code !== 0) {
          console.log('npm install stdout:', installCapture.stdout().slice(0, 2000));
          console.log('npm install stderr:', installCapture.stderr().slice(0, 2000));
          console.log('npm install errorMessage:', installResult.errorMessage?.slice(0, 2000));
        }
        expect(installResult.code).toBe(0);
      } finally {
        installRuntime.dispose();
      }

      // Step 2: Verify node_modules was created on the host filesystem
      const nmStat = await stat(path.join(workDir, 'node_modules', 'is-odd'));
      expect(nmStat.isDirectory()).toBe(true);

      // Step 3: Verify the package is usable via require() in a new sandbox exec
      const requireCapture = createStdioCapture();
      const requireRuntime = createNpmSandboxRuntime({
        onStdio: requireCapture.onStdio,
        cwd: workDir,
      });

      try {
        const requireResult = await requireRuntime.exec(
          buildRequireCode({
            packageName: 'is-odd',
            expression: 'mod(3)',
          }),
          execOpts,
        );

        expect(requireResult.code).toBe(0);
        expect(requireCapture.stdout()).toBe('true');
      } finally {
        requireRuntime.dispose();
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Exit code propagation
  // -------------------------------------------------------------------------

  it(
    'npm install exits with code 0 on success',
    async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'npm-exit-code-'));
      const execOpts = { filePath: path.join(tempDir, 'entry.js'), cwd: tempDir };

      try {
        await writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'test-npm-exit-code',
            private: true,
            dependencies: {},
          }),
        );

        const capture = createStdioCapture();
        const runtime = createNpmSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: tempDir,
        });

        try {
          const result = await runtime.exec(
            buildNpmInstallCode({ cwd: tempDir }),
            execOpts,
          );
          expect(result.code).toBe(0);
        } finally {
          runtime.dispose();
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    30_000,
  );

  // -------------------------------------------------------------------------
  // Stdout/stderr flow through bridge
  // -------------------------------------------------------------------------

  it(
    'npm install stderr contains progress output through the bridge',
    async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'npm-stdio-'));
      const execOpts = { filePath: path.join(tempDir, 'entry.js'), cwd: tempDir };

      try {
        await writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'test-npm-stdio',
            private: true,
            dependencies: { 'is-odd': '3.0.1' },
          }),
        );

        const capture = createStdioCapture();
        const runtime = createNpmSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: tempDir,
        });

        try {
          const result = await runtime.exec(
            buildNpmInstallCode({ cwd: tempDir }),
            execOpts,
          );
          expect(result.code).toBe(0);

          // npm produces output on stderr (progress) or stdout (added packages)
          const allOutput = capture.stdout() + capture.stderr();
          expect(allOutput.length).toBeGreaterThan(0);
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
  // Multiple dependencies
  // -------------------------------------------------------------------------

  it(
    'npm install handles multiple dependencies',
    async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'npm-multi-'));
      const execOpts = { filePath: path.join(tempDir, 'entry.js'), cwd: tempDir };

      try {
        await writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'test-npm-multi',
            private: true,
            dependencies: {
              'is-odd': '3.0.1',
              'left-pad': '1.3.0',
            },
          }),
        );

        const installCapture = createStdioCapture();
        const installRuntime = createNpmSandboxRuntime({
          onStdio: installCapture.onStdio,
          cwd: tempDir,
        });

        try {
          const installResult = await installRuntime.exec(
            buildNpmInstallCode({ cwd: tempDir }),
            execOpts,
          );

          if (installResult.code !== 0) {
            console.log('npm install stderr:', installCapture.stderr().slice(0, 2000));
          }
          expect(installResult.code).toBe(0);
        } finally {
          installRuntime.dispose();
        }

        // Verify both packages are usable
        const requireCapture = createStdioCapture();
        const requireRuntime = createNpmSandboxRuntime({
          onStdio: requireCapture.onStdio,
          cwd: tempDir,
        });

        try {
          const requireResult = await requireRuntime.exec(
            `(async () => {
              const isOdd = require('is-odd');
              const leftPad = require('left-pad');
              process.stdout.write(isOdd(3) + '|' + leftPad('hi', 6));
            })()`,
            execOpts,
          );

          expect(requireResult.code).toBe(0);
          expect(requireCapture.stdout()).toBe('true|    hi');
        } finally {
          requireRuntime.dispose();
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // package-lock.json creation
  // -------------------------------------------------------------------------

  it(
    'npm install creates package-lock.json',
    async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'npm-lockfile-'));
      const execOpts = { filePath: path.join(tempDir, 'entry.js'), cwd: tempDir };

      try {
        await writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'test-npm-lockfile',
            private: true,
            dependencies: { 'is-odd': '3.0.1' },
          }),
        );

        const capture = createStdioCapture();
        const runtime = createNpmSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: tempDir,
        });

        try {
          const result = await runtime.exec(
            buildNpmInstallCode({ cwd: tempDir }),
            execOpts,
          );
          expect(result.code).toBe(0);
        } finally {
          runtime.dispose();
        }

        // Verify package-lock.json was created
        const lockStat = await stat(path.join(tempDir, 'package-lock.json'));
        expect(lockStat.isFile()).toBe(true);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
