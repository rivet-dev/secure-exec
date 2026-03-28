/**
 * E2E test: OpenCode interactive PTY through the sandbox with real provider
 * traffic.
 *
 * Uses kernel.openShell() + @xterm/headless, real Anthropic credentials loaded
 * at runtime, host-backed filesystem for the mutable temp worktree, and host
 * network for provider requests.
 *
 * Policy-compliant: no host PTY wrappers (script -qefc), no mock LLM server.
 *
 * The HostBinaryDriver detects PTY context from ProcessContext.stdinIsTTY and
 * allocates a real host-side PTY via node-pty so TUI binaries (bubbletea) see
 * real TTY FDs. The virtual kernel PTY is set to raw mode so the host PTY
 * handles all terminal processing. A stdin pump forwards data from the virtual
 * PTY slave to the host PTY, completing the bidirectional chain:
 *   xterm → kernel PTY master → kernel PTY slave → stdin pump → host PTY → binary
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as nodePty from 'node-pty';
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
} from '../../../core/src/index.ts';
import type { VirtualFileSystem } from '../../../core/src/kernel/vfs.ts';
import { InMemoryFileSystem } from '../../../browser/src/os-filesystem.ts';
import {
  createNodeHostNetworkAdapter,
  createNodeRuntime,
} from '../../../nodejs/src/index.ts';
import { TerminalHarness } from '../../../core/test/kernel/terminal-harness.ts';
import { loadRealProviderEnv } from './real-provider-env.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const OPENCODE_BIN = path.join(PACKAGE_ROOT, 'node_modules/.bin/opencode');
const REAL_PROVIDER_FLAG = 'SECURE_EXEC_OPENCODE_REAL_PROVIDER_E2E';
const OPENCODE_MODEL = 'anthropic/claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// Signal number → name mapping for node-pty kill()
// ---------------------------------------------------------------------------

function signalNumberToName(sig: number): string {
  for (const [name, num] of Object.entries(constants.signals)) {
    if (num === sig) return name;
  }
  return 'SIGTERM';
}

// ---------------------------------------------------------------------------
// HostBinaryDriver — spawns real host binaries through the kernel
//
// When ProcessContext indicates TTY FDs, allocates a real host-side PTY via
// node-pty so the binary sees real TTY FDs (required by bubbletea and other
// TUI frameworks). The virtual kernel PTY is set to raw mode so the host PTY
// handles all terminal processing. A stdin pump reads from the virtual PTY
// slave and forwards to the host PTY.
//
// When isTTY is false, falls back to plain pipe-based child_process.spawn.
// ---------------------------------------------------------------------------

class HostBinaryDriver implements RuntimeDriver {
  readonly name = 'host-binary';
  readonly commands: string[];
  private ki!: KernelInterface;

  constructor(commands: string[]) {
    this.commands = commands;
  }

  async init(ki: KernelInterface): Promise<void> {
    this.ki = ki;
  }

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    if (ctx.stdinIsTTY && ctx.stdoutIsTTY) {
      return this.spawnWithPty(command, args, ctx);
    }
    return this.spawnWithPipes(command, args, ctx);
  }

  /** Spawn with a real host PTY for TUI binaries. */
  private spawnWithPty(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    // Set virtual kernel PTY to raw mode — host PTY handles all processing
    this.ki.tcsetattr(ctx.pid, ctx.fds.stdin, {
      icanon: false,
      echo: false,
      icrnl: false,
      isig: false,
      opost: false,
      onlcr: false,
    });

    const ptyProcess = nodePty.spawn(command, args, {
      name: ctx.env.TERM || 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: ctx.cwd,
      env: ctx.env,
    });

    let resolveExit!: (code: number) => void;
    let exitResolved = false;
    let exited = false;
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = (code: number) => {
        if (exitResolved) return;
        exitResolved = true;
        exited = true;
        resolve(code);
      };
    });

    const proc: DriverProcess = {
      onStdout: null,
      onStderr: null,
      onExit: null,
      writeStdin: (data) => {
        try { ptyProcess.write(Buffer.from(data)); } catch { /* pty closed */ }
      },
      closeStdin: () => {
        // PTY doesn't support half-close — no-op
      },
      kill: (signal) => {
        try { ptyProcess.kill(signalNumberToName(signal)); } catch { /* dead */ }
      },
      wait: () => exitPromise,
    };

    // Forward host PTY output → kernel PTY slave
    ptyProcess.onData((data: string) => {
      const bytes = new TextEncoder().encode(data);
      ctx.onStdout?.(bytes);
      proc.onStdout?.(bytes);
    });

    ptyProcess.onExit(({ exitCode }) => {
      resolveExit(exitCode);
      proc.onExit?.(exitCode);
    });

    // Stdin pump: read from virtual PTY slave → forward to host PTY master.
    // Completes the chain: xterm → kernel PTY master → slave → pump → host PTY
    const pumpStdin = async () => {
      try {
        while (!exited) {
          const data = await this.ki.fdRead(ctx.pid, ctx.fds.stdin, 4096);
          if (!data || data.length === 0) break;
          try { ptyProcess.write(Buffer.from(data)); } catch { break; }
        }
      } catch {
        // FD closed or PTY gone — expected on process exit
      }
    };
    pumpStdin();

    return proc;
  }

  /** Spawn with plain pipes (default for non-TTY context). */
  private spawnWithPipes(command: string, args: string[], ctx: ProcessContext): DriverProcess {
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
      writeStdin: (data) => {
        try { child.stdin.write(data); } catch { /* stdin may be closed */ }
      },
      closeStdin: () => {
        try { child.stdin.end(); } catch { /* stdin may be closed */ }
      },
      kill: (signal) => {
        try { child.kill(signal); } catch { /* process may be dead */ }
      },
      wait: () => exitPromise,
    };

    child.on('error', (err) => {
      const msg = `${command}: ${err.message}\n`;
      const bytes = new TextEncoder().encode(msg);
      ctx.onStderr?.(bytes);
      proc.onStderr?.(bytes);
      resolveExit(127);
      proc.onExit?.(127);
    });

    child.stdout.on('data', (d: Buffer) => {
      const bytes = new Uint8Array(d);
      ctx.onStdout?.(bytes);
      proc.onStdout?.(bytes);
    });

    child.stderr.on('data', (d: Buffer) => {
      const bytes = new Uint8Array(d);
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
// Overlay VFS — writes to InMemoryFileSystem, reads fall back to host
// ---------------------------------------------------------------------------

function createOverlayVfs(workDir: string): VirtualFileSystem {
  const memfs = new InMemoryFileSystem();
  const hostRoots = [PACKAGE_ROOT, path.resolve(PACKAGE_ROOT, '../..'), workDir, '/tmp'];

  const isHostPath = (p: string): boolean =>
    hostRoots.some((root) => p === root || p.startsWith(`${root}/`));

  return {
    readFile: async (p) => {
      try { return await memfs.readFile(p); }
      catch { return new Uint8Array(await fsPromises.readFile(p)); }
    },
    readTextFile: async (p) => {
      try { return await memfs.readTextFile(p); }
      catch { return await fsPromises.readFile(p, 'utf-8'); }
    },
    readDir: async (p) => {
      try { return await memfs.readDir(p); }
      catch { return await fsPromises.readdir(p); }
    },
    readDirWithTypes: async (p) => {
      try { return await memfs.readDirWithTypes(p); }
      catch {
        const entries = await fsPromises.readdir(p, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
      }
    },
    exists: async (p) => {
      if (await memfs.exists(p)) return true;
      try { await fsPromises.access(p); return true; } catch { return false; }
    },
    stat: async (p) => {
      try { return await memfs.stat(p); }
      catch {
        const s = await fsPromises.stat(p);
        return {
          mode: s.mode, size: s.size, isDirectory: s.isDirectory(),
          isSymbolicLink: false,
          atimeMs: s.atimeMs, mtimeMs: s.mtimeMs,
          ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs,
          ino: s.ino, nlink: s.nlink, uid: s.uid, gid: s.gid,
        };
      }
    },
    lstat: async (p) => {
      try { return await memfs.lstat(p); }
      catch {
        const s = await fsPromises.lstat(p);
        return {
          mode: s.mode, size: s.size, isDirectory: s.isDirectory(),
          isSymbolicLink: s.isSymbolicLink(),
          atimeMs: s.atimeMs, mtimeMs: s.mtimeMs,
          ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs,
          ino: s.ino, nlink: s.nlink, uid: s.uid, gid: s.gid,
        };
      }
    },
    realpath: async (p) => {
      try { return await memfs.realpath(p); }
      catch { return await fsPromises.realpath(p); }
    },
    readlink: async (p) => {
      try { return await memfs.readlink(p); }
      catch { return await fsPromises.readlink(p); }
    },
    pread: async (p, offset, length) => {
      try { return await memfs.pread(p, offset, length); }
      catch {
        const fd = await fsPromises.open(p, 'r');
        try {
          const buf = Buffer.alloc(length);
          const { bytesRead } = await fd.read(buf, 0, length, offset);
          return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
        } finally { await fd.close(); }
      }
    },
    writeFile: (p, content) =>
      isHostPath(p) ? fsPromises.writeFile(p, content) : memfs.writeFile(p, content),
    createDir: (p) =>
      isHostPath(p) ? fsPromises.mkdir(p) : memfs.createDir(p),
    mkdir: (p, opts) =>
      isHostPath(p) ? fsPromises.mkdir(p, { recursive: opts?.recursive ?? true }) : memfs.mkdir(p, opts),
    removeFile: (p) =>
      isHostPath(p) ? fsPromises.unlink(p) : memfs.removeFile(p),
    removeDir: (p) =>
      isHostPath(p) ? fsPromises.rm(p, { recursive: true, force: false }) : memfs.removeDir(p),
    rename: (a, b) =>
      (isHostPath(a) || isHostPath(b)) ? fsPromises.rename(a, b) : memfs.rename(a, b),
    symlink: (t, l) =>
      isHostPath(l) ? fsPromises.symlink(t, l) : memfs.symlink(t, l),
    link: (a, b) =>
      (isHostPath(a) || isHostPath(b)) ? fsPromises.link(a, b) : memfs.link(a, b),
    chmod: (p, m) =>
      isHostPath(p) ? fsPromises.chmod(p, m) : memfs.chmod(p, m),
    chown: (p, u, g) =>
      isHostPath(p) ? fsPromises.chown(p, u, g) : memfs.chown(p, u, g),
    utimes: (p, a, m) =>
      isHostPath(p) ? fsPromises.utimes(p, a, m) : memfs.utimes(p, a, m),
    truncate: (p, l) =>
      isHostPath(p) ? fsPromises.truncate(p, l) : memfs.truncate(p, l),
  };
}

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function skipUnlessOpenCodeInstalled(): string | false {
  if (!existsSync(OPENCODE_BIN)) {
    return 'opencode-ai test dependency not installed';
  }
  const probe = spawnSync(OPENCODE_BIN, ['--version'], { stdio: 'ignore' });
  return probe.status === 0
    ? false
    : `opencode binary probe failed with status ${probe.status ?? 'unknown'}`;
}

function getSkipReason(): string | false {
  const opencodeSkip = skipUnlessOpenCodeInstalled();
  if (opencodeSkip) return opencodeSkip;

  if (process.env[REAL_PROVIDER_FLAG] !== '1') {
    return `${REAL_PROVIDER_FLAG}=1 required for real provider PTY E2E`;
  }

  return loadRealProviderEnv(['ANTHROPIC_API_KEY']).skipReason ?? false;
}

const skipReason = getSkipReason();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(skipReason)('OpenCode PTY real-provider E2E (sandbox)', () => {
  let kernel: Kernel | undefined;
  let workDir: string | undefined;
  let xdgDataHome: string | undefined;
  let harness: TerminalHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
    await kernel?.dispose();
    kernel = undefined;
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
    if (xdgDataHome) {
      await rm(xdgDataHome, { recursive: true, force: true });
      xdgDataHome = undefined;
    }
  });

  it(
    'dispatches opencode --version through kernel.openShell() with PTY-aware HostBinaryDriver',
    async () => {
      workDir = await mkdtemp(path.join(tmpdir(), 'opencode-pty-version-'));
      kernel = createKernel({ filesystem: createOverlayVfs(workDir) });
      await kernel.mount(new HostBinaryDriver(['opencode']));

      const shell = kernel.openShell({
        command: 'opencode',
        args: ['--version'],
        cwd: workDir,
        env: {
          PATH: `${path.join(PACKAGE_ROOT, 'node_modules/.bin')}:${process.env.PATH ?? '/usr/bin:/bin'}`,
          HOME: workDir,
          TERM: 'xterm-256color',
        },
      });

      let output = '';
      shell.onData = (data) => {
        output += new TextDecoder().decode(data);
      };

      const exitCode = await Promise.race([
        shell.wait(),
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('opencode --version timed out')), 15_000),
        ),
      ]);

      expect(exitCode).toBe(0);
      expect(output.trim()).toMatch(/\d+\.\d+\.\d+/);
    },
    20_000,
  );

  it(
    'renders TUI through host PTY, accepts prompt, and receives provider response',
    async () => {
      const providerEnv = loadRealProviderEnv(['ANTHROPIC_API_KEY']);
      expect(providerEnv.skipReason).toBeUndefined();

      workDir = await mkdtemp(path.join(tmpdir(), 'opencode-pty-tui-'));
      xdgDataHome = await mkdtemp(path.join(tmpdir(), 'opencode-pty-tui-xdg-'));
      spawnSync('git', ['init'], { cwd: workDir, stdio: 'ignore' });
      await writeFile(
        path.join(workDir, 'package.json'),
        '{"name":"opencode-pty-tui","private":true}\n',
      );

      const permissions = {
        ...allowAllFs,
        ...allowAllNetwork,
        ...allowAllChildProcess,
        ...allowAllEnv,
      };

      kernel = createKernel({
        filesystem: createOverlayVfs(workDir),
        hostNetworkAdapter: createNodeHostNetworkAdapter(),
        permissions,
      });
      await kernel.mount(createNodeRuntime({ permissions }));
      await kernel.mount(new HostBinaryDriver(['opencode']));

      // Launch OpenCode TUI via TerminalHarness (kernel.openShell under the hood)
      harness = new TerminalHarness(kernel, {
        command: 'opencode',
        args: ['-m', OPENCODE_MODEL, workDir],
        cwd: workDir,
        cols: 120,
        rows: 40,
        env: {
          ...providerEnv.env!,
          PATH: `${path.join(PACKAGE_ROOT, 'node_modules/.bin')}:${process.env.PATH ?? '/usr/bin:/bin'}`,
          HOME: workDir,
          XDG_DATA_HOME: xdgDataHome,
          TERM: 'xterm-256color',
        },
      });

      // Wire terminal query responses back to the host binary so
      // bubbletea's terminal capability detection completes:
      // xterm → kernel PTY master → kernel PTY slave → stdin pump → host PTY
      harness.term.onData((data) => {
        harness!.shell.write(data);
      });

      // Wait for TUI to boot — bubbletea renders "Ask anything" or similar
      await harness.waitFor('>', 1, 30_000);

      // Submit a simple prompt
      await harness.type('say exactly "hello world"\r');

      // Wait for provider response — the model should respond with "hello world"
      await harness.waitFor('hello', 1, 60_000);

      const screen = harness.screenshotTrimmed();
      expect(screen.toLowerCase()).toContain('hello');
    },
    90_000,
  );
});
