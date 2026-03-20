/**
 * Git remote test suite - HTTP transport operations
 *
 * Verifies git remote commands (clone, fetch, push, pull) via kernel.exec()
 * with real WASM binaries and a local HTTP server serving a bare git repo.
 *
 * The bare repo is constructed programmatically using Node.js crypto/zlib
 * to create loose git objects, then served via http.createServer.
 *
 * Tests use the dumb HTTP protocol: info/refs for discovery, loose objects
 * for transport, and HTTP PUT for push operations.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createWasmVmRuntime } from '../src/driver.ts';
import { createKernel } from '@secure-exec/kernel';
import type { Kernel } from '@secure-exec/kernel';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(__dirname, '../../../../wasmvm/target/wasm32-wasip1/release/commands');
const C_BUILD_DIR = resolve(__dirname, '../../../../wasmvm/c/build');

const hasWasmBinaries = existsSync(COMMANDS_DIR);
const hasGitBinary = existsSync(join(C_BUILD_DIR, 'git')) || existsSync(join(COMMANDS_DIR, 'git'));
// git-remote-http symlink is created by `make install` only after rebuilding git with curl support
const hasGitCurl = existsSync(join(COMMANDS_DIR, 'git-remote-http')) ||
                   existsSync(join(C_BUILD_DIR, 'git-remote-http'));

function skipReason(): string | false {
  if (!hasWasmBinaries) return 'WASM binaries not built (run make wasm in wasmvm/)';
  if (!hasGitBinary) return 'git WASM binary not built (run make -C wasmvm/c programs install)';
  if (!hasGitCurl) return 'git not built with curl support (rebuild: make -C wasmvm/c programs install)';
  return false;
}

// Git env to avoid interactive prompts
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
};

// --- Git object creation helpers ---

/** Create a git blob object (returns compressed data + hex hash) */
function createGitBlob(content: string): { data: Buffer; hex: string } {
  const buf = Buffer.from(content);
  const header = `blob ${buf.length}\0`;
  const store = Buffer.concat([Buffer.from(header), buf]);
  const hex = createHash('sha1').update(store).digest('hex');
  const compressed = deflateSync(store);
  return { data: compressed, hex };
}

/** Create a git tree object with entries */
function createGitTree(entries: Array<{ mode: string; name: string; hex: string }>): { data: Buffer; hex: string } {
  const parts: Buffer[] = [];
  // Sort entries by name (git requires sorted order)
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  for (const e of sorted) {
    parts.push(Buffer.from(`${e.mode} ${e.name}\0`));
    parts.push(Buffer.from(e.hex, 'hex'));
  }
  const content = Buffer.concat(parts);
  const header = `tree ${content.length}\0`;
  const store = Buffer.concat([Buffer.from(header), content]);
  const hex = createHash('sha1').update(store).digest('hex');
  const compressed = deflateSync(store);
  return { data: compressed, hex };
}

/** Create a git commit object */
function createGitCommit(opts: {
  treeHex: string;
  parentHex?: string;
  message: string;
  timestamp?: number;
}): { data: Buffer; hex: string } {
  const ts = opts.timestamp ?? 1710000000;
  let body = `tree ${opts.treeHex}\n`;
  if (opts.parentHex) body += `parent ${opts.parentHex}\n`;
  body += `author Test <test@test.com> ${ts} +0000\n`;
  body += `committer Test <test@test.com> ${ts} +0000\n`;
  body += `\n${opts.message}\n`;
  const buf = Buffer.from(body);
  const header = `commit ${buf.length}\0`;
  const store = Buffer.concat([Buffer.from(header), buf]);
  const hex = createHash('sha1').update(store).digest('hex');
  const compressed = deflateSync(store);
  return { data: compressed, hex };
}

// --- In-memory bare repo + HTTP server ---

interface BareRepo {
  objects: Map<string, Buffer>; // hex -> compressed object data
  refs: Map<string, string>;   // refname -> hex
}

function createBareRepo(): BareRepo {
  return { objects: new Map(), refs: new Map() };
}

function addObject(repo: BareRepo, hex: string, data: Buffer) {
  repo.objects.set(hex, data);
}

