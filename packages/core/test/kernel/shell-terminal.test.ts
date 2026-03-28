/**
 * Shell terminal tests using MockRuntimeDriver.
 *
 * All output assertions use exact-match on screenshotTrimmed().
 * No toContain(), no substring checks — the full screen state is asserted.
 * This ensures cursor positioning, echo, and output placement are correct.
 */

import { describe, it, expect, afterEach } from "vitest";
import { TerminalHarness } from "./terminal-harness.js";
import { createTestKernel } from "./helpers.js";
import type {
	RuntimeDriver,
	DriverProcess,
	ProcessContext,
	KernelInterface,
} from "../../src/kernel/types.js";
import { SIGINT, SIGWINCH } from "../../src/kernel/types.js";

// ---------------------------------------------------------------------------
// Mock shell driver — reads lines from PTY slave via kernel FDs, interprets
// simple commands (echo), writes output + prompt back through PTY.
// ---------------------------------------------------------------------------

class MockShellDriver implements RuntimeDriver {
	name = "mock-shell";
	commands = ["sh"];
	private ki: KernelInterface | null = null;

	async init(ki: KernelInterface): Promise<void> {
		this.ki = ki;
	}

	spawn(_command: string, _args: string[], ctx: ProcessContext): DriverProcess {
		const ki = this.ki!;
		const { pid } = ctx;
		const stdinFd = ctx.fds.stdin;
		const stdoutFd = ctx.fds.stdout;

		let exitResolve: (code: number) => void;
		const exitPromise = new Promise<number>((r) => {
			exitResolve = r;
		});

		const enc = new TextEncoder();
		const dec = new TextDecoder();

		const proc: DriverProcess = {
			writeStdin() {},
			closeStdin() {},
			kill(signal) {
				if (signal === SIGINT) {
					// SIGINT: show ^C, emit new prompt, keep running
					ki.fdWrite(pid, stdoutFd, enc.encode("^C\r\n$ "));
				} else if (signal === SIGWINCH) {
					// SIGWINCH: ignore, shell stays alive
				} else {
					exitResolve!(128 + signal);
					proc.onExit?.(128 + signal);
				}
			},
			wait() {
				return exitPromise;
			},
			onStdout: null,
			onStderr: null,
			onExit: null,
		};

		// Shell read-eval-print loop
		(async () => {
			// Write initial prompt
			ki.fdWrite(pid, stdoutFd, enc.encode("$ "));

			while (true) {
				const data = await ki.fdRead(pid, stdinFd, 4096);
				if (data.length === 0) {
					// EOF (^D on empty line)
					exitResolve!(0);
					proc.onExit?.(0);
					break;
				}

				const line = dec.decode(data).replace(/\n$/, "");

				// Simple command dispatch
				if (line.startsWith("echo ")) {
					ki.fdWrite(pid, stdoutFd, enc.encode(line.slice(5) + "\r\n"));
				} else if (line === "noecho") {
					// Disable PTY echo (password input scenario)
					ki.ptySetDiscipline(pid, stdinFd, { echo: false });
				} else if (line.length > 0) {
					// Unknown command — just emit a newline
					ki.fdWrite(pid, stdoutFd, enc.encode("\r\n"));
				}

				// Next prompt
				ki.fdWrite(pid, stdoutFd, enc.encode("$ "));
			}
		})().catch(() => {
			exitResolve!(1);
			proc.onExit?.(1);
		});

		return proc;
	}

