/**
 * Tests for the Python RuntimeDriver.
 *
 * Verifies driver interface contract, kernel mounting, command
 * registration, entry point resolution, and kernelSpawn RPC routing.
 *
 * Tests that require Pyodide are skipped gracefully when pyodide
 * is not available.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createPythonRuntime } from '../src/driver.ts';
import type { PythonRuntimeOptions } from '../src/driver.ts';
import { createKernel } from '@secure-exec/kernel';
import type {
  RuntimeDriver,
  KernelInterface,
  ProcessContext,
  DriverProcess,
  Kernel,
} from '@secure-exec/kernel';

// Check if pyodide is available for integration tests
let pyodideAvailable = false;
try {
  await import('pyodide');
  pyodideAvailable = true;
} catch {
  // pyodide not installed — skip integration tests
}

/**
 * Minimal mock RuntimeDriver for testing cross-runtime dispatch.
 */
class MockRuntimeDriver implements RuntimeDriver {
  name = 'mock';
  commands: string[];
  spawnCalls: { command: string; args: string[] }[] = [];
  private _configs: Record<string, { exitCode?: number; stdout?: string; stderr?: string }>;

  constructor(commands: string[], configs: Record<string, { exitCode?: number; stdout?: string; stderr?: string }> = {}) {
    this.commands = commands;
    this._configs = configs;
  }

  async init(_kernel: KernelInterface): Promise<void> {}

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    this.spawnCalls.push({ command, args });
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

// Minimal in-memory VFS for kernel tests
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
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      this.dirs.add('/' + parts.slice(0, i).join('/'));
    }
  }
  async createDir(path: string) { this.dirs.add(path); }
  async mkdir(path: string) { this.dirs.add(path); }
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