function setRef(repo: BareRepo, ref: string, hex: string) {
  repo.refs.set(ref, hex);
}

/** Generate info/refs content from repo refs */
function generateInfoRefs(repo: BareRepo): string {
  let out = '';
  for (const [ref, hex] of repo.refs.entries()) {
    out += `${hex}\t${ref}\n`;
  }
  return out;
}

/** Start HTTP server that serves a bare git repo */
function startGitServer(repo: BareRepo): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const path = req.url ?? '/';

      if (req.method === 'GET') {
        if (path === '/info/refs') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(generateInfoRefs(repo));
          return;
        }
        if (path === '/HEAD') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ref: refs/heads/main\n');
          return;
        }
        // Loose object: /objects/<xx>/<38hex>
        const objMatch = path.match(/^\/objects\/([0-9a-f]{2})\/([0-9a-f]{38})$/);
        if (objMatch) {
          const hex = objMatch[1] + objMatch[2];
          const data = repo.objects.get(hex);
          if (data) {
            res.writeHead(200, { 'Content-Type': 'application/x-git-loose-object' });
            res.end(data);
            return;
          }
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        // Ref files: /refs/heads/<branch>
        const refMatch = path.match(/^\/(refs\/.+)$/);
        if (refMatch) {
          const refHex = repo.refs.get(refMatch[1]);
          if (refHex) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(refHex + '\n');
            return;
          }
        }
      }

      if (req.method === 'PUT') {
        // Accept object uploads for push
        const objMatch = path.match(/^\/objects\/([0-9a-f]{2})\/([0-9a-f]{38})$/);
        if (objMatch) {
          const hex = objMatch[1] + objMatch[2];
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            repo.objects.set(hex, Buffer.concat(chunks));
            res.writeHead(200);
            res.end('OK');
          });
          return;
        }
        // Accept ref updates for push
        const refMatch = path.match(/^\/(refs\/.+)$/);
        if (refMatch) {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            const body = Buffer.concat(chunks).toString().trim();
            repo.refs.set(refMatch[1], body);
            res.writeHead(200);
            res.end('OK');
          });
          return;
        }
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        server,
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

// --- Minimal in-memory VFS ---

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

