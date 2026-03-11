import { afterEach, describe, expect, it } from "vitest";
import {
	NodeRuntime,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
} from "../../../src/index.js";
import type { NodeRuntimeOptions } from "../../../src/index.js";
import type { NodeRuntimeDriverFactory } from "../../../src/types.js";

type RuntimeOptions = Omit<NodeRuntimeOptions, "systemDriver" | "runtimeDriverFactory">;

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
});
