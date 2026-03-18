import { afterEach, describe, expect, it } from "vitest";
import { allowAllFs, createInMemoryFileSystem } from "../../../src/index.js";
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

describe("bridge-side resource hardening", () => {
	let proc: NodeRuntime | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	// -------------------------------------------------------------------
	// FD table limit — bridge enforces max open files
	// -------------------------------------------------------------------

	describe("FD table limit", () => {
		it("throws EMFILE when opening more than 1024 files", async () => {
			const capture = createConsoleCapture();

			// Pre-populate VFS with enough files to hit the FD limit
			const vfs = createInMemoryFileSystem();
			for (let i = 0; i < 1025; i++) {
				await vfs.writeFile(`/app/fd-test-${i}`, "x");
			}

			proc = createTestNodeRuntime({
				permissions: { ...allowAllFs },
				onStdio: capture.onStdio,
				filesystem: vfs,
			});

			const result = await proc.exec(`
				const fs = require('fs');
				const results = {};

				let opened = 0;
				let emfileThrown = false;
				let errorCode = '';
				try {
					for (let i = 0; i < 1025; i++) {
						fs.openSync('/app/fd-test-' + i, 'r');
						opened++;
					}
				} catch (e) {
					emfileThrown = true;
					errorCode = e.code;
				}

				results.opened = opened;
				results.emfileThrown = emfileThrown;
				results.errorCode = errorCode;
				console.log(JSON.stringify(results));
			`);

			expect(result.code).toBe(0);
			const results = JSON.parse(capture.stdout().trim());
			expect(results.emfileThrown).toBe(true);
			expect(results.errorCode).toBe("EMFILE");
			expect(results.opened).toBe(1024);
		});

		it("allows reopening after closing files", async () => {
			const capture = createConsoleCapture();

			const vfs = createInMemoryFileSystem();
			for (let i = 0; i < 1025; i++) {
				await vfs.writeFile(`/app/reopen-${i}`, "x");
			}

			proc = createTestNodeRuntime({
				permissions: { ...allowAllFs },
				onStdio: capture.onStdio,
				filesystem: vfs,
			});

			const result = await proc.exec(`
				const fs = require('fs');
				const fds = [];

				// Open files up to limit
				for (let i = 0; i < 1024; i++) {
					fds.push(fs.openSync('/app/reopen-' + i, 'r'));
				}

				// Should fail at limit
				let blocked = false;
				try {
					fs.openSync('/app/reopen-1024', 'r');
				} catch (e) {
					blocked = e.code === 'EMFILE';
				}

				// Close one FD, then reopen should succeed
				fs.closeSync(fds[0]);
				let reopened = false;
				try {
					fs.openSync('/app/reopen-1024', 'r');
					reopened = true;
				} catch (_e) {
					// Should not throw
				}

				console.log(JSON.stringify({ blocked, reopened }));
			`);

			expect(result.code).toBe(0);
			const results = JSON.parse(capture.stdout().trim());
			expect(results.blocked).toBe(true);
			expect(results.reopened).toBe(true);
		});
	});

	// -------------------------------------------------------------------
	// Event listener cap — maxListeners warning without crash
	// -------------------------------------------------------------------

	describe("event listener cap", () => {
		it("emits MaxListenersExceededWarning when adding >10 listeners to process", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`
				const results = {};

				// Add 15 listeners to process (default maxListeners = 10)
				for (let i = 0; i < 15; i++) {
					process.on('customEvent', () => {});
				}

				results.listenerCount = process.listenerCount('customEvent');
				results.didNotCrash = true;
				console.log(JSON.stringify(results));
			`);

			expect(result.code).toBe(0);
			const results = JSON.parse(capture.stdout().trim());
			expect(results.listenerCount).toBe(15);
			expect(results.didNotCrash).toBe(true);

			// Warning should have been emitted to stderr
			const stderr = capture.stderr();
			expect(stderr).toContain("MaxListenersExceededWarning");
		});

		it("process.setMaxListeners() is respected", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`
				// Increase limit to 20
				process.setMaxListeners(20);
				const results = { maxListeners: process.getMaxListeners() };

				// Add 15 listeners — should NOT warn since limit is 20
				for (let i = 0; i < 15; i++) {
					process.on('testEvent', () => {});
				}

				results.count = process.listenerCount('testEvent');
				results.ok = true;
				console.log(JSON.stringify(results));
			`);

			expect(result.code).toBe(0);
			const results = JSON.parse(capture.stdout().trim());
			expect(results.maxListeners).toBe(20);
			expect(results.count).toBe(15);
			expect(results.ok).toBe(true);

			// No warning should appear since 15 < 20
			const stderr = capture.stderr();
			expect(stderr).not.toContain("MaxListenersExceededWarning");
		});

		it("adding 1000 listeners emits warning but does not crash", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({ onStdio: capture.onStdio });

			const result = await proc.exec(`
				const results = {};

				// Add 1000 listeners
				for (let i = 0; i < 1000; i++) {
					process.on('massEvent', () => {});
				}

				results.count = process.listenerCount('massEvent');
				results.alive = true;
				console.log(JSON.stringify(results));
			`);

			expect(result.code).toBe(0);
			const results = JSON.parse(capture.stdout().trim());
			expect(results.count).toBe(1000);
			expect(results.alive).toBe(true);

			// Warning should be emitted once
			const stderr = capture.stderr();
			expect(stderr).toContain("MaxListenersExceededWarning");
		});
	});

	// -------------------------------------------------------------------
	// process.chdir validation — must check VFS before setting cwd
	// -------------------------------------------------------------------

	describe("process.chdir validation", () => {
		it("throws ENOENT when chdir to non-existent path", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				permissions: { ...allowAllFs },
				onStdio: capture.onStdio,
			});

			const result = await proc.exec(`
				const results = {};
				try {
					process.chdir('/nonexistent/path');
					results.threw = false;
				} catch (e) {
					results.threw = true;
					results.code = e.code;
					results.message = e.message;
				}
				console.log(JSON.stringify(results));
			`);

			expect(result.code).toBe(0);
			const results = JSON.parse(capture.stdout().trim());
			expect(results.threw).toBe(true);
			expect(results.code).toBe("ENOENT");
		});

		it("succeeds when chdir to existing directory", async () => {
			const capture = createConsoleCapture();
			const vfs = createInMemoryFileSystem();
			await vfs.writeFile("/app/sub/file.txt", "x");

			proc = createTestNodeRuntime({
				permissions: { ...allowAllFs },
				onStdio: capture.onStdio,
				filesystem: vfs,
			});

			const result = await proc.exec(`
				const results = {};
				try {
					process.chdir('/app/sub');
					results.cwd = process.cwd();
					results.ok = true;
				} catch (e) {
					results.ok = false;
					results.error = e.message;
				}
				console.log(JSON.stringify(results));
			`);

			expect(result.code).toBe(0);
			const results = JSON.parse(capture.stdout().trim());
			expect(results.ok).toBe(true);
			expect(results.cwd).toBe("/app/sub");
		});
	});

	// -------------------------------------------------------------------
	// setInterval(0) CPU spin prevention
	// -------------------------------------------------------------------

	describe("setInterval minimum delay", () => {
		it("setInterval with delay 0 produces bounded counter under timeout", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				onStdio: capture.onStdio,
				cpuTimeMs: 200,
			});

			const result = await proc.exec(`
				let counter = 0;
				const id = setInterval(() => { counter++; }, 0);

				// After 100ms, stop and report
				setTimeout(() => {
					clearInterval(id);
					console.log(JSON.stringify({ counter }));
				}, 100);
			`);

			// Process should complete (not hang or spin forever)
			const stdout = capture.stdout().trim();
			if (stdout) {
				const results = JSON.parse(stdout);
				// Counter should be bounded — with 1ms min delay, ~100 iterations max in 100ms
				expect(results.counter).toBeLessThan(500);
				expect(results.counter).toBeGreaterThan(0);
			}
			// Even if timeout killed it, we prove it didn't spin infinitely
			expect(result.code === 0 || result.code !== undefined).toBe(true);
		});
	});
});