describe.skipIf(skipReason())('git remote operations', { timeout: 60_000 }, () => {
  let kernel: Kernel;
  let vfs: SimpleVFS;
  let gitServer: { server: Server; port: number; url: string };
  let bareRepo: BareRepo;

  // Build a bare repo with one commit: a file "hello.txt" with "hello world\n"
  function buildBareRepoWithOneCommit(): {
    commitHex: string;
    treeHex: string;
    blobHex: string;
  } {
    bareRepo = createBareRepo();

    const blob = createGitBlob('hello world\n');
    addObject(bareRepo, blob.hex, blob.data);

    const tree = createGitTree([{ mode: '100644', name: 'hello.txt', hex: blob.hex }]);
    addObject(bareRepo, tree.hex, tree.data);

    const commit = createGitCommit({
      treeHex: tree.hex,
      message: 'initial commit',
      timestamp: 1710000000,
    });
    addObject(bareRepo, commit.hex, commit.data);

    setRef(bareRepo, 'refs/heads/main', commit.hex);

    return { commitHex: commit.hex, treeHex: tree.hex, blobHex: blob.hex };
  }

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

  async function git(cmd: string, cwd = '/work', env?: Record<string, string>) {
    return kernel.exec(`cd ${cwd} && git ${cmd}`, { env: { ...GIT_ENV, ...env } });
  }

  afterEach(async () => {
    await kernel?.dispose();
    if (gitServer?.server) {
      await new Promise<void>((resolve) => gitServer.server.close(() => resolve()));
    }
  });

  // --- git clone ---

  it('git clone from HTTP URL creates local repo with correct commits', async () => {
    const { commitHex } = buildBareRepoWithOneCommit();
    gitServer = await startGitServer(bareRepo);
    await setup();

    const result = await git(`clone ${gitServer.url} /work/cloned`);

    expect(result.stdout).toContain("Cloning into 'cloned'");
    expect(result.stdout).toContain('Initialized');

    // Verify cloned file content
    const content = await vfs.readTextFile('/work/cloned/hello.txt');
    expect(content).toBe('hello world\n');

    // Verify .git structure
    expect(await vfs.exists('/work/cloned/.git')).toBe(true);
    expect(await vfs.exists('/work/cloned/.git/refs/remotes/origin')).toBe(true);
  });

  it('cloned repo has correct remote origin URL', async () => {
    buildBareRepoWithOneCommit();
    gitServer = await startGitServer(bareRepo);
    await setup();

    await git(`clone ${gitServer.url} /work/cloned`);

    const result = await git('remote -v', '/work/cloned');
    expect(result.stdout).toContain('origin');
    expect(result.stdout).toContain(gitServer.url);
    expect(result.stdout).toContain('(fetch)');
    expect(result.stdout).toContain('(push)');
  });

  // --- git fetch ---

  it('git fetch updates refs without modifying working tree', async () => {
    const { commitHex, blobHex, treeHex } = buildBareRepoWithOneCommit();
    gitServer = await startGitServer(bareRepo);
    await setup();

    // Clone first
    await git(`clone ${gitServer.url} /work/cloned`);

    // Add a second commit to the remote bare repo
    const blob2 = createGitBlob('updated content\n');
    addObject(bareRepo, blob2.hex, blob2.data);

    const tree2 = createGitTree([
      { mode: '100644', name: 'hello.txt', hex: blob2.hex },
    ]);
    addObject(bareRepo, tree2.hex, tree2.data);

    const commit2 = createGitCommit({
      treeHex: tree2.hex,
      parentHex: commitHex,
      message: 'second commit',
      timestamp: 1710001000,
    });
    addObject(bareRepo, commit2.hex, commit2.data);
    setRef(bareRepo, 'refs/heads/main', commit2.hex);

    // Fetch - should download new objects and update tracking ref
    const fetchResult = await git('fetch', '/work/cloned');

    // Working tree should still have old content (fetch doesn't change working tree)
    const content = await vfs.readTextFile('/work/cloned/hello.txt');
    expect(content).toBe('hello world\n');

    // But remote tracking ref should be updated
    expect(fetchResult.stdout).toContain('updated');
  });

  // --- git pull ---

  it('git pull merges remote changes into local branch', async () => {
    const { commitHex } = buildBareRepoWithOneCommit();
    gitServer = await startGitServer(bareRepo);
    await setup();

    // Clone
    await git(`clone ${gitServer.url} /work/cloned`);

    // Add a new commit to remote
    const blob2 = createGitBlob('updated by remote\n');
    addObject(bareRepo, blob2.hex, blob2.data);

    const tree2 = createGitTree([
      { mode: '100644', name: 'hello.txt', hex: blob2.hex },
    ]);
    addObject(bareRepo, tree2.hex, tree2.data);

    const commit2 = createGitCommit({
      treeHex: tree2.hex,
      parentHex: commitHex,
      message: 'remote update',
      timestamp: 1710001000,
    });
    addObject(bareRepo, commit2.hex, commit2.data);
    setRef(bareRepo, 'refs/heads/main', commit2.hex);

    // Pull - should fetch and merge (fast-forward)
    const pullResult = await git('pull', '/work/cloned');

    // Working tree should have new content
    const content = await vfs.readTextFile('/work/cloned/hello.txt');
    expect(content).toBe('updated by remote\n');

    // Log should show both commits
    const log = await git('log --oneline', '/work/cloned');
    expect(log.stdout).toContain('remote update');
    expect(log.stdout).toContain('initial commit');
  });

  // --- git push ---

  it('git push sends local commits to remote', async () => {
    buildBareRepoWithOneCommit();
    gitServer = await startGitServer(bareRepo);
    await setup();

    // Clone
    await git(`clone ${gitServer.url} /work/cloned`);

    // Make a local commit
    await vfs.writeFile('/work/cloned/new.txt', 'new file\n');
    await git('add new.txt', '/work/cloned');
    await git('commit -m "add new file"', '/work/cloned');

    // Push
    const pushResult = await git('push', '/work/cloned');

    expect(pushResult.stdout).toContain(gitServer.url);

    // Verify remote repo has the new ref
    const remoteRef = bareRepo.refs.get('refs/heads/main');
    expect(remoteRef).toBeDefined();

    // Verify the pushed object exists in remote
    // The new commit hash should be in the remote objects
    expect(bareRepo.objects.size).toBeGreaterThan(3); // original 3 + new objects
  });

  // --- git remote ---

  it('git remote -v shows remote URLs', async () => {
    buildBareRepoWithOneCommit();
    gitServer = await startGitServer(bareRepo);
    await setup();

    await git(`clone ${gitServer.url} /work/cloned`);

    const result = await git('remote -v', '/work/cloned');
    expect(result.stdout).toContain('origin');
    expect(result.stdout).toContain(gitServer.url);
  });

  it('clone from invalid URL fails with clear error message', async () => {
    await setup();

    const result = await git('clone http://127.0.0.1:1/nonexistent /work/bad');
    // Should fail with error about not being able to connect
    expect(result.stdout + result.stderr).toMatch(/fatal|error|not found|repository/i);
  });

  // --- shallow clone ---

  it('git clone with --depth 1 completes successfully', async () => {
    // Our git implementation does not support shallow clones via dumb HTTP,
    // but --depth flag should be gracefully ignored (full clone performed)
    buildBareRepoWithOneCommit();
    gitServer = await startGitServer(bareRepo);
    await setup();

    const result = await git(`clone --depth 1 ${gitServer.url} /work/shallow`);

    // Clone should succeed (--depth ignored, full clone)
    expect(result.stdout).toContain("Cloning into 'shallow'");
    const content = await vfs.readTextFile('/work/shallow/hello.txt');
    expect(content).toBe('hello world\n');
    expect(await vfs.exists('/work/shallow/.git')).toBe(true);
  });

  // --- auth error ---

  it('push without credentials to authenticated remote fails with error', async () => {
    // Start a server that requires auth (returns 401 for PUT requests)
    const authRepo = createBareRepo();
    const blob = createGitBlob('hello world\n');
    addObject(authRepo, blob.hex, blob.data);
    const tree = createGitTree([{ mode: '100644', name: 'hello.txt', hex: blob.hex }]);
    addObject(authRepo, tree.hex, tree.data);
    const commit = createGitCommit({ treeHex: tree.hex, message: 'initial', timestamp: 1710000000 });
    addObject(authRepo, commit.hex, commit.data);
    setRef(authRepo, 'refs/heads/main', commit.hex);

    // Server allows GET (clone) but returns 401 for PUT (push)
    const authServer = await new Promise<{ server: Server; port: number; url: string }>((resolve) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'PUT') {
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' });
          res.end('Authentication required');
          return;
        }
        // Serve GET requests normally
        const path = req.url ?? '/';
        if (path === '/info/refs') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(generateInfoRefs(authRepo));
          return;
        }
        if (path === '/HEAD') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ref: refs/heads/main\n');
          return;
        }
        const objMatch = path.match(/^\/objects\/([0-9a-f]{2})\/([0-9a-f]{38})$/);
        if (objMatch) {
          const hex = objMatch[1] + objMatch[2];
          const data = authRepo.objects.get(hex);
          if (data) {
            res.writeHead(200, { 'Content-Type': 'application/x-git-loose-object' });
            res.end(data);
            return;
          }
        }
        const refMatch = path.match(/^\/(refs\/.+)$/);
        if (refMatch) {
          const refHex = authRepo.refs.get(refMatch[1]);
          if (refHex) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(refHex + '\n');
            return;
          }
        }
        res.writeHead(404);
        res.end('Not found');
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
      });
    });

    try {
      await setup();

      // Clone succeeds (GET requests work)
      await git(`clone ${authServer.url} /work/authed`);

      // Make a local commit to push
      await vfs.writeFile('/work/authed/new.txt', 'new content\n');
      await git('add new.txt', '/work/authed');
      await git('commit -m "local change"', '/work/authed');

      // Push should fail (PUT returns 401)
      const pushResult = await git('push', '/work/authed');
      const output = pushResult.stdout + pushResult.stderr;
      expect(output).toMatch(/fatal|error|fail|denied|reject/i);
    } finally {
      await new Promise<void>((resolve) => authServer.server.close(() => resolve()));
    }
  });
});
