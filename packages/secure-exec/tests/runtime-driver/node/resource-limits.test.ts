import { afterEach, describe, expect, it } from "vitest";
import { createTestNodeRuntime } from "../../test-utils.js";
import type { NodeRuntime } from "../../../src/index.js";

describe("NodeRuntime resource limits", { timeout: 60_000 }, () => {
	let proc: NodeRuntime | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	// -----------------------------------------------------------------------
	// memoryLimit — V8 heap limit enforcement
	// -----------------------------------------------------------------------

	describe("memoryLimit", () => {
		it("terminates a process that exceeds the heap limit", async () => {
			proc = createTestNodeRuntime({ memoryLimit: 32 });

			const result = await proc.exec(`
				// Allocate large arrays until OOM
				const arrays = [];
				while (true) {
					arrays.push(new Uint8Array(1024 * 1024)); // 1MB chunks
				}
			`);

			expect(result.code).not.toBe(0);
		});

		it("keeps runtime usable after memoryLimit OOM", async () => {
			proc = createTestNodeRuntime({ memoryLimit: 32 });

			const oom = await proc.exec(`
				const arrays = [];
				while (true) {
					arrays.push(new Uint8Array(1024 * 1024));
				}
			`);
			expect(oom.code).not.toBe(0);

			const recovered = await proc.exec("console.log('ok');");
			expect(recovered.code).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// cpuTimeLimitMs — execution timeout enforcement
	// -----------------------------------------------------------------------

	describe("cpuTimeLimitMs", () => {
		it("kills an infinite loop within a reasonable tolerance", async () => {
			proc = createTestNodeRuntime({ cpuTimeLimitMs: 200 });

			const start = Date.now();
			const result = await proc.exec(`while (true) {}`);
			const elapsed = Date.now() - start;

			expect(result.code).toBe(124);
			expect(result.errorMessage).toMatch(/time limit/i);
			// Should terminate within ~500ms (200ms limit + overhead)
			expect(elapsed).toBeLessThan(2000);
		});

		it("does not kill a fast-completing script", async () => {
			proc = createTestNodeRuntime({ cpuTimeLimitMs: 2000 });

			const result = await proc.exec(`
				console.log("fast");
			`);

			expect(result.code).toBe(0);
		});
	});
});
