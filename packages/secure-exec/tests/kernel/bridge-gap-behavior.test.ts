/**
 * Bridge gap tests for CLI tool support: isTTY, setRawMode, abort bootstrap.
 *
 * Exercises PTY-backed process TTY detection and raw mode toggling through
 * the kernel PTY line discipline. Uses openShell({ command: 'node', ... })
 * to spawn Node directly on a PTY — no WasmVM shell needed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { allowAllFs, allowAllNetwork, createKernel } from '../../../core/src/index.ts';
import type { Kernel } from '../../../core/src/kernel/index.ts';
import { InMemoryFileSystem } from '../../../browser/src/os-filesystem.ts';
import { createNodeHostNetworkAdapter, createNodeRuntime } from '../../../nodejs/src/index.ts';

async function createNodeKernel(options?: {
  hostNetwork?: boolean;
}): Promise<{ kernel: Kernel; dispose: () => Promise<void> }> {
  const vfs = new InMemoryFileSystem();
  const networked = options?.hostNetwork === true;
  const kernel = createKernel({
    filesystem: vfs,
    hostNetworkAdapter: networked ? createNodeHostNetworkAdapter() : undefined,
    permissions: networked ? { ...allowAllFs, ...allowAllNetwork } : undefined,
  });
  await kernel.mount(
    createNodeRuntime({
      permissions: networked ? { ...allowAllFs, ...allowAllNetwork } : undefined,
    }),
  );
  return { kernel, dispose: () => kernel.dispose() };
}

/** Collect all output from a PTY-backed process spawned via openShell. */
async function runNodeOnPty(
  kernel: Kernel,
  code: string,
  timeout = 10_000,
  options: { cwd?: string } = {},
): Promise<string> {
  const shell = kernel.openShell({
    command: 'node',
    args: ['-e', code],
    cwd: options.cwd,
  });

  const chunks: Uint8Array[] = [];
  shell.onData = (data) => chunks.push(data);

  const exitCode = await Promise.race([
    shell.wait(),
    new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error('PTY process timed out')), timeout),
    ),
  ]);

  const output = new TextDecoder().decode(
    Buffer.concat(chunks),
  );
  return output;
}

// ---------------------------------------------------------------------------
// PTY isTTY detection
// ---------------------------------------------------------------------------

describe('bridge gap: isTTY via PTY', () => {
  let ctx: { kernel: Kernel; dispose: () => Promise<void> };

  afterEach(async () => {
    await ctx?.dispose();
  });

  it('process.stdin.isTTY returns true when spawned with PTY', async () => {
    ctx = await createNodeKernel();
    const output = await runNodeOnPty(ctx.kernel, "console.log('STDIN_TTY:' + process.stdin.isTTY)");
    expect(output).toContain('STDIN_TTY:true');
  }, 15_000);

  it('process.stdout.isTTY returns true when spawned with PTY', async () => {
    ctx = await createNodeKernel();
    const output = await runNodeOnPty(ctx.kernel, "console.log('STDOUT_TTY:' + process.stdout.isTTY)");
    expect(output).toContain('STDOUT_TTY:true');
  }, 15_000);

  it('process.stderr.isTTY returns true when spawned with PTY', async () => {
    ctx = await createNodeKernel();
    const output = await runNodeOnPty(ctx.kernel, "console.log('STDERR_TTY:' + process.stderr.isTTY)");
    expect(output).toContain('STDERR_TTY:true');
  }, 15_000);

  it('isTTY remains false for non-PTY sandbox processes', async () => {
    ctx = await createNodeKernel();

    // Spawn node directly via kernel.spawn (no PTY)
    const stdout: string[] = [];
    const proc = ctx.kernel.spawn('node', ['-e', "console.log('STDIN_TTY:' + process.stdin.isTTY + ',STDOUT_TTY:' + process.stdout.isTTY)"], {
      onStdout: (data) => stdout.push(new TextDecoder().decode(data)),
    });
    const exitCode = await proc.wait();

    expect(exitCode).toBe(0);
    const output = stdout.join('');
    expect(output).toMatch(/STDIN_TTY:(false|undefined)/);
    expect(output).toMatch(/STDOUT_TTY:(false|undefined)/);
  }, 15_000);
});

describe('bridge gap: abort bootstrap via PTY', () => {
  let ctx: { kernel: Kernel; dispose: () => Promise<void> };

  afterEach(async () => {
    await ctx?.dispose();
  });

  it('exposes AbortSignal.timeout and AbortSignal.any during PTY bootstrap', async () => {
    ctx = await createNodeKernel();
    const output = await runNodeOnPty(
      ctx.kernel,
      `
        console.log('TIMEOUT_TYPE:' + typeof AbortSignal.timeout);
        console.log('ANY_TYPE:' + typeof AbortSignal.any);
      `,
      15_000,
    );

    expect(output).toContain('TIMEOUT_TYPE:function');
    expect(output).toContain('ANY_TYPE:function');
    expect(output).not.toContain('AbortSignal.timeout is not a function');
  }, 15_000);
});

