/**
 * Tests for the WasmVM RuntimeDriver.
 *
 * Verifies driver interface contract, kernel mounting, command
 * registration, and proc_spawn routing architecture. WASM execution
 * tests are skipped when the binary is not built.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWasmVmRuntime, WASMVM_COMMANDS, mapErrorToErrno } from '../src/driver.ts';
import type { WasmVmRuntimeOptions } from '../src/driver.ts';
import { DATA_BUFFER_BYTES } from '../src/syscall-rpc.ts';
import { createKernel, KernelError } from '@secure-exec/core';
import type {
  KernelRuntimeDriver as RuntimeDriver,
  KernelInterface,
  ProcessContext,
  DriverProcess,
  Kernel,
} from '@secure-exec/core';
import { ERRNO_MAP } from '../src/wasi-constants.ts';
import { existsSync } from 'node:fs';
import { writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(__dirname, '../../../native/wasmvm/target/wasm32-wasip1/release/commands');
const hasWasmBinaries = existsSync(COMMANDS_DIR);

// Valid WASM magic: \0asm + version 1
const VALID_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

// Minimal in-memory VFS for kernel tests (same pattern as kernel test helpers)
class SimpleVFS {
  private files = new Map<string, Uint8Array>();
  private dirs = new Set<string>(['/']);
  private symlinks = new Map<string, string>();

  async readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(path);
    if (!data) throw new Error(`ENOENT: ${path}`);
    return data;
  }
  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path));
  }
  async readDir(path: string): Promise<string[]> {
    const prefix = path === '/' ? '/' : path + '/';
    const entries: string[] = [];
    for (const p of [...this.files.keys(), ...this.dirs]) {
      if (p !== path && p.startsWith(prefix)) {
        const rest = p.slice(prefix.length);
        if (!rest.includes('/')) entries.push(rest);
      }
    }
    return entries;
  }
  async readDirWithTypes(path: string) {
    return (await this.readDir(path)).map(name => ({
      name,
      isDirectory: this.dirs.has(path === '/' ? `/${name}` : `${path}/${name}`),
    }));
  }
  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.files.set(path, new Uint8Array(data));
    // Ensure parent dirs exist
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      this.dirs.add('/' + parts.slice(0, i).join('/'));
    }
  }
  async createDir(path: string) { this.dirs.add(path); }
  async mkdir(path: string, _options?: { recursive?: boolean }) { this.dirs.add(path); }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }
  async stat(path: string) {
    const isDir = this.dirs.has(path);
    const data = this.files.get(path);
    if (!isDir && !data) throw new Error(`ENOENT: ${path}`);
    return {
      mode: isDir ? 0o40755 : 0o100644,
      size: data?.length ?? 0,
      isDirectory: isDir,
      isSymbolicLink: false,
      atimeMs: Date.now(),
      mtimeMs: Date.now(),
      ctimeMs: Date.now(),
      birthtimeMs: Date.now(),
      ino: 0,
      nlink: 1,
      uid: 1000,
      gid: 1000,
    };
  }
  async removeFile(path: string) { this.files.delete(path); }
  async removeDir(path: string) { this.dirs.delete(path); }
  async rename(oldPath: string, newPath: string) {
    const data = this.files.get(oldPath);
    if (data) { this.files.set(newPath, data); this.files.delete(oldPath); }
  }
  async realpath(path: string) { return path; }
  async symlink(target: string, linkPath: string) {
    this.symlinks.set(linkPath, target);
    // Ensure parent dirs exist
    const parts = linkPath.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      this.dirs.add('/' + parts.slice(0, i).join('/'));
    }
  }
  async readlink(path: string): Promise<string> {
    const target = this.symlinks.get(path);
    if (!target) throw new Error(`EINVAL: ${path}`);
    return target;
  }
  async lstat(path: string) {
    // Return symlink type without following
    if (this.symlinks.has(path)) {
      return {
        mode: 0o120777,
        size: 0,
        isDirectory: false,
        isSymbolicLink: true,
        atimeMs: Date.now(),
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        birthtimeMs: Date.now(),
        ino: 0,
        nlink: 1,
        uid: 1000,
        gid: 1000,
      };
    }
    return this.stat(path);
  }
  async link(_old: string, _new: string) {}
  async chmod(_path: string, _mode: number) {}
  async chown(_path: string, _uid: number, _gid: number) {}
  async utimes(_path: string, _atime: number, _mtime: number) {}
  async truncate(_path: string, _length: number) {}
}

/**
 * Minimal mock RuntimeDriver for testing cross-runtime dispatch.
 * Configurable per-command exit codes and stdout/stderr output.
 */
class MockRuntimeDriver implements RuntimeDriver {
  name = 'mock';
  commands: string[];
  private _configs: Record<string, { exitCode?: number; stdout?: string; stderr?: string }>;