	async dispose(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Naive driver — kill() terminates on every signal (like real WasmVM driver).
// Used to prove the kernel default-ignore disposition for SIGWINCH.
// ---------------------------------------------------------------------------

class NaiveKillDriver implements RuntimeDriver {
	name = "naive-shell";
	commands = ["sh"];
	private ki: KernelInterface | null = null;

	async init(ki: KernelInterface): Promise<void> {
		this.ki = ki;
	}

	spawn(_command: string, _args: string[], ctx: ProcessContext): DriverProcess {
		const ki = this.ki!;
		const { pid } = ctx;
		const stdinFd = ctx.fds.stdin;
		const stdoutFd = ctx.fds.stdout;

		let exitResolve: (code: number) => void;
		const exitPromise = new Promise<number>((r) => {
			exitResolve = r;
		});

		const enc = new TextEncoder();
		const dec = new TextDecoder();

		const proc: DriverProcess = {
			writeStdin() {},
			closeStdin() {},
			kill(signal) {
				// Terminates on ANY signal — no SIGWINCH exception.
				// Before the kernel fix this killed the shell on resize.
				exitResolve!(128 + signal);
				proc.onExit?.(128 + signal);
			},
			wait() {
				return exitPromise;
			},
			onStdout: null,
			onStderr: null,
			onExit: null,
		};

		(async () => {
			ki.fdWrite(pid, stdoutFd, enc.encode("$ "));
			while (true) {
				const data = await ki.fdRead(pid, stdinFd, 4096);
				if (data.length === 0) {
					exitResolve!(0);
					proc.onExit?.(0);
					break;
				}
				const line = dec.decode(data).replace(/\n$/, "");
				if (line.startsWith("echo ")) {
					ki.fdWrite(pid, stdoutFd, enc.encode(line.slice(5) + "\r\n"));
				} else if (line.length > 0) {
					ki.fdWrite(pid, stdoutFd, enc.encode("\r\n"));
				}
				ki.fdWrite(pid, stdoutFd, enc.encode("$ "));
			}
		})().catch(() => {
			exitResolve!(1);
			proc.onExit?.(1);
		});

		return proc;
	}

	async dispose(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("shell-terminal", () => {
	let harness: TerminalHarness;

	afterEach(async () => {
		await harness?.dispose();
	});

	it("clean initial state — shell opens, screen shows prompt", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		expect(harness.screenshotTrimmed()).toBe("$ ");
	});

	it("echo on input — typed text appears on screen via PTY echo", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");
		await harness.type("hello");

		expect(harness.screenshotTrimmed()).toBe("$ hello");
	});

	it("command output on correct line — output appears below input", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");
		await harness.type("echo hello\n");

		expect(harness.screenshotTrimmed()).toBe(
			["$ echo hello", "hello", "$ "].join("\n"),
		);
	});

	it("output preservation — multiple commands, all previous output visible", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");
		await harness.type("echo AAA\n");
		await harness.type("echo BBB\n");

		expect(harness.screenshotTrimmed()).toBe(
			["$ echo AAA", "AAA", "$ echo BBB", "BBB", "$ "].join("\n"),
		);
	});

	it("^C sends SIGINT — screen shows ^C, shell stays alive, can type more", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		// Type partial input then ^C
		await harness.type("hel\x03");

		// PTY echoes "hel", then ^C triggers session-leader SIGINT
		// interception: PTY echoes "^C\r\n" and injects newline → fresh prompt
		expect(harness.screenshotTrimmed()).toBe(
			["$ hel^C", "$ "].join("\n"),
		);

		// Shell stays alive — type another command
		await harness.type("echo hi\n");

		expect(harness.screenshotTrimmed()).toBe(
			["$ hel^C", "$ echo hi", "hi", "$ "].join("\n"),
		);
	});

