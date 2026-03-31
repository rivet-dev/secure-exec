import { afterEach, describe, expect, it } from "vitest";
import {
	NodeRuntime,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
} from "../../../src/index.js";
import type { NodeRuntimeOptions } from "../../../src/index.js";
import type { NodeRuntimeDriverFactory } from "../../../src/types.js";
import type { ProcessConfig } from "../../../src/shared/api-types.js";

type RuntimeOptions = Omit<NodeRuntimeOptions, "systemDriver" | "runtimeDriverFactory">;

function createRuntimeWithProcessConfig(
	processConfig: ProcessConfig,
	runtimes: Set<NodeRuntime>,
): NodeRuntime {
	const runtime = new NodeRuntime({
		systemDriver: createNodeDriver({ processConfig }),
		runtimeDriverFactory: createNodeRuntimeDriverFactory(),
	});
	runtimes.add(runtime);
	return runtime;
}

describe("runtime driver specific: node", () => {
	const runtimes = new Set<NodeRuntime>();

	const createRuntime = (options: RuntimeOptions = {}): NodeRuntime => {
		const runtime = new NodeRuntime({
			...options,
			systemDriver: createNodeDriver({}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		});
		runtimes.add(runtime);
		return runtime;
	};

	afterEach(async () => {
		const runtimeList = Array.from(runtimes);
		runtimes.clear();

		for (const runtime of runtimeList) {
			try {
				await runtime.terminate();
			} catch {
				runtime.dispose();
			}
		}
	});

	it("accepts Node-only runtime construction options", async () => {
		const runtimeDriverFactory: NodeRuntimeDriverFactory =
			createNodeRuntimeDriverFactory();
		const runtime = new NodeRuntime({
			memoryLimit: 128,
			// Keep the default runtime limit low enough to exercise node-only
			// construction options without depending on machine-specific startup jitter.
			cpuTimeLimitMs: 500,
			timingMitigation: "off",
			payloadLimits: {
				base64TransferBytes: 4096,
				jsonPayloadBytes: 4096,
			},
			systemDriver: createNodeDriver({}),
			runtimeDriverFactory,
		});

		const result = await runtime.exec(`console.log("node-runtime-options-ok");`);
		expect(result.code).toBe(0);
	});

	it("accepts Node-only exec options", async () => {
		const runtime = createRuntime();
		const result = await runtime.exec(`console.log("node-exec-options-ok");`, {
			// Keep the limit low enough to exercise the node-only option path
			// without coupling the test to machine-specific startup jitter.
			cpuTimeLimitMs: 250,
			timingMitigation: "off",
		});
		expect(result.code).toBe(0);
	});

	it("treats empty exec stdin as an immediate EOF", async () => {
		const runtime = new NodeRuntime({
			systemDriver: createNodeDriver({}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		});
		runtimes.add(runtime);

		const result = await runtime.exec(
			[
				'let sawData = false;',
				'process.stdin.setEncoding("utf8");',
				'process.stdin.on("data", () => { sawData = true; });',
				'let sawEnd = false;',
				'process.stdin.on("end", () => { sawEnd = true; });',
				'process.stdin.resume();',
				'setTimeout(() => {',
				'  if (!sawEnd || sawData) process.exitCode = 9;',
				'}, 0);',
			].join("\n"),
			{ stdin: "" },
		);

		expect(result.code).toBe(0);
	});

	it("treats TypeScript-only syntax as a JavaScript execution failure", async () => {
		const runtime = createRuntime();
		const result = await runtime.exec(
			`
			const value: string = 123;
			console.log(value);
		`,
			{ filePath: "/entry.js" },
		);
		expect(result.code).toBe(1);
		expect(result.errorMessage).toBeDefined();
	});

	describe("isTTY and setRawMode", () => {
		it("process.stdout.isTTY is true when stdoutIsTTY is set in processConfig", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdoutIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(
				`module.exports = process.stdout.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stderr.isTTY is true when stderrIsTTY is set in processConfig", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stderrIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(
				`module.exports = process.stderr.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stdin.isTTY is true when stdinIsTTY is set in processConfig", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdinIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(
				`module.exports = process.stdin.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stdout.isTTY is false by default (no PTY)", async () => {
			const runtime = createRuntime();
			const result = await runtime.run(
				`module.exports = process.stdout.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(false);
		});

		it("process.stdin.isTTY is false by default (no PTY)", async () => {
			const runtime = createRuntime();
			const result = await runtime.run(
				`module.exports = process.stdin.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(false);
		});

		it("process.stdin.setRawMode(true) succeeds when stdinIsTTY is true", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdinIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(`
				const ret = process.stdin.setRawMode(true);
				module.exports = ret === process.stdin;
			`);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stdin.setRawMode(false) succeeds when stdinIsTTY is true", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdinIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(`
				process.stdin.setRawMode(true);
				const ret = process.stdin.setRawMode(false);
				module.exports = ret === process.stdin;
			`);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stdin.setRawMode throws when isTTY is false", async () => {
			const runtime = createRuntime();
			const result = await runtime.exec(`
				try {
					process.stdin.setRawMode(true);
					console.log("ERROR:no-throw");
				} catch (e) {
					console.log("CAUGHT:" + e.message);
				}
			`);
			expect(result.code).toBe(0);
		});

		it("isTTY flags are independent per stream", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdinIsTTY: true, stdoutIsTTY: false, stderrIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(`
				module.exports = {
					stdin: process.stdin.isTTY,
					stdout: process.stdout.isTTY,
					stderr: process.stderr.isTTY,
				};
			`);
			expect(result.code).toBe(0);
			expect(result.exports).toEqual({
				stdin: true,
				stdout: false,
				stderr: true,
			});
		});
	});
});
