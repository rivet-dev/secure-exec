/**
 * C parity tests — native vs WASM
 *
 * Compiles C test fixtures to both native and WASM, runs both, and
 * compares stdout/stderr/exit code for parity. Tests skip when
 * WASM binaries (make wasm), C WASM binaries (make -C wasmvm/c programs),
 * or native binaries (make -C wasmvm/c native) are not built.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmVmRuntime } from '../src/driver.ts';
import { createKernel } from '@secure-exec/kernel';
import type { Kernel } from '@secure-exec/kernel';
import { existsSync } from 'node:fs';
import { writeFile as fsWriteFile, readFile as fsReadFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(__dirname, '../../../../wasmvm/target/wasm32-wasip1/release/commands');
const C_BUILD_DIR = resolve(__dirname, '../../../../wasmvm/c/build');
const NATIVE_DIR = resolve(__dirname, '../../../../wasmvm/c/build/native');

const hasWasmBinaries = existsSync(COMMANDS_DIR);
const hasCWasmBinaries = existsSync(join(C_BUILD_DIR, 'hello'));
const hasNativeBinaries = existsSync(join(NATIVE_DIR, 'hello'));

function skipReason(): string | false {
  if (!hasWasmBinaries) return 'WASM binaries not built (run make wasm in wasmvm/)';
  if (!hasCWasmBinaries) return 'C WASM binaries not built (run make -C wasmvm/c programs)';
  if (!hasNativeBinaries) return 'C native binaries not built (run make -C wasmvm/c native)';
  return false;
}

// Run a native binary, capture stdout/stderr/exitCode
function runNative(
  name: string,
  args: string[] = [],
  options?: { input?: string; env?: Record<string, string> },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    const proc = spawn(join(NATIVE_DIR, name), args, {
      env: options?.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    if (options?.input !== undefined) {
      proc.stdin.write(options.input);
    }
    proc.stdin.end();

    proc.on('close', (code) => {
      res({ exitCode: code ?? 0, stdout, stderr });
    });
  });
}

// Normalize argv[0] line since native path differs from WASM command name
function normalizeArgsOutput(output: string): string {
  return output.replace(/^(argv\[0\]=).+$/m, '$1<program>');
}

// Extract lines matching a prefix from env output
function extractEnvPrefix(output: string, prefix: string): string {
  return output
    .split('\n')
    .filter((l) => l.startsWith(prefix))
    .sort()
    .join('\n');
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
    return (await this.readDir(path)).map((name) => ({
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
  async chmod() {}
  async rename(from: string, to: string) {
    const data = this.files.get(from);
    if (data) { this.files.set(to, data); this.files.delete(from); }
  }
  async unlink(path: string) { this.files.delete(path); }
  async rmdir(path: string) { this.dirs.delete(path); }
  async symlink() {}
  async readlink() { return ''; }
}

describe.skipIf(skipReason())('C parity: native vs WASM', { timeout: 30_000 }, () => {
  let kernel: Kernel;
  let vfs: SimpleVFS;

  beforeEach(async () => {
    vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    // C build dir first so C programs take precedence over same-named Rust commands
    await kernel.mount(createWasmVmRuntime({ commandDirs: [C_BUILD_DIR, COMMANDS_DIR] }));
  });

  afterEach(async () => {
    await kernel?.dispose();
  });

  // --- Tier 1: basic I/O ---

  it('hello: stdout and exit code match', async () => {
    const native = await runNative('hello');
    const wasm = await kernel.exec('hello');

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);
  });

  it('args: argc and argv[1..] match', async () => {
    const native = await runNative('args', ['foo', 'bar']);
    const wasm = await kernel.exec('args foo bar');

    expect(wasm.exitCode).toBe(native.exitCode);
    // argv[0] differs (native path vs WASM command name), normalize it
    expect(normalizeArgsOutput(wasm.stdout)).toBe(normalizeArgsOutput(native.stdout));
  });

  it('env: user-specified env vars match', async () => {
    const env = { TEST_PARITY_A: 'hello', TEST_PARITY_B: 'world' };
    const native = await runNative('env', [], { env });
    const wasm = await kernel.exec('env', { env });

    expect(wasm.exitCode).toBe(native.exitCode);
    // Shell may inject extra env vars; compare only the TEST_PARITY_ vars
    expect(extractEnvPrefix(wasm.stdout, 'TEST_PARITY_')).toBe(
      extractEnvPrefix(native.stdout, 'TEST_PARITY_'),
    );
  });

  it('exitcode: exit code matches', async () => {
    const native = await runNative('exitcode', ['42']);
    const wasm = await kernel.exec('exitcode 42');

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.exitCode).toBe(42);
  });

  it('cat: stdin passthrough matches', async () => {
    const input = 'hello world\nfoo bar\n';
    const native = await runNative('cat', [], { input });
    const wasm = await kernel.exec('cat', { stdin: input });

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);
  });

  // --- Tier 1: data processing ---

  it('wc: word/line/byte counts match', async () => {
    const input = 'hello world\nfoo bar baz\n';
    const native = await runNative('wc', [], { input });
    const wasm = await kernel.exec('wc', { stdin: input });

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);
  });

  it('fread: file contents match', async () => {
    const content = 'hello from fread test\n';

    // Native: temp file on disk
    const tmpDir = await mkdtemp(join(tmpdir(), 'c-parity-'));
    const filePath = join(tmpDir, 'test.txt');
    await fsWriteFile(filePath, content);
    const native = await runNative('fread', [filePath]);

    // WASM: file on VFS
    await vfs.writeFile('/tmp/test.txt', content);
    const wasm = await kernel.exec('fread /tmp/test.txt');

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);

    await rm(tmpDir, { recursive: true });
  });

  it('fwrite: written content matches', async () => {
    const writeContent = 'test content';

    // Native: write to temp dir
    const tmpDir = await mkdtemp(join(tmpdir(), 'c-parity-'));
    const nativePath = join(tmpDir, 'out.txt');
    const native = await runNative('fwrite', [nativePath, writeContent]);
    const nativeFileContent = await fsReadFile(nativePath, 'utf8');

    // WASM: write to VFS
    const wasm = await kernel.exec(`fwrite /tmp/out.txt "${writeContent}"`);
    const wasmFileContent = await vfs.readTextFile('/tmp/out.txt');

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasmFileContent).toBe(nativeFileContent);

    await rm(tmpDir, { recursive: true });
  });

  it('sort: sorted output matches', async () => {
    const input = 'banana\napple\ncherry\ndate\n';
    const native = await runNative('sort', [], { input });
    const wasm = await kernel.exec('sort', { stdin: input });

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);
  });

  it('sha256: hex digest matches', async () => {
    const input = 'hello';
    const native = await runNative('sha256', [], { input });
    const wasm = await kernel.exec('sha256', { stdin: input });

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);
  });

  // --- Tier 2: custom imports (patched sysroot) ---

  const hasCTier2Binaries = existsSync(join(C_BUILD_DIR, 'pipe_test'));
  const tier2Skip = !hasCTier2Binaries
    ? 'C Tier 2 WASM binaries not built (need patched sysroot: make -C wasmvm/c sysroot && make -C wasmvm/c programs)'
    : false;

  it.skipIf(tier2Skip)('isatty_test: piped stdin/stdout/stderr all report not-a-tty', async () => {
    const native = await runNative('isatty_test');
    const wasm = await kernel.exec('isatty_test');

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);
  });

  it.skipIf(tier2Skip)('getpid_test: PID is valid and not hardcoded 42', async () => {
    const native = await runNative('getpid_test');
    const wasm = await kernel.exec('getpid_test');

    expect(wasm.exitCode).toBe(native.exitCode);
    // PIDs differ between native and WASM, but both should be valid
    expect(wasm.stdout).toContain('pid_positive=yes');
    expect(wasm.stdout).toContain('pid_not_42=yes');
    expect(native.stdout).toContain('pid_positive=yes');
    expect(native.stdout).toContain('pid_not_42=yes');
  });

  it.skipIf(tier2Skip)('userinfo: uid/gid/euid/egid format matches', async () => {
    const native = await runNative('userinfo');
    const wasm = await kernel.exec('userinfo');

    expect(wasm.exitCode).toBe(native.exitCode);
    // Values may differ (native user vs WASM kernel), verify format
    const format = /^uid=\d+\ngid=\d+\neuid=\d+\negid=\d+\n$/;
    expect(wasm.stdout).toMatch(format);
    expect(native.stdout).toMatch(format);
  });

  it.skipIf(tier2Skip)('pipe_test: write through pipe and read back matches', async () => {
    const native = await runNative('pipe_test');
    const wasm = await kernel.exec('pipe_test');

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);
  });

  it.skipIf(tier2Skip)('dup_test: write through duplicated fds matches', async () => {
    const native = await runNative('dup_test');
    const wasm = await kernel.exec('dup_test');

    expect(wasm.exitCode).toBe(native.exitCode);
    expect(wasm.stdout).toBe(native.stdout);
  });

  it.skipIf(tier2Skip)('sleep_test: nanosleep completes successfully', async () => {
    const native = await runNative('sleep_test', ['50']);
    const wasm = await kernel.exec('sleep_test 50');

    expect(wasm.exitCode).toBe(native.exitCode);
    // Both should report successful sleep with >= 80% of requested time
    expect(wasm.stdout).toContain('requested=50ms');
    expect(wasm.stdout).toContain('ok=yes');
    expect(native.stdout).toContain('requested=50ms');
    expect(native.stdout).toContain('ok=yes');
  });
});