describe('bridge gap: web-stream adapters via PTY', () => {
  let ctx: { kernel: Kernel; dispose: () => Promise<void> };

  afterEach(async () => {
    await ctx?.dispose();
  });

  it('exposes stream.Readable.fromWeb during PTY bootstrap', async () => {
    ctx = await createNodeKernel();
    const output = await runNodeOnPty(
      ctx.kernel,
      `
        const { Readable } = require('node:stream');
        const web = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('web-stream-ok'));
            controller.close();
          },
        });
        const stream = Readable.fromWeb(web);
        let body = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          body += chunk;
        });
        stream.on('end', () => {
          console.log('FROM_WEB:' + body);
        });
      `,
      15_000,
    );

    expect(output).toContain('FROM_WEB:web-stream-ok');
    expect(output).not.toContain('Readable.fromWeb is not a function');
  }, 15_000);
});

describe('bridge gap: undici bootstrap via PTY', () => {
  let ctx: { kernel: Kernel; dispose: () => Promise<void> };

  afterEach(async () => {
    await ctx?.dispose();
  });

  it('loads undici with its bootstrap globals before the bridge network module initializes', async () => {
    ctx = await createNodeKernel();
    const output = await runNodeOnPty(
      ctx.kernel,
      `
        const { markAsUncloneable } = require('node:worker_threads');
        const { Readable } = require('node:stream');
        require('undici');
        console.log(JSON.stringify({
          undici: 'ok',
          domExceptionType: typeof DOMException,
          blobType: typeof Blob,
          fileType: typeof File,
          formDataType: typeof FormData,
          messagePortType: typeof MessagePort,
          messageChannelType: typeof MessageChannel,
          messageEventType: typeof MessageEvent,
          abortTimeoutType: typeof AbortSignal.timeout,
          abortAnyType: typeof AbortSignal.any,
          markAsUncloneableType: typeof markAsUncloneable,
          readableFromWebType: typeof Readable.fromWeb,
        }));
      `,
      15_000,
    );

    expect(output).toContain('"undici":"ok"');
    expect(output).toContain('"domExceptionType":"function"');
    expect(output).toContain('"blobType":"function"');
    expect(output).toContain('"fileType":"function"');
    expect(output).toContain('"formDataType":"function"');
    expect(output).toContain('"messagePortType":"function"');
    expect(output).toContain('"messageChannelType":"function"');
    expect(output).toContain('"messageEventType":"function"');
    expect(output).toContain('"abortTimeoutType":"function"');
    expect(output).toContain('"abortAnyType":"function"');
    expect(output).toContain('"markAsUncloneableType":"function"');
    expect(output).toContain('"readableFromWebType":"function"');
    expect(output).not.toContain('is not defined');
    expect(output).not.toContain('is not supported in sandbox');
  }, 15_000);
});

describe('bridge gap: host-backed HTTP via PTY', () => {
  let ctx: { kernel: Kernel; dispose: () => Promise<void> };
  let server: http.Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    server = undefined;
    await ctx?.dispose();
  });

  it('routes node:http client requests through the kernel-backed network path', async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('host-http-ok');
    });
    await new Promise<void>((resolve, reject) => {
      server!.listen(0, '127.0.0.1', () => resolve());
      server!.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('host HTTP server did not expose an inet address');
    }

    ctx = await createNodeKernel({ hostNetwork: true });
    const output = await runNodeOnPty(
      ctx.kernel,
      `
        const http = require('node:http');
        http.get('http://127.0.0.1:${address.port}/', (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            console.log('HTTP_OK:' + res.statusCode + ':' + body);
          });
        }).on('error', (error) => {
          console.error('HTTP_ERR:' + error.message);
          process.exitCode = 1;
        });
      `,
      15_000,
    );

    expect(output).toContain('HTTP_OK:200:host-http-ok');
    expect(output).not.toContain('ENOSYS: function not implemented, connect');
    expect(output).not.toContain('HTTP_ERR:');
  }, 15_000);
});

// ---------------------------------------------------------------------------
// PTY setRawMode
// ---------------------------------------------------------------------------

describe('bridge gap: setRawMode via PTY', () => {
  let ctx: { kernel: Kernel; dispose: () => Promise<void> };

  afterEach(async () => {
    await ctx?.dispose();
  });

  it('setRawMode(true) succeeds when stdin is a TTY', async () => {
    ctx = await createNodeKernel();
    const output = await runNodeOnPty(ctx.kernel, "process.stdin.setRawMode(true); console.log('RAW_OK')");
    expect(output).toContain('RAW_OK');
  }, 15_000);

  it('setRawMode(false) restores PTY defaults', async () => {
    ctx = await createNodeKernel();
    const output = await runNodeOnPty(
      ctx.kernel,
      "process.stdin.setRawMode(true); process.stdin.setRawMode(false); console.log('RESTORE_OK')",
    );
    expect(output).toContain('RESTORE_OK');
  }, 15_000);

  it('setRawMode throws when stdin is not a TTY', async () => {
    ctx = await createNodeKernel();

    // Spawn node directly via kernel.spawn (no PTY)
    const stderr: string[] = [];
    const proc = ctx.kernel.spawn('node', ['-e', `
      try {
        process.stdin.setRawMode(true);
        console.log('SHOULD_NOT_REACH');
      } catch (e) {
        console.error('ERR:' + e.message);
      }
    `], {
      onStderr: (data) => stderr.push(new TextDecoder().decode(data)),
    });
    await proc.wait();

    const output = stderr.join('');
    expect(output).toContain('ERR:');
    expect(output).toContain('not a TTY');
  }, 15_000);
});
