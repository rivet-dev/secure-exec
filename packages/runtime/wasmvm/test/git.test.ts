/**
 * Git local test suite - filesystem operations
 *
 * Verifies git's local commands via kernel.exec() with real WASM binaries:
 *   - init: creates .git/ structure
 *   - add: stages files
 *   - commit: creates commits with messages
 *   - status: shows working tree state
 *   - log: shows commit history
 *   - diff: shows unstaged changes
 *
 * Each test creates a clean VFS, runs git commands via kernel.exec(),
 * and verifies stdout/stderr/exit code. GIT_AUTHOR_NAME/EMAIL and
 * GIT_COMMITTER_NAME/EMAIL are set via env to avoid interactive prompts.
 *
 * Note: kernel.exec() wraps commands in sh -c. Tests verify stdout content.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmVmRuntime } from '../src/driver.ts';
import { createKernel } from '@secure-exec/kernel';
import type { Kernel } from '@secure-exec/kernel';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(__dirname, '../../../../wasmvm/target/wasm32-wasip1/release/commands');
const C_BUILD_DIR = resolve(__dirname, '../../../../wasmvm/c/build');

const hasWasmBinaries = existsSync(COMMANDS_DIR);
const hasGitBinary = existsSync(join(C_BUILD_DIR, 'git')) || existsSync(join(COMMANDS_DIR, 'git'));

function skipReason(): string | false {
  if (!hasWasmBinaries) return 'WASM binaries not built (run make wasm in wasmvm/)';
  if (!hasGitBinary) return 'git WASM binary not built (run make -C wasmvm/c programs install)';
  return false;
}

// Git env to avoid interactive prompts and ensure deterministic output
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
};

// Minimal in-memory VFS for kernel tests
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
  async pread(path: string, offset: number, length: number): Promise<Uint8Array> {
    const data = await this.readFile(path);
    return data.slice(offset, offset + length);
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
  async mkdir(path: string, _options?: { recursive?: boolean }) {
    this.dirs.add(path);
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      this.dirs.add('/' + parts.slice(0, i).join('/'));
    }
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path) || this.symlinks.has(path);
  }
  async stat(path: string) {
    const isDir = this.dirs.has(path);
    const isSymlink = this.symlinks.has(path);
    const data = this.files.get(path);
    if (!isDir && !isSymlink && !data) throw new Error(`ENOENT: ${path}`);
    return {
      mode: isSymlink ? 0o120777 : (isDir ? 0o40755 : 0o100644),
      size: data?.length ?? 0,
      isDirectory: isDir,
      isSymbolicLink: isSymlink,
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
  async lstat(path: string) { return this.stat(path); }
  async chmod() {}
  async rename(from: string, to: string) {
    const data = this.files.get(from);
    if (data) { this.files.set(to, data); this.files.delete(from); }
  }
  async unlink(path: string) { this.files.delete(path); this.symlinks.delete(path); }
  async rmdir(path: string) { this.dirs.delete(path); }
  async removeFile(path: string) { this.files.delete(path); }
  async removeDir(path: string) { this.dirs.delete(path); }
  async symlink(target: string, linkPath: string) {
    this.symlinks.set(linkPath, target);
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
}

describe.skipIf(skipReason())('git local operations', { timeout: 60_000 }, () => {
  let kernel: Kernel;
  let vfs: SimpleVFS;

  // Helper: create kernel+VFS with optional pre-populated files in /work
  async function setup(files?: Record<string, string>) {
    vfs = new SimpleVFS();
    await vfs.mkdir('/work');
    if (files) {
      for (const [path, content] of Object.entries(files)) {
        await vfs.writeFile(`/work/${path}`, content);
      }
    }
    kernel = createKernel({ filesystem: vfs as any });
    const commandDirs = [C_BUILD_DIR, COMMANDS_DIR].filter(existsSync);
    await kernel.mount(createWasmVmRuntime({ commandDirs }));
  }

  // Helper: run a git command in /work
  async function git(cmd: string, env?: Record<string, string>) {
    return kernel.exec(`cd /work && git ${cmd}`, { env: { ...GIT_ENV, ...env } });
  }

  afterEach(async () => {
    await kernel?.dispose();
  });

  // --- git init ---

  it('git init creates .git/ with objects/, refs/, HEAD', async () => {
    await setup();
    const result = await git('init');

    expect(result.stdout).toContain('Initialized');

    // Verify .git structure
    expect(await vfs.exists('/work/.git')).toBe(true);
    expect(await vfs.exists('/work/.git/objects')).toBe(true);
    expect(await vfs.exists('/work/.git/refs')).toBe(true);
    expect(await vfs.exists('/work/.git/HEAD')).toBe(true);

    const head = await vfs.readTextFile('/work/.git/HEAD');
    expect(head).toContain('ref: refs/heads/');
  });

  it('git init in existing repo is safe (reinitializes without data loss)', async () => {
    await setup();

    // First init
    await git('init');
    // Create a file and commit
    await vfs.writeFile('/work/file.txt', 'content');
    await git('add file.txt');
    await git('commit -m "initial"');

    // Capture state before reinit
    const headBefore = await vfs.readTextFile('/work/.git/HEAD');

    // Reinit
    const result = await git('init');
    expect(result.stdout).toContain('Reinitialized') ;

    // HEAD should still point to the same ref
    const headAfter = await vfs.readTextFile('/work/.git/HEAD');
    expect(headAfter).toBe(headBefore);

    // Previous commit should still be accessible
    const log = await git('log --oneline');
    expect(log.stdout).toContain('initial');
  });

  // --- git add ---

  it('git add file.txt stages file - git status shows new file', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello world\n');

    await git('add file.txt');
    const status = await git('status');

    expect(status.stdout).toContain('new file');
    expect(status.stdout).toContain('file.txt');
  });

  it('git add . stages all files in directory', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/a.txt', 'aaa\n');
    await vfs.writeFile('/work/b.txt', 'bbb\n');
    await vfs.writeFile('/work/sub/c.txt', 'ccc\n');

    await git('add .');
    const status = await git('status');

    expect(status.stdout).toContain('a.txt');
    expect(status.stdout).toContain('b.txt');
    expect(status.stdout).toContain('c.txt');
  });

  // --- git commit ---

  it('git commit -m creates commit - git log shows commit with message', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello\n');
    await git('add file.txt');

    const commit = await git('commit -m "first commit"');
    expect(commit.stdout).toContain('first commit');

    const log = await git('log');
    expect(log.stdout).toContain('first commit');
    expect(log.stdout).toContain('Author: Test <test@test.com>');
  });

  it('git commit with no staged changes fails with appropriate error', async () => {
    await setup();
    await git('init');

    const result = await git('commit -m "nothing"');
    // Should fail — nothing staged
    expect(result.stdout + result.stderr).toMatch(/nothing to commit|no changes/i);
  });

  // --- git status ---

  it('git status with no changes shows clean working tree', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello\n');
    await git('add file.txt');
    await git('commit -m "initial"');

    const status = await git('status');
    expect(status.stdout).toMatch(/nothing to commit|working tree clean/i);
  });

  // --- git diff ---

  it('git diff shows unstaged changes', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'line one\n');
    await git('add file.txt');
    await git('commit -m "initial"');

    // Modify file
    await vfs.writeFile('/work/file.txt', 'line one\nline two\n');

    const diff = await git('diff');
    expect(diff.stdout).toContain('line two');
    // Should show + for additions
    expect(diff.stdout).toMatch(/\+.*line two/);
  });

  // --- git log ---

  it('git log --oneline shows abbreviated format', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello\n');
    await git('add file.txt');
    await git('commit -m "initial commit"');

    const log = await git('log --oneline');
    // --oneline: short hash + message on one line
    expect(log.stdout).toContain('initial commit');
    // Should not have full Author/Date headers
    expect(log.stdout).not.toContain('Author:');
  });

  it('multiple commits - git log shows all in reverse chronological order', async () => {
    await setup();
    await git('init');

    await vfs.writeFile('/work/file.txt', 'v1\n');
    await git('add file.txt');
    await git('commit -m "commit one"');

    await vfs.writeFile('/work/file.txt', 'v2\n');
    await git('add file.txt');
    await git('commit -m "commit two"');

    await vfs.writeFile('/work/file.txt', 'v3\n');
    await git('add file.txt');
    await git('commit -m "commit three"');

    const log = await git('log --oneline');
    const lines = log.stdout.trim().split('\n').filter(Boolean);

    // Should have 3 commits
    expect(lines.length).toBeGreaterThanOrEqual(3);

    // Reverse chronological: three before two before one
    const threeIdx = lines.findIndex(l => l.includes('commit three'));
    const twoIdx = lines.findIndex(l => l.includes('commit two'));
    const oneIdx = lines.findIndex(l => l.includes('commit one'));

    expect(threeIdx).toBeLessThan(twoIdx);
    expect(twoIdx).toBeLessThan(oneIdx);
  });

  // --- git branch ---

  it('git branch creates branch - git branch lists it', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello\n');
    await git('add .');
    await git('commit -m "initial"');

    await git('branch feature');

    const branches = await git('branch');
    expect(branches.stdout).toContain('feature');
    expect(branches.stdout).toContain('main');
    expect(branches.stdout).toMatch(/\* main/);
  });

  // --- git checkout ---

  it('git checkout switches branch - git status shows correct branch', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello\n');
    await git('add .');
    await git('commit -m "initial"');

    await git('branch feature');
    await git('checkout feature');

    const status = await git('status');
    expect(status.stdout).toContain('On branch feature');
  });

  it('git checkout -b creates and switches in one command', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello\n');
    await git('add .');
    await git('commit -m "initial"');

    const result = await git('checkout -b newbranch');
    expect(result.stdout).toContain("Switched to a new branch 'newbranch'");

    const status = await git('status');
    expect(status.stdout).toContain('On branch newbranch');
  });

  // --- git merge (fast-forward) ---

  it('fast-forward merge succeeds', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello\n');
    await git('add .');
    await git('commit -m "initial"');

    await git('checkout -b feature');
    await vfs.writeFile('/work/feature.txt', 'feature work\n');
    await git('add .');
    await git('commit -m "feature commit"');

    await git('checkout main');
    const merge = await git('merge feature');
    expect(merge.stdout).toContain('Fast-forward');

    const content = await vfs.readTextFile('/work/feature.txt');
    expect(content).toBe('feature work\n');

    const log = await git('log --oneline');
    expect(log.stdout).toContain('feature commit');
  });

  // --- git merge (three-way, no conflict) ---

  it('three-way merge with no conflicts', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/base.txt', 'base content\n');
    await git('add .');
    await git('commit -m "initial"');

    await git('checkout -b feature');
    await vfs.writeFile('/work/feature.txt', 'feature work\n');
    await git('add .');
    await git('commit -m "feature commit"');

    await git('checkout main');
    await vfs.writeFile('/work/main.txt', 'main work\n');
    await git('add .');
    await git('commit -m "main commit"');

    const merge = await git('merge feature');
    expect(merge.stdout).toContain('Merge made by');

    const featureContent = await vfs.readTextFile('/work/feature.txt');
    expect(featureContent).toBe('feature work\n');
    const mainContent = await vfs.readTextFile('/work/main.txt');
    expect(mainContent).toBe('main work\n');
    const baseContent = await vfs.readTextFile('/work/base.txt');
    expect(baseContent).toBe('base content\n');
  });

  // --- git merge (conflict) ---

  it('merge conflict produces correct conflict markers', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'base content\n');
    await git('add .');
    await git('commit -m "initial"');

    await git('checkout -b feature');
    await vfs.writeFile('/work/file.txt', 'feature version\n');
    await git('add .');
    await git('commit -m "feature change"');

    await git('checkout main');
    await vfs.writeFile('/work/file.txt', 'main version\n');
    await git('add .');
    await git('commit -m "main change"');

    const merge = await git('merge feature');
    expect(merge.stderr).toContain('CONFLICT');

    const content = await vfs.readTextFile('/work/file.txt');
    expect(content).toContain('<<<<<<< HEAD');
    expect(content).toContain('=======');
    expect(content).toContain('>>>>>>> feature');
    expect(content).toContain('main version');
    expect(content).toContain('feature version');
  });

  // --- git tag ---

  it('git tag creates tag - git tag lists it', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'hello\n');
    await git('add .');
    await git('commit -m "v1 release"');

    await git('tag v1.0');

    const tags = await git('tag');
    expect(tags.stdout).toContain('v1.0');
  });

  // --- git log --all --graph ---

  it('git log --all --graph shows branch structure', async () => {
    await setup();
    await git('init');
    await vfs.writeFile('/work/file.txt', 'initial\n');
    await git('add .');
    await git('commit -m "initial"');

    await git('branch feature');
    await git('checkout feature');
    await vfs.writeFile('/work/feature.txt', 'feature\n');
    await git('add .');
    await git('commit -m "feature work"');

    await git('checkout main');
    await vfs.writeFile('/work/main.txt', 'main\n');
    await git('add .');
    await git('commit -m "main work"');

    const log = await git('log --all --graph --oneline');

    expect(log.stdout).toContain('initial');
    expect(log.stdout).toContain('feature work');
    expect(log.stdout).toContain('main work');
    expect(log.stdout).toContain('*');
  });
});
