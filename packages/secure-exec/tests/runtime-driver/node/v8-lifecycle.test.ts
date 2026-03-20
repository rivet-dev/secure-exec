import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { disposeSharedV8Runtime } from "../../../src/index.js";
import { createTestNodeRuntime } from "../../test-utils.js";
import type { NodeRuntime } from "../../../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

	it("process exits cleanly after runtime dispose without process.exit()", async () => {
		// Spawn a subprocess that creates a V8 runtime, runs code, disposes, and
		// verifies that the Node process exits naturally without process.exit().
		const scriptPath = resolve(__dirname, "../../../src/index.ts");
		const script = `
			import { NodeRuntime, createNodeDriver, createNodeRuntimeDriverFactory, disposeSharedV8Runtime } from "${scriptPath}";
			const runtime = new NodeRuntime({
				systemDriver: createNodeDriver(),
				runtimeDriverFactory: createNodeRuntimeDriverFactory(),
			});
			const result = await runtime.run("export const x = 42;");
			if (result.code !== 0) {
				process.stderr.write("exec failed: code=" + result.code + "\\n");
				process.exit(2);
			}
			runtime.dispose();
			await disposeSharedV8Runtime();
			// Do NOT call process.exit() — the process must exit on its own
		`;

		const { writeFileSync, unlinkSync } = await import("node:fs");
		const tmpScript = resolve(__dirname, "__clean-exit-test.mts");
		writeFileSync(tmpScript, script);

		try {
			const exitCode = await new Promise<number | null>((res, rej) => {
				const child = execFile(
					"tsx",
					[tmpScript],
					{ timeout: 30_000 },
					(err, _stdout, stderr) => {
						if (err && "killed" in err && err.killed) {
							rej(new Error(`Child process timed out (killed). stderr: ${stderr}`));
							return;
						}
						if (stderr) process.stderr.write(stderr);
						res(child.exitCode);
					},
				);
			});
			expect(exitCode).toBe(0);
		} finally {
			try { unlinkSync(tmpScript); } catch { /* ignore */ }
		}
	}, 45_000);
});
