import { afterEach, describe, expect, it, vi } from "vitest";
import type { StdioEvent } from "@secure-exec/core";
import { HOST_BRIDGE_GLOBAL_KEYS } from "../src/bridge-contract.ts";
import {
	buildFsBridgeHandlers,
	buildModuleLoadingBridgeHandlers,
} from "../src/bridge-handlers.ts";
import { createBudgetState } from "../src/isolate-bootstrap.ts";
import { ProcessTable, TimerTable, type VirtualFileSystem } from "@secure-exec/core";
import { createNodeDriver, NodeExecutionDriver } from "../src/driver.ts";

function createNoopDriverProcess() {
	return {
		writeStdin() {},
		closeStdin() {},
		kill() {},
		wait: async () => 0,
		onStdout: null,
		onStderr: null,
		onExit: null,
	};
}

function createKernelBackedExecutionDriver() {
	const processTable = new ProcessTable();
	const timerTable = new TimerTable();
	const pid = processTable.allocatePid();
	const events: StdioEvent[] = [];

	processTable.register(
		pid,
		"node",
		"node",
		[],
		{
			pid,
			ppid: 0,
			env: {},
			cwd: "/root",
			fds: { stdin: 0, stdout: 1, stderr: 2 },
		},
		createNoopDriverProcess(),
	);

	const driver = new NodeExecutionDriver({
		system: createNodeDriver(),
		runtime: {
			process: {},
			os: {},
		},
		processTable,
		timerTable,
		pid,
		onStdio: (event) => {
			events.push(event);
		},
	});

	return {
		driver,
		processTable,
		timerTable,
		pid,
		stdout() {
			return events
				.filter((event) => event.channel === "stdout")
				.map((event) => event.message)
				.join("");
		},
	};
}

describe("kernel-backed Node bridge resource tracking", () => {
	let driver: NodeExecutionDriver | undefined;

	afterEach(() => {
		driver?.dispose();
		driver = undefined;
	});

	it("enforces timer limits through the kernel timer table", async () => {
		const ctx = createKernelBackedExecutionDriver();
		driver = ctx.driver;
		ctx.timerTable.setLimit(ctx.pid, 1);

		const result = await ctx.driver.exec(`
			let blocked = false;
			const interval = setInterval(() => {}, 1);
			try {
				setInterval(() => {}, 1);
			} catch (error) {
				blocked = error.message.includes("ERR_RESOURCE_BUDGET_EXCEEDED");
			}
			clearInterval(interval);
			console.log("blocked:" + blocked);
		`);

		expect(result.code).toBe(0);
		expect(ctx.stdout()).toContain("blocked:true");
		expect(ctx.timerTable.countForProcess(ctx.pid)).toBe(0);
	});

	it("enforces active handle limits through the kernel process table", async () => {
		const ctx = createKernelBackedExecutionDriver();
		driver = ctx.driver;
		ctx.processTable.setHandleLimit(ctx.pid, 1);

		const result = await ctx.driver.exec(`
			let blocked = false;
			_registerHandle("handle:1", "first");
			try {
				_registerHandle("handle:2", "second");
			} catch (error) {
				blocked = error.message.includes("ERR_RESOURCE_BUDGET_EXCEEDED");
			}
			_unregisterHandle("handle:1");
			console.log("blocked:" + blocked);
		`);

		expect(result.code).toBe(0);
		expect(ctx.stdout()).toContain("blocked:true");
		expect(ctx.processTable.getHandles(ctx.pid).size).toBe(0);
	});

	it("filters POSIX '.' and '..' entries from Node readdir bridge results", async () => {
		const filesystem = {
			readDirWithTypes: async () => [
				{ name: ".", isDirectory: true, ino: 10 },
				{ name: "..", isDirectory: true, ino: 1 },
				{ name: "file.txt", isDirectory: false, ino: 11 },
			],
		} as Pick<VirtualFileSystem, "readDirWithTypes"> as VirtualFileSystem;
		const handlers = buildFsBridgeHandlers({
			filesystem,
			budgetState: createBudgetState(),
			bridgeBase64TransferLimitBytes: 1024,
			isolateJsonPayloadLimitBytes: 1024,
		});

		const json = await handlers[HOST_BRIDGE_GLOBAL_KEYS.fsReadDir]("/tmp");

		expect(JSON.parse(String(json))).toEqual([
			{ name: "file.txt", isDirectory: false, ino: 11 },
		]);
	});

	it("preserves undefined args, structured errors, and missing-handler fallback in _bridgeDispatch", async () => {
		const handlers = buildModuleLoadingBridgeHandlers(
			{
				filesystem: {} as VirtualFileSystem,
				resolutionCache: new Map(),
			},
			{
				echo: (...args: unknown[]) => args,
				fail: () => {
					const error = new Error("dispatch failed") as Error & {
						code?: string;
					};
					error.name = "RangeError";
					error.code = "ERR_TEST_DISPATCH";
					error.stack = "RangeError: dispatch failed\n    at bridge";
					throw error;
				},
			},
		);

		const dispatch = handlers[HOST_BRIDGE_GLOBAL_KEYS.bridgeDispatch];

		await expect(
			dispatch("echo", undefined, { nested: undefined, value: 7 }),
		).resolves.toEqual({
			__bd_result: [undefined, { nested: undefined, value: 7 }],
		});
		await expect(dispatch("missing-handler")).resolves.toBeNull();
		await expect(dispatch("fail")).resolves.toEqual({
			__bd_error: {
				message: "dispatch failed",
				name: "RangeError",
				code: "ERR_TEST_DISPATCH",
				stack: "RangeError: dispatch failed\n    at bridge",
			},
		});
	});

	it("skips managed-resource polling when exec work leaves no host resources", async () => {
		const ctx = createKernelBackedExecutionDriver();
		driver = ctx.driver;
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		try {
			await (ctx.driver as any).waitForManagedResources();
		} finally {
			setTimeoutSpy.mockRestore();
		}

		expect(setTimeoutSpy).not.toHaveBeenCalled();
	});

	it("keeps polling while managed host resources are still active", async () => {
		const ctx = createKernelBackedExecutionDriver();
		driver = ctx.driver;
		const state = (ctx.driver as any).state as {
			activeHttpClientRequests: { count: number };
		};

		state.activeHttpClientRequests.count = 1;
		vi.useFakeTimers();
		try {
			let settled = false;
			const waitPromise = ((ctx.driver as any).waitForManagedResources() as Promise<void>).then(
				() => {
					settled = true;
				},
			);

			await vi.advanceTimersByTimeAsync(9);
			expect(settled).toBe(false);

			state.activeHttpClientRequests.count = 0;
			await vi.advanceTimersByTimeAsync(10);
			await waitPromise;

			expect(settled).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
