/**
 * Pi helper-tool bootstrap behavior across PTY, headless, and SDK surfaces.
 *
 * Pi's tools-manager probes for `fd` and `rg` at startup to register
 * code-search helpers. This file verifies how that bootstrap behaves
 * in each supported SecureExec surface:
 *
 * - **PTY (kernel.openShell)**: child_process.spawn routes through the
 *   kernel command executor. Host ELF binaries are only reachable when a
 *   HostBinaryDriver is mounted; otherwise Pi degrades gracefully.
 *
 * - **Headless (kernel.spawn)**: Same command routing as PTY. Pi print
 *   mode works without helpers because read/write/bash tools use bridge
 *   fs and kernel-routed child_process rather than fd/rg.
 *
 * - **SDK (NodeRuntime.exec)**: Standalone NodeRuntime with
 *   createNodeHostCommandExecutor() spawns host processes directly, so
 *   PATH-based helper resolution works like regular Node.js.
 *
 * Key invariant: Pi must boot and serve its core tool set (read, write,
 * bash) on every surface regardless of helper availability. Helper tools
 * (fd, rg) are optional code-search accelerators.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowAllChildProcess,
  allowAllEnv,
  allowAllFs,
  allowAllNetwork,
  createKernel,
} from '../../../core/src/index.ts';
import type {
  DriverProcess,
  Kernel,
  KernelInterface,
  ProcessContext,
  RuntimeDriver,
  ShellHandle,
} from '../../../core/src/index.ts';
import {
  NodeRuntime,
  NodeFileSystem,
  allowAll,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from '../../src/index.js';
import {
  createNodeHostCommandExecutor,
} from '../../../nodejs/src/host-command-executor.ts';
import {
  createNodeHostNetworkAdapter,
  createNodeRuntime,
} from '../../../nodejs/src/index.ts';
import {
  createHybridVfs,
  SECURE_EXEC_ROOT,
  seedPiManagedTools,
  skipUnlessPiInstalled,
  WASM_COMMANDS_DIR,
  buildPiInteractiveCode,
} from './pi-pty-helpers.ts';
import {
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// HostBinaryDriver — allows the kernel to spawn specific host binaries
// ---------------------------------------------------------------------------

class HostBinaryDriver implements RuntimeDriver {
  readonly name = 'host-binary';
  readonly commands: string[];

  constructor(commands: string[]) {
    this.commands = commands;
  }

  async init(_kernel: KernelInterface): Promise<void> {}

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    const child = nodeSpawn(command, args, {
      cwd: ctx.cwd,
      env: ctx.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolveExit!: (code: number) => void;
    let exitResolved = false;
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = (code: number) => {
        if (exitResolved) return;
        exitResolved = true;
        resolve(code);
      };
    });

    const proc: DriverProcess = {
      onStdout: null,
      onStderr: null,
      onExit: null,
      writeStdin: (data) => { try { child.stdin.write(data); } catch { /* closed */ } },
      closeStdin: () => { try { child.stdin.end(); } catch { /* closed */ } },
      kill: (signal) => { try { child.kill(signal); } catch { /* dead */ } },
      wait: () => exitPromise,
    };

    child.on('error', (error) => {
      const bytes = new TextEncoder().encode(`${command}: ${error.message}\n`);
      ctx.onStderr?.(bytes);
      proc.onStderr?.(bytes);
      resolveExit(127);
      proc.onExit?.(127);
    });
    child.stdout.on('data', (data: Buffer) => {
      const bytes = new Uint8Array(data);
      ctx.onStdout?.(bytes);
      proc.onStdout?.(bytes);
    });
    child.stderr.on('data', (data: Buffer) => {
      const bytes = new Uint8Array(data);
      ctx.onStderr?.(bytes);
      proc.onStderr?.(bytes);
    });
    child.on('close', (code) => {
      const exitCode = code ?? 1;
      resolveExit(exitCode);
      proc.onExit?.(exitCode);
    });

    return proc;
  }

  async dispose(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

function getSkipReason(): string | false {
  const piSkip = skipUnlessPiInstalled();
  if (piSkip) return piSkip;
  return false;
}

const PI_CLI = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
);