	it("^C on empty prompt — shows ^C, fresh prompt, no error", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		// ^C on empty prompt
		await harness.type("\x03");

		expect(harness.screenshotTrimmed()).toBe(
			["$ ^C", "$ "].join("\n"),
		);

		// Shell still functional — type a command
		await harness.type("echo ok\n");

		expect(harness.screenshotTrimmed()).toBe(
			["$ ^C", "$ echo ok", "ok", "$ "].join("\n"),
		);
	});

	it("^D exits cleanly — shell exits with code 0, no extra output", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		const exitCode = await harness.exit();

		expect(exitCode).toBe(0);
		expect(harness.screenshotTrimmed()).toBe("$ ");
	});

	it("backspace erases character — 'helo' + BS + 'lo' produces 'hello'", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		// Type "echo helo", backspace erases 'o', then "lo\n" → shell receives "echo hello"
		await harness.type("echo helo\x7flo\n");

		expect(harness.screenshotTrimmed()).toBe(
			["$ echo hello", "hello", "$ "].join("\n"),
		);
	});

	it("long line wrapping — input exceeding cols wraps to next row", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel, { cols: 20, rows: 24 });

		await harness.waitFor("$");

		// "$ " = 2 chars, leaves 18 chars on first row. 25 A's forces wrap.
		const input = "A".repeat(25);
		await harness.type(input);

		expect(harness.screenshotTrimmed()).toBe(
			"$ " + "A".repeat(18) + "\n" + "A".repeat(7),
		);
	});

	it("resize triggers SIGWINCH — shell stays alive, prompt returns", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		// Resize terminal — delivers SIGWINCH to foreground process group
		harness.term.resize(40, 12);
		harness.shell.resize(40, 12);

		// Shell survives SIGWINCH — verify by typing a command
		await harness.type("echo alive\n");

		expect(harness.screenshotTrimmed()).toBe(
			["$ echo alive", "alive", "$ "].join("\n"),
		);
	});

	it("SIGWINCH default-ignore — driver without explicit handler survives resize", async () => {
		// Regression: a driver whose kill() terminates on any signal (like WasmVM)
		// would die on SIGWINCH because applyDefaultAction forwarded it as a kill.
		// The kernel must apply POSIX default-ignore for SIGWINCH so kill() is never called.
		const driver = new NaiveKillDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		// Resize — if kernel forwards SIGWINCH to NaiveKillDriver.kill(), the
		// shell process terminates and the next type() hangs or gets no prompt.
		harness.term.resize(40, 12);
		harness.shell.resize(40, 12);

		// Shell must survive — verify by typing a command
		await harness.type("echo survived\n");

		expect(harness.screenshotTrimmed()).toBe(
			["$ echo survived", "survived", "$ "].join("\n"),
		);
	});

	it("echo disabled — typed text does NOT appear on screen", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		// "noecho" command disables PTY echo via ptySetDiscipline
		await harness.type("noecho\n");

		const screenAfterNoecho = harness.screenshotTrimmed();
		expect(screenAfterNoecho).toBe(["$ noecho", "$ "].join("\n"));

		// Type "secret" with echo off — should NOT appear on screen
		await harness.type("secret");

		expect(harness.screenshotTrimmed()).toBe(screenAfterNoecho);
	});

	it("waitFor occurrence=2 — waits for second appearance of text", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		// Run command: screen shows "$ echo AAA\nAAA\n$ " — "AAA" appears twice
		await harness.type("echo AAA\n");

		// occurrence=2 should succeed (once in echoed command line, once in output)
		await harness.waitFor("AAA", 2);

		expect(harness.screenshotTrimmed()).toBe(
			["$ echo AAA", "AAA", "$ "].join("\n"),
		);
	});

	it("waitFor occurrence=3 on text appearing twice — times out", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");
		await harness.type("echo AAA\n");

		// "AAA" appears only twice — occurrence=3 should timeout
		await expect(
			harness.waitFor("AAA", 3, 200),
		).rejects.toThrow(/timed out/);
	});

	it("type() on no-output input — resolves via settlement timer", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");

		// Disable echo so typed text produces zero output
		await harness.type("noecho\n");

		// type() with echo off and no newline → zero output produced.
		// Settlement timer fires after SETTLE_MS (50ms), resolving the promise.
		const start = Date.now();
		await harness.type("silent");
		const elapsed = Date.now() - start;

		// Should resolve in roughly SETTLE_MS (50ms), not hang or instant
		expect(elapsed).toBeGreaterThanOrEqual(30);
		expect(elapsed).toBeLessThan(500);

		// Screen unchanged — "silent" is not visible because echo is off
		expect(harness.screenshotTrimmed()).toBe(["$ noecho", "$ "].join("\n"));
	});

	it("^Z in PTY sends SIGTSTP to foreground group — echoes ^Z", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });
		harness = new TerminalHarness(kernel);

		await harness.waitFor("$");
		await harness.type("hello");

		// ^Z (0x1A) should echo ^Z and send SIGTSTP
		await harness.type("\x1a");

		// PTY should echo ^Z\r\n
		const screen = harness.screenshotTrimmed();
		expect(screen).toContain("^Z");
	});
});

// ---------------------------------------------------------------------------
// Concurrent openShell() session isolation
// ---------------------------------------------------------------------------

