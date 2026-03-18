/**
 * Integration tests for kernel.dispose() with active processes.
 *
 * Verifies that dispose terminates running processes across WasmVM and Node
 * runtimes, cleans up after crashes, disposes timers, propagates pipe EOF,
 * and supports idempotent double-dispose.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createKernel } from '../../../kernel/src/index.ts';
import type { Kernel } from '../../../kernel/src/index.ts';
import { MockRuntimeDriver } from '../../../kernel/test/helpers.ts';
import { createNodeRuntime } from '../../../runtime/node/src/index.ts';
import { createPythonRuntime } from '../../../runtime/python/src/index.ts';
import { InMemoryFileSystem } from '../../../os/browser/src/index.ts';
import {
  createIntegrationKernel,
  skipUnlessWasmBuilt,
  skipUnlessPyodide,
} from './helpers.ts';
import type { IntegrationKernelResult } from './helpers.ts';

const skipReason = skipUnlessWasmBuilt();

describe.skipIf(skipReason)('dispose with active processes (integration)', () => {
  let ctx: IntegrationKernelResult;

  afterEach(async () => {
    if (ctx) await ctx.dispose();
  });

  it('dispose terminates active WasmVM sleep process within 5s', async () => {
    ctx = await createIntegrationKernel({ runtimes: ['wasmvm'] });

    // Spawn a long-running sleep — would hang for 60s without dispose
    const proc = ctx.kernel.spawn('sleep', ['60']);
    expect(proc.pid).toBeGreaterThan(0);

    const start = Date.now();
    await ctx.dispose();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it('dispose terminates active Node setTimeout process within 5s', async () => {
    ctx = await createIntegrationKernel({ runtimes: ['wasmvm', 'node'] });

    // Spawn a Node process that hangs for 60s
    const proc = ctx.kernel.spawn('node', ['-e', 'setTimeout(()=>{},60000)']);
    expect(proc.pid).toBeGreaterThan(0);

    const start = Date.now();
    await ctx.dispose();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it('dispose terminates processes in BOTH WasmVM and Node simultaneously', async () => {
    ctx = await createIntegrationKernel({ runtimes: ['wasmvm', 'node'] });

    // Spawn long-running processes in both runtimes
    const wasmProc = ctx.kernel.spawn('sleep', ['60']);
    const nodeProc = ctx.kernel.spawn('node', ['-e', 'setTimeout(()=>{},60000)']);

    expect(wasmProc.pid).toBeGreaterThan(0);
    expect(nodeProc.pid).toBeGreaterThan(0);
    expect(wasmProc.pid).not.toBe(nodeProc.pid);

    const start = Date.now();
    await ctx.dispose();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it('WASM process exits → piped stdout closed, reader gets EOF', async () => {
    ctx = await createIntegrationKernel({ runtimes: ['wasmvm'] });
    const { kernel: k, vfs } = ctx;

    // Mount a mock driver to act as the reader process
    const reader = new MockRuntimeDriver(['reader'], {
      reader: { neverExit: true },
    });
    await k.mount(reader);
    const ki = reader.kernelInterface!;

    // Spawn reader process to host the pipe
    const readerProc = k.spawn('reader', []);
    const { readFd, writeFd } = ki.pipe(readerProc.pid);

    // Spawn WASM echo as child with stdout wired to pipe write end
    const echoPid = ki.spawn('echo', ['wasm-pipe-data'], {
      ppid: readerProc.pid,
      stdoutFd: writeFd,
    });

    // Close reader's inherited write end (standard pipe setup)
    ki.fdClose(readerProc.pid, writeFd);

    // Wait for echo to finish — exit triggers FD cleanup → write end closed → EOF
    await echoPid.wait();

    // Read pipe data + EOF
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await ki.fdRead(readerProc.pid, readFd, 4096);
      if (chunk.length === 0) break; // EOF
      chunks.push(chunk);
    }

    const output = new TextDecoder().decode(
      new Uint8Array(chunks.reduce((acc, c) => [...acc, ...c], [] as number[])),
    );
    expect(output).toContain('wasm-pipe-data');

    readerProc.kill(9);
    await readerProc.wait();
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Process cleanup and timer disposal tests
// ---------------------------------------------------------------------------

describe('process cleanup and timer disposal', () => {
  let kernel: Kernel;

  afterEach(async () => {
    await kernel?.dispose();
  });

  it('crashed process has its worker/isolate cleaned up (no leaked drivers)', async () => {
    const vfs = new InMemoryFileSystem();
    kernel = createKernel({ filesystem: vfs });
    const driver = createNodeRuntime();
    await kernel.mount(driver);

    // Spawn a process that throws immediately
    const proc = kernel.spawn('node', ['-e', 'throw new Error("crash")']);
    const code = await proc.wait();

    // Process exited with error
    expect(code).not.toBe(0);

    // Verify no leaked active drivers (internal map should be empty after exit)
    const activeDrivers = (driver as any)._activeDrivers as Map<number, unknown>;
    expect(activeDrivers.size).toBe(0);
  });

  it('setInterval does not keep process alive after runtime dispose', async () => {
    const vfs = new InMemoryFileSystem();
    kernel = createKernel({ filesystem: vfs });
    const driver = createNodeRuntime();
    await kernel.mount(driver);

    // Spawn a process with setInterval that would run forever
    const proc = kernel.spawn('node', ['-e',
      'setInterval(() => {}, 10); setTimeout(() => {}, 60000)']);
    expect(proc.pid).toBeGreaterThan(0);

    // Dispose should terminate the isolate, killing the interval
    const start = Date.now();
    await kernel.dispose();
    const elapsed = Date.now() - start;

    // If setInterval leaked, this would hang for 60s
    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it('piped stdout/stderr FDs closed on process exit, readers get EOF', async () => {
    const driver = new MockRuntimeDriver(['writer', 'reader'], {
      writer: { neverExit: true },
      reader: { neverExit: true },
    });
    const vfs = new InMemoryFileSystem();
    kernel = createKernel({ filesystem: vfs });
    await kernel.mount(driver);
    const ki = driver.kernelInterface!;

    // Spawn writer, create pipe in its FD table
    const writer = kernel.spawn('writer', []);
    const { readFd, writeFd } = ki.pipe(writer.pid);

    // Spawn reader as child — inherits both pipe ends
    const reader = ki.spawn('reader', [], { ppid: writer.pid });
    // Reader closes inherited write end (standard pipe setup)
    ki.fdClose(reader.pid, writeFd);

    // Writer sends data through pipe
    ki.fdWrite(writer.pid, writeFd, new TextEncoder().encode('pipe-data'));
    const data = await ki.fdRead(reader.pid, readFd, 100);
    expect(new TextDecoder().decode(data)).toBe('pipe-data');

    // Kill writer — exit triggers cleanupProcessFDs → write end refcount drops → EOF
    writer.kill(9);
    await writer.wait();

    // Reader should get EOF (empty Uint8Array)
    const eof = await ki.fdRead(reader.pid, readFd, 100);
    expect(eof.length).toBe(0);

    reader.kill(9);
    await reader.wait();
  });

  it('double-dispose on NodeRuntime does not throw', async () => {
    const vfs = new InMemoryFileSystem();
    kernel = createKernel({ filesystem: vfs });
    const driver = createNodeRuntime();
    await kernel.mount(driver);

    // First dispose through kernel
    await kernel.dispose();

    // Direct second dispose on the driver itself
    await expect(driver.dispose()).resolves.not.toThrow();
  });

  it.skipIf(skipUnlessPyodide())('double-dispose on PythonRuntime does not throw', async () => {
    const vfs = new InMemoryFileSystem();
    kernel = createKernel({ filesystem: vfs });
    const driver = createPythonRuntime();
    await kernel.mount(driver);

    // First dispose through kernel
    await kernel.dispose();

    // Direct second dispose on the driver itself
    await expect(driver.dispose()).resolves.not.toThrow();
  }, 30_000);
});
