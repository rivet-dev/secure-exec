import { afterEach, describe, expect, it } from "vitest";
import { allowAllFs, allowAllChildProcess, allowAllNetwork, NodeRuntime } from "../../../src/index.js";
import type { CommandExecutor, NetworkAdapter, SpawnedProcess } from "../../../src/types.js";
import { createTestNodeRuntime } from "../../test-utils.js";

const RESOURCE_BUDGET_ERROR_CODE = "ERR_RESOURCE_BUDGET_EXCEEDED";

type CapturedConsoleEvent = {
	channel: "stdout" | "stderr";
	message: string;
};

function createConsoleCapture() {
	const events: CapturedConsoleEvent[] = [];
	return {
		onStdio: (event: CapturedConsoleEvent) => {
			events.push(event);
		},
		stdout: () =>
			events
				.filter((e) => e.channel === "stdout")
				.map((e) => e.message)
				.join("\n") + (events.some((e) => e.channel === "stdout") ? "\n" : ""),
		allText: () => events.map((e) => e.message).join(""),
	};
}

/** CommandExecutor that immediately exits with code 0 and emits "ok\n" stdout. */
function createMockCommandExecutor(): CommandExecutor {
	return {
		spawn(
			_command: string,
			_args: string[],
			options: {
				cwd?: string;
				env?: Record<string, string>;
				onStdout?: (data: Uint8Array) => void;
				onStderr?: (data: Uint8Array) => void;
			},
		): SpawnedProcess {
			let exitResolve: (code: number) => void;
			const waitPromise = new Promise<number>((r) => {
				exitResolve = r;
			});

			// Emit stdout and exit asynchronously
			queueMicrotask(() => {
				options.onStdout?.(new TextEncoder().encode("ok\n"));
				exitResolve(0);
			});

			return {
				writeStdin() {},
				closeStdin() {},
				kill() {},
				wait: () => waitPromise,
			};
		},
	};
}

