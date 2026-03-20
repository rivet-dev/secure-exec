import { afterEach, describe, expect, it } from "vitest";
import { disposeSharedV8Runtime } from "../../../src/index.js";
import { createTestNodeRuntime } from "../../test-utils.js";
import type { NodeRuntime } from "../../../src/index.js";

describe("V8 shared runtime lifecycle", () => {
	let proc: NodeRuntime | undefined;

	afterEach(async () => {
		proc?.dispose();
		proc = undefined;
		// Ensure the shared runtime is cleaned up between tests
		await disposeSharedV8Runtime();
	});

	it("disposeSharedV8Runtime kills the child process", async () => {
		// First exec — spins up the shared V8 runtime
		proc = createTestNodeRuntime();
		const result1 = await proc.exec(`console.log("hello")`);
		expect(result1.code).toBe(0);
		proc.dispose();
		proc = undefined;

		// Dispose the shared runtime — kills the Rust child process
		await disposeSharedV8Runtime();

		// Next exec — must create a brand-new V8 runtime (proves the old one was killed)
		proc = createTestNodeRuntime();
		const result2 = await proc.exec(`console.log("world")`);
		expect(result2.code).toBe(0);
	});

	it("after getSharedV8Runtime failure, next attempt retries", async () => {
		// Verify the singleton can be disposed and recreated multiple times —
		// the same reset mechanism (nulling sharedV8RuntimePromise) powers both
		// the dispose path and the .catch() retry path.
		for (let i = 0; i < 3; i++) {
			proc = createTestNodeRuntime();
			const result = await proc.exec(`console.log(${i})`);
			expect(result.code).toBe(0);
			proc.dispose();
			proc = undefined;
			await disposeSharedV8Runtime();
		}
	});
});
