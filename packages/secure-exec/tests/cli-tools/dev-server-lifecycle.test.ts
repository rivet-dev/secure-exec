/**
 * E2E test: dev server lifecycle through the sandbox's child_process and
 * network bridges.
 *
 * Verifies the full start → verify → kill flow:
 *   1. Sandbox JS spawns a Node HTTP server via child_process.spawn bridge
 *   2. Server starts listening on a pre-assigned port
 *   3. Sandbox JS makes HTTP requests to the server via fetch (network bridge)
 *   4. Sandbox JS kills the server via child_process bridge kill()
 *   5. Server exits cleanly within 5 seconds
 *
 * Uses NodeFileSystem (no root mapping) so the child_process bridge forwards
 * the actual host cwd to the spawned node process.
 *
 * The port is discovered on the host first (bind port 0, read assigned port,
 * close), then passed to both the server script and the network adapter's
 * initialExemptPorts to bypass SSRF protection for loopback requests.
 */

import { createServer } from 'node:http';
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NodeFileSystem,
  allowAll,
  createDefaultNetworkAdapter,
  createNodeDriver,
} from '../../src/index.js';
import type { CommandExecutor, SpawnedProcess } from '../../src/types.js';
import { createTestNodeRuntime } from '../test-utils.js';

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function findNodeBinary(): string | null {
  try {
    require('node:child_process').execSync('node --version', {
      stdio: 'ignore',
    });
    return 'node';
  } catch {
    return null;
  }
}

const nodeBinary = findNodeBinary();
const skipReason = nodeBinary ? false : 'node binary not found';

