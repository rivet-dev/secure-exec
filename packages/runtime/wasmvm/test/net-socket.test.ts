/**
 * Tests for TCP socket RPC handlers in WasmVmRuntimeDriver.
 *
 * Verifies net_socket, net_connect, net_send, net_recv, net_close
 * lifecycle through the driver's _handleSyscall method. Uses a local
 * TCP echo server for realistic integration testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server, type Socket as NetSocket } from 'node:net';
import { createWasmVmRuntime } from '../src/driver.ts';
import type { WasmVmRuntimeOptions } from '../src/driver.ts';
import {
  SIGNAL_BUFFER_BYTES,
  DATA_BUFFER_BYTES,
  SIG_IDX_STATE,
  SIG_IDX_ERRNO,
  SIG_IDX_INT_RESULT,
  SIG_IDX_DATA_LEN,
  SIG_STATE_READY,
  type SyscallRequest,
} from '../src/syscall-rpc.ts';
import { ERRNO_MAP } from '../src/wasi-constants.ts';

// -------------------------------------------------------------------------
// TCP echo server helper
// -------------------------------------------------------------------------

function createEchoServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((conn: NetSocket) => {
      conn.on('data', (chunk) => conn.write(chunk)); // Echo back
      conn.on('error', () => {}); // Ignore client errors
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind'));
        return;
      }
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

// -------------------------------------------------------------------------
// _handleSyscall test helper
// -------------------------------------------------------------------------

/**
 * Call _handleSyscall on a driver and extract the response from the SAB.
 * This simulates what the worker thread does: post a syscall request,
 * then read the response from the shared buffers.
 */
