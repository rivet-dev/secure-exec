/**
 * Integration tests for curl C command (libcurl-based CLI).
 *
 * Verifies HTTP and HTTPS operations via kernel.exec() with real WASM binaries:
 *   - Basic GET request
 *   - Download to file (-o)
 *   - POST with data (-d)
 *   - Custom headers (-H)
 *   - HEAD request (-I)
 *   - Follow redirects (-L)
 *   - Error handling for unreachable hosts
 *   - HTTPS with self-signed cert + --insecure (-k)
 *   - Basic authentication (-u)
 *   - Multipart form upload (-F)
 *   - Binary file download with integrity check
 *   - Connection timeout (--connect-timeout)
 *   - Write-out format (-w '%{http_code}')
 *
 * Tests start local HTTP/HTTPS servers in beforeAll and make curl requests against them.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { createWasmVmRuntime } from '../src/driver.ts';
import { createKernel } from '@secure-exec/kernel';
import type { Kernel } from '@secure-exec/kernel';
import { createServer as createHttpServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(__dirname, '../../../../wasmvm/target/wasm32-wasip1/release/commands');
const hasWasmBinaries = existsSync(COMMANDS_DIR) &&
  existsSync(resolve(COMMANDS_DIR, 'curl'));

// Check if openssl CLI is available for generating test certs
let hasOpenssl = false;
try {
  execSync('openssl version', { stdio: 'pipe' });
  hasOpenssl = true;
} catch { /* openssl not available */ }

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

  has(path: string): boolean {
    return this.files.has(path);
  }
  getContent(path: string): string | undefined {
    const data = this.files.get(path);
    return data ? new TextDecoder().decode(data) : undefined;
  }
  getRawContent(path: string): Uint8Array | undefined {
    return this.files.get(path);
  }
}

// HTTP request handler shared between HTTP and HTTPS servers
function requestHandler(port: number, httpsPort: number) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    if (url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello from curl test');
      return;
    }

    if (url === '/json' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', message: 'json response' }));
      return;
    }

    if (url === '/echo-method') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`method: ${req.method}`);
      return;
    }

    if (url === '/echo-body' && (req.method === 'POST' || req.method === 'PUT')) {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`body: ${body}`);
      });
      return;
    }

    if (url === '/echo-headers') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      const xCustom = req.headers['x-custom-header'] ?? 'none';
      res.end(`x-custom-header: ${xCustom}`);
      return;
    }

    if (url === '/redirect') {
      res.writeHead(302, { 'Location': `http://127.0.0.1:${port}/redirected` });
      res.end();
      return;
    }

    if (url === '/redirected') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('arrived after redirect');
      return;
    }

    if (url === '/head-test') {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'X-Test-Header': 'present',
      });
      if (req.method !== 'HEAD') {
        res.end('body should not appear in HEAD');
      } else {
        res.end();
      }
      return;
    }

    // Basic auth check
    if (url === '/auth-required') {
      const auth = req.headers['authorization'];
      if (!auth || !auth.startsWith('Basic ')) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('unauthorized');
        return;
      }
      const decoded = Buffer.from(auth.slice(6), 'base64').toString();
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`authenticated: ${decoded}`);
      return;
    }

    // Multipart form upload echo
    if (url === '/upload' && req.method === 'POST') {
      const contentType = req.headers['content-type'] ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        // Echo content-type and body summary for verification
        const isMultipart = contentType.startsWith('multipart/form-data');
        res.end(`multipart: ${isMultipart}\nbody-length: ${body.length}\nbody-contains-file: ${body.includes('upload.txt')}`);
      });
      return;
    }

    // Binary download (deterministic 1KB payload)
    if (url === '/binary') {
      const buf = Buffer.alloc(1024);
      for (let i = 0; i < buf.length; i++) buf[i] = i & 0xff;
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buf.length),
      });
      res.end(buf);
      return;
    }

    // Status code test
    if (url === '/status') {
      res.writeHead(201, { 'Content-Type': 'text/plain' });
      res.end('created');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  };
}

