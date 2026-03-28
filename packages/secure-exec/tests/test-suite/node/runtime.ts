import { afterEach, expect, it } from "vitest";
import type { StdioEvent } from "../../../src/shared/api-types.js";
import type { NodeRuntimeOptions } from "../../../src/runtime.js";

export type NodeRuntimeTarget = "node" | "browser";

type RuntimeOptions = Omit<NodeRuntimeOptions, "systemDriver" | "runtimeDriverFactory">;

type RuntimeLike = {
	exec: (code: string) => Promise<{ code: number; errorMessage?: string }>;
	run: (code: string, filename?: string) => Promise<{
		code: number;
		errorMessage?: string;
		exports?: unknown;
	}>;
	network: {
		fetch: (
			url: string,
			init?: { method?: string; headers?: Record<string, string>; body?: string },
		) => Promise<{ ok: boolean; body: string }>;
		dnsLookup: (
			hostname: string,
			family?: 4 | 6,
		) => Promise<
			| { address: string; family: 4 | 6 }
			| { error: string; code?: string; errno?: number }
		>;
	};
	dispose: () => void;
	terminate: () => Promise<void>;
};

export type NodeSuiteContext = {
	target: NodeRuntimeTarget;
	createRuntime(options?: RuntimeOptions): Promise<RuntimeLike>;
	teardown(): Promise<void>;
};

export function runNodeSuite(context: NodeSuiteContext): void {
	afterEach(async () => {
		await context.teardown();
	});

	it("executes scripts without runtime-managed stdout buffers", async () => {
		const events: StdioEvent[] = [];
		const runtime = await context.createRuntime({
			onStdio: (event) => events.push(event),
		});
		const result = await runtime.exec(`console.log("hello");`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result).not.toHaveProperty("stdout");
		expect(result).not.toHaveProperty("stderr");
		// Verify the script actually produced output via the streaming hook
		const stdoutMessages = events
			.filter((e) => e.channel === "stdout")
			.map((e) => e.message);
		expect(stdoutMessages.length).toBeGreaterThan(0);
		expect(stdoutMessages.join("")).toContain("hello");
	});

	it("returns CommonJS exports from run()", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(
			`module.exports = { ok: true, runtimeDriver: "${context.target}" };`,
		);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			ok: true,
			runtimeDriver: context.target,
		});
	});

	it("returns ESM namespace exports from run()", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(
			`export const answer = 42; export default "ok";`,
			"/entry.mjs",
		);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({ answer: 42, default: "ok" });
	});

	it("supports sequential exec() calls on the same runtime without disposal errors", async () => {
		const events: StdioEvent[] = [];
		const runtime = await context.createRuntime({
			onStdio: (event) => events.push(event),
		});

		// Simulate an AI SDK tool loop: multiple exec() calls in sequence
		for (let step = 1; step <= 5; step++) {
			const result = await runtime.exec(`console.log("step-${step}");`);
			expect(result.code).toBe(0);
			expect(result.errorMessage).toBeUndefined();
		}

		// All five steps produced output
		const stdout = events
			.filter((e) => e.channel === "stdout")
			.map((e) => e.message)
			.join("");
		for (let step = 1; step <= 5; step++) {
			expect(stdout).toContain(`step-${step}`);
		}
	});

	it("supports interleaved exec() and run() on the same runtime", async () => {
		const runtime = await context.createRuntime();

		const r1 = await runtime.exec(`console.log("warmup");`);
		expect(r1.code).toBe(0);

		const r2 = await runtime.run(`module.exports = { value: 42 };`);
		expect(r2.code).toBe(0);
		expect(r2.exports).toEqual({ value: 42 });

		const r3 = await runtime.exec(`console.log("after-run");`);
		expect(r3.code).toBe(0);
	});

	it("throws a clear error when exec() is called after dispose()", async () => {
		const runtime = await context.createRuntime();
		const r1 = await runtime.exec(`console.log("ok");`);
		expect(r1.code).toBe(0);

		runtime.dispose();

		await expect(runtime.exec(`console.log("should-fail");`)).rejects.toThrow(
			/disposed/i,
		);
	});

	it("drops high-volume logs by default to avoid buffering amplification", async () => {
		const events: StdioEvent[] = [];
		const runtime = await context.createRuntime({
			onStdio: (event) => events.push(event),
			resourceBudgets: { maxOutputBytes: 1024 },
		});
		const result = await runtime.exec(`
      for (let i = 0; i < 2500; i += 1) {
        console.log("line-" + i);
      }
    `);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result).not.toHaveProperty("stdout");
		expect(result).not.toHaveProperty("stderr");
		// Verify some events arrive (proving output was produced)
		expect(events.length).toBeGreaterThan(0);
		// Verify count is bounded below total (proving budget caps output)
		expect(events.length).toBeLessThan(2500);
	});
}
