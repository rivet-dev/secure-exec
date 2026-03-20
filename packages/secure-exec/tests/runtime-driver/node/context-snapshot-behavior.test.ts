/**
 * Context snapshot behavior tests (NodeRuntime integration level).
 *
 * Verifies that snapshot-restored V8 contexts have working bridge
 * infrastructure through the NodeRuntime API. The snapshot is transparent
 * to the caller — these tests verify behavioral parity between fresh
 * and snapshot-restored contexts.
 *
 * Note: CJS globals (require, module, process, crypto) are tested at
 * the V8 IPC level in packages/secure-exec-v8/test/context-snapshot-behavior.test.ts.
 * Tests at this level focus on behaviors accessible through exec/run that
 * don't depend on CJS module initialization.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { NodeRuntime } from "../../../src/index.js";
import { createTestNodeRuntime } from "../../test-utils.js";

type CapturedConsoleEvent = {
	channel: "stdout" | "stderr";
	message: string;
};

function createConsoleCapture() {
	const events: CapturedConsoleEvent[] = [];
	return {
		events,
		onStdio: (event: CapturedConsoleEvent) => {
			events.push(event);
		},
		stdout: () =>
			events
				.filter((e) => e.channel === "stdout")
				.map((e) => e.message)
				.join("\n"),
		stderr: () =>
			events
				.filter((e) => e.channel === "stderr")
				.map((e) => e.message)
				.join("\n"),
	};
}

describe("context snapshot behavior", () => {
	let proc: NodeRuntime | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	// -------------------------------------------------------------------
	// AC2: __runtimeApplyConfig applies timing freeze
	// -------------------------------------------------------------------

	describe("__runtimeApplyConfig via post-restore script", () => {
		it("applies timing mitigation freeze (Date.now frozen)", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				timingMitigation: "freeze",
				onStdio: capture.onStdio,
			});

			const result = await proc.exec(`
				var t1 = Date.now();
				var t2 = Date.now();
				console.log(t1 === t2);
			`);

			expect(result.code).toBe(0);
			expect(capture.stdout().trim()).toBe("true");
		});

		it("applies timing mitigation freeze (new Date constructor)", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				timingMitigation: "freeze",
				onStdio: capture.onStdio,
			});

			const result = await proc.exec(`
				var d1 = new Date();
				var d2 = new Date();
				console.log(d1.getTime() === d2.getTime());
			`);

			expect(result.code).toBe(0);
			expect(capture.stdout().trim()).toBe("true");
		});
	});

	// -------------------------------------------------------------------
	// AC3: restored context has working console
	// -------------------------------------------------------------------

	describe("console bridge on restored context", () => {
		it("console.log routes to stdout", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`console.log("snapshot-stdout");`);

			expect(result.code).toBe(0);
			expect(capture.stdout()).toContain("snapshot-stdout");
		});

		it("console.error routes to stderr", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`console.error("snapshot-stderr");`);

			expect(result.code).toBe(0);
			expect(capture.stderr()).toContain("snapshot-stderr");
		});

		it("console.warn routes to stderr", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`console.warn("snapshot-warn");`);

			expect(result.code).toBe(0);
			expect(capture.stderr()).toContain("snapshot-warn");
		});

		it("console handles multiple arguments", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`console.log("a", 42, true);`);

			expect(result.code).toBe(0);
			expect(capture.stdout()).toContain("a 42 true");
		});

		it("console handles objects with circular references", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`
				var obj = { name: 'test' };
				obj.self = obj;
				console.log(obj);
			`);

			expect(result.code).toBe(0);
			expect(capture.stdout()).toContain("[Circular]");
		});

		it("console.debug routes to stdout", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`console.debug("debug-output");`);

			expect(result.code).toBe(0);
			expect(capture.stdout()).toContain("debug-output");
		});

		it("console.trace routes to stderr", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`console.trace("trace-output");`);

			expect(result.code).toBe(0);
			expect(capture.stderr()).toContain("trace-output");
		});
	});

	// -------------------------------------------------------------------
	// AC3: __filename and __dirname in CJS mode
	// -------------------------------------------------------------------

	describe("CJS file globals on restored context", () => {
		it("__filename and __dirname are available with filePath option", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(
				`console.log(typeof __filename, typeof __dirname);`,
				{ filePath: "/app/test.js" },
			);

			expect(result.code).toBe(0);
			expect(capture.stdout().trim()).toBe("string string");
		});
	});

	// -------------------------------------------------------------------
	// AC5: timing mitigation freeze via post-restore script
	// -------------------------------------------------------------------

	describe("timing mitigation freeze", () => {
		it("Date.now() returns the same frozen value on repeated calls", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				timingMitigation: "freeze",
				onStdio: capture.onStdio,
			});

			const result = await proc.exec(`
				var times = [];
				for (var i = 0; i < 5; i++) times.push(Date.now());
				var allSame = times.every(function(t) { return t === times[0]; });
				console.log(allSame);
			`);

			expect(result.code).toBe(0);
			expect(capture.stdout().trim()).toBe("true");
		});

		it("SharedArrayBuffer is removed in freeze mode", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				timingMitigation: "freeze",
				onStdio: capture.onStdio,
			});

			const result = await proc.exec(`
				console.log(typeof SharedArrayBuffer);
			`);

			expect(result.code).toBe(0);
			expect(capture.stdout().trim()).toBe("undefined");
		});

		it("timing mitigation off preserves real Date.now()", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				timingMitigation: "off",
				onStdio: capture.onStdio,
			});

			const before = Date.now();
			const result = await proc.exec(`console.log(Date.now());`);

			expect(result.code).toBe(0);
			const sandboxTime = parseInt(capture.stdout().trim(), 10);
			expect(sandboxTime).toBeGreaterThan(before - 10000);
			expect(sandboxTime).toBeLessThan(before + 10000);
		});

		it("SharedArrayBuffer is preserved when timing mitigation is off", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				timingMitigation: "off",
				onStdio: capture.onStdio,
			});

			const result = await proc.exec(`
				console.log(typeof SharedArrayBuffer);
			`);

			expect(result.code).toBe(0);
			expect(capture.stdout().trim()).toBe("function");
		});
	});

	// -------------------------------------------------------------------
	// AC7: exec() and run() produce correct results
	// -------------------------------------------------------------------

	describe("exec and run on snapshot-restored context", () => {
		it("exec() returns exit code 0 for successful code", async () => {
			proc = createTestNodeRuntime();
			const result = await proc.exec(`1 + 1;`);
			expect(result.code).toBe(0);
		});

		it("exec() returns structured error for runtime exceptions", async () => {
			proc = createTestNodeRuntime();
			const result = await proc.exec(`throw new TypeError("oops");`);
			expect(result.code).not.toBe(0);
			expect(result.errorMessage).toContain("oops");
		});

		it("exec() returns structured error for syntax errors", async () => {
			proc = createTestNodeRuntime();
			const result = await proc.exec(`function( {`);
			expect(result.code).not.toBe(0);
			expect(result.errorMessage).toBeTruthy();
		});

		it("run() returns ESM default export", async () => {
			proc = createTestNodeRuntime();
			const result = await proc.run(
				`export default 42;`,
				"/entry.mjs",
			);
			expect(result.exports).toEqual({ default: 42 });
		});

		it("run() returns ESM named exports", async () => {
			proc = createTestNodeRuntime();
			const result = await proc.run(
				`export const msg = 'hi'; export const num = 7;`,
				"/entry.mjs",
			);
			expect(result.exports).toEqual({ msg: "hi", num: 7 });
		});

		it("sequential exec() calls work correctly", async () => {
			proc = createTestNodeRuntime();

			const r1 = await proc.exec(`1 + 1;`);
			expect(r1.code).toBe(0);

			const r2 = await proc.exec(`2 + 2;`);
			expect(r2.code).toBe(0);

			const r3 = await proc.exec(`throw new Error("third");`);
			expect(r3.code).not.toBe(0);
		});

		it("exec() after error recovers for next call", async () => {
			proc = createTestNodeRuntime();

			const r1 = await proc.exec(`throw new RangeError("boom");`);
			expect(r1.code).not.toBe(0);

			const r2 = await proc.exec(`1 + 1;`);
			expect(r2.code).toBe(0);
		});
	});
});