describe('Python RuntimeDriver', () => {
  describe('factory', () => {
    it('createPythonRuntime returns a RuntimeDriver', () => {
      const driver = createPythonRuntime();
      expect(driver).toBeDefined();
      expect(driver.name).toBe('python');
      expect(typeof driver.init).toBe('function');
      expect(typeof driver.spawn).toBe('function');
      expect(typeof driver.dispose).toBe('function');
    });

    it('driver.name is "python"', () => {
      const driver = createPythonRuntime();
      expect(driver.name).toBe('python');
    });

    it('driver.commands contains python, python3, pip', () => {
      const driver = createPythonRuntime();
      expect(driver.commands).toContain('python');
      expect(driver.commands).toContain('python3');
      expect(driver.commands).toContain('pip');
    });

    it('accepts custom cpuTimeLimitMs', () => {
      // Verify option is stored on the driver instance
      const driver = createPythonRuntime({ cpuTimeLimitMs: 5000 });
      expect((driver as any)._cpuTimeLimitMs).toBe(5000);
    });

    it('cpuTimeLimitMs defaults to undefined', () => {
      const driver = createPythonRuntime();
      expect((driver as any)._cpuTimeLimitMs).toBeUndefined();
    });
  });

  describe('driver lifecycle', () => {
    it('throws when spawning before init', () => {
      const driver = createPythonRuntime();
      const ctx: ProcessContext = {
        pid: 1, ppid: 0, env: {}, cwd: '/home/user',
        fds: { stdin: 0, stdout: 1, stderr: 2 },
        isTTY: { stdin: false, stdout: false, stderr: false },
      };
      expect(() => driver.spawn('python', ['-c', 'pass'], ctx)).toThrow(/not initialized/);
    });

    it('dispose without init does not throw', async () => {
      const driver = createPythonRuntime();
      await driver.dispose();
    });

    it('dispose after init cleans up', async () => {
      const driver = createPythonRuntime();
      const mockKernel: Partial<KernelInterface> = {};
      await driver.init(mockKernel as KernelInterface);
      await driver.dispose();
    });
  });

  describe('kernel mounting', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('mounts to kernel and registers commands', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      const driver = createPythonRuntime();
      await kernel.mount(driver);

      expect(kernel.commands.get('python')).toBe('python');
      expect(kernel.commands.get('python3')).toBe('python');
      expect(kernel.commands.get('pip')).toBe('python');
    });
  });

  describe.skipIf(!pyodideAvailable)('kernel integration (pyodide)', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('python -c executes inline code and exits 0', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const proc = kernel.spawn('python', ['-c', 'print("hello from python")']);
      const code = await proc.wait();
      expect(code).toBe(0);
    }, 30_000);

    it('python -c captures stdout', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const chunks: Uint8Array[] = [];
      const proc = kernel.spawn('python', ['-c', 'print("hello")'], {
        onStdout: (data) => chunks.push(data),
      });
      await proc.wait();

      const output = chunks.map(c => new TextDecoder().decode(c)).join('');
      expect(output).toContain('hello');
    }, 30_000);

    it('python -c with error exits non-zero', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const proc = kernel.spawn('python', ['-c', 'raise ValueError("boom")']);
      const code = await proc.wait();
      expect(code).not.toBe(0);
    }, 30_000);

    it('python script reads from VFS', async () => {
      const vfs = new SimpleVFS();
      await vfs.writeFile('/app/hello.py', 'print("from vfs")');
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const chunks: Uint8Array[] = [];
      const proc = kernel.spawn('python', ['/app/hello.py'], {
        onStdout: (data) => chunks.push(data),
      });
      const code = await proc.wait();
      expect(code).toBe(0);

      const output = chunks.map(c => new TextDecoder().decode(c)).join('');
      expect(output).toContain('from vfs');
    }, 30_000);

    it('python with missing file exits non-zero', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const errChunks: Uint8Array[] = [];
      const proc = kernel.spawn('python', ['/nonexistent.py'], {
        onStderr: (data) => errChunks.push(data),
      });
      const code = await proc.wait();
      expect(code).not.toBe(0);

      const stderr = errChunks.map(c => new TextDecoder().decode(c)).join('');
      expect(stderr).toContain('No such file');
    }, 30_000);

    it('python3 is alias for python', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const chunks: Uint8Array[] = [];
      const proc = kernel.spawn('python3', ['-c', 'print("py3")'], {
        onStdout: (data) => chunks.push(data),
      });
      const code = await proc.wait();
      expect(code).toBe(0);

      const output = chunks.map(c => new TextDecoder().decode(c)).join('');
      expect(output).toContain('py3');
    }, 30_000);

    it('pip command exits non-zero with unsupported error', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const errChunks: Uint8Array[] = [];
      const proc = kernel.spawn('pip', ['install', 'requests'], {
        onStderr: (data) => errChunks.push(data),
      });
      const code = await proc.wait();
      expect(code).not.toBe(0);

      const stderr = errChunks.map(c => new TextDecoder().decode(c)).join('');
      expect(stderr).toContain('not supported');
    }, 30_000);

    it('python with no args exits non-zero', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const proc = kernel.spawn('python', []);
      const code = await proc.wait();
      expect(code).not.toBe(0);
    }, 30_000);

    it('dispose cleans up worker', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      const driver = createPythonRuntime();
      await kernel.mount(driver);

      await kernel.dispose();
      // Double dispose is safe
      await kernel.dispose();
    }, 30_000);
  });

  describe.skipIf(!pyodideAvailable)('kernelSpawn RPC', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('os.system routes through kernel to other drivers', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });

      // Mount a mock driver for 'sh' command
      const mockDriver = new MockRuntimeDriver(['sh'], {
        sh: { exitCode: 0 },
      });
      await kernel.mount(mockDriver);
      await kernel.mount(createPythonRuntime());

      const proc = kernel.spawn('python', ['-c', `
import os
rc = os.system('echo hello')
print(f"exit code: {rc}")
`]);
      const code = await proc.wait();
      expect(code).toBe(0);

      // Verify the mock driver received the spawn call
      expect(mockDriver.spawnCalls.length).toBeGreaterThan(0);
      expect(mockDriver.spawnCalls[0].command).toBe('sh');
      expect(mockDriver.spawnCalls[0].args).toContain('-c');
    }, 30_000);

    it('subprocess.run routes through kernel', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });

      const mockDriver = new MockRuntimeDriver(['echo'], {
        echo: { exitCode: 0 },
      });
      await kernel.mount(mockDriver);
      await kernel.mount(createPythonRuntime());

      const proc = kernel.spawn('python', ['-c', `
import subprocess
result = subprocess.run(['echo', 'hello'])
print(f"returncode: {result.returncode}")
`]);
      const code = await proc.wait();
      expect(code).toBe(0);

      expect(mockDriver.spawnCalls.length).toBeGreaterThan(0);
      expect(mockDriver.spawnCalls[0].command).toBe('echo');
    }, 30_000);
  });

  describe.skipIf(!pyodideAvailable)('exploit/abuse paths', () => {
    let kernel: Kernel;

    afterEach(async () => {
      await kernel?.dispose();
    });

    it('cannot access host filesystem via Python os module', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const errChunks: Uint8Array[] = [];
      const outChunks: Uint8Array[] = [];
      const proc = kernel.spawn('python', ['-c', `
import os
try:
    files = os.listdir('/etc')
    print('SECURITY_BREACH')
except Exception as e:
    print(f'blocked: {e}')
`], {
        onStdout: (data) => outChunks.push(data),
        onStderr: (data) => errChunks.push(data),
      });
      await proc.wait();

      const stdout = outChunks.map(c => new TextDecoder().decode(c)).join('');
      // Pyodide runs in WASM sandbox — should not access host filesystem
      expect(stdout).not.toContain('SECURITY_BREACH');
      // Positive assertion: the exception handler ran and printed the block message
      expect(stdout).toContain('blocked:');
    }, 30_000);

    it('SystemExit is caught and returns exit code', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });
      await kernel.mount(createPythonRuntime());

      const proc = kernel.spawn('python', ['-c', 'import sys; sys.exit(42)']);
      const code = await proc.wait();
      expect(typeof code).toBe('number');
      expect(code).not.toBe(0);
    }, 30_000);

    it('infinite loop in subprocess does not hang if mock returns', async () => {
      const vfs = new SimpleVFS();
      kernel = createKernel({ filesystem: vfs as any });

      // Mock that returns immediately
      const mockDriver = new MockRuntimeDriver(['sh'], {
        sh: { exitCode: 1 },
      });
      await kernel.mount(mockDriver);
      await kernel.mount(createPythonRuntime());

      const proc = kernel.spawn('python', ['-c', `
import os
rc = os.system('sh -c "false"')
print(f"rc={rc}")
`]);
      const code = await proc.wait();
      // Should complete without hanging
      expect(typeof code).toBe('number');
    }, 30_000);
  });
});