async function callSyscall(
  driver: ReturnType<typeof createWasmVmRuntime>,
  call: string,
  args: Record<string, unknown>,
  kernel?: unknown,
): Promise<{ errno: number; intResult: number; data: Uint8Array }> {
  const signalBuf = new SharedArrayBuffer(SIGNAL_BUFFER_BYTES);
  const dataBuf = new SharedArrayBuffer(DATA_BUFFER_BYTES);

  const msg: SyscallRequest = { type: 'syscall', call, args };

  // Access private method — safe for testing
  await (driver as any)._handleSyscall(msg, 1, kernel ?? {}, signalBuf, dataBuf);

  const signal = new Int32Array(signalBuf);
  const data = new Uint8Array(dataBuf);

  const errno = Atomics.load(signal, SIG_IDX_ERRNO);
  const intResult = Atomics.load(signal, SIG_IDX_INT_RESULT);
  const dataLen = Atomics.load(signal, SIG_IDX_DATA_LEN);
  const responseData = dataLen > 0 ? data.slice(0, dataLen) : new Uint8Array(0);

  return { errno, intResult, data: responseData };
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('TCP socket RPC handlers', () => {
  let echoServer: Server;
  let echoPort: number;
  let driver: ReturnType<typeof createWasmVmRuntime>;

  beforeEach(async () => {
    const echo = await createEchoServer();
    echoServer = echo.server;
    echoPort = echo.port;

    driver = createWasmVmRuntime({ commandDirs: [] });
  });

  afterEach(async () => {
    await driver.dispose();
    await new Promise<void>((resolve) => echoServer.close(() => resolve()));
  });

  it('netSocket allocates a socket ID', async () => {
    const res = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    expect(res.errno).toBe(0);
    expect(res.intResult).toBeGreaterThan(0);
  });

  it('netConnect to local echo server succeeds', async () => {
    // Allocate socket
    const socketRes = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    expect(socketRes.errno).toBe(0);
    const fd = socketRes.intResult;

    // Connect
    const connectRes = await callSyscall(driver, 'netConnect', {
      fd,
      addr: `127.0.0.1:${echoPort}`,
    });
    expect(connectRes.errno).toBe(0);
  });

  it('netConnect to invalid address returns ECONNREFUSED', async () => {
    const socketRes = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    const fd = socketRes.intResult;

    // Port 1 should be unreachable
    const connectRes = await callSyscall(driver, 'netConnect', {
      fd,
      addr: '127.0.0.1:1',
    });
    expect(connectRes.errno).toBe(ERRNO_MAP.ECONNREFUSED);
  });

  it('netConnect with bad address format returns EINVAL', async () => {
    const socketRes = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    const fd = socketRes.intResult;

    const connectRes = await callSyscall(driver, 'netConnect', {
      fd,
      addr: 'invalid-no-port',
    });
    expect(connectRes.errno).toBe(ERRNO_MAP.EINVAL);
  });

  it('netSend and netRecv echo round-trip', async () => {
    // Socket + connect
    const socketRes = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    const fd = socketRes.intResult;
    await callSyscall(driver, 'netConnect', { fd, addr: `127.0.0.1:${echoPort}` });

    // Send
    const message = 'hello TCP';
    const sendData = Array.from(new TextEncoder().encode(message));
    const sendRes = await callSyscall(driver, 'netSend', { fd, data: sendData, flags: 0 });
    expect(sendRes.errno).toBe(0);
    expect(sendRes.intResult).toBe(sendData.length);

    // Recv
    const recvRes = await callSyscall(driver, 'netRecv', { fd, length: 1024, flags: 0 });
    expect(recvRes.errno).toBe(0);
    expect(new TextDecoder().decode(recvRes.data)).toBe(message);
  });

  it('netClose cleans up socket', async () => {
    const socketRes = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    const fd = socketRes.intResult;
    await callSyscall(driver, 'netConnect', { fd, addr: `127.0.0.1:${echoPort}` });

    // Close
    const closeRes = await callSyscall(driver, 'netClose', { fd });
    expect(closeRes.errno).toBe(0);

    // Subsequent operations on closed socket return EBADF
    const sendRes = await callSyscall(driver, 'netSend', { fd, data: [1, 2, 3], flags: 0 });
    expect(sendRes.errno).toBe(ERRNO_MAP.EBADF);

    const recvRes = await callSyscall(driver, 'netRecv', { fd, length: 1024, flags: 0 });
    expect(recvRes.errno).toBe(ERRNO_MAP.EBADF);
  });

  it('netClose with invalid fd returns EBADF', async () => {
    const res = await callSyscall(driver, 'netClose', { fd: 9999 });
    expect(res.errno).toBe(ERRNO_MAP.EBADF);
  });

  it('netSend on invalid fd returns EBADF', async () => {
    const res = await callSyscall(driver, 'netSend', { fd: 9999, data: [1], flags: 0 });
    expect(res.errno).toBe(ERRNO_MAP.EBADF);
  });

  it('netRecv on invalid fd returns EBADF', async () => {
    const res = await callSyscall(driver, 'netRecv', { fd: 9999, length: 1024, flags: 0 });
    expect(res.errno).toBe(ERRNO_MAP.EBADF);
  });

  it('full lifecycle: socket → connect → send → recv → close', async () => {
    // Create
    const socketRes = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    expect(socketRes.errno).toBe(0);
    const fd = socketRes.intResult;

    // Connect
    const connectRes = await callSyscall(driver, 'netConnect', { fd, addr: `127.0.0.1:${echoPort}` });
    expect(connectRes.errno).toBe(0);

    // Send
    const payload = 'ping';
    const sendRes = await callSyscall(driver, 'netSend', {
      fd,
      data: Array.from(new TextEncoder().encode(payload)),
      flags: 0,
    });
    expect(sendRes.errno).toBe(0);

    // Recv
    const recvRes = await callSyscall(driver, 'netRecv', { fd, length: 256, flags: 0 });
    expect(recvRes.errno).toBe(0);
    expect(new TextDecoder().decode(recvRes.data)).toBe(payload);

    // Close
    const closeRes = await callSyscall(driver, 'netClose', { fd });
    expect(closeRes.errno).toBe(0);
  });

  it('multiple concurrent sockets work independently', async () => {
    // Create two sockets
    const s1 = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    const s2 = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    expect(s1.intResult).not.toBe(s2.intResult);

    // Connect both
    await callSyscall(driver, 'netConnect', { fd: s1.intResult, addr: `127.0.0.1:${echoPort}` });
    await callSyscall(driver, 'netConnect', { fd: s2.intResult, addr: `127.0.0.1:${echoPort}` });

    // Send different data
    await callSyscall(driver, 'netSend', {
      fd: s1.intResult,
      data: Array.from(new TextEncoder().encode('A')),
      flags: 0,
    });
    await callSyscall(driver, 'netSend', {
      fd: s2.intResult,
      data: Array.from(new TextEncoder().encode('B')),
      flags: 0,
    });

    // Recv independently
    const r1 = await callSyscall(driver, 'netRecv', { fd: s1.intResult, length: 256, flags: 0 });
    const r2 = await callSyscall(driver, 'netRecv', { fd: s2.intResult, length: 256, flags: 0 });
    expect(new TextDecoder().decode(r1.data)).toBe('A');
    expect(new TextDecoder().decode(r2.data)).toBe('B');

    // Clean up
    await callSyscall(driver, 'netClose', { fd: s1.intResult });
    await callSyscall(driver, 'netClose', { fd: s2.intResult });
  });

  it('dispose cleans up all open sockets', async () => {
    const s1 = await callSyscall(driver, 'netSocket', { domain: 2, type: 1, protocol: 0 });
    await callSyscall(driver, 'netConnect', { fd: s1.intResult, addr: `127.0.0.1:${echoPort}` });

    // Dispose should clean up sockets without errors
    await driver.dispose();

    // Create a fresh driver for afterEach cleanup
    driver = createWasmVmRuntime({ commandDirs: [] });
  });
});

describe('TCP socket permission enforcement', () => {
  it('permission-restricted command cannot create sockets (kernel-worker level)', async () => {
    // This tests the isNetworkBlocked check in kernel-worker.ts.
    // At the driver level, the permission check happens in the worker,
    // not in _handleSyscall. So we verify the permission function directly.
    const { isNetworkBlocked } = await import('../src/permission-check.ts');

    expect(isNetworkBlocked('read-only')).toBe(true);
    expect(isNetworkBlocked('read-write')).toBe(true);
    expect(isNetworkBlocked('isolated')).toBe(true);
    expect(isNetworkBlocked('full')).toBe(false);
  });
});