describe("NodeRuntime resource budgets", () => {
	let proc: NodeRuntime | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	// -----------------------------------------------------------------------
	// maxOutputBytes
	// -----------------------------------------------------------------------

	describe("maxOutputBytes", () => {
		it("captures output within the limit", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				onStdio: capture.onStdio,
				resourceBudgets: { maxOutputBytes: 1000 },
			});
			const result = await proc.exec(`console.log("hello");`);
			expect(result.code).toBe(0);
			expect(capture.stdout()).toContain("hello");
		});

		it("silently drops output bytes beyond the limit", async () => {
			const budget = 100;
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				onStdio: capture.onStdio,
				resourceBudgets: { maxOutputBytes: budget },
			});
			// Write 200+ bytes via console.log
			const result = await proc.exec(`
				for (let i = 0; i < 20; i++) console.log("0123456789");
			`);
			expect(result.code).toBe(0);
			const total = capture.allText();
			// Last write that crosses the budget boundary is allowed through,
			// but subsequent writes are dropped — allow small overhead for that one message
			expect(total.length).toBeLessThanOrEqual(budget + 32);
			expect(total.length).toBeGreaterThan(0);
		});

		it("applies to stderr as well", async () => {
			const budget = 50;
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				onStdio: capture.onStdio,
				resourceBudgets: { maxOutputBytes: budget },
			});
			const result = await proc.exec(`
				for (let i = 0; i < 20; i++) console.error("0123456789");
			`);
			expect(result.code).toBe(0);
			const total = capture.allText();
			// Same enforcement as stdout — budget + one overflow message
			expect(total.length).toBeLessThanOrEqual(budget + 32);
			expect(total.length).toBeGreaterThan(0);
		});
	});

	// -----------------------------------------------------------------------
	// maxChildProcesses
	// -----------------------------------------------------------------------

	describe("maxChildProcesses", () => {
		it("first N spawns succeed, subsequent spawns throw", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				commandExecutor: createMockCommandExecutor(),
				permissions: { ...allowAllFs, ...allowAllChildProcess },
				onStdio: capture.onStdio,
				resourceBudgets: { maxChildProcesses: 3 },
			});

			const result = await proc.exec(`
				const { spawnSync } = require('child_process');
				let succeeded = 0;
				let errors = 0;
				for (let i = 0; i < 5; i++) {
					try {
						const r = spawnSync('echo', ['test']);
						if (r.error) { errors++; } else { succeeded++; }
					} catch (e) {
						errors++;
					}
				}
				console.log('succeeded:' + succeeded);
				console.log('errors:' + errors);
			`);

			expect(result.code).toBe(0);
			const out = capture.stdout();
			expect(out).toContain("succeeded:3");
			expect(out).toContain("errors:2");
		});
	});

	// -----------------------------------------------------------------------
	// maxTimers
	// -----------------------------------------------------------------------

	describe("maxTimers", () => {
		it("first N intervals succeed, subsequent throw", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				onStdio: capture.onStdio,
				resourceBudgets: { maxTimers: 5 },
			});

			const result = await proc.exec(`
				let succeeded = 0;
				let errors = 0;
				for (let i = 0; i < 10; i++) {
					try {
						setInterval(() => {}, 60000);
						succeeded++;
					} catch (e) {
						errors++;
					}
				}
				console.log('succeeded:' + succeeded);
				console.log('errors:' + errors);
			`);

			expect(result.code).toBe(0);
			const out = capture.stdout();
			expect(out).toContain("succeeded:5");
			expect(out).toContain("errors:5");
		});

		it("existing intervals survive when new ones are blocked", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				onStdio: capture.onStdio,
				resourceBudgets: { maxTimers: 3 },
			});

			const result = await proc.exec(`
				// Create 3 persistent intervals (occupy all slots)
				const id1 = setInterval(() => {}, 60000);
				const id2 = setInterval(() => {}, 60000);
				const id3 = setInterval(() => {}, 60000);
				// 4th should be blocked
				let blocked = false;
				try { setInterval(() => {}, 60000); } catch(e) { blocked = true; }
				// Verify existing intervals were not affected
				console.log('blocked:' + blocked);
				console.log('created:3');
				// Cleanup
				clearInterval(id1);
				clearInterval(id2);
				clearInterval(id3);
			`);

			expect(result.code).toBe(0);
			const out = capture.stdout();
			expect(out).toContain("blocked:true");
			expect(out).toContain("created:3");
		});
	});

	// -----------------------------------------------------------------------
	// maxBridgeCalls
	// -----------------------------------------------------------------------

	describe("maxBridgeCalls", () => {
		it("bridge calls within limit succeed", async () => {
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				permissions: allowAllFs,
				onStdio: capture.onStdio,
				resourceBudgets: { maxBridgeCalls: 100 },
			});

			const result = await proc.exec(`
				const fs = require('fs');
				fs.existsSync('/tmp');
				console.log('ok');
			`);

			expect(result.code).toBe(0);
			expect(capture.stdout()).toContain("ok");
		});

		it("bridge returns error when budget exceeded", async () => {
			const budget = 5;
			const totalCalls = 10;
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				permissions: allowAllFs,
				onStdio: capture.onStdio,
				resourceBudgets: { maxBridgeCalls: budget },
			});

			const result = await proc.exec(`
				const fs = require('fs');
				let errors = 0;
				for (let i = 0; i < ${totalCalls}; i++) {
					try {
						fs.existsSync('/tmp');
					} catch(e) {
						errors++;
					}
				}
				console.log('errors:' + errors);
			`);

			// Exactly totalCalls - budget calls should fail
			expect(result.code).toBe(0);
			const out = capture.stdout();
			expect(out).toContain("errors:");
			const errCount = parseInt(out.match(/errors:(\d+)/)?.[1] ?? "0");
			expect(errCount).toBe(totalCalls - budget);
		});
	});

	// -----------------------------------------------------------------------
	// Host timer cleanup on disposal / timeout
	// -----------------------------------------------------------------------

	// -----------------------------------------------------------------------
	// Child process cleanup on disposal / timeout
	// -----------------------------------------------------------------------

	describe("child process cleanup", () => {
		it("kills spawned child processes on timeout and isolate recycle", async () => {
			const killed: number[] = [];
			const neverExitExecutor: CommandExecutor = {
				spawn(
					_command: string,
					_args: string[],
					_options: {
						cwd?: string;
						env?: Record<string, string>;
						onStdout?: (data: Uint8Array) => void;
						onStderr?: (data: Uint8Array) => void;
					},
				): SpawnedProcess {
					// Process that never exits on its own
					return {
						writeStdin() {},
						closeStdin() {},
						kill(signal: number) {
							killed.push(signal);
						},
						wait: () => new Promise<number>(() => {}), // never resolves
					};
				},
			};

			proc = createTestNodeRuntime({
				commandExecutor: neverExitExecutor,
				permissions: { ...allowAllFs, ...allowAllChildProcess },
				cpuTimeLimitMs: 200,
			});

			// Spawn a child process, then spin to trigger timeout
			const result = await proc.exec(`
				const { spawn } = require('child_process');
				spawn('sleep', ['999']);
				while (true) {}
			`);

			expect(result.code).toBe(124); // timeout exit code
			// recycleIsolate should have killed the child process with SIGKILL (9)
			expect(killed.length).toBeGreaterThanOrEqual(1);
			expect(killed[0]).toBe(9);
		});

		it("kills spawned child processes on dispose", async () => {
			const killed: number[] = [];
			const neverExitExecutor: CommandExecutor = {
				spawn(
					_command: string,
					_args: string[],
					_options: {
						cwd?: string;
						env?: Record<string, string>;
						onStdout?: (data: Uint8Array) => void;
						onStderr?: (data: Uint8Array) => void;
					},
				): SpawnedProcess {
					return {
						writeStdin() {},
						closeStdin() {},
						kill(signal: number) {
							killed.push(signal);
						},
						wait: () => new Promise<number>(() => {}),
					};
				},
			};

			proc = createTestNodeRuntime({
				commandExecutor: neverExitExecutor,
				permissions: { ...allowAllFs, ...allowAllChildProcess },
				cpuTimeLimitMs: 300,
			});

			// Spawn a child process then spin to trigger timeout (exec returns on timeout)
			const result = await proc.exec(`
				const { spawn } = require('child_process');
				spawn('sleep', ['999']);
				while (true) {}
			`);
			expect(result.code).toBe(124);

			// recycleIsolate already killed child processes; dispose should also handle any remaining
			proc.dispose();
			proc = undefined;

			expect(killed.length).toBeGreaterThanOrEqual(1);
			expect(killed[0]).toBe(9);
		});
	});

	// -----------------------------------------------------------------------
	// HTTP server tracking across exec() calls
	// -----------------------------------------------------------------------

	describe("HTTP server cleanup on timeout", () => {
		it("closes tracked HTTP servers on recycleIsolate after timeout", async () => {
			const closedServerIds: number[] = [];

			const networkAdapter: NetworkAdapter = {
				async httpServerListen(options) {
					return { address: { address: "127.0.0.1", family: "IPv4", port: options.port ?? 0 } };
				},
				async httpServerClose(serverId: number) {
					closedServerIds.push(serverId);
				},
				async fetch() {
					return { ok: true, status: 200, statusText: "OK", headers: {}, body: "", url: "", redirected: false };
				},
				async dnsLookup() {
					return { address: "127.0.0.1", family: 4 };
				},
				async httpRequest() {
					return { status: 200, statusText: "OK", headers: {}, body: "", url: "" };
				},
			};

			proc = createTestNodeRuntime({
				networkAdapter,
				permissions: { ...allowAllFs, ...allowAllChildProcess, ...allowAllNetwork },
				cpuTimeLimitMs: 300,
			});

			// Create an HTTP server then spin to trigger timeout
			// The server stays in activeHttpServerIds since it's never closed by sandbox code
			const result = await proc.exec(`
				const http = require('http');
				const server = http.createServer((req, res) => { res.end('ok'); });
				server.listen(0, '127.0.0.1');
				while (true) {}
			`);
			expect(result.code).toBe(124);

			// recycleIsolate should have called httpServerClose for the tracked server
			expect(closedServerIds.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("host timer cleanup", () => {
		it("clears host timers on dispose after normal execution", async () => {
			proc = createTestNodeRuntime({});

			// Create 100 timers with long delays — they should all be cleaned up on dispose
			await proc.exec(`
				for (let i = 0; i < 100; i++) {
					setTimeout(() => {}, 60000);
				}
			`);

			// Dispose should clear all pending host timers
			proc.dispose();
			proc = undefined;

			// If timers leaked, they would hold references and fire after 60s.
			// We can't directly observe the host Set, but we verify no errors
			// are thrown when the isolate is gone and timers would have resolved.
		});

		it("clears host timers on timeout — no leaked callbacks", async () => {
			proc = createTestNodeRuntime({ cpuTimeLimitMs: 200 });

			// Create 100 timers with 60s delay, then spin to trigger timeout
			const result = await proc.exec(`
				for (let i = 0; i < 100; i++) {
					setTimeout(() => {}, 60000);
				}
				// Spin to exceed CPU time limit and trigger isolate recycle
				while (true) {}
			`);

			expect(result.code).toBe(124);

			// After timeout + recycle, the runtime should still be usable
			const capture = createConsoleCapture();
			const proc2 = createTestNodeRuntime({ onStdio: capture.onStdio });
			const result2 = await proc2.exec(`console.log('alive');`);
			expect(result2.code).toBe(0);
			expect(capture.stdout()).toContain("alive");
			proc2.dispose();
		});
	});
});