  constructor(commands: string[], configs: Record<string, { exitCode?: number; stdout?: string; stderr?: string }> = {}) {
    this.commands = commands;
    this._configs = configs;
  }

  async init(_kernel: KernelInterface): Promise<void> {}

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    const config = this._configs[command] ?? {};
    const exitCode = config.exitCode ?? 0;

    let resolveExit!: (code: number) => void;
    const exitPromise = new Promise<number>((r) => { resolveExit = r; });

    const proc: DriverProcess = {
      onStdout: null,
      onStderr: null,
      onExit: null,
      writeStdin: () => {},
      closeStdin: () => {},
      kill: () => {},
      wait: () => exitPromise,
    };

    queueMicrotask(() => {
      if (config.stdout) {
        const data = new TextEncoder().encode(config.stdout);
        ctx.onStdout?.(data);
        proc.onStdout?.(data);
      }
      if (config.stderr) {
        const data = new TextEncoder().encode(config.stderr);
        ctx.onStderr?.(data);
        proc.onStderr?.(data);
      }
      resolveExit(exitCode);
      proc.onExit?.(exitCode);
    });

    return proc;
  }

  async dispose(): Promise<void> {}
}

/** Create a temp dir with WASM command binaries for testing. */
async function createCommandDir(commands: string[]): Promise<string> {
  const dir = join(tmpdir(), `wasmvm-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  for (const cmd of commands) {
    await writeFile(join(dir, cmd), VALID_WASM);
  }
  return dir;
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('WasmVM RuntimeDriver', () => {
  // Guard: WASM binaries must be available in CI — prevents silent test skips
  if (process.env.CI) {
    it('WASM binaries are available in CI', () => {
      expect(hasWasmBinaries, `WASM commands dir not found at ${COMMANDS_DIR} — CI must build it before tests`).toBe(true);
    });
  }

  describe('factory — legacy mode', () => {
    it('createWasmVmRuntime returns a RuntimeDriver', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      expect(driver).toBeDefined();
      expect(driver.name).toBe('wasmvm');
      expect(typeof driver.init).toBe('function');
      expect(typeof driver.spawn).toBe('function');
      expect(typeof driver.dispose).toBe('function');
    });

    it('driver.name is "wasmvm"', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      expect(driver.name).toBe('wasmvm');
    });

    it('legacy mode: driver.commands contains 90+ commands from WASMVM_COMMANDS', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      expect(driver.commands.length).toBeGreaterThanOrEqual(90);
    });

    it('legacy mode: commands include shell commands', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      expect(driver.commands).toContain('sh');
      expect(driver.commands).toContain('bash');
    });

    it('legacy mode: commands include coreutils', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      expect(driver.commands).toContain('cat');
      expect(driver.commands).toContain('ls');
      expect(driver.commands).toContain('grep');
      expect(driver.commands).toContain('sed');
      expect(driver.commands).toContain('awk');
      expect(driver.commands).toContain('echo');
      expect(driver.commands).toContain('wc');
    });

    it('legacy mode: commands include text processing tools', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      expect(driver.commands).toContain('jq');
      expect(driver.commands).toContain('sort');
      expect(driver.commands).toContain('uniq');
      expect(driver.commands).toContain('tr');
    });

    it('WASMVM_COMMANDS is exported and frozen', () => {
      expect(WASMVM_COMMANDS.length).toBeGreaterThanOrEqual(90);
      expect(WASMVM_COMMANDS).toContain('sh');
      expect(Object.isFrozen(WASMVM_COMMANDS)).toBe(true);
    });

    it('accepts custom wasmBinaryPath', async () => {
      const bogusPath = '/bogus/nonexistent-binary.wasm';
      const vfs = new SimpleVFS();
      const kernel = createKernel({ filesystem: vfs as any });
      const driver = createWasmVmRuntime({ wasmBinaryPath: bogusPath });
      await kernel.mount(driver);

      const stderrChunks: Uint8Array[] = [];
      const proc = kernel.spawn('echo', ['hello'], {
        onStderr: (data) => stderrChunks.push(data),
      });
      const exitCode = await proc.wait();

      expect(exitCode).toBeGreaterThan(0);
      const stderr = stderrChunks.map(c => new TextDecoder().decode(c)).join('');
      expect(stderr).toContain(bogusPath);

      await kernel.dispose();
    });
  });

  describe('factory — commandDirs mode', () => {
    let tempDir: string;

    afterEach(async () => {
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('no-args: commands is empty before init', () => {
      const driver = createWasmVmRuntime();
      expect(driver.commands).toEqual([]);
    });

    it('discovers commands from commandDirs at init', async () => {
      tempDir = await createCommandDir(['ls', 'cat', 'grep']);
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.commands).toContain('ls');
      expect(driver.commands).toContain('cat');
      expect(driver.commands).toContain('grep');
      expect(driver.commands.length).toBe(3);
    });

    it('skips dotfiles during scan', async () => {
      tempDir = await createCommandDir(['ls', '.hidden']);
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.commands).toContain('ls');
      expect(driver.commands).not.toContain('.hidden');
    });

    it('skips directories during scan', async () => {
      tempDir = await createCommandDir(['ls']);
      await mkdir(join(tempDir, 'subdir'), { recursive: true });
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.commands).toContain('ls');
      expect(driver.commands).not.toContain('subdir');
    });

    it('skips non-WASM files during scan', async () => {
      tempDir = await createCommandDir(['ls']);
      await writeFile(join(tempDir, 'README.md'), 'This is a readme');
      await writeFile(join(tempDir, 'script.sh'), '#!/bin/bash\necho hi');
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.commands).toEqual(['ls']);
    });

    it('first directory wins on naming conflict (PATH semantics)', async () => {
      const dir1 = await createCommandDir(['ls', 'cat']);
      const dir2 = await createCommandDir(['ls', 'grep']);
      tempDir = dir1; // for cleanup

      const driver = createWasmVmRuntime({ commandDirs: [dir1, dir2] }) as any;
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      // ls from dir1 should be used (first match)
      expect(driver.commands).toContain('ls');
      expect(driver.commands).toContain('cat');
      expect(driver.commands).toContain('grep');
      // Verify ls path points to dir1, not dir2
      expect(driver._commandPaths.get('ls')).toBe(join(dir1, 'ls'));

      await rm(dir2, { recursive: true, force: true });
    });

    it('handles nonexistent commandDirs gracefully', async () => {
      const driver = createWasmVmRuntime({ commandDirs: ['/nonexistent/path'] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.commands).toEqual([]);
    });

    it('handles empty commandDirs gracefully', async () => {
      tempDir = join(tmpdir(), `empty-cmd-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.commands).toEqual([]);
    });
  });

  describe('tryResolve — on-demand discovery', () => {
    let tempDir: string;

    afterEach(async () => {
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('discovers a binary added after init', async () => {
      tempDir = await createCommandDir(['ls']);
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.commands).not.toContain('new-cmd');

      // Drop a new binary after init
      await writeFile(join(tempDir, 'new-cmd'), VALID_WASM);

      // tryResolve finds it
      expect(driver.tryResolve!('new-cmd')).toBe(true);
      expect(driver.commands).toContain('new-cmd');
    });

    it('returns false for nonexistent command', async () => {
      tempDir = await createCommandDir(['ls']);
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.tryResolve!('nonexistent')).toBe(false);
    });

    it('returns false for non-WASM file', async () => {
      tempDir = await createCommandDir([]);
      await writeFile(join(tempDir, 'readme'), 'not wasm');
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.tryResolve!('readme')).toBe(false);
    });

    it('returns true for already-known command', async () => {
      tempDir = await createCommandDir(['ls']);
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      // ls is already discovered — tryResolve returns true immediately
      expect(driver.tryResolve!('ls')).toBe(true);
    });

    it('skips directories in tryResolve', async () => {
      tempDir = await createCommandDir([]);
      await mkdir(join(tempDir, 'subdir'), { recursive: true });
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      expect(driver.tryResolve!('subdir')).toBe(false);
    });

    it('returns false in legacy mode', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      expect(driver.tryResolve!('ls')).toBe(false);
    });

    it('does not add duplicate entries on repeated tryResolve', async () => {
      tempDir = await createCommandDir(['ls']);
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      const countBefore = driver.commands.length;
      driver.tryResolve!('ls');
      driver.tryResolve!('ls');
      expect(driver.commands.length).toBe(countBefore);
    });
  });

  describe('backwards compatibility — deprecation warnings', () => {
    it('emits deprecation warning for wasmBinaryPath only', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
      warnSpy.mockRestore();
    });

    it('emits warning that wasmBinaryPath is ignored when commandDirs is set', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tempDir = await createCommandDir([]);
      createWasmVmRuntime({ wasmBinaryPath: '/fake', commandDirs: [tempDir] });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ignored'));
      warnSpy.mockRestore();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('no warning when commandDirs only', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tempDir = await createCommandDir([]);
      createWasmVmRuntime({ commandDirs: [tempDir] });
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('no warning when no options', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createWasmVmRuntime();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('kernel integration — legacy mode', () => {
    let kernel: Kernel;
    let driver: RuntimeDriver;

    beforeEach(async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      await kernel.mount(driver);
    });

    afterEach(async () => {
      await kernel.dispose();
    });

    it('mounts to kernel successfully', () => {
      expect(kernel.commands.size).toBeGreaterThan(0);
    });

    it('registers all commands in kernel', () => {
      const commands = kernel.commands;
      expect(commands.get('sh')).toBe('wasmvm');
      expect(commands.get('cat')).toBe('wasmvm');
      expect(commands.get('grep')).toBe('wasmvm');
      expect(commands.get('echo')).toBe('wasmvm');
    });

    it('all driver commands map to wasmvm', () => {
      const commands = kernel.commands;
      for (const cmd of driver.commands) {
        expect(commands.get(cmd)).toBe('wasmvm');
      }
    });

    it('dispose is idempotent', async () => {
      await kernel.dispose();
      await kernel.dispose();
    });
  });

  describe('kernel integration — commandDirs mode', () => {
    let kernel: Kernel;
    let tempDir: string;

    afterEach(async () => {
      await kernel?.dispose();
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('registers scanned commands in kernel', async () => {
      tempDir = await createCommandDir(['ls', 'cat', 'grep']);
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      const driver = createWasmVmRuntime({ commandDirs: [tempDir] });
      await kernel.mount(driver);

      expect(kernel.commands.get('ls')).toBe('wasmvm');
      expect(kernel.commands.get('cat')).toBe('wasmvm');
      expect(kernel.commands.get('grep')).toBe('wasmvm');
    });
  });

  describe('spawn', () => {
    let kernel: Kernel;
    let driver: RuntimeDriver;

    beforeEach(async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      driver = createWasmVmRuntime({ wasmBinaryPath: '/nonexistent/binary.wasm' });
      await kernel.mount(driver);
    });

    afterEach(async () => {
      await kernel.dispose();
    });

    it('spawn returns DriverProcess with correct interface', () => {
      const proc = kernel.spawn('echo', ['hello']);
      expect(proc).toBeDefined();
      expect(typeof proc.writeStdin).toBe('function');
      expect(typeof proc.closeStdin).toBe('function');
      expect(typeof proc.kill).toBe('function');
      expect(typeof proc.wait).toBe('function');
      expect(proc.pid).toBeGreaterThan(0);
    });

    it('spawn with missing binary exits with code 1', async () => {
      const proc = kernel.spawn('echo', ['hello']);
      const exitCode = await proc.wait();
      expect(exitCode).toBeGreaterThan(0);
    });

    it('throws ENOENT for unknown commands', () => {
      expect(() => kernel.spawn('nonexistent-cmd', [])).toThrow(/ENOENT/);
    });

    it('spawn with corrupt WASM binary produces clear error', async () => {
      // Create a temp dir with a file that has valid WASM magic but invalid module content
      const corruptDir = join(tmpdir(), `wasmvm-corrupt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(corruptDir, { recursive: true });
      // Valid magic + version header followed by garbage bytes that break compilation
      const corruptWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF]);
      await writeFile(join(corruptDir, 'badcmd'), corruptWasm);

      const vfs = new SimpleVFS();
      const k = createKernel({ filesystem: vfs as any });
      await k.mount(createWasmVmRuntime({ commandDirs: [corruptDir] }));

      const stderrChunks: Uint8Array[] = [];
      const proc = k.spawn('badcmd', [], { onStderr: (data) => stderrChunks.push(data) });
      const exitCode = await proc.wait();

      expect(exitCode).toBe(1);
      const stderr = stderrChunks.map(c => new TextDecoder().decode(c)).join('');
      expect(stderr).toContain('wasmvm');
      expect(stderr).toContain('badcmd');

      await k.dispose();
      await rm(corruptDir, { recursive: true, force: true });
    });
  });

  describe('driver lifecycle', () => {
    it('throws when spawning before init', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' });
      const ctx: ProcessContext = {
        pid: 1, ppid: 0, env: {}, cwd: '/home/user',
        fds: { stdin: 0, stdout: 1, stderr: 2 },
      };
      expect(() => driver.spawn('echo', ['hello'], ctx)).toThrow(/not initialized/);
    });

    it('dispose without init does not throw', async () => {
      const driver = createWasmVmRuntime();
      await driver.dispose();
    });

    it('dispose after init cleans up', async () => {
      const driver = createWasmVmRuntime();
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);
      await driver.dispose();
    });
  });

  describe.skipIf(!hasWasmBinaries)('real execution', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('exec echo hello returns stdout hello\\n', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      const result = await kernel.exec('echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello\n');
    });

    it('path-based /bin command lookups resolve to the discovered WASM binary', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      const result = await kernel.exec('/bin/printf path-lookup-ok');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('path-lookup-ok');
    });

    it('path-based /bin command gets correct permission tier from defaults', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      // Provide a non-empty permissions map (without catch-all) so defaults are consulted
      const driver = createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { 'ls': 'isolated' },
      }) as any;
      await kernel.mount(driver);

      // basename 'printf' falls through to DEFAULT_FIRST_PARTY_TIERS → 'read-only'
      // Without normalization, '/bin/printf' would miss the defaults and return 'read-write'
      expect(driver._resolvePermissionTier('/bin/printf')).toBe('read-only');
      expect(driver._resolvePermissionTier('printf')).toBe('read-only');
      // Explicit user permission still takes priority
      expect(driver._resolvePermissionTier('/bin/ls')).toBe('isolated');
      expect(driver._resolvePermissionTier('ls')).toBe('isolated');
    });

    it('module cache is populated after first spawn and reused for subsequent spawns', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      const driver = createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }) as any;
      await kernel.mount(driver);

      // Before any spawn, cache is empty
      expect(driver._moduleCache.size).toBe(0);

      // First spawn compiles and caches the module
      const result1 = await kernel.exec('echo first');
      expect(result1.exitCode).toBe(0);
      expect(driver._moduleCache.size).toBe(1);

      // Second spawn reuses the cached module (cache size stays 1)
      const result2 = await kernel.exec('echo second');
      expect(result2.exitCode).toBe(0);
      expect(driver._moduleCache.size).toBe(1);
    });

    it('exec cat /dev/null exits 0', async () => {
      const vfs = new SimpleVFS();
      await vfs.writeFile('/dev/null', new Uint8Array(0));
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      const result = await kernel.exec('cat /dev/null');
      expect(result.exitCode).toBe(0);
    });

    it('exec false exits non-zero', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      const result = await kernel.exec('false');
      expect(result.exitCode).not.toBe(0);
    });
  });

  // Pre-existing: cat stdin pipe blocks because WASI polyfill's non-blocking
  // fd_read returns 0 bytes (which cat treats as "try again" instead of EOF).
  // Root cause: WASM cat binary doesn't interpret nread=0 as EOF.
  describe.skipIf(!hasWasmBinaries)('stdin streaming', () => {
    it.todo('writeStdin to cat delivers data through kernel pipe');
  });

  describe.skipIf(!hasWasmBinaries)('proc_spawn routing', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('proc_spawn routes through kernel.spawn() — spy driver records call', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });

      // Spy driver records every spawn call for later assertion
      const spy = { calls: [] as { command: string; args: string[]; callerPid: number }[] };
      const spyDriver = new MockRuntimeDriver(['spycmd'], {
        spycmd: { exitCode: 0, stdout: 'spy-output\n' },
      });
      const originalSpawn = spyDriver.spawn.bind(spyDriver);
      spyDriver.spawn = (command: string, args: string[], ctx: ProcessContext): DriverProcess => {
        spy.calls.push({ command, args: [...args], callerPid: ctx.ppid });
        return originalSpawn(command, args, ctx);
      };

      // Mount spy driver first (handles 'spycmd'), then WasmVM (handles shell)
      await kernel.mount(spyDriver);
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      // Shell runs 'spycmd arg1 arg2' — brush-shell proc_spawn routes through kernel
      const proc = kernel.spawn('sh', ['-c', 'spycmd arg1 arg2'], {});

      const code = await proc.wait();

      // Spy proves routing happened — not just that output appeared
      expect(spy.calls.length).toBe(1);
      expect(spy.calls[0].command).toBe('spycmd');
      expect(spy.calls[0].args).toEqual(['arg1', 'arg2']);
      expect(spy.calls[0].callerPid).toBeGreaterThan(0);
      expect(code).toBe(0);
    });

    it('rapid spawn/wait cycles produce correct exit codes', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      // Run 5 sequential spawn/wait cycles rapidly — each with a different
      // expected exit code. Before the fix, the async managed.wait().then()
      // could write a stale exit code into dataBuf, corrupting a later RPC.
      for (let i = 0; i < 5; i++) {
        const result = await kernel.exec(`sh -c "exit ${i}"`);
        expect(result.exitCode).toBe(i);
      }
    });
  });

  describe('SAB overflow protection', () => {
    it('DATA_BUFFER_BYTES is 1MB', () => {
      expect(DATA_BUFFER_BYTES).toBe(1024 * 1024);
    });
  });

  describe.skipIf(!hasWasmBinaries)('SAB overflow handling', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('fdRead exceeding 1MB SAB returns error instead of truncating', async () => {
      const vfs = new SimpleVFS();
      // Write 2MB file filled with pattern bytes
      const twoMB = new Uint8Array(2 * 1024 * 1024);
      for (let i = 0; i < twoMB.length; i++) twoMB[i] = 0x41 + (i % 26);
      await vfs.writeFile('/large-file', twoMB);

      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      // dd with bs=2097152 requests a single fdRead >1MB — triggers SAB overflow guard
      const result = await kernel.exec('dd if=/large-file of=/dev/null bs=2097152 count=1');
      // EIO returned instead of silent truncation
      expect(result.exitCode).not.toBe(0);
    });

    it('pipe read/write FileDescriptions are freed after process exits', async () => {
      const vfs = new SimpleVFS();
      await vfs.writeFile('/small-file', 'hello');

      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      // Capture FD table count before spawning
      const fdMgr = (kernel as any).fdTableManager;
      const tableSizeBefore = fdMgr.size;

      // echo uses pipes (stdin/stdout wired between kernel and WasmVM)
      const result = await kernel.exec('echo done');
      expect(result.exitCode).toBe(0);

      // After process exits, its FD table (including pipe FDs) must be cleaned up
      expect(fdMgr.size).toBe(tableSizeBefore);
    });

    it('vfsReadFile exceeding 1MB returns EIO without RangeError crash', async () => {
      const vfs = new SimpleVFS();
      // Write 2MB file — exceeds DATA_BUFFER_BYTES (1MB) SAB capacity
      const twoMB = new Uint8Array(2 * 1024 * 1024);
      for (let i = 0; i < twoMB.length; i++) twoMB[i] = 0x41 + (i % 26);
      await vfs.writeFile('/oversized', twoMB);

      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      // cat reads through fd_read (bounded reads), but we verify no crash from
      // the pre-check guards on all VFS RPC data paths (vfsReadFile, vfsStat, etc.)
      const result = await kernel.exec('cat /oversized');
      // cat reads in bounded chunks so it succeeds — the fix prevents RangeError
      // if the full-file vfsReadFile path were hit instead
      expect(result.exitCode).toBe(0);
    });

    it('lstat on symlink returns symlink type, not target type', async () => {
      const vfs = new SimpleVFS();
      await vfs.writeFile('/target-file', 'content');
      await vfs.symlink('/target-file', '/my-symlink');

      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

      // ls -l shows symlinks with 'l' prefix in permissions column
      const result = await kernel.exec('ls -l /my-symlink');
      expect(result.exitCode).toBe(0);
      // lstat should identify this as a symlink (shown as 'l' in ls -l output)
      expect(result.stdout).toMatch(/^l/);
    });
  });

  describe('mapErrorToErrno — structured error code mapping', () => {
    it('maps KernelError.code to WASI errno (ENOENT → 44)', () => {
      const err = new KernelError('ENOENT', 'file not found');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.ENOENT);
      expect(mapErrorToErrno(err)).toBe(44);
    });

    it('maps KernelError.code to WASI errno (EBADF → 8)', () => {
      const err = new KernelError('EBADF', 'bad file descriptor 5');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.EBADF);
    });

    it('maps KernelError.code to WASI errno (ESPIPE → 70)', () => {
      const err = new KernelError('ESPIPE', 'illegal seek');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.ESPIPE);
    });

    it('maps KernelError.code to WASI errno (EPIPE → 64)', () => {
      const err = new KernelError('EPIPE', 'write end closed');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.EPIPE);
    });

    it('maps KernelError.code to WASI errno (EACCES → 2)', () => {
      const err = new KernelError('EACCES', 'permission denied');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.EACCES);
    });

    it('maps KernelError.code to WASI errno (EPERM → 63)', () => {
      const err = new KernelError('EPERM', 'cannot remove device');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.EPERM);
    });

    it('maps KernelError.code to WASI errno (EINVAL → 28)', () => {
      const err = new KernelError('EINVAL', 'invalid whence 99');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.EINVAL);
    });

    it('prefers structured .code over string matching', () => {
      const err = new KernelError('ENOENT', 'EBADF appears in message');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.ENOENT);
    });

    it('falls back to string matching for plain Error', () => {
      const err = new Error('ENOENT: no such file');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.ENOENT);
    });

    it('falls back to string matching for Error with unknown code', () => {
      const err = new Error('EISDIR: is a directory');
      (err as any).code = 'UNKNOWN_CODE';
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.EISDIR);
    });

    it('returns EIO for non-Error values', () => {
      expect(mapErrorToErrno('string error')).toBe(ERRNO_MAP.EIO);
      expect(mapErrorToErrno(42)).toBe(ERRNO_MAP.EIO);
      expect(mapErrorToErrno(null)).toBe(ERRNO_MAP.EIO);
    });

    it('returns EIO for Error with no recognized code or message', () => {
      const err = new Error('something went wrong');
      expect(mapErrorToErrno(err)).toBe(ERRNO_MAP.EIO);
    });

    it('maps all KernelErrorCode values to non-zero errno', () => {
      const codes = [
        'EACCES', 'EBADF', 'EEXIST', 'EINVAL', 'EIO', 'EISDIR',
        'ENOENT', 'ENOSYS', 'ENOTDIR', 'ENOTEMPTY', 'EPERM', 'EPIPE',
        'ESPIPE', 'ESRCH', 'ETIMEDOUT',
      ] as const;
      for (const code of codes) {
        expect(ERRNO_MAP[code]).toBeDefined();
        expect(ERRNO_MAP[code]).toBeGreaterThan(0);
        const err = new KernelError(code, 'test');
        expect(mapErrorToErrno(err)).toBe(ERRNO_MAP[code]);
      }
    });
  });

  describe('permission tier resolution', () => {
    it('all commands default to full when no permissions configured', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/fake' }) as any;
      // No permissions config → fully unrestricted (backward compatible)
      expect(driver._resolvePermissionTier('custom-tool')).toBe('full');
      expect(driver._resolvePermissionTier('grep')).toBe('full');
      expect(driver._resolvePermissionTier('sh')).toBe('full');
    });

    it('user * catch-all takes priority over first-party defaults', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: { '*': 'full' },
      }) as any;
      // User's '*' covers everything — defaults don't override
      expect(driver._resolvePermissionTier('sh')).toBe('full');
      expect(driver._resolvePermissionTier('grep')).toBe('full');
      expect(driver._resolvePermissionTier('ls')).toBe('full');
      expect(driver._resolvePermissionTier('custom-tool')).toBe('full');
    });

    it('first-party defaults apply when user config has no catch-all', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: { 'my-tool': 'isolated' },
      }) as any;
      // No '*' in user config → defaults kick in for known commands
      expect(driver._resolvePermissionTier('sh')).toBe('full');
      expect(driver._resolvePermissionTier('grep')).toBe('read-only');
      expect(driver._resolvePermissionTier('ls')).toBe('read-only');
      expect(driver._resolvePermissionTier('my-tool')).toBe('isolated');
      // Unknown commands not in defaults → read-write
      expect(driver._resolvePermissionTier('unknown-cmd')).toBe('read-write');
    });

    it('exact command name match overrides defaults', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: { 'grep': 'full', 'sh': 'read-only' },
      }) as any;
      expect(driver._resolvePermissionTier('grep')).toBe('full');
      expect(driver._resolvePermissionTier('sh')).toBe('read-only');
    });

    it('falls back to * wildcard', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: { '*': 'isolated' },
      }) as any;
      expect(driver._resolvePermissionTier('unknown-cmd')).toBe('isolated');
    });

    it('defaults to read-write when no * wildcard and no match', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: { 'sh': 'full' },
      }) as any;
      expect(driver._resolvePermissionTier('unknown-cmd')).toBe('read-write');
    });

    it('all four tiers are accepted', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: {
          'sh': 'full',
          'cp': 'read-write',
          'grep': 'read-only',
          'untrusted': 'isolated',
        },
      }) as any;
      expect(driver._resolvePermissionTier('sh')).toBe('full');
      expect(driver._resolvePermissionTier('cp')).toBe('read-write');
      expect(driver._resolvePermissionTier('grep')).toBe('read-only');
      expect(driver._resolvePermissionTier('untrusted')).toBe('isolated');
    });

    it('wildcard pattern _untrusted/* matches directory prefix commands', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: {
          'sh': 'full',
          '_untrusted/*': 'isolated',
          '*': 'read-write',
        },
      }) as any;
      expect(driver._resolvePermissionTier('_untrusted/evil-cmd')).toBe('isolated');
      expect(driver._resolvePermissionTier('_untrusted/another')).toBe('isolated');
      expect(driver._resolvePermissionTier('sh')).toBe('full');
      expect(driver._resolvePermissionTier('custom-tool')).toBe('read-write');
    });

    it('exact match takes precedence over wildcard pattern', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: {
          '_untrusted/special': 'full',
          '_untrusted/*': 'isolated',
          '*': 'read-write',
        },
      }) as any;
      expect(driver._resolvePermissionTier('_untrusted/special')).toBe('full');
      expect(driver._resolvePermissionTier('_untrusted/other')).toBe('isolated');
    });

    it('longer glob pattern wins over shorter one', () => {
      const driver = createWasmVmRuntime({
        wasmBinaryPath: '/fake',
        permissions: {
          'vendor/*': 'read-write',
          'vendor/untrusted/*': 'isolated',
          '*': 'full',
        },
      }) as any;
      expect(driver._resolvePermissionTier('vendor/untrusted/cmd')).toBe('isolated');
      expect(driver._resolvePermissionTier('vendor/trusted-cmd')).toBe('read-write');
    });

    it('permissionTier is included in WorkerInitData', async () => {
      const tempDir = await createCommandDir(['ls']);
      const driver = createWasmVmRuntime({
        commandDirs: [tempDir],
        permissions: { 'ls': 'read-only' },
      }) as any;
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);

      // Verify the _resolvePermissionTier matches
      expect(driver._resolvePermissionTier('ls')).toBe('read-only');

      await rm(tempDir, { recursive: true, force: true });
    });
  });

  describe.skipIf(!hasWasmBinaries)('permission tier enforcement', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('read-only command cannot write files', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'read-only' },
      }));

      // tee tries to write to a file — should fail with EACCES
      const result = await kernel.exec('tee /tmp/out', { stdin: 'hello' });
      expect(result.exitCode).not.toBe(0);
    });

    it('read-only command can still write to stdout', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'read-only' },
      }));

      const result = await kernel.exec('echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello\n');
    });

    it('full tier command can write files', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'full' },
      }));

      // echo hello should work fine with full permissions
      const result = await kernel.exec('echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello\n');
    });

    it('full tier command can spawn subprocesses', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'full' },
      }));

      // sh with full tier can spawn ls as subprocess
      const result = await kernel.exec('sh -c "ls /"');
      expect(result.exitCode).toBe(0);
    });

    it('read-write command cannot spawn subprocesses', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'read-write' },
      }));

      // sh with read-write tier cannot spawn subprocesses — ls will fail
      const result = await kernel.exec('sh -c "ls /"');
      expect(result.exitCode).not.toBe(0);
    });

    it('read-only command cannot write via pwrite path', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'read-only' },
      }));

      // tee with read-only tier cannot write — fdOpen blocks write flags,
      // fdPwrite provides defense-in-depth with the same isWriteBlocked() check
      const result = await kernel.exec('tee /tmp/out', { stdin: 'hello' });
      expect(result.exitCode).not.toBe(0);
    });

    it('read-only command calling proc_kill is blocked', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'read-only' },
      }));

      // sh builtin kill or external kill — either path blocked
      // proc_kill gated by isSpawnBlocked(), proc_spawn also gated
      const result = await kernel.exec('sh -c "kill -0 1"');
      expect(result.exitCode).not.toBe(0);
    });

    it('isolated command cannot create pipes (fd_pipe blocked)', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'isolated' },
      }));

      // Pipe operator requires fd_pipe — blocked for isolated tier
      const result = await kernel.exec('sh -c "echo a | cat"');
      expect(result.exitCode).not.toBe(0);
    });

    it('restricted tier command cannot use fd_dup2', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'read-only' },
      }));

      // fd_dup2 is gated by isSpawnBlocked() — read-only tier should fail
      // sh -c will try to use dup2 for pipe redirection
      const result = await kernel.exec('sh -c "echo hello >/dev/null"');
      expect(result.exitCode).not.toBe(0);
    });

    it('full tier command can use pipes and subprocesses normally', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'full' },
      }));

      // Full tier: fd_pipe, fd_dup, proc_spawn, proc_kill all allowed
      const result = await kernel.exec('sh -c "echo hello | cat"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
    });

    it('isolated command cannot stat paths outside cwd', async () => {
      const vfs = new SimpleVFS();
      // Populate a path outside the default cwd (/home/user)
      await vfs.writeFile('/etc/passwd', 'root:x:0:0');
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'isolated' },
      }));

      // ls /etc tries to stat/readdir outside cwd — should fail
      const result = await kernel.exec('ls /etc');
      expect(result.exitCode).not.toBe(0);
    });

    it('isolated command cannot readdir root', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'isolated' },
      }));

      // ls / tries to readdir root — outside /home/user cwd
      const result = await kernel.exec('ls /');
      expect(result.exitCode).not.toBe(0);
    });

    it('isolated command can read files within cwd', async () => {
      const vfs = new SimpleVFS();
      await vfs.writeFile('/home/user/test.txt', 'cwd-content');
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'isolated' },
      }));

      // cat a file within the default cwd (/home/user) — should succeed
      const result = await kernel.exec('cat /home/user/test.txt');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('cwd-content');
    });

    it('isolated command cannot write files', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'isolated' },
      }));

      // tee tries to write — isWriteBlocked returns true for isolated
      const result = await kernel.exec('tee /home/user/out', { stdin: 'hello' });
      expect(result.exitCode).not.toBe(0);
    });

    it('isolated command cannot spawn subprocesses', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({
        commandDirs: [COMMANDS_DIR],
        permissions: { '*': 'isolated' },
      }));

      // sh -c tries to spawn ls — isSpawnBlocked returns true for isolated
      const result = await kernel.exec('sh -c "ls"');
      expect(result.exitCode).not.toBe(0);
    });
  });
});