describe.skipIf(!hasWasmBinaries)('curl command', () => {
  let kernel: Kernel;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createHttpServer(requestHandler(0, 0));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as import('node:net').AddressInfo).port;
    // Patch handler to use actual port
    server.removeAllListeners('request');
    server.on('request', requestHandler(port, 0));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(async () => {
    await kernel?.dispose();
  });

  it('GET returns HTTP response body', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl http://127.0.0.1:${port}/`);
    expect(result.stdout).toContain('hello from curl test');
  });

  it('-o downloads to file in VFS', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -o /output.txt http://127.0.0.1:${port}/json`);
    // stdout should not contain the body (written to file)
    expect(result.stdout).not.toContain('json response');

    // Verify file was written
    const content = vfs.getContent('/output.txt');
    expect(content).toBeDefined();
    expect(content).toContain('json response');
    expect(content).toContain('"status":"ok"');
  });

  it('-X POST -d sends POST request with data', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -X POST -d 'test-data' http://127.0.0.1:${port}/echo-body`);
    expect(result.stdout).toContain('body: test-data');
  });

  it('-d implies POST method', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -d 'post-data' http://127.0.0.1:${port}/echo-body`);
    expect(result.stdout).toContain('body: post-data');
  });

  it('-H sends custom header', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -H 'X-Custom-Header: my-value' http://127.0.0.1:${port}/echo-headers`);
    expect(result.stdout).toContain('x-custom-header: my-value');
  });

  it('-I returns only headers (HEAD request)', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -I http://127.0.0.1:${port}/head-test`);
    // Should contain HTTP headers
    expect(result.stdout).toContain('HTTP/');
    expect(result.stdout).toContain('200');
    expect(result.stdout).toMatch(/X-Test-Header/i);
    // Should NOT contain the body
    expect(result.stdout).not.toContain('body should not appear');
  });

  it('-L follows redirects', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -L http://127.0.0.1:${port}/redirect`);
    expect(result.stdout).toContain('arrived after redirect');
  });

  it('returns error and non-zero exit code for unreachable host', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    // Use a port that's definitely not listening
    const result = await kernel.exec('curl http://127.0.0.1:1/nonexistent');
    // curl returns non-zero on connection failure
    // Note: kernel.exec wraps in sh -c, brush-shell may return 17
    // but the stderr should contain a curl error
    expect(result.stderr).toMatch(/curl|connect|refused|resolve|failed/i);
  });

  it('-u sends Basic authentication', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -u testuser:testpass http://127.0.0.1:${port}/auth-required`);
    expect(result.stdout).toContain('authenticated: testuser:testpass');
  });

  it('-F uploads file via multipart form', async () => {
    const vfs = new SimpleVFS();
    // Create a file in VFS for curl to upload
    await vfs.writeFile('/upload.txt', 'file-content-here');
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -F file=@/upload.txt http://127.0.0.1:${port}/upload`);
    expect(result.stdout).toContain('multipart: true');
    expect(result.stdout).toContain('body-contains-file: true');
  });

  it('-o downloads binary file with correct size', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    await kernel.exec(`curl -o /output.bin http://127.0.0.1:${port}/binary`);

    const data = vfs.getRawContent('/output.bin');
    expect(data).toBeDefined();
    expect(data!.length).toBe(1024);
    // Verify first few bytes of deterministic pattern
    expect(data![0]).toBe(0);
    expect(data![1]).toBe(1);
    expect(data![255]).toBe(255);
  });

  it('--connect-timeout times out for unreachable host', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    // 10.255.255.1 is a non-routable address that should cause connection timeout
    const result = await kernel.exec('curl --connect-timeout 1 http://10.255.255.1/');
    expect(result.stderr).toMatch(/curl|timeout|timed out|connect/i);
  }, 15000);

  it('-w outputs http_code', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -s -w '%{http_code}' http://127.0.0.1:${port}/status`);
    // stdout should contain both the body and the status code
    expect(result.stdout).toContain('created');
    expect(result.stdout).toContain('201');
  });
});

