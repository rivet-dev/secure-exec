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

async function createNodeKernel(): Promise<{ kernel: Kernel; dispose: () => Promise<void> }> {
  const vfs = new InMemoryFileSystem();
  const kernel = createKernel({ filesystem: vfs });
  await kernel.mount(createNodeRuntime());
  return { kernel, dispose: () => kernel.dispose() };
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
