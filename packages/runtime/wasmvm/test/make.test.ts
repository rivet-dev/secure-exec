/**
 * Integration tests for make C command.
 *
 * Verifies POSIX make operations via kernel.exec() with real WASM binaries:
 *   - Simple targets with recipes
 *   - Variable expansion (VAR=value, $(VAR))
 *   - Automatic variables ($@, $<, $^)
 *   - Dependencies (prerequisite ordering)
 *   - .PHONY targets
 *   - Multiple targets
 *   - Recipe failure handling
 *   - -f flag for alternate Makefile path
 *
 * Note: kernel.exec() wraps commands in sh -c. Brush-shell currently returns
 * exit code 17 for all child commands. Tests verify stdout correctness.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createWasmVmRuntime } from '../src/driver.ts';
import { createKernel } from '@secure-exec/kernel';
import type { Kernel } from '@secure-exec/kernel';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(__dirname, '../../../../wasmvm/target/wasm32-wasip1/release/commands');
const hasWasmBinaries = existsSync(COMMANDS_DIR) &&
  existsSync(resolve(COMMANDS_DIR, 'make'));

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
  async mkdir(path: string, _options?: { recursive?: boolean }) {
    this.dirs.add(path);
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      this.dirs.add('/' + parts.slice(0, i).join('/'));
    }
  }
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
  async chmod(_path: string, _mode: number) {}
  async lstat(path: string) { return this.stat(path); }
  async removeFile(path: string) { this.files.delete(path); }
  async removeDir(path: string) { this.dirs.delete(path); }
  async rename(oldPath: string, newPath: string) {
    const data = this.files.get(oldPath);
    if (data) {
      this.files.set(newPath, data);
      this.files.delete(oldPath);
    }
  }
  async pread(path: string, buffer: Uint8Array, offset: number, length: number, position: number): Promise<number> {
    const data = this.files.get(path);
    if (!data) throw new Error(`ENOENT: ${path}`);
    const available = Math.min(length, data.length - position);
    if (available <= 0) return 0;
    buffer.set(data.subarray(position, position + available), offset);
    return available;
  }
}

describe.skipIf(!hasWasmBinaries)('make command', () => {
  let kernel: Kernel;

  afterEach(async () => {
    await kernel?.dispose();
  });

  it('executes simple Makefile with one target and recipe', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'all:',
      '\techo "hello from make"',
      '',
    ].join('\n'));
    await vfs.mkdir('/work');
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('hello from make');
  });

  it('expands variables in recipes', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'MSG = world',
      'all:',
      '\techo "hello $(MSG)"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('hello world');
  });

  it('supports automatic variable $@', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'output.txt:',
      '\techo "$@"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work output.txt');
    expect(result.stdout).toContain('output.txt');
  });

  it('supports automatic variables $< and $^', async () => {
    const vfs = new SimpleVFS();
    // Create prerequisite files so make sees them as up-to-date sources
    await vfs.writeFile('/work/a.txt', 'a');
    await vfs.writeFile('/work/b.txt', 'b');
    await vfs.writeFile('/work/Makefile', [
      'result: a.txt b.txt',
      '\techo "first: $<"',
      '\techo "all: $^"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work result');
    expect(result.stdout).toContain('first: a.txt');
    expect(result.stdout).toContain('all: a.txt b.txt');
  });

  it('builds dependencies before target', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'all: step1',
      '\techo "building all"',
      '',
      'step1:',
      '\techo "building step1"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    const lines = result.stdout.split('\n').filter(l => l.includes('building'));
    // step1 must appear before all
    const step1Idx = lines.findIndex(l => l.includes('building step1'));
    const allIdx = lines.findIndex(l => l.includes('building all'));
    expect(step1Idx).toBeLessThan(allIdx);
  });

  it('runs .PHONY target recipe', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      '.PHONY: clean',
      'clean:',
      '\techo "cleaning up"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work clean');
    expect(result.stdout).toContain('cleaning up');
  });

  it('builds multiple targets from all', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'all: target1 target2',
      '',
      'target1:',
      '\techo "built target1"',
      '',
      'target2:',
      '\techo "built target2"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('built target1');
    expect(result.stdout).toContain('built target2');
  });

  it('stops on recipe failure and reports error', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'all:',
      '\tfalse',
      '\techo "should not reach"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).not.toContain('should not reach');
    // make should report the error
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/error|Error|failed|Failed/i);
  });

  it('accepts -f flag to specify Makefile path', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/custom.mk', [
      'all:',
      '\techo "custom makefile"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work -f custom.mk');
    expect(result.stdout).toContain('custom makefile');
  });
});
