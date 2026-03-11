import { afterEach, describe, expect, it } from "vitest";
import {
	NodeRuntime,
	allowAllNetwork,
	createBrowserDriver,
	createBrowserRuntimeDriverFactory,
} from "../../../src/browser-runtime.js";
import type { NodeRuntimeOptions } from "../../../src/browser-runtime.js";

const IS_BROWSER_ENV =
	typeof window !== "undefined" && typeof Worker !== "undefined";

type RuntimeOptions = Omit<NodeRuntimeOptions, "systemDriver" | "runtimeDriverFactory">;

const UNSUPPORTED_BROWSER_RUNTIME_OPTIONS: Array<[string, RuntimeOptions]> = [
	["memoryLimit", { memoryLimit: 128 }],
	["cpuTimeLimitMs", { cpuTimeLimitMs: 250 }],
	["timingMitigation", { timingMitigation: "off" }],
	[
		"payloadLimits.base64TransferBytes",
		{ payloadLimits: { base64TransferBytes: 4096 } },
	],
	[
		"payloadLimits.jsonPayloadBytes",
		{ payloadLimits: { jsonPayloadBytes: 4096 } },
	],
];

describe.skipIf(!IS_BROWSER_ENV)("runtime driver specific: browser", () => {
	const runtimes = new Set<NodeRuntime>();

	const createRuntime = async (
		options: RuntimeOptions = {},
	): Promise<NodeRuntime> => {
		const systemDriver = await createBrowserDriver({
			filesystem: "memory",
			useDefaultNetwork: true,
			permissions: allowAllNetwork,
		});
		const runtime = new NodeRuntime({
			...options,
			systemDriver,
			runtimeDriverFactory: createBrowserRuntimeDriverFactory({
				workerUrl: new URL("../../../src/browser/worker.ts", import.meta.url),
			}),
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

	it.each(UNSUPPORTED_BROWSER_RUNTIME_OPTIONS)(
		"rejects browser runtime construction option %s",
		async (optionName, options) => {
			await expect(createRuntime(options)).rejects.toThrow(optionName);
		},
	);

	it("rejects Node-only exec options for browser runtime", async () => {
		const runtime = await createRuntime();
		await expect(
			runtime.exec("console.log('nope')", { cpuTimeLimitMs: 10 }),
		).rejects.toThrow("cpuTimeLimitMs");
	});

	it("accepts supported cross-target options and streams stdio", async () => {
		const events: Array<{ channel: "stdout" | "stderr"; message: string }> = [];
		const runtime = await createRuntime({
			onStdio: (event) => events.push(event),
		});
		const result = await runtime.exec(`console.log("browser-ok");`);
		expect(result.code).toBe(0);
		expect(events).toContainEqual({
			channel: "stdout",
			message: "browser-ok",
		});
	});

	it("treats TypeScript-only syntax as a JavaScript execution failure", async () => {
		const runtime = await createRuntime();
		const result = await runtime.exec(
			`
			const value: string = 123;
			console.log("should-not-run");
		`,
			{
				filePath: "/playground.ts",
			},
		);

		expect(result.code).toBe(1);
		expect(result.errorMessage).toBeDefined();
	});

	it("supports repeated exec calls on the same browser runtime", async () => {
		const runtime = await createRuntime();
		const first = await runtime.exec(`
      globalThis.__browserCounter = (globalThis.__browserCounter ?? 0) + 1;
      console.log("browser-counter:" + globalThis.__browserCounter);
    `);
		const second = await runtime.exec(`
      globalThis.__browserCounter = (globalThis.__browserCounter ?? 0) + 1;
      console.log("browser-counter:" + globalThis.__browserCounter);
    `);

		expect(first.code).toBe(0);
		expect(second.code).toBe(0);
		expect(second.errorMessage).toBeUndefined();
	});

	it("keeps HTTP2 server APIs unsupported in browser runtime", async () => {
		const runtime = await createRuntime();
		const result = await runtime.exec(`
      const http2 = require("http2");
      http2.createServer();
    `);
		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(
			"http2.createServer is not supported in sandbox",
		);
	});
});
