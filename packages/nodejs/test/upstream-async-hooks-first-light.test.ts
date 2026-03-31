import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	createKernel,
	type Kernel,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import { createNodeDriver } from "../src/index.ts";
import {
	createReplacementNodeKernelRuntime,
	createReplacementNodeRuntimeDriverFactory,
	runUpstreamAsyncHooksFirstLightEval,
	type UpstreamBootstrapEvalResult,
} from "../src/upstream/bootstrap-execution.ts";

interface AsyncHooksTimerSummary {
	asyncResourceAsyncId: number | null;
	boundStore: string | null;
	clearedImmediateDestroyed: boolean;
	clearedImmediateTracked: boolean;
	hookCounts: {
		after: number;
		before: number;
		destroy: number;
		init: number;
	};
	nextTickStore: string | null;
	resourceStore: string | null;
	sawImmediateType: boolean;
	snapshotStore: string | null;
	timerStore: string | null;
}

interface AsyncHooksNetSummary {
	clientStore: string | null;
	hookCounts: {
		init: number;
	};
	sawSocketType: boolean;
	serverStore: string | null;
}

const ASYNC_HOOKS_TIMER_EVAL = `
const { AsyncLocalStorage, AsyncResource, createHook } = require('async_hooks');

const summary = {
  asyncResourceAsyncId: null,
  boundStore: null,
  clearedImmediateDestroyed: false,
  clearedImmediateTracked: false,
  hookCounts: { init: 0, before: 0, after: 0, destroy: 0 },
  nextTickStore: null,
  resourceStore: null,
  sawImmediateType: false,
  snapshotStore: null,
  timerStore: null,
};

const immediateEntries = [];
const destroyedIds = new Set();

createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    summary.hookCounts.init += 1;
    if (type === 'Immediate') {
      summary.sawImmediateType = true;
      immediateEntries.push({ asyncId, resource, triggerAsyncId });
    }
  },
  before() {
    summary.hookCounts.before += 1;
  },
  after() {
    summary.hookCounts.after += 1;
  },
  destroy(asyncId) {
    summary.hookCounts.destroy += 1;
    destroyedIds.add(asyncId);
  },
}).enable();

const storage = new AsyncLocalStorage();
storage.run({ id: 'ctx' }, () => {
  const clearedImmediate = setImmediate(() => {
    process.__secureExecDone('cleared immediate callback should not execute');
  });
  const clearedImmediateEntry =
    immediateEntries.find((entry) => entry.resource === clearedImmediate) ?? null;
  summary.clearedImmediateTracked = clearedImmediateEntry !== null;
  clearImmediate(clearedImmediate);
  summary.clearedImmediateDestroyed =
    clearedImmediateEntry !== null && destroyedIds.has(clearedImmediateEntry.asyncId);

  process.nextTick(() => {
    summary.nextTickStore = storage.getStore()?.id ?? null;
  });

  const bound = AsyncLocalStorage.bind(() => {
    summary.boundStore = storage.getStore()?.id ?? null;
  });
  const snapshot = AsyncLocalStorage.snapshot();

  setTimeout(() => {
    summary.timerStore = storage.getStore()?.id ?? null;
    bound();
    summary.snapshotStore = snapshot(() => storage.getStore()?.id ?? null);

    const resource = new AsyncResource('SecureExecAsyncResource');
    summary.asyncResourceAsyncId = resource.asyncId();
    resource.runInAsyncScope(() => {
      summary.resourceStore = storage.getStore()?.id ?? null;
    });
    resource.emitDestroy();

    process.stdout.write(JSON.stringify(summary));
    process.__secureExecDone();
  }, 0);
});
`.trim();

const ASYNC_HOOKS_NET_EVAL = `
const { AsyncLocalStorage, createHook } = require('async_hooks');
const net = require('net');

const summary = {
  clientStore: null,
  hookCounts: { init: 0 },
  sawSocketType: false,
  serverStore: null,
};

let client;
let server;
let serverSocket;
let finished = false;

function finish(error) {
  if (finished) {
    return;
  }
  finished = true;
  client?.destroy();
  serverSocket?.destroy();
  server?.close(() => {});
  if (error) {
    process.__secureExecDone(error.stack || String(error));
    return;
  }
  process.stdout.write(JSON.stringify(summary));
  process.__secureExecDone();
}

createHook({
  init(asyncId, type) {
    summary.hookCounts.init += 1;
    if (type.includes('Socket.') || type.startsWith('Server.')) {
      summary.sawSocketType = true;
    }
  },
}).enable();

const storage = new AsyncLocalStorage();
storage.run({ id: 'ctx' }, () => {
  server = net.createServer((socket) => {
    serverSocket = socket;
    socket.on('data', () => {
      summary.serverStore = storage.getStore()?.id ?? null;
      socket.end('pong');
      finish();
    });
    socket.on('error', finish);
  });

  server.listen(0, '127.0.0.1', () => {
    client = net.connect({
      host: '127.0.0.1',
      port: server.address().port,
    });
    client.on('connect', () => {
      summary.clientStore = storage.getStore()?.id ?? null;
      client.write('ping');
    });
    client.on('error', finish);
  });

  server.on('error', finish);
});
`.trim();

function readStdout(events: readonly StdioEvent[]): string {
	return events
		.filter((event) => event.channel === "stdout")
		.map((event) => event.message)
		.join("");
}

