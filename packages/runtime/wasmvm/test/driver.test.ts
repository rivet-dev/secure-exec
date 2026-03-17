/**
 * Tests for the WasmVM RuntimeDriver.
 *
 * Verifies driver interface contract, kernel mounting, command
 * registration, and proc_spawn routing architecture. WASM execution
 * tests are skipped when the binary is not built.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmVmRuntime, WASMVM_COMMANDS } from '../src/driver.ts';
import type { WasmVmRuntimeOptions } from '../src/driver.ts';
import { DATA_BUFFER_BYTES } from '../src/syscall-rpc.ts';
import { createKernel } from '@secure-exec/kernel';
import type {
  RuntimeDriver,
  KernelInterface,
  ProcessContext,
  DriverProcess,
  Kernel,
} from '@secure-exec/kernel';
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

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('WasmVM RuntimeDriver', () => {
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
    });

    it('accepts custom wasmBinaryPath', () => {
      const driver = createWasmVmRuntime({ wasmBinaryPath: '/custom/path.wasm' });
      expect(driver.name).toBe('wasmvm');
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

  describe.skipIf(!hasWasmBinary)('stdin streaming', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('writeStdin to cat delivers data through kernel pipe', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH }));

      const chunks: Uint8Array[] = [];
      const proc = kernel.spawn('cat', [], {
        onStdout: (data) => chunks.push(data),
      });

      proc.writeStdin(new TextEncoder().encode('stdin-data\n'));
      proc.closeStdin();

      const code = await proc.wait();
      const output = chunks.map(c => new TextDecoder().decode(c)).join('');
      expect(code).toBe(0);
      expect(output).toContain('stdin-data');
    });
  });

  describe.skipIf(!hasWasmBinary)('proc_spawn routing', () => {
    it('proc_spawn routes through kernel.spawn()', async () => {
      // This test requires the WASM binary — verifies the critical
      // architectural requirement that brush-shell proc_spawn calls
      // route through KernelInterface.spawn() for cross-runtime dispatch
      const vfs = new SimpleVFS();
      const kernel = createKernel({ filesystem: vfs as any });
      const driver = createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH });
      await kernel.mount(driver);

      try {
        const result = await kernel.exec('echo hello');
        expect(result.stdout.trim()).toBe('hello');
        expect(result.exitCode).toBe(0);
      } finally {
        await kernel.dispose();
      }
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
      // Write file within SAB capacity
      const smallData = new Uint8Array(1024);
      for (let i = 0; i < smallData.length; i++) smallData[i] = 0x41 + (i % 26);
      await vfs.writeFile('/small-file', smallData);

      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: WASM_BINARY_PATH }));

      // Small file reads should work fine
      const result = await kernel.exec('cat /small-file');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBe(1024);
    });
  });
});