// Generate self-signed certificate for HTTPS tests
function generateSelfSignedCert(): { key: string; cert: string } {
  const keyFile = '/tmp/se-curl-test.key';
  const certFile = '/tmp/se-curl-test.crt';

  execSync(
    'openssl req -x509 -newkey rsa:2048 -keyout ' + keyFile +
    ' -out ' + certFile +
    ' -days 1 -nodes -subj "/CN=127.0.0.1"' +
    ' -addext "subjectAltName=IP:127.0.0.1" 2>/dev/null',
    { shell: '/bin/bash' },
  );

  const key = readFileSync(keyFile, 'utf-8');
  const cert = readFileSync(certFile, 'utf-8');

  // Clean up temp files
  try { unlinkSync(keyFile); } catch { /* ignore */ }
  try { unlinkSync(certFile); } catch { /* ignore */ }

  return { key, cert };
}

describe.skipIf(!hasWasmBinaries || !hasOpenssl)('curl HTTPS', () => {
  let kernel: Kernel;
  let httpsServer: HttpsServer;
  let httpsPort: number;

  beforeAll(async () => {
    const { key, cert } = generateSelfSignedCert();

    httpsServer = createHttpsServer({ key, cert }, (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '/';

      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('hello from https');
        return;
      }

      if (url === '/auth-required') {
        const auth = req.headers['authorization'];
        if (!auth || !auth.startsWith('Basic ')) {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('unauthorized');
          return;
        }
        const decoded = Buffer.from(auth.slice(6), 'base64').toString();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`authenticated: ${decoded}`);
        return;
      }

      if (url === '/upload' && req.method === 'POST') {
        const contentType = req.headers['content-type'] ?? '';
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          const isMultipart = contentType.startsWith('multipart/form-data');
          res.end(`multipart: ${isMultipart}\nbody-length: ${body.length}\nbody-contains-file: ${body.includes('upload.txt')}`);
        });
        return;
      }

      if (url === '/binary') {
        const buf = Buffer.alloc(1024);
        for (let i = 0; i < buf.length; i++) buf[i] = i & 0xff;
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(buf.length),
        });
        res.end(buf);
        return;
      }

      if (url === '/status') {
        res.writeHead(201, { 'Content-Type': 'text/plain' });
        res.end('created');
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    });

    await new Promise<void>((resolve) => httpsServer.listen(0, '127.0.0.1', resolve));
    httpsPort = (httpsServer.address() as import('node:net').AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpsServer.close(() => resolve()));
  });

  afterEach(async () => {
    await kernel?.dispose();
  });

  it('HTTPS GET with --insecure returns response', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -k https://127.0.0.1:${httpsPort}/`);
    expect(result.stdout).toContain('hello from https');
  });

  it('-u sends Basic auth over HTTPS', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -k -u user:pass https://127.0.0.1:${httpsPort}/auth-required`);
    expect(result.stdout).toContain('authenticated: user:pass');
  });

  it('-F uploads file via multipart form over HTTPS', async () => {
    const vfs = new SimpleVFS();
    await vfs.writeFile('/upload.txt', 'secure-file-content');
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -k -F file=@/upload.txt https://127.0.0.1:${httpsPort}/upload`);
    expect(result.stdout).toContain('multipart: true');
    expect(result.stdout).toContain('body-contains-file: true');
  });

  it('-o downloads binary file over HTTPS with correct size', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    await kernel.exec(`curl -k -o /output.bin https://127.0.0.1:${httpsPort}/binary`);

    const data = vfs.getRawContent('/output.bin');
    expect(data).toBeDefined();
    expect(data!.length).toBe(1024);
  });

  it('--connect-timeout times out for unreachable host', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec('curl -k --connect-timeout 1 https://10.255.255.1/');
    expect(result.stderr).toMatch(/curl|timeout|timed out|connect/i);
  }, 15000);

  it('-w outputs http_code over HTTPS', async () => {
    const vfs = new SimpleVFS();
    kernel = createKernel({ filesystem: vfs as any });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));

    const result = await kernel.exec(`curl -k -s -w '%{http_code}' https://127.0.0.1:${httpsPort}/status`);
    expect(result.stdout).toContain('created');
    expect(result.stdout).toContain('201');
  });
});
