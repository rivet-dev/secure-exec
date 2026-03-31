import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	createKernel,
	type Kernel,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import {
	createNodeDriver,
	createNodeRuntime,
	createNodeRuntimeDriverFactory,
	NodeExecutionDriver,
	TIMEOUT_EXIT_CODE,
} from "../src/index.ts";

function readStdout(events: readonly StdioEvent[]): string {
	return events
		.filter((event) => event.channel === "stdout")
		.map((event) => event.message)
		.join("");
}

describe("replacement runtime execution ownership", () => {
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

	it("creates public standalone runtime drivers with NodeExecutionDriver", () => {
		const systemDriver = createNodeDriver({
			filesystem: createInMemoryFileSystem(),
			commandExecutor: createCommandExecutorStub(),
		});
		const driver = createNodeRuntimeDriverFactory().createRuntimeDriver({
			system: systemDriver,
			runtime: systemDriver.runtime,
			cpuTimeLimitMs: 250,
			timingMitigation: "freeze",
		});

		try {
			expect(driver).toBeInstanceOf(NodeExecutionDriver);
		} finally {
			driver.dispose();
		}
	});

	it("keeps timing mitigation and timeout recovery on the public standalone runtime path", async () => {
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			cpuTimeLimitMs: 200,
			timingMitigation: "freeze",
			systemDriver: createNodeDriver({
				filesystem: createInMemoryFileSystem(),
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const frozenTime = await runtime.run<{ first: number; second: number }>(
			"module.exports = { first: Date.now(), second: Date.now() };",
		);
		expect(frozenTime.code).toBe(0);
		expect(frozenTime.exports).toEqual({
			first: frozenTime.exports?.first,
			second: frozenTime.exports?.first,
		});

		const timedOut = await runtime.exec("while (true) {}");
		expect(timedOut.code).toBe(TIMEOUT_EXIT_CODE);

		const recovered = await runtime.run("module.exports = 7;");
		expect(recovered.code).toBe(0);
		expect(recovered.exports).toBe(7);
		expect(readStdout(stdio)).toBe("");
	});

	it("keeps kernel-mounted node execution on the public V8-backed runtime path", async () => {
		const driver = createNodeRuntime({ memoryLimit: 32 });
		expect((driver as { _memoryLimit?: number })._memoryLimit).toBe(32);

		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.mount(driver);

		const stdout: Uint8Array[] = [];
		const stderr: Uint8Array[] = [];
		const second = kernel.spawn("node", ["-e", "process.stdout.write('kernel-recovered');"], {
			onStdout: (chunk) => stdout.push(chunk),
			onStderr: (chunk) => stderr.push(chunk),
		});
		const secondExit = await second.wait();

		expect(secondExit).toBe(0);
		expect(
			Buffer.concat(stdout.map((chunk) => Buffer.from(chunk))).toString("utf8"),
		).toBe("kernel-recovered");
		expect(
			Buffer.concat(stderr.map((chunk) => Buffer.from(chunk))).toString("utf8"),
		).toBe("");
	});
});
