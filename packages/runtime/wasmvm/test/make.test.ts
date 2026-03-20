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

/**
 * Advanced make tests covering:
 *   - Pattern rules (%.o: %.c)
 *   - Include directive
 *   - Conditionals (ifeq/ifneq/ifdef/ifndef)
 *   - $(shell ...) function
 *   - $(wildcard ...) function
 *   - Multi-line recipes
 *   - Recursive make (make -C subdir)
 *   - Silent recipes (@echo)
 */
describe.skipIf(!hasWasmBinaries)('make advanced features', () => {
  let kernel: Kernel;

  afterEach(async () => {
    await kernel?.dispose();
  });

  it('supports pattern rules (%.o: %.c)', async () => {
    const vfs = new SimpleVFS();
    // Create a source file so the pattern rule prerequisite is satisfied
    await vfs.writeFile('/work/main.c', 'int main() { return 0; }\n');
    await vfs.writeFile('/work/Makefile', [
      'all: main.o',
      '',
      '%.o: %.c',
      '\techo "compiling $< to $@"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('compiling main.c to main.o');
  });

  it('supports include directive', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/config.mk', [
      'MSG = from included file',
      '',
    ].join('\n'));
    await vfs.writeFile('/work/Makefile', [
      'include config.mk',
      '',
      'all:',
      '\techo "$(MSG)"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('from included file');
  });

  it('supports ifeq conditional', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'MODE = debug',
      '',
      'all:',
      'ifeq ($(MODE),debug)',
      '\techo "debug mode"',
      'else',
      '\techo "release mode"',
      'endif',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('debug mode');
    expect(result.stdout).not.toContain('release mode');
  });

  it('supports ifneq conditional', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'MODE = release',
      '',
      'all:',
      'ifneq ($(MODE),debug)',
      '\techo "not debug"',
      'else',
      '\techo "is debug"',
      'endif',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('not debug');
    expect(result.stdout).not.toContain('is debug');
  });

  it('supports ifdef/ifndef conditionals', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'DEFINED_VAR = yes',
      '',
      'all:',
      'ifdef DEFINED_VAR',
      '\techo "var is defined"',
      'endif',
      'ifndef UNDEFINED_VAR',
      '\techo "var is not defined"',
      'endif',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('var is defined');
    expect(result.stdout).toContain('var is not defined');
  });

  it('supports $(shell ...) function', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'GREETING = $(shell echo hello-from-shell)',
      '',
      'all:',
      '\techo "$(GREETING)"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('hello-from-shell');
  });

  it('supports $(wildcard ...) function', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/foo.c', 'int foo() {}\n');
    await vfs.writeFile('/work/bar.c', 'int bar() {}\n');
    await vfs.writeFile('/work/Makefile', [
      'SRCS = $(wildcard *.c)',
      '',
      'all:',
      '\techo "sources: $(SRCS)"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    // Both .c files should appear (order may vary)
    expect(result.stdout).toContain('foo.c');
    expect(result.stdout).toContain('bar.c');
  });

  it('executes multi-line recipes', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'all:',
      '\techo "line one"',
      '\techo "line two"',
      '\techo "line three"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('line one');
    expect(result.stdout).toContain('line two');
    expect(result.stdout).toContain('line three');
  });

  it('supports recursive make (make -C subdir)', async () => {
    const vfs = new SimpleVFS();
    await vfs.mkdir('/work/subdir');
    await vfs.writeFile('/work/subdir/Makefile', [
      'all:',
      '\techo "built in subdir"',
      '',
    ].join('\n'));
    await vfs.writeFile('/work/Makefile', [
      'all:',
      '\t$(MAKE) -C subdir',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    expect(result.stdout).toContain('built in subdir');
  });

  it('suppresses command echo with @ prefix', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/work/Makefile', [
      'all:',
      '\t@echo "silent output"',
      '',
    ].join('\n'));
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('make -C /work');
    // With @, make should NOT echo the command itself, only the output
    expect(result.stdout).toContain('silent output');
    // The recipe command 'echo "silent output"' should not be printed by make
    // (without @, make prints both the command and its output)
    const lines = result.stdout.split('\n').filter(l => l.includes('silent output'));
    // Only one line should contain "silent output" (the actual echo output)
    // If @ works, make won't print the command line itself
    expect(lines.length).toBe(1);
  });
});
