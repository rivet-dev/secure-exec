/**
 * Tests for the WasmVM RuntimeDriver.
 *
 * Verifies driver interface contract, kernel mounting, command
 * registration, and proc_spawn routing architecture. WASM execution
 * tests are skipped when the binary is not built.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmVmRuntime, WASMVM_COMMANDS, mapErrorToErrno } from '../src/driver.ts';
import type { WasmVmRuntimeOptions } from '../src/driver.ts';
import { DATA_BUFFER_BYTES } from '../src/syscall-rpc.ts';
import { createKernel, KernelError } from '@secure-exec/kernel';
import type {
  RuntimeDriver,
  KernelInterface,
  ProcessContext,
  DriverProcess,
  Kernel,
} from '@secure-exec/kernel';
import { ERRNO_MAP } from '../src/wasi-constants.ts';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_BINARY_PATH = resolve(__dirname, '../../../../wasmvm/target/wasm32-wasip1/release/multicall.wasm');
const hasWasmBinary = existsSync(WASM_BINARY_PATH);

// Minimal in-memory VFS for kernel tests (same pattern as kernel test helpers)
class SimpleVFS {
  private files = new Map<string, Uint8Array>();
  private dirs = new Set<string>(['/']);

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
  async symlink(_target: string, _linkPath: string) {}
  async readlink(_path: string): Promise<string> { return ''; }
  async lstat(path: string) { return this.stat(path); }
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

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('WasmVM RuntimeDriver', () => {
  // Guard: WASM binary must be available in CI — prevents silent test skips
  if (process.env.CI) {
    it('WASM binary is available in CI', () => {
      expect(hasWasmBinary, `WASM binary not found at ${WASM_BINARY_PATH} — CI must build it before tests`).toBe(true);
    });
  }

  describe('factory', () => {
    it('createWasmVmRuntime returns a RuntimeDriver', () => {
      const driver = createWasmVmRuntime();
      expect(driver).toBeDefined();
      expect(driver.name).toBe('wasmvm');
      expect(typeof driver.init).toBe('function');
      expect(typeof driver.spawn).toBe('function');
      expect(typeof driver.dispose).toBe('function');
    });

    it('driver.name is "wasmvm"', () => {
      const driver = createWasmVmRuntime();
      expect(driver.name).toBe('wasmvm');
    });

    it('driver.commands contains 90+ commands', () => {
      const driver = createWasmVmRuntime();
      expect(driver.commands.length).toBeGreaterThanOrEqual(90);
    });

    it('commands include shell commands', () => {
      const driver = createWasmVmRuntime();
      expect(driver.commands).toContain('sh');
      expect(driver.commands).toContain('bash');
    });

    it('commands include coreutils', () => {
      const driver = createWasmVmRuntime();
      expect(driver.commands).toContain('cat');
      expect(driver.commands).toContain('ls');
      expect(driver.commands).toContain('grep');
      expect(driver.commands).toContain('sed');
      expect(driver.commands).toContain('awk');
      expect(driver.commands).toContain('echo');
      expect(driver.commands).toContain('wc');
    });

    it('commands include text processing tools', () => {
      const driver = createWasmVmRuntime();
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
      // Verify the custom path is actually used by spawning with a bogus path
      // and checking the error references it
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

  describe('kernel integration', () => {
    let kernel: Kernel;
    let driver: RuntimeDriver;

    beforeEach(async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      driver = createWasmVmRuntime();
      await kernel.mount(driver);
    });

    afterEach(async () => {
      await kernel.dispose();
    });

    it('mounts to kernel successfully', () => {
      // If we got here without error, mount succeeded
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
      // Second dispose should not throw
      await kernel.dispose();
    });
  });

  describe('spawn', () => {
    let kernel: Kernel;
    let driver: RuntimeDriver;

    beforeEach(async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      driver = createWasmVmRuntime({ wasmBinaryPath: '/nonexistent/multicall.wasm' });
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
      // Worker fails because binary doesn't exist — exits 1 or 127
      expect(exitCode).toBeGreaterThan(0);
    });

    it('throws ENOENT for unknown commands', () => {
      expect(() => kernel.spawn('nonexistent-cmd', [])).toThrow(/ENOENT/);
    });
  });

  describe('driver lifecycle', () => {
    it('throws when spawning before init', () => {
      const driver = createWasmVmRuntime();
      const ctx: ProcessContext = {
        pid: 1, ppid: 0, env: {}, cwd: '/home/user',
        fds: { stdin: 0, stdout: 1, stderr: 2 },
        isTTY: { stdin: false, stdout: false, stderr: false },
      };
      expect(() => driver.spawn('echo', ['hello'], ctx)).toThrow(/not initialized/);
    });

    it('dispose without init does not throw', async () => {
      const driver = createWasmVmRuntime();
      await driver.dispose();
    });

    it('dispose after init cleans up', async () => {
      const driver = createWasmVmRuntime();
      // Mock KernelInterface
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);
      await driver.dispose();
    });
  });

  describe.skipIf(!hasWasmBinary)('real execution', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('exec echo hello returns stdout hello\\n', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH }));

      const result = await kernel.exec('echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello\n');
    });

    it('exec cat /dev/null exits 0', async () => {
      const vfs = new SimpleVFS();
      await vfs.writeFile('/dev/null', new Uint8Array(0));
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH }));

      const result = await kernel.exec('cat /dev/null');
      expect(result.exitCode).toBe(0);
    });

    it('exec false exits non-zero', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH }));

      const result = await kernel.exec('false');
      expect(result.exitCode).not.toBe(0);
    });
  });

  // Pre-existing: cat stdin pipe blocks because WASI polyfill's non-blocking
  // fd_read returns 0 bytes (which cat treats as "try again" instead of EOF).
  // Root cause: WASM cat binary doesn't interpret nread=0 as EOF.
  describe.skipIf(!hasWasmBinary)('stdin streaming', () => {
    it.todo('writeStdin to cat delivers data through kernel pipe');
  });

  describe.skipIf(!hasWasmBinary)('proc_spawn routing', () => {
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
      await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH }));

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
  });

  describe('SAB overflow protection', () => {
    it('DATA_BUFFER_BYTES is 1MB', () => {
      expect(DATA_BUFFER_BYTES).toBe(1024 * 1024);
    });
  });

  describe.skipIf(!hasWasmBinary)('SAB overflow handling', () => {
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
      await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH }));

      // dd with bs=2097152 requests a single fdRead >1MB — triggers SAB overflow guard
      const result = await kernel.exec('dd if=/large-file of=/dev/null bs=2097152 count=1');
      // EIO returned instead of silent truncation
      expect(result.exitCode).not.toBe(0);
    });

    it('pipe read/write FileDescriptions are freed after process exits', async () => {
      const vfs = new SimpleVFS();
      await vfs.writeFile('/small-file', 'hello');

      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH }));

      // Capture FD table count before spawning
      const fdMgr = (kernel as any).fdTableManager;
      const tableSizeBefore = fdMgr.size;

      // echo uses pipes (stdin/stdout wired between kernel and WasmVM)
      const result = await kernel.exec('echo done');
      expect(result.exitCode).toBe(0);

      // After process exits, its FD table (including pipe FDs) must be cleaned up
      expect(fdMgr.size).toBe(tableSizeBefore);
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
      // Error with code=ENOENT but message mentions EBADF — code wins
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
});
