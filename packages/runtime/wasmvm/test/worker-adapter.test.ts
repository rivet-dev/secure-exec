/**
 * Tests for WorkerAdapter -- unified Worker abstraction for browser and Node.js.
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WorkerAdapter } from '../src/worker-adapter.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ECHO_WORKER = join(__dirname, 'fixtures', 'echo-worker.js');

describe('WorkerAdapter', () => {
  describe('environment detection', () => {
    it('detects Node.js environment', () => {
      const adapter = new WorkerAdapter();
      expect(adapter.environment).toBe('node');
    });
  });

  describe('SharedArrayBuffer availability', () => {
    it('reports SharedArrayBuffer as available in Node.js', () => {
      expect(WorkerAdapter.isSharedArrayBufferAvailable()).toBe(true);
    });
  });

  describe('spawn', () => {
    it('spawns a worker and receives messages', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      const result = await new Promise<{ type: string; data: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        worker.onMessage((data) => {
          const msg = data as { type: string; data: string };
          if (msg.type === 'echo') {
            clearTimeout(timeout);
            resolve(msg);
          }
        });
        worker.onError(reject);
        worker.postMessage({ type: 'echo', data: 'hello' });
      });

      expect(result.type).toBe('echo');
      expect(result.data).toBe('hello');
      await worker.terminate();
    });

    it('passes workerData to the worker', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER, {
        workerData: { greeting: 'hello from parent' },
      });

      const result = await new Promise<{ type: string; data: unknown }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        worker.onMessage((data) => {
          const msg = data as { type: string; data: unknown };
          if (msg.type === 'workerData') {
            clearTimeout(timeout);
            resolve(msg);
          }
        });
        worker.onError(reject);
      });

      expect(result.type).toBe('workerData');
      expect(result.data).toEqual({ greeting: 'hello from parent' });
      await worker.terminate();
    });

    it('exposes threadId on Node.js workers', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      expect(typeof (worker as unknown as { threadId: number }).threadId).toBe('number');
      expect((worker as unknown as { threadId: number }).threadId > 0).toBeTruthy();
      await worker.terminate();
    });
  });

  describe('postMessage', () => {
    it('sends and receives multiple messages', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);
      const received: string[] = [];

      const done = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        worker.onMessage((data) => {
          const msg = data as { type: string; data: string };
          if (msg.type === 'echo') {
            received.push(msg.data);
            if (received.length === 3) {
              clearTimeout(timeout);
              resolve();
            }
          }
        });
        worker.onError(reject);
      });

      worker.postMessage({ type: 'echo', data: 'one' });
      worker.postMessage({ type: 'echo', data: 'two' });
      worker.postMessage({ type: 'echo', data: 'three' });

      await done;
      expect(received).toEqual(['one', 'two', 'three']);
      await worker.terminate();
    });

    it('handles complex data structures', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      const complex = {
        array: [1, 2, 3],
        nested: { a: true, b: null },
        buffer: new Uint8Array([10, 20, 30]).buffer,
      };

      const result = await new Promise<{ type: string; data: { array: number[]; nested: { a: boolean; b: null } } }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        worker.onMessage((data) => {
          const msg = data as { type: string; data: { array: number[]; nested: { a: boolean; b: null } } };
          if (msg.type === 'echo') {
            clearTimeout(timeout);
            resolve(msg);
          }
        });
        worker.onError(reject);
        worker.postMessage({ type: 'echo', data: complex });
      });

      expect(result.data.array).toEqual([1, 2, 3]);
      expect(result.data.nested).toEqual({ a: true, b: null });
      await worker.terminate();
    });
  });

  describe('SharedArrayBuffer support', () => {
    it('passes SharedArrayBuffer to worker and shares memory', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      const sab = new SharedArrayBuffer(4);
      const view = new Int32Array(sab);
      Atomics.store(view, 0, 0);

      const done = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        worker.onMessage((data) => {
          const msg = data as { type: string };
          if (msg.type === 'sharedBufferDone') {
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.onError(reject);
      });

      worker.postMessage({ type: 'sharedBuffer', buffer: sab });
      await done;

      // Worker wrote 42 to the shared buffer
      expect(Atomics.load(view, 0)).toBe(42);
      await worker.terminate();
    });

    it('supports Atomics.wait/notify across threads', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      const sab = new SharedArrayBuffer(8);
      const view = new Int32Array(sab);
      Atomics.store(view, 0, 0);

      worker.postMessage({ type: 'sharedBuffer', buffer: sab });

      // Wait for the worker to write to the buffer
      // (Atomics.wait blocks until value at index 0 is no longer 0)
      const waitResult = Atomics.wait(view, 0, 0, 5000);
      expect(waitResult === 'ok' || waitResult === 'not-equal').toBeTruthy();
      expect(Atomics.load(view, 0)).toBe(42);
      await worker.terminate();
    });
  });

  describe('onError', () => {
    it('fires error handler on worker errors', async () => {
      const adapter = new WorkerAdapter();

      // Spawn a non-existent script to trigger an error
      const worker = await adapter.spawn(join(__dirname, 'fixtures', 'nonexistent.js'));

      const error = await new Promise<Error>((resolve) => {
        const timeout = setTimeout(() => resolve(new Error('No error received')), 5000);
        worker.onError((err) => {
          clearTimeout(timeout);
          resolve(err);
        });
      });

      expect(error).toBeInstanceOf(Error);
      await (worker.terminate() as Promise<number>).catch(() => {});
    });
  });

  describe('onExit', () => {
    it('fires exit handler when worker terminates', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      const exitCode = new Promise<number>((resolve) => {
        const timeout = setTimeout(() => resolve(-1), 5000);
        worker.onExit((code) => {
          clearTimeout(timeout);
          resolve(code);
        });
      });

      await worker.terminate();
      const code = await exitCode;
      expect(typeof code).toBe('number');
    });

    it('fires exit handler with worker-initiated exit', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      const exitCode = new Promise<number>((resolve) => {
        const timeout = setTimeout(() => resolve(-1), 5000);
        worker.onExit((code) => {
          clearTimeout(timeout);
          resolve(code);
        });
      });

      // Tell the worker to exit with code 0
      worker.postMessage({ type: 'exit', code: 0 });

      const code = await exitCode;
      expect(code).toBe(0);
    });
  });

  describe('terminate', () => {
    it('terminates a running worker', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      // Verify worker is alive
      const alive = await new Promise<boolean>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        worker.onMessage((data) => {
          const msg = data as { type: string };
          if (msg.type === 'echo') {
            clearTimeout(timeout);
            resolve(true);
          }
        });
        worker.onError(reject);
        worker.postMessage({ type: 'echo', data: 'ping' });
      });
      expect(alive).toBeTruthy();

      // Terminate
      const result = await worker.terminate();
      expect(typeof result).toBe('number');
    });

    it('can register multiple message handlers', async () => {
      const adapter = new WorkerAdapter();
      const worker = await adapter.spawn(ECHO_WORKER);

      let handler1Called = false;
      let handler2Called = false;

      const done = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        worker.onMessage(() => { handler1Called = true; });
        worker.onMessage((data) => {
          const msg = data as { type: string };
          if (msg.type === 'echo') {
            handler2Called = true;
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.onError(reject);
      });

      worker.postMessage({ type: 'echo', data: 'test' });
      await done;

      expect(handler1Called).toBeTruthy();
      expect(handler2Called).toBeTruthy();
      await worker.terminate();
    });
  });
});
