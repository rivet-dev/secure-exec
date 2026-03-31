/**
 * Focused WasmVM backend probes for the upstream Node runtime plan.
 *
 * These probes validate backend-only operations through the normal WasmVM
 * command path. They do not prove host-side JS handle identity or callback
 * delivery for the future upstream runtime.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer as createTcpServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AF_INET,
  SOCK_STREAM,
  allowAllFs,
  allowAllNetwork,
  createInMemoryFileSystem,
  createKernel,
  type Kernel,
} from '@secure-exec/core';
import { createNodeHostNetworkAdapter } from '../../nodejs/src/index.ts';
import { createWasmVmRuntime } from '../src/driver.ts';
import { registerKernelPid } from './helpers/kernel-process.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(
  __dirname,
  '../../../native/wasmvm/target/wasm32-wasip1/release/commands',
);
const C_BUILD_DIR = resolve(__dirname, '../../../native/wasmvm/c/build');

const REQUIRED_BINARIES = ['fs_probe', 'tcp_echo', 'tcp_server', 'dns_probe'] as const;
const hasWasmBinaries = existsSync(COMMANDS_DIR);

function skipReason(): string | false {
  if (!hasWasmBinaries) {
    return 'WASM binaries not built (run make wasm in native/wasmvm/)';
  }

  for (const binary of REQUIRED_BINARIES) {
    if (!existsSync(join(C_BUILD_DIR, binary))) {
      return `${binary} WASM binary not built (run make -C native/wasmvm/c sysroot && make -C native/wasmvm/c ${join('build', binary)})`;
    }
  }

  return false;
}

async function waitForTcpListener(
  kernel: Kernel,
  port: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listener = kernel.socketTable.findListener({ host: '0.0.0.0', port });
    if (listener) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }

  throw new Error(`Timed out waiting for TCP listener on port ${port}`);
}

describe.skipIf(skipReason())('upstream Node WasmVM backend probes', { timeout: 30_000 }, () => {
  let kernel: Kernel;
  let clientPid: number;

  beforeEach(async () => {
    kernel = createKernel({
      filesystem: createInMemoryFileSystem(),
      hostNetworkAdapter: createNodeHostNetworkAdapter(),
      permissions: { ...allowAllFs, ...allowAllNetwork },
    });
    await kernel.mount(createWasmVmRuntime({ commandDirs: [C_BUILD_DIR, COMMANDS_DIR] }));
    clientPid = registerKernelPid(kernel);
  });

  afterEach(async () => {
    await kernel?.dispose();
  });

  it('fs_probe exercises open/read/write/stat/readdir/realpath through the sandbox VFS', async () => {
    const result = await kernel.exec('fs_probe');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('open: ok');
    expect(result.stdout).toContain('write: ok');
    expect(result.stdout).toContain('read: wasmvm-fs-probe');
    expect(result.stdout).toContain('stat: size=15');
    expect(result.stdout).toContain('close: ok');
    expect(result.stdout).toContain('readdir: ok');
    expect(result.stdout).toContain('realpath: /tmp/fs-probe/probe.txt');
  });

  it('tcp_echo covers connect/read/write/close against a host TCP echo server', async () => {
    const server = createTcpServer((conn) => {
      conn.on('data', (data) => {
        conn.write(data);
        conn.end();
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const port = (server.address() as import('node:net').AddressInfo).port;

    try {
      const result = await kernel.exec(`tcp_echo ${port}`);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('sent: 5');
      expect(result.stdout).toContain('received: hello');
    } finally {
      server.close();
    }
  });

  it('tcp_server covers listen/accept/read/write/close through the kernel socket table', async () => {
    const port = 19076;
    const execPromise = kernel.exec(`tcp_server ${port}`);

    await waitForTcpListener(kernel, port);

    const clientId = kernel.socketTable.create(AF_INET, SOCK_STREAM, 0, clientPid);
    await kernel.socketTable.connect(clientId, { host: '127.0.0.1', port });
    kernel.socketTable.send(clientId, new TextEncoder().encode('ping'));

    let reply = '';
    const decoder = new TextDecoder();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const chunk = kernel.socketTable.recv(clientId, 256);
      if (chunk && chunk.length > 0) {
        reply += decoder.decode(chunk);
        break;
      }
      await new Promise((resolveRead) => setTimeout(resolveRead, 20));
    }

    kernel.socketTable.close(clientId, clientPid);

    const result = await execPromise;

    expect(reply).toBe('pong');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`listening on port ${port}`);
    expect(result.stdout).toContain('received: ping');
    expect(result.stdout).toContain('sent: 4');
  });

  it('dns_probe covers localhost lookup plus an expected .invalid failure path', async () => {
    const result = await kernel.exec('dns_probe');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('localhost: 127.0.0.1');
    expect(result.stdout).toContain('invalid_host: expected_failure');
    expect(result.stderr).toContain('invalid_host_error:');
  });
});