const PI_BASE_FLAGS = [
  '--verbose',
  '--no-session',
  '--no-extensions',
  '--no-skills',
  '--no-prompt-templates',
  '--no-themes',
];

const FETCH_INTERCEPT = path.resolve(__dirname, 'fetch-intercept.cjs');

const skipReason = getSkipReason();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(skipReason)('Pi helper-tool bootstrap behavior', () => {
  // -----------------------------------------------------------------------
  // SDK surface — standalone NodeRuntime with host command executor
  // -----------------------------------------------------------------------
  describe('SDK surface (standalone NodeRuntime)', () => {
    let runtime: NodeRuntime | undefined;
    let workDir: string | undefined;

    afterEach(async () => {
      await runtime?.terminate();
      runtime = undefined;
      if (workDir) {
        await rm(workDir, { recursive: true, force: true });
        workDir = undefined;
      }
    });

    it('resolves preseeded fd/rg helpers from PATH via host command executor', async () => {
      workDir = await mkdtemp(path.join(tmpdir(), 'pi-helper-sdk-'));
      const helperBinDir = await seedPiManagedTools(workDir);

      const stdout: string[] = [];
      const stderr: string[] = [];

      runtime = new NodeRuntime({
        onStdio: (event) => {
          if (event.channel === 'stdout') stdout.push(event.message);
          if (event.channel === 'stderr') stderr.push(event.message);
        },
        systemDriver: createNodeDriver({
          filesystem: new NodeFileSystem(),
          moduleAccess: { cwd: SECURE_EXEC_ROOT },
          permissions: allowAll,
          commandExecutor: createNodeHostCommandExecutor(),
        }),
        runtimeDriverFactory: createNodeRuntimeDriverFactory(),
      });

      // Spawn fd --version and rg --version through the bridge, with
      // PATH pointing at the preseeded helper bin directory.
      const result = await runtime.exec(
        `
        const { execSync } = require('child_process');
        const env = Object.assign({}, process.env, {
          PATH: ${JSON.stringify(helperBinDir)} + ':/usr/bin:/bin',
        });
        try {
          const fdVersion = execSync('fd --version', { env, timeout: 10000 }).toString().trim();
          const rgVersion = execSync('rg --version', { env, timeout: 10000 }).toString().trim();
          console.log(JSON.stringify({
            ok: true,
            fdVersion,
            rgVersion,
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(JSON.stringify({
            ok: false,
            error: errorMessage.split('\\n')[0].slice(0, 600),
          }));
          process.exitCode = 1;
        }
        `,
        { cwd: workDir },
      );

      const combined = stdout.join('');
      expect(result.code, `stderr: ${stderr.join('')}`).toBe(0);

      const payload = JSON.parse(
        combined.trim().split('\n').filter(Boolean).at(-1)!,
      ) as Record<string, unknown>;
      expect(payload.ok).toBe(true);

      // Verify real upstream versions, NOT sandbox WasmVM versions
      expect(String(payload.fdVersion)).toMatch(/^fd \d+\.\d+\.\d+/);
      expect(String(payload.fdVersion)).not.toContain('secure-exec');
      expect(String(payload.rgVersion)).toMatch(/^ripgrep \d+\.\d+\.\d+/);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Kernel PTY surface — helpers reachable via HostBinaryDriver
  // -----------------------------------------------------------------------
  describe('PTY surface (kernel.openShell)', () => {
    let kernel: Kernel | undefined;
    let shell: ShellHandle | undefined;
    let workDir: string | undefined;

    afterEach(async () => {
      try { shell?.kill(); } catch { /* may have exited */ }
      shell = undefined;
      await kernel?.dispose();
      kernel = undefined;
      if (workDir) {
        await rm(workDir, { recursive: true, force: true });
        workDir = undefined;
      }
    });

    it('resolves preseeded fd/rg via HostBinaryDriver mount in kernel', async () => {
      workDir = await mkdtemp(path.join(tmpdir(), 'pi-helper-pty-'));
      const helperBinDir = await seedPiManagedTools(workDir);

      const permissions = {
        ...allowAllFs,
        ...allowAllNetwork,
        ...allowAllChildProcess,
        ...allowAllEnv,
      };

      kernel = createKernel({
        filesystem: createHybridVfs(workDir),
        hostNetworkAdapter: createNodeHostNetworkAdapter(),
        permissions,
      });
      await kernel.mount(createNodeRuntime({ permissions }));
      await kernel.mount(new HostBinaryDriver(['fd', 'rg']));

      const sandboxEnv = {
        HOME: workDir,
        PATH: `${helperBinDir}:/usr/bin:/bin`,
      };

      // Direct kernel.spawn probe — proves HostBinaryDriver routes to
      // the preseeded host binaries and captures their output.
      async function probeCommand(cmd: string, args: string[]): Promise<{ exitCode: number; stdout: string }> {
        const chunks: string[] = [];
        const proc = kernel!.spawn(cmd, args, {
          cwd: workDir!,
          env: sandboxEnv,
          onStdout: (data) => chunks.push(new TextDecoder().decode(data)),
        });
        const exitCode = await Promise.race([
          proc.wait(),
          new Promise<number>((resolve) => setTimeout(() => { proc.kill(); resolve(124); }, 10_000)),
        ]);
        return { exitCode, stdout: chunks.join('') };
      }

      const fdResult = await probeCommand('fd', ['--version']);
      expect(fdResult.exitCode, 'fd --version should exit 0').toBe(0);
      const fdFirst = fdResult.stdout.split('\n')[0].trim();
      expect(fdFirst).toMatch(/^fd \d+\.\d+\.\d+/);
      expect(fdFirst).not.toContain('secure-exec');

      const rgResult = await probeCommand('rg', ['--version']);
      expect(rgResult.exitCode, 'rg --version should exit 0').toBe(0);
      const rgFirst = rgResult.stdout.split('\n')[0].trim();
      expect(rgFirst).toMatch(/^ripgrep \d+\.\d+\.\d+/);

      // Bridge probe — proves sandbox child_process.spawn resolves the
      // same commands through the kernel command executor.
      const bridgeProbe = await probeCommand('node', ['-e', [
        'const { spawn } = require("node:child_process");',
        'const child = spawn("fd", ["--version"], { env: process.env });',
        'child.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));',
        'child.on("error", (e) => process.stderr.write("ERR:" + e.message + "\\n"));',
        'child.on("close", (code) => process.stdout.write("EXIT:" + String(code) + "\\n"));',
      ].join('\n')]);

      expect(bridgeProbe.exitCode).toBe(0);
      expect(bridgeProbe.stdout).toContain('EXIT:0');
      expect(bridgeProbe.stdout.split('\n')[0].trim()).toMatch(/^fd \d+\.\d+\.\d+/);
    }, 30_000);

    it('Pi TUI boots without helpers when HostBinaryDriver is not mounted (graceful degradation)', async () => {
      if (!existsSync(path.join(WASM_COMMANDS_DIR, 'tar'))) {
        return; // skip if WasmVM tar not built
      }

      workDir = await mkdtemp(path.join(tmpdir(), 'pi-helper-degrade-'));
      const tarRuntimeDir = await mkdtemp(path.join(tmpdir(), 'pi-helper-tar-'));
      await copyFile(path.join(WASM_COMMANDS_DIR, 'tar'), path.join(tarRuntimeDir, 'tar'));
      await chmod(path.join(tarRuntimeDir, 'tar'), 0o755);

      const permissions = {
        ...allowAllFs,
        ...allowAllNetwork,
        ...allowAllChildProcess,
        ...allowAllEnv,
      };

      kernel = createKernel({
        filesystem: createHybridVfs(workDir),
        hostNetworkAdapter: createNodeHostNetworkAdapter(),
        permissions,
      });
      await kernel.mount(createNodeRuntime({ permissions }));
      // Mount only WasmVM tar — no HostBinaryDriver for fd/rg
      const { createWasmVmRuntime } = await import('../../../wasmvm/src/index.ts');
      await kernel.mount(createWasmVmRuntime({ commandDirs: [tarRuntimeDir] }));

      shell = kernel.openShell({
        command: 'node',
        args: ['-e', buildPiInteractiveCode({ workDir, providerApiKey: 'test-key' })],
        cwd: SECURE_EXEC_ROOT,
        env: {
          HOME: workDir,
          NO_COLOR: '1',
          ANTHROPIC_API_KEY: 'test-key',
          PATH: '/usr/bin:/bin',
        },
      });

      let rawOutput = '';
      shell.onData = (data) => { rawOutput += new TextDecoder().decode(data); };

      // Wait for Pi to reach TUI — proves bootstrap completes despite no helpers
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const visible = rawOutput
          .replace(/\u001b\][^\u0007]*\u0007/g, '')
          .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
          .replace(/\r/g, '');
        if (rawOutput.includes('\u001b[?2004h') && visible.includes('drop files to attach')) {
          break;
        }
        const exited = await Promise.race([
          shell.wait(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
        ]);
        if (exited !== null) {
          throw new Error(`Pi exited prematurely (code ${exited}).\nRaw PTY:\n${rawOutput}`);
        }
      }

      const visible = rawOutput
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\r/g, '');
      expect(visible).toContain('drop files to attach');

      shell.kill();
      await Promise.race([
        shell.wait(),
        new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
      ]);

      // Cleanup tar runtime dir
      await rm(tarRuntimeDir, { recursive: true, force: true });
    }, 60_000);
  });

  // -----------------------------------------------------------------------
  // Headless surface (kernel.spawn) — print mode inside sandbox
  // -----------------------------------------------------------------------
  describe('Headless surface (kernel print mode)', () => {
    let kernel: Kernel | undefined;
    let shell: ShellHandle | undefined;
    let workDir: string | undefined;
    let mockServer: MockLlmServerHandle | undefined;

    // Suppress EBADF from lingering TLS sockets during kernel teardown.
    // Pi's SDK may start a TLS handshake before the fetch intercept
    // redirects to the mock; disposal races with the write completion.
    const suppressEbadf = (err: Error & { code?: string }) => {
      if (err?.code === 'EBADF') return;
      throw err;
    };

    afterEach(async () => {
      try { shell?.kill(); } catch { /* may have exited */ }
      shell = undefined;
      process.on('uncaughtException', suppressEbadf);
      await kernel?.dispose();
      kernel = undefined;
      await new Promise((r) => setTimeout(r, 50));
      process.removeListener('uncaughtException', suppressEbadf);
      await mockServer?.close();
      mockServer = undefined;
      if (workDir) {
        await rm(workDir, { recursive: true, force: true });
        workDir = undefined;
      }
    });

    it('Pi print mode completes inside kernel sandbox without fd/rg helpers', async () => {
      process.on('uncaughtException', suppressEbadf);
      workDir = await mkdtemp(path.join(tmpdir(), 'pi-helper-headless-'));
      const agentDir = path.join(workDir, '.pi', 'agent');
      await mkdir(agentDir, { recursive: true });

      // Seed a test file for the mock LLM to read
      await writeFile(path.join(workDir, 'input.txt'), 'headless_bootstrap_canary');

      // Start mock LLM
      mockServer = await createMockLlmServer([
        { type: 'tool_use', name: 'read', input: { path: path.join(workDir, 'input.txt') } },
        { type: 'text', text: 'HEADLESS_CANARY_OK' },
      ]);
      await writeFile(
        path.join(agentDir, 'models.json'),
        JSON.stringify({ providers: { anthropic: { baseUrl: `http://127.0.0.1:${mockServer.port}` } } }),
      );

      const permissions = {
        ...allowAllFs,
        ...allowAllNetwork,
        ...allowAllChildProcess,
        ...allowAllEnv,
      };

      kernel = createKernel({
        filesystem: createHybridVfs(workDir),
        hostNetworkAdapter: createNodeHostNetworkAdapter(),
        permissions,
      });
      await kernel.mount(createNodeRuntime({ permissions }));
      // No HostBinaryDriver — Pi's read/write tools don't need fd/rg

      const mockUrl = `http://127.0.0.1:${mockServer.port}`;
      const piCode = `(async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = function(input, init) {
          let url = typeof input === 'string' ? input
            : input instanceof URL ? input.href
            : input.url;
          if (url && url.includes('api.anthropic.com')) {
            const newUrl = url.replace(/https?:\\/\\/api\\.anthropic\\.com/, ${JSON.stringify(mockUrl)});
            if (typeof input === 'string') input = newUrl;
            else if (input instanceof URL) input = new URL(newUrl);
            else input = new Request(newUrl, input);
          }
          return origFetch.call(this, input, init);
        };
        process.argv = ['node', 'pi', ${PI_BASE_FLAGS.map((f) => JSON.stringify(f)).join(', ')},
          '--print', 'Read input.txt and summarize.'];
        process.env.HOME = ${JSON.stringify(workDir)};
        process.env.ANTHROPIC_API_KEY = 'test-key';
        process.env.NO_COLOR = '1';
        await import(${JSON.stringify(PI_CLI)});
      })()`;

      // Use openShell to capture all output (stdout+stderr go through PTY)
      // This matches the proven working pattern from pi-cross-surface-parity.test.ts
      shell = kernel.openShell({
        command: 'node',
        args: ['-e', piCode],
        cwd: workDir,
        env: {
          HOME: workDir,
          ANTHROPIC_API_KEY: 'test-key',
          NO_COLOR: '1',
          PATH: process.env.PATH ?? '/usr/bin:/bin',
        },
      });

      let output = '';
      shell.onData = (data) => { output += new TextDecoder().decode(data); };

      const exitCode = await Promise.race([
        shell.wait(),
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error(
            `Headless timed out.\nOutput: ${output.slice(0, 2000)}`,
          )), 45_000),
        ),
      ]);

      expect(exitCode, `output: ${output.slice(0, 2000)}`).toBe(0);
      // Strip ANSI sequences for assertion
      const clean = output
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\r/g, '');
      expect(clean).toContain('HEADLESS_CANARY_OK');
      expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
    }, 60_000);
  });

  // -----------------------------------------------------------------------
  // Headless surface — host spawn baseline (proves host PATH works)
  // -----------------------------------------------------------------------
  describe('Headless host-spawn baseline', () => {
    let workDir: string | undefined;
    let mockServer: MockLlmServerHandle | undefined;

    afterEach(async () => {
      await mockServer?.close();
      mockServer = undefined;
      if (workDir) {
        await rm(workDir, { recursive: true, force: true });
        workDir = undefined;
      }
    });

    it('Pi print mode completes via host spawn with preseeded helpers in PATH', async () => {
      workDir = await mkdtemp(path.join(tmpdir(), 'pi-helper-host-'));
      const helperBinDir = await seedPiManagedTools(workDir);
      const agentDir = path.join(workDir, '.pi');
      await mkdir(agentDir, { recursive: true });

      await writeFile(path.join(workDir, 'input.txt'), 'host_canary_content');

      mockServer = await createMockLlmServer([
        { type: 'tool_use', name: 'read', input: { path: path.join(workDir, 'input.txt') } },
        { type: 'text', text: 'HOST_HEADLESS_CANARY' },
      ]);

      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const child = nodeSpawn('node', [
          PI_CLI, ...PI_BASE_FLAGS, '--print', 'Read input.txt and summarize.',
        ], {
          cwd: workDir,
          env: {
            ...process.env as Record<string, string>,
            ANTHROPIC_API_KEY: 'test-key',
            MOCK_LLM_URL: `http://127.0.0.1:${mockServer!.port}`,
            NODE_OPTIONS: `-r ${FETCH_INTERCEPT}`,
            HOME: workDir!,
            PI_AGENT_DIR: agentDir,
            NO_COLOR: '1',
            PATH: `${helperBinDir}:${process.env.PATH ?? '/usr/bin:/bin'}`,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        child.stdout.on('data', (d: Buffer) => stdoutChunks.push(d));
        child.stderr.on('data', (d: Buffer) => stderrChunks.push(d));

        const timer = setTimeout(() => child.kill('SIGKILL'), 45_000);
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

      expect(result.code, `stderr: ${result.stderr.slice(0, 1000)}`).toBe(0);
      expect(result.stdout).toContain('HOST_HEADLESS_CANARY');
    }, 60_000);
  });
});