function readBufferChunks(chunks: readonly Uint8Array[]): string {
	return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function parseJson<T>(stdout: string): T {
	return JSON.parse(stdout) as T;
}

function expectTimerSummary(summary: AsyncHooksTimerSummary): void {
	expect(summary.timerStore).toBe("ctx");
	expect(summary.nextTickStore).toBe("ctx");
	expect(summary.boundStore).toBe("ctx");
	expect(summary.snapshotStore).toBe("ctx");
	expect(summary.resourceStore).toBe("ctx");
	expect(summary.asyncResourceAsyncId).toBeGreaterThan(0);
	expect(summary.clearedImmediateTracked).toBe(true);
	expect(summary.clearedImmediateDestroyed).toBe(true);
	expect(summary.hookCounts.init).toBeGreaterThan(0);
	expect(summary.hookCounts.before).toBeGreaterThan(0);
	expect(summary.hookCounts.after).toBeGreaterThan(0);
	expect(summary.hookCounts.destroy).toBeGreaterThan(0);
	expect(summary.sawImmediateType).toBe(true);
}

function expectNetSummary(summary: AsyncHooksNetSummary): void {
	expect(summary.clientStore).toBe("ctx");
	expect(summary.serverStore).toBe("ctx");
	expect(summary.hookCounts.init).toBeGreaterThan(0);
	expect(summary.sawSocketType).toBe(true);
}

function expectSuccessfulAsyncHooksEval(
	result: UpstreamBootstrapEvalResult,
	expectedBuiltins: readonly string[],
): void {
	expect(result.status, result.errorMessage ?? result.stderr).toBe("pass");
	expect(result.code, result.stderr || result.errorMessage).toBe(0);
	expect(result.entrypoint).toBe("secure_exec/post_bootstrap_eval");
	expect(result.vendoredPublicBuiltinsLoaded).toEqual(
		expect.arrayContaining(expectedBuiltins),
	);
	expect(result.publicBuiltinFallbacks).not.toContain("async_hooks");
	expect(result.appliedBindingShims).toEqual(
		expect.arrayContaining(["async_hooks-supported-subset-module"]),
	);
}

describe("upstream async_hooks first-light", () => {
	let runtime: NodeRuntime | undefined;
	let kernel: Kernel | undefined;

	afterEach(async () => {
		runtime?.dispose();
		runtime = undefined;

		if (kernel) {
			await kernel.dispose();
			kernel = undefined;
		}
	});

	it("loads the supported async_hooks subset through the isolated child runner", async () => {
		const timerResult = await runUpstreamAsyncHooksFirstLightEval({
			code: ASYNC_HOOKS_TIMER_EVAL,
		});
		expectSuccessfulAsyncHooksEval(timerResult, ["async_hooks"]);
		expectTimerSummary(parseJson<AsyncHooksTimerSummary>(timerResult.stdout));

		const netResult = await runUpstreamAsyncHooksFirstLightEval({
			code: ASYNC_HOOKS_NET_EVAL,
		});
		expectSuccessfulAsyncHooksEval(netResult, ["async_hooks", "net"]);
		expect(netResult.publicBuiltinFallbacks).not.toContain("net");
		expect(netResult.appliedBindingShims).toEqual(
			expect.arrayContaining(["tcp_wrap-owner-subclass"]),
		);
		expectNetSummary(parseJson<AsyncHooksNetSummary>(netResult.stdout));
	});

	it("runs async_hooks first-light through standalone NodeRuntime", async () => {
		const runStandaloneEval = async (
			code: string,
		): Promise<{ resultCode: number; stdout: string }> => {
			const stdio: StdioEvent[] = [];
			runtime = new NodeRuntime({
				systemDriver: createNodeDriver({
					filesystem: createInMemoryFileSystem(),
					commandExecutor: createCommandExecutorStub(),
				}),
				runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
				onStdio: (event) => stdio.push(event),
			});

			try {
				const result = await runtime.exec(code);
				return {
					resultCode: result.code,
					stdout: readStdout(stdio),
				};
			} finally {
				runtime.dispose();
				runtime = undefined;
			}
		};

		const timerRun = await runStandaloneEval(ASYNC_HOOKS_TIMER_EVAL);
		expect(timerRun.resultCode).toBe(0);
		expectTimerSummary(parseJson<AsyncHooksTimerSummary>(timerRun.stdout));

		const netRun = await runStandaloneEval(ASYNC_HOOKS_NET_EVAL);
		expect(netRun.resultCode).toBe(0);
		expectNetSummary(parseJson<AsyncHooksNetSummary>(netRun.stdout));
	});

	it("runs async_hooks first-light through a kernel-mounted runtime driver", async () => {
		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.mount(createReplacementNodeKernelRuntime());

		const runKernelEval = async (
			code: string,
		): Promise<{ exitCode: number; stderr: string; stdout: string }> => {
			const stdout: Uint8Array[] = [];
			const stderr: Uint8Array[] = [];
			const proc = kernel!.spawn("node", ["-e", code], {
				onStdout: (data) => stdout.push(data),
				onStderr: (data) => stderr.push(data),
			});
			return {
				exitCode: await proc.wait(),
				stdout: readBufferChunks(stdout),
				stderr: readBufferChunks(stderr),
			};
		};

		const timerRun = await runKernelEval(ASYNC_HOOKS_TIMER_EVAL);
		expect(timerRun.exitCode, timerRun.stderr).toBe(0);
		expect(timerRun.stderr).toBe("");
		expectTimerSummary(parseJson<AsyncHooksTimerSummary>(timerRun.stdout));

		const netRun = await runKernelEval(ASYNC_HOOKS_NET_EVAL);
		expect(netRun.exitCode, netRun.stderr).toBe(0);
		expect(netRun.stderr).toBe("");
		expectNetSummary(parseJson<AsyncHooksNetSummary>(netRun.stdout));
	});
});
