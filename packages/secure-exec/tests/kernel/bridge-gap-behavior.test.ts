/**
 * Bridge gap tests for CLI tool support: isTTY, setRawMode, HTTPS, streams.
 *
 * Exercises PTY-backed process TTY detection and raw mode toggling through
 * the kernel PTY line discipline. Uses openShell({ command: 'node', ... })
 * to spawn Node directly on a PTY — no WasmVM shell needed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createKernel } from '../../../core/src/kernel/index.ts';
import type { Kernel } from '../../../core/src/kernel/index.ts';
import { InMemoryFileSystem } from '../../../browser/src/os-filesystem.ts';
import { createNodeRuntime } from '../../../nodejs/src/kernel-runtime.ts';

async function createNodeKernel(): Promise<{ kernel: Kernel; vfs: InMemoryFileSystem; dispose: () => Promise<void> }> {
  const vfs = new InMemoryFileSystem();
  const kernel = createKernel({ filesystem: vfs });
  await kernel.mount(createNodeRuntime());
  return { kernel, vfs, dispose: () => kernel.dispose() };
}

/** Collect all output from a PTY-backed process spawned via openShell. */
async function runNodeOnPty(
  kernel: Kernel,
  code: string,
  timeout = 10_000,
): Promise<string> {
  const shell = kernel.openShell({
    command: 'node',
    args: ['-e', code],
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

// ---------------------------------------------------------------------------
// Native ESM mode (V8 module system)
// ---------------------------------------------------------------------------

describe('native ESM execution via V8 module system', () => {
  let ctx: { kernel: Kernel; vfs: InMemoryFileSystem; dispose: () => Promise<void> };

  afterEach(async () => {
    await ctx?.dispose();
  });

  it('ESM module with import/export runs correctly via kernel.spawn()', async () => {
    ctx = await createNodeKernel();
    // Write an ESM file to VFS
    await ctx.vfs.writeFile('/app/main.mjs', `
      const msg = 'ESM_OK';
      console.log(msg);
    `);

    const stdout: string[] = [];
    const proc = ctx.kernel.spawn('node', ['/app/main.mjs'], {
      onStdout: (data) => stdout.push(new TextDecoder().decode(data)),
    });
    const exitCode = await proc.wait();

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('ESM_OK');
  }, 15_000);

  it('CJS module with require() still runs correctly via kernel.spawn()', async () => {
    ctx = await createNodeKernel();
    // CJS code — no import/export syntax, uses require
    const stdout: string[] = [];
    const proc = ctx.kernel.spawn('node', ['-e', "const os = require('os'); console.log('CJS_OK:' + os.platform())"], {
      onStdout: (data) => stdout.push(new TextDecoder().decode(data)),
    });
    const exitCode = await proc.wait();

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('CJS_OK:');
  }, 15_000);

  it('ESM file with static import resolves via V8 module_resolve_callback', async () => {
    ctx = await createNodeKernel();
    // Write two ESM files — main imports from helper
    await ctx.vfs.writeFile('/app/helper.mjs', `
      export const greeting = 'HELLO_FROM_ESM';
    `);
    await ctx.vfs.writeFile('/app/main.mjs', `
      import { greeting } from './helper.mjs';
      console.log(greeting);
    `);

    const stdout: string[] = [];
    const proc = ctx.kernel.spawn('node', ['/app/main.mjs'], {
      onStdout: (data) => stdout.push(new TextDecoder().decode(data)),
    });
    const exitCode = await proc.wait();

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('HELLO_FROM_ESM');
  }, 15_000);

  it('import.meta.url is populated for ESM modules', async () => {
    ctx = await createNodeKernel();
    await ctx.vfs.writeFile('/app/meta.mjs', `
      console.log('META_URL:' + import.meta.url);
    `);

    const stdout: string[] = [];
    const proc = ctx.kernel.spawn('node', ['/app/meta.mjs'], {
      onStdout: (data) => stdout.push(new TextDecoder().decode(data)),
    });
    const exitCode = await proc.wait();

    expect(exitCode).toBe(0);
    const output = stdout.join('');
    expect(output).toContain('META_URL:file:///app/meta.mjs');
  }, 15_000);

  it('dynamic import() works in ESM via V8 native callback', async () => {
    ctx = await createNodeKernel();
    await ctx.vfs.writeFile('/app/dynamic-dep.mjs', `
      export const value = 'DYNAMIC_IMPORT_OK';
    `);
    await ctx.vfs.writeFile('/app/dynamic-main.mjs', `
      const mod = await import('./dynamic-dep.mjs');
      console.log(mod.value);
    `);

    const stdout: string[] = [];
    const proc = ctx.kernel.spawn('node', ['/app/dynamic-main.mjs'], {
      onStdout: (data) => stdout.push(new TextDecoder().decode(data)),
    });
    const exitCode = await proc.wait();

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('DYNAMIC_IMPORT_OK');
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Streaming stdin via PTY
// ---------------------------------------------------------------------------

describe('bridge gap: streaming stdin via PTY', () => {
  let ctx: { kernel: Kernel; vfs: InMemoryFileSystem; dispose: () => Promise<void> };

  afterEach(async () => {
    await ctx?.dispose();
  });

  it('process.stdin data events fire when PTY master writes data', async () => {
    ctx = await createNodeKernel();

    const shell = ctx.kernel.openShell({
      command: 'node',
      args: ['-e', `
        process.stdin.setRawMode(true);
        const received = [];
        process.stdin.on('data', (chunk) => {
          received.push(chunk);
          // After receiving some data, output it and exit
          if (received.join('').includes('HELLO')) {
            console.log('GOT:' + received.join(''));
            process.exit(0);
          }
        });
        process.stdin.resume();
      `],
    });

    const chunks: Uint8Array[] = [];
    shell.onData = (data) => chunks.push(data);

    // Wait for process to start, then write stdin data
    await new Promise(resolve => setTimeout(resolve, 500));
    const encoder = new TextEncoder();
    shell.write(encoder.encode('HELLO'));

    const exitCode = await Promise.race([
      shell.wait(),
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('PTY stdin test timed out')), 15_000),
      ),
    ]);

    const output = new TextDecoder().decode(Buffer.concat(chunks));
    expect(output).toContain('GOT:HELLO');
    expect(exitCode).toBe(0);
  }, 20_000);

  it('stdin data arrives in small chunks, not batched', async () => {
    ctx = await createNodeKernel();

    const shell = ctx.kernel.openShell({
      command: 'node',
      args: ['-e', `
        process.stdin.setRawMode(true);
        let chunkCount = 0;
        process.stdin.on('data', (chunk) => {
          chunkCount++;
          if (chunkCount >= 3) {
            console.log('CHUNKS:' + chunkCount);
            process.exit(0);
          }
        });
        process.stdin.resume();
      `],
    });

    const chunks: Uint8Array[] = [];
    shell.onData = (data) => chunks.push(data);

    // Wait for process to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Write 3 separate chunks with delays between them
    const encoder = new TextEncoder();
    shell.write(encoder.encode('a'));
    await new Promise(resolve => setTimeout(resolve, 100));
    shell.write(encoder.encode('b'));
    await new Promise(resolve => setTimeout(resolve, 100));
    shell.write(encoder.encode('c'));

    const exitCode = await Promise.race([
      shell.wait(),
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('PTY stdin chunk test timed out')), 15_000),
      ),
    ]);

    const output = new TextDecoder().decode(Buffer.concat(chunks));
    expect(output).toContain('CHUNKS:3');
    expect(exitCode).toBe(0);
  }, 20_000);

  it('process.stdin.resume() enables event delivery and data accumulates', async () => {
    ctx = await createNodeKernel();

    const shell = ctx.kernel.openShell({
      command: 'node',
      args: ['-e', `
        process.stdin.setRawMode(true);
        let received = '';
        process.stdin.on('data', (chunk) => {
          received += chunk;
          // After receiving enough data, output and exit
          if (received.length >= 2) {
            console.log('RECEIVED:' + received);
            process.exit(0);
          }
        });
        process.stdin.resume();
      `],
    });

    const chunks: Uint8Array[] = [];
    shell.onData = (data) => chunks.push(data);

    // Wait for process to start and resume stdin
    await new Promise(resolve => setTimeout(resolve, 500));
    const encoder = new TextEncoder();
    shell.write(encoder.encode('XY'));

    const exitCode = await Promise.race([
      shell.wait(),
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('PTY stdin test timed out')), 15_000),
      ),
    ]);

    const output = new TextDecoder().decode(Buffer.concat(chunks));
    expect(output).toContain('RECEIVED:XY');
    expect(exitCode).toBe(0);
  }, 20_000);

  it('non-PTY stdin behavior is unchanged with batched delivery', async () => {
    ctx = await createNodeKernel();

    // Non-PTY: stdin is delivered as a batch via processConfig
    const stdout: string[] = [];
    const proc = ctx.kernel.spawn('node', ['-e', `
      let data = '';
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => { console.log('BATCH:' + data); });
    `], {
      onStdout: (d) => stdout.push(new TextDecoder().decode(d)),
    });

    // Write stdin data and close
    proc.writeStdin(new TextEncoder().encode('batch-data'));
    proc.closeStdin();

    const exitCode = await proc.wait();
    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('BATCH:batch-data');
  }, 15_000);
});