describe("concurrent openShell sessions", () => {
	let harnessA: TerminalHarness;
	let harnessB: TerminalHarness;

	afterEach(async () => {
		await harnessA?.dispose();
		await harnessB?.dispose();
	});

	it("output isolation — data from shell A never appears in shell B", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });

		harnessA = new TerminalHarness(kernel);
		harnessB = new TerminalHarness(kernel);

		await harnessA.waitFor("$");
		await harnessB.waitFor("$");

		// Send different commands to each shell
		await harnessA.type("echo ALPHA\n");
		await harnessB.type("echo BRAVO\n");

		// Shell A has ALPHA, never BRAVO
		const screenA = harnessA.screenshotTrimmed();
		expect(screenA).toBe(["$ echo ALPHA", "ALPHA", "$ "].join("\n"));

		// Shell B has BRAVO, never ALPHA
		const screenB = harnessB.screenshotTrimmed();
		expect(screenB).toBe(["$ echo BRAVO", "BRAVO", "$ "].join("\n"));
	});

	it("exit one shell — surviving shell is unaffected", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });

		harnessA = new TerminalHarness(kernel);
		harnessB = new TerminalHarness(kernel);

		await harnessA.waitFor("$");
		await harnessB.waitFor("$");

		// Exit shell A
		const codeA = await harnessA.exit();
		expect(codeA).toBe(0);

		// Shell B still works — run a command
		await harnessB.type("echo STILL_ALIVE\n");
		expect(harnessB.screenshotTrimmed()).toBe(
			["$ echo STILL_ALIVE", "STILL_ALIVE", "$ "].join("\n"),
		);
	});
});

// ---------------------------------------------------------------------------
// readPump lifecycle tests — verify pump is tracked, exits on shell exit,
// errors are propagated, and wait() drains before resolving.
// ---------------------------------------------------------------------------

describe("openShell readPump lifecycle", () => {
	it("wait() resolves only after pump finishes delivering data", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });

		const chunks: Uint8Array[] = [];
		const shell = kernel.openShell();

		shell.onData = (data) => {
			chunks.push(data);
		};

		// Wait for prompt
		await new Promise((r) => setTimeout(r, 100));

		// Exit shell — ^D
		shell.write("\x04");
		const exitCode = await shell.wait();

		expect(exitCode).toBe(0);
		// Pump delivered at least the prompt before wait() resolved
		const text = new TextDecoder().decode(
			new Uint8Array(chunks.reduce((acc, c) => [...acc, ...c], [] as number[])),
		);
		expect(text).toContain("$ ");
	});

	it("pump exits promptly when shell is killed", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });

		const shell = kernel.openShell();
		shell.onData = () => {};

		// Wait for shell to be ready
		await new Promise((r) => setTimeout(r, 50));

		// Kill the shell
		shell.kill();
		const exitCode = await Promise.race([
			shell.wait(),
			new Promise<number>((_, rej) => setTimeout(() => rej(new Error("wait() hung")), 2000)),
		]);

		// Shell killed with SIGTERM → 128 + 15
		expect(exitCode).toBe(128 + 15);
	});

	it("onData callback error is logged, pump continues for remaining data", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });

		const errors: unknown[] = [];
		const origError = console.error;
		console.error = (...args: unknown[]) => {
			if (typeof args[0] === "string" && args[0].includes("onData callback error")) {
				errors.push(args[1]);
			}
		};

		try {
			const shell = kernel.openShell();
			let thrown = false;
			shell.onData = () => {
				if (!thrown) {
					thrown = true;
					throw new Error("callback boom");
				}
			};

			// Wait for prompt to be delivered (which triggers the error)
			await new Promise((r) => setTimeout(r, 100));

			// Shell should still be alive — send exit
			shell.write("\x04");
			const exitCode = await shell.wait();
			expect(exitCode).toBe(0);

			// Error was logged, not silently swallowed
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect((errors[0] as Error).message).toBe("callback boom");
		} finally {
			console.error = origError;
		}
	});

	it("multiple wait() calls return the same exit code", async () => {
		const driver = new MockShellDriver();
		const { kernel } = await createTestKernel({ drivers: [driver] });

		const shell = kernel.openShell();
		shell.onData = () => {};

		await new Promise((r) => setTimeout(r, 50));

		shell.write("\x04");
		const [code1, code2] = await Promise.all([shell.wait(), shell.wait()]);
		expect(code1).toBe(0);
		expect(code2).toBe(0);
	});
});