// ---------------------------------------------------------------------------
// Port allocation — find a free port on the host
// ---------------------------------------------------------------------------

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('could not get port'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Stdio capture helper
// ---------------------------------------------------------------------------

type CapturedEvent = {
  channel: 'stdout' | 'stderr';
  message: string;
};

function createStdioCapture() {
  const events: CapturedEvent[] = [];
  return {
    events,
    onStdio: (event: CapturedEvent) => events.push(event),
    stdout: () =>
      events
        .filter((e) => e.channel === 'stdout')
        .map((e) => e.message)
        .join('\n'),
    stderr: () =>
      events
        .filter((e) => e.channel === 'stderr')
        .map((e) => e.message)
        .join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Host command executor for child_process bridge
// ---------------------------------------------------------------------------

function createHostCommandExecutor(): CommandExecutor {
  return {
    spawn(
      command: string,
      args: string[],
      options: {
        cwd?: string;
        env?: Record<string, string>;
        onStdout?: (data: Uint8Array) => void;
        onStderr?: (data: Uint8Array) => void;
      },
    ): SpawnedProcess {
      const child = nodeSpawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (options.onStdout)
        child.stdout.on('data', (d: Buffer) =>
          options.onStdout!(new Uint8Array(d)),
        );
      if (options.onStderr)
        child.stderr.on('data', (d: Buffer) =>
          options.onStderr!(new Uint8Array(d)),
        );
      return {
        writeStdin(data: Uint8Array | string) {
          child.stdin.write(data);
        },
        closeStdin() {
          child.stdin.end();
        },
        kill(signal?: number) {
          child.kill(signal);
        },
        wait(): Promise<number> {
          return new Promise((resolve) =>
            child.on('close', (code) => resolve(code ?? 1)),
          );
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Sandbox runtime factory
// ---------------------------------------------------------------------------

function createDevServerSandboxRuntime(opts: {
  onStdio: (event: CapturedEvent) => void;
  cwd: string;
  exemptPort: number;
}) {
  return createTestNodeRuntime({
    driver: createNodeDriver({
      filesystem: new NodeFileSystem(),
      commandExecutor: createHostCommandExecutor(),
      networkAdapter: createDefaultNetworkAdapter({
        initialExemptPorts: new Set([opts.exemptPort]),
      }),
      permissions: allowAll,
      processConfig: {
        cwd: opts.cwd,
        env: {
          PATH: process.env.PATH ?? '/usr/bin',
          HOME: process.env.HOME ?? tmpdir(),
        },
      },
    }),
    onStdio: opts.onStdio,
  });
}

// ---------------------------------------------------------------------------
// Server script generators (port passed as argument)
// ---------------------------------------------------------------------------

function serverScript(port: number): string {
  return `
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else if (req.url === '/echo') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('echo:' + body);
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hello from dev server');
  }
});

server.listen(${port}, '127.0.0.1', () => {
  console.log('LISTENING:' + ${port});
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
`;
}

function unresponsiveServerScript(port: number): string {
  return `
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hello from dev server');
  }
});

server.listen(${port}, '127.0.0.1', () => {
  console.log('LISTENING:' + ${port});
});

// Ignore SIGTERM — only SIGKILL will stop this
process.on('SIGTERM', () => {
  // intentionally ignored
});
`;
}

// ---------------------------------------------------------------------------
// Sandbox code builders
// ---------------------------------------------------------------------------

/**
 * Build sandbox code that spawns a dev server, verifies it via HTTP,
 * kills it, and reports results on stdout.
 * process.exit() at top-level await, not inside bridge callbacks.
 */
function buildLifecycleCode(opts: {
  cwd: string;
  scriptName: string;
  port: number;
  killSignal?: string;
  killTimeout?: number;
}): string {
  const killSignal = opts.killSignal ?? 'SIGTERM';
  const killTimeout = opts.killTimeout ?? 5000;

  return `(async () => {
    const { spawn } = require('child_process');
    const child = spawn('node', [${JSON.stringify(opts.scriptName)}], {
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '/tmp',
      },
      cwd: ${JSON.stringify(opts.cwd)},
    });

    child.stdin.end();

    // Collect stderr for diagnostics
    let stderrBuf = '';
    child.stderr.on('data', (d) => { stderrBuf += String(d); });

    // Wait for LISTENING:PORT on stdout
    await new Promise((resolve, reject) => {
      let buf = '';
      child.stdout.on('data', (d) => {
        buf += String(d);
        if (buf.includes('LISTENING:')) resolve();
      });
      setTimeout(() => reject(new Error('server did not start within 10s')), 10000);
    });

    process.stdout.write('SERVER_STARTED:${opts.port}\\n');

    // Verify server responds via fetch (through the network bridge)
    const resp = await fetch('http://127.0.0.1:${opts.port}/health');
    const body = await resp.json();
    process.stdout.write('HEALTH_STATUS:' + resp.status + '\\n');
    process.stdout.write('HEALTH_BODY:' + JSON.stringify(body) + '\\n');

    // Verify root path
    const rootResp = await fetch('http://127.0.0.1:${opts.port}/');
    const rootText = await rootResp.text();
    process.stdout.write('ROOT_STATUS:' + rootResp.status + '\\n');
    process.stdout.write('ROOT_BODY:' + rootText + '\\n');

    // Kill the server
    child.kill(${JSON.stringify(killSignal)});

    // Wait for exit with timeout
    const exitCode = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve('timeout');
      }, ${killTimeout});

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    process.stdout.write('EXIT_CODE:' + exitCode + '\\n');
    if (stderrBuf.length > 0) {
      process.stderr.write(stderrBuf);
    }
  })()`;
}

/**
 * Build sandbox code that spawns a server, makes multiple requests,
 * then kills it.
 */
function buildMultiRequestCode(opts: { cwd: string; port: number }): string {
  return `(async () => {
    const { spawn } = require('child_process');
    const child = spawn('node', ['server.js'], {
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '/tmp',
      },
      cwd: ${JSON.stringify(opts.cwd)},
    });

    child.stdin.end();
    child.stderr.on('data', () => {});

    // Wait for LISTENING
    await new Promise((resolve, reject) => {
      let buf = '';
      child.stdout.on('data', (d) => {
        buf += String(d);
        if (buf.includes('LISTENING:')) resolve();
      });
      setTimeout(() => reject(new Error('server did not start')), 10000);
    });

    // Make 3 sequential requests
    for (let i = 0; i < 3; i++) {
      const resp = await fetch('http://127.0.0.1:${opts.port}/health');
      const body = await resp.json();
      process.stdout.write('REQ' + i + ':' + body.status + '\\n');
    }

    // Kill and wait
    child.kill('SIGTERM');
    const exitCode = await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve('timeout'); }, 5000);
      child.on('close', (code) => { clearTimeout(timer); resolve(code); });
    });

    process.stdout.write('EXIT_CODE:' + exitCode + '\\n');
  })()`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let workDir: string;

describe.skipIf(skipReason)(
  'dev server lifecycle E2E (sandbox child_process + network bridge)',
  () => {
    beforeAll(async () => {
      workDir = await mkdtemp(path.join(tmpdir(), 'dev-server-sandbox-'));
    });

    afterAll(async () => {
      if (workDir) {
        await rm(workDir, { recursive: true, force: true });
      }
    });

    // -----------------------------------------------------------------------
    // Full lifecycle: start → HTTP verify → SIGTERM → clean exit
    // -----------------------------------------------------------------------

    it(
      'starts server, verifies HTTP response, kills with SIGTERM, exits cleanly',
      async () => {
        const port = await findFreePort();
        await writeFile(path.join(workDir, 'server.js'), serverScript(port));

        const capture = createStdioCapture();
        const runtime = createDevServerSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: workDir,
          exemptPort: port,
        });

        try {
          const result = await runtime.exec(
            buildLifecycleCode({ cwd: workDir, scriptName: 'server.js', port }),
            { filePath: path.join(workDir, 'entry.js'), cwd: workDir },
          );

          if (result.code !== 0) {
            console.log('stdout:', capture.stdout().slice(0, 2000));
            console.log('stderr:', capture.stderr().slice(0, 2000));
            console.log('errorMessage:', result.errorMessage?.slice(0, 2000));
          }
          expect(result.code).toBe(0);

          const stdout = capture.stdout();

          // Server started on the assigned port
          expect(stdout).toContain(`SERVER_STARTED:${port}`);

          // Health endpoint returned 200 with JSON body
          expect(stdout).toContain('HEALTH_STATUS:200');
          expect(stdout).toContain('"status":"ok"');

          // Root endpoint returned 200 with text body
          expect(stdout).toContain('ROOT_STATUS:200');
          expect(stdout).toContain('ROOT_BODY:hello from dev server');

          // Server exited cleanly after SIGTERM
          expect(stdout).toContain('EXIT_CODE:0');
        } finally {
          runtime.dispose();
        }
      },
      30_000,
    );

    // -----------------------------------------------------------------------
    // Multiple HTTP requests before kill
    // -----------------------------------------------------------------------

    it(
      'server handles multiple requests through the network bridge',
      async () => {
        const port = await findFreePort();
        await writeFile(path.join(workDir, 'server.js'), serverScript(port));

        const capture = createStdioCapture();
        const runtime = createDevServerSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: workDir,
          exemptPort: port,
        });

        try {
          const result = await runtime.exec(
            buildMultiRequestCode({ cwd: workDir, port }),
            { filePath: path.join(workDir, 'entry.js'), cwd: workDir },
          );

          if (result.code !== 0) {
            console.log('stdout:', capture.stdout().slice(0, 2000));
            console.log('stderr:', capture.stderr().slice(0, 2000));
            console.log('errorMessage:', result.errorMessage?.slice(0, 2000));
          }
          expect(result.code).toBe(0);

          const stdout = capture.stdout();

          // All 3 requests returned ok
          expect(stdout).toContain('REQ0:ok');
          expect(stdout).toContain('REQ1:ok');
          expect(stdout).toContain('REQ2:ok');

          // Server exited cleanly
          expect(stdout).toContain('EXIT_CODE:0');
        } finally {
          runtime.dispose();
        }
      },
      30_000,
    );

    // -----------------------------------------------------------------------
    // SIGTERM exit timing — server exits within 5 seconds
    // -----------------------------------------------------------------------

    it(
      'server exits within 5 seconds after SIGTERM',
      async () => {
        const port = await findFreePort();
        await writeFile(path.join(workDir, 'server.js'), serverScript(port));

        const capture = createStdioCapture();
        const runtime = createDevServerSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: workDir,
          exemptPort: port,
        });

        try {
          const startTime = Date.now();

          const result = await runtime.exec(
            buildLifecycleCode({ cwd: workDir, scriptName: 'server.js', port }),
            { filePath: path.join(workDir, 'entry.js'), cwd: workDir },
          );

          const elapsed = Date.now() - startTime;
          expect(result.code).toBe(0);

          const stdout = capture.stdout();
          // Exit code should be 0 (clean SIGTERM), not 'timeout'
          expect(stdout).toContain('EXIT_CODE:0');

          // Entire test should complete well under 30s
          expect(elapsed).toBeLessThan(20_000);
        } finally {
          runtime.dispose();
        }
      },
      30_000,
    );

    // -----------------------------------------------------------------------
    // SIGKILL fallback for unresponsive server
    // -----------------------------------------------------------------------

    it(
      'SIGKILL terminates server that ignores SIGTERM',
      async () => {
        const port = await findFreePort();
        await writeFile(
          path.join(workDir, 'unresponsive-server.js'),
          unresponsiveServerScript(port),
        );

        const capture = createStdioCapture();
        const runtime = createDevServerSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: workDir,
          exemptPort: port,
        });

        try {
          const result = await runtime.exec(
            buildLifecycleCode({
              cwd: workDir,
              scriptName: 'unresponsive-server.js',
              port,
              killTimeout: 2000,
            }),
            { filePath: path.join(workDir, 'entry.js'), cwd: workDir },
          );

          expect(result.code).toBe(0);

          const stdout = capture.stdout();

          // Server responded before kill
          expect(stdout).toContain('HEALTH_STATUS:200');

          // Exit code should not be 0 — SIGTERM was ignored, SIGKILL kicked in
          const exitMatch = stdout.match(/EXIT_CODE:(.+)/);
          expect(exitMatch).not.toBeNull();
          const exitVal = exitMatch![1];
          expect(exitVal).not.toBe('0');
        } finally {
          runtime.dispose();
        }
      },
      30_000,
    );

    // -----------------------------------------------------------------------
    // Server stdout flows through the bridge
    // -----------------------------------------------------------------------

    it(
      'server stdout flows through the child_process bridge',
      async () => {
        const port = await findFreePort();
        await writeFile(path.join(workDir, 'server.js'), serverScript(port));

        const capture = createStdioCapture();
        const runtime = createDevServerSandboxRuntime({
          onStdio: capture.onStdio,
          cwd: workDir,
          exemptPort: port,
        });

        try {
          const result = await runtime.exec(
            buildLifecycleCode({ cwd: workDir, scriptName: 'server.js', port }),
            { filePath: path.join(workDir, 'entry.js'), cwd: workDir },
          );

          expect(result.code).toBe(0);

          const stdout = capture.stdout();

          // The LISTENING message originated from the server's console.log,
          // flowed through child.stdout → sandbox process.stdout.write → bridge
          expect(stdout).toContain(`SERVER_STARTED:${port}`);
        } finally {
          runtime.dispose();
        }
      },
      30_000,
    );
  },
);
