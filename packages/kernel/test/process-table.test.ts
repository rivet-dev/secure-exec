import { describe, it, expect, vi } from "vitest";
import { ProcessTable } from "../src/process-table.js";
import { WIFEXITED, WEXITSTATUS, WIFSIGNALED, WTERMSIG } from "../src/wstatus.js";
import { WNOHANG, SIGCHLD, SIGALRM, SIGCONT, SIGSTOP, SIGTSTP } from "../src/types.js";
import type { DriverProcess, ProcessContext } from "../src/types.js";

function createMockDriverProcess(exitAfterMs?: number): DriverProcess {
	let exitResolve: (code: number) => void;
	const exitPromise = new Promise<number>((r) => { exitResolve = r; });

	const proc: DriverProcess = {
		writeStdin(_data) {},
		closeStdin() {},
		kill(_signal) {
			exitResolve!(128 + _signal);
		},
		wait() { return exitPromise; },
		onStdout: null,
		onStderr: null,
		onExit: null,
	};

	if (exitAfterMs !== undefined) {
		setTimeout(() => {
			exitResolve!(0);
			proc.onExit?.(0);
		}, exitAfterMs);
	}

	return proc;
}

function createCtx(overrides?: Partial<ProcessContext>): ProcessContext {
	return {
		pid: 0,
		ppid: 0,
		env: {},
		cwd: "/",
		fds: { stdin: 0, stdout: 1, stderr: 2 },
		...overrides,
	};
}

describe("ProcessTable", () => {
	it("registers processes with sequential PIDs", () => {
		const table = new ProcessTable();
		const proc1 = createMockDriverProcess();
		const proc2 = createMockDriverProcess();

		const pid1 = table.allocatePid();
		const pid2 = table.allocatePid();
		const entry1 = table.register(pid1, "wasmvm", "grep", ["-r", "foo"], createCtx(), proc1);
		const entry2 = table.register(pid2, "node", "node", ["-e", "1+1"], createCtx(), proc2);

		expect(entry1.pid).toBe(1);
		expect(entry2.pid).toBe(2);
		expect(entry1.driver).toBe("wasmvm");
		expect(entry2.driver).toBe("node");
	});

	it("waitpid resolves when process exits", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess(10);
		table.register(table.allocatePid(), "wasmvm", "echo", ["hello"], createCtx(), proc);

		const result = await table.waitpid(1);
		expect(result).not.toBeNull();
		expect(result!.pid).toBe(1);
		expect(result!.status).toBe(0);
	});

	it("waitpid resolves immediately for already-exited process", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		table.register(table.allocatePid(), "wasmvm", "true", [], createCtx(), proc);

		// Manually mark as exited
		table.markExited(1, 42);

		const result = await table.waitpid(1);
		expect(result).not.toBeNull();
		// POSIX wstatus: normal exit = (exitCode << 8)
		expect(WIFEXITED(result!.status)).toBe(true);
		expect(WEXITSTATUS(result!.status)).toBe(42);
	});

	it("kill routes to driver process", () => {
		const table = new ProcessTable();
		let killedWith = -1;
		const proc = createMockDriverProcess();
		const origKill = proc.kill;
		proc.kill = (signal) => {
			killedWith = signal;
			origKill.call(proc, signal);
		};

		table.register(table.allocatePid(), "wasmvm", "sleep", ["100"], createCtx(), proc);
		table.kill(1, 15);

		expect(killedWith).toBe(15);
	});

	it("kill throws ESRCH for unknown PID", () => {
		const table = new ProcessTable();
		expect(() => table.kill(999, 15)).toThrow("ESRCH");
	});

	it("kill(pid, 0) is an existence check — no signal delivered", () => {
		const table = new ProcessTable();
		let killedWith = -1;
		const proc = createMockDriverProcess();
		proc.kill = (signal) => { killedWith = signal; };

		table.register(table.allocatePid(), "wasmvm", "sleep", ["1"], createCtx(), proc);
		// Signal 0: should succeed without calling driverProcess.kill
		table.kill(1, 0);
		expect(killedWith).toBe(-1); // kill was NOT called
	});

	it("kill(pid, 0) throws ESRCH for non-existent process", () => {
		const table = new ProcessTable();
		expect(() => table.kill(999, 0)).toThrow("ESRCH");
	});

	it("kill throws EINVAL for negative signal", () => {
		const table = new ProcessTable();
		table.register(table.allocatePid(), "wasmvm", "sleep", [], createCtx(), createMockDriverProcess());
		expect(() => table.kill(1, -1)).toThrow("EINVAL");
	});

	it("kill throws EINVAL for signal > 64", () => {
		const table = new ProcessTable();
		table.register(table.allocatePid(), "wasmvm", "sleep", [], createCtx(), createMockDriverProcess());
		expect(() => table.kill(1, 100)).toThrow("EINVAL");
	});

	it("waitpid rejects with ESRCH for non-existent PID", async () => {
		const table = new ProcessTable();
		await expect(table.waitpid(9999)).rejects.toThrow(/ESRCH/);
	});

	// POSIX wstatus encoding tests
	it("normal exit(42) — WIFEXITED=true, WEXITSTATUS=42", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		table.register(table.allocatePid(), "wasmvm", "test", [], createCtx(), proc);
		table.markExited(1, 42);

		const result = await table.waitpid(1);
		expect(result).not.toBeNull();
		expect(WIFEXITED(result!.status)).toBe(true);
		expect(WEXITSTATUS(result!.status)).toBe(42);
		expect(WIFSIGNALED(result!.status)).toBe(false);

		// Verify exitReason on entry
		const entry = table.get(1)!;
		expect(entry.exitReason).toBe("normal");
	});

	it("killed by SIGKILL — WIFSIGNALED=true, WTERMSIG=9", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();

		table.register(table.allocatePid(), "wasmvm", "sleep", ["100"], createCtx(), proc);

		// Set up waiter before kill
		const waitPromise = table.waitpid(1);

		// Kill sets termSignal, then driver triggers onExit
		table.kill(1, 9);
		proc.onExit!(128 + 9);

		const result = await waitPromise;
		expect(result).not.toBeNull();
		expect(WIFSIGNALED(result!.status)).toBe(true);
		expect(WTERMSIG(result!.status)).toBe(9);
		expect(WIFEXITED(result!.status)).toBe(false);

		const entry = table.get(1)!;
		expect(entry.exitReason).toBe("signal");
		expect(entry.termSignal).toBe(9);
	});

	it("killed by SIGTERM — WIFSIGNALED=true, WTERMSIG=15", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();

		table.register(table.allocatePid(), "wasmvm", "sleep", ["100"], createCtx(), proc);

		// Set up waiter before kill
		const waitPromise = table.waitpid(1);

		// Kill sets termSignal, then driver triggers onExit
		table.kill(1, 15);
		proc.onExit!(128 + 15);

		const result = await waitPromise;
		expect(result).not.toBeNull();
		expect(WIFSIGNALED(result!.status)).toBe(true);
		expect(WTERMSIG(result!.status)).toBe(15);
		expect(WIFEXITED(result!.status)).toBe(false);

		const entry = table.get(1)!;
		expect(entry.exitReason).toBe("signal");
		expect(entry.termSignal).toBe(15);
	});

	it("normal exit(0) — WIFEXITED=true, WEXITSTATUS=0", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		table.register(table.allocatePid(), "wasmvm", "true", [], createCtx(), proc);
		table.markExited(1, 0);

		const result = await table.waitpid(1);
		expect(result).not.toBeNull();
		expect(WIFEXITED(result!.status)).toBe(true);
		expect(WEXITSTATUS(result!.status)).toBe(0);
		expect(WIFSIGNALED(result!.status)).toBe(false);
		expect(result!.status).toBe(0); // (0 << 8) == 0
	});

	it("listProcesses returns read-only view", () => {
		const table = new ProcessTable();
		table.register(table.allocatePid(), "wasmvm", "ls", [], createCtx(), createMockDriverProcess());
		table.register(table.allocatePid(), "node", "node", [], createCtx(), createMockDriverProcess());

		const list = table.listProcesses();
		expect(list.size).toBe(2);
		expect(list.get(1)!.command).toBe("ls");
		expect(list.get(2)!.command).toBe("node");
	});

	// WNOHANG tests
	it("waitpid with WNOHANG returns null for running process", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		table.register(table.allocatePid(), "wasmvm", "sleep", ["100"], createCtx(), proc);

		const result = await table.waitpid(1, WNOHANG);
		expect(result).toBeNull();
	});

	it("waitpid with WNOHANG returns result for exited process", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		table.register(table.allocatePid(), "wasmvm", "true", [], createCtx(), proc);
		table.markExited(1, 0);

		const result = await table.waitpid(1, WNOHANG);
		expect(result).not.toBeNull();
		expect(result!.pid).toBe(1);
		expect(WIFEXITED(result!.status)).toBe(true);
		expect(WEXITSTATUS(result!.status)).toBe(0);
	});

	it("waitpid without WNOHANG still blocks until exit", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess(20);
		table.register(table.allocatePid(), "wasmvm", "echo", ["hi"], createCtx(), proc);

		// Should block and resolve after the mock exits
		const result = await table.waitpid(1);
		expect(result).not.toBeNull();
		expect(result!.pid).toBe(1);
		expect(result!.status).toBe(0);
	});

	it("WNOHANG then normal wait — non-blocking check followed by blocking wait", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		table.register(table.allocatePid(), "wasmvm", "sleep", ["100"], createCtx(), proc);

		// WNOHANG returns null while running
		const nohangResult = await table.waitpid(1, WNOHANG);
		expect(nohangResult).toBeNull();

		// Normal wait blocks until exit
		const waitPromise = table.waitpid(1);
		proc.onExit!(0);
		const result = await waitPromise;
		expect(result).not.toBeNull();
		expect(result!.pid).toBe(1);
		expect(WIFEXITED(result!.status)).toBe(true);
		expect(WEXITSTATUS(result!.status)).toBe(0);
	});

	it("waitpid with WNOHANG rejects with ESRCH for non-existent PID", async () => {
		const table = new ProcessTable();
		await expect(table.waitpid(9999, WNOHANG)).rejects.toThrow(/ESRCH/);
	});

	// -----------------------------------------------------------------------
	// SIGCHLD
	// -----------------------------------------------------------------------

	it("child exit delivers SIGCHLD to parent", () => {
		const table = new ProcessTable();
		const parentKillSignals: number[] = [];

		const parentProc = createMockDriverProcess();
		const origParentKill = parentProc.kill;
		parentProc.kill = (signal) => {
			parentKillSignals.push(signal);
			// SIGCHLD default action is ignore — do not terminate
			if (signal === SIGCHLD) return;
			origParentKill.call(parentProc, signal);
		};

		const parentPid = table.allocatePid();
		table.register(parentPid, "wasmvm", "sh", [], createCtx(), parentProc);

		const childProc = createMockDriverProcess();
		const childPid = table.allocatePid();
		table.register(childPid, "wasmvm", "echo", ["hi"], createCtx({ ppid: parentPid }), childProc);

		// Child exits — parent should receive SIGCHLD
		table.markExited(childPid, 0);
		expect(parentKillSignals).toContain(SIGCHLD);
	});

	it("SIGCHLD not delivered when parent is already exited", () => {
		const table = new ProcessTable();
		const parentKillSignals: number[] = [];

		const parentProc = createMockDriverProcess();
		parentProc.kill = (signal) => { parentKillSignals.push(signal); };

		const parentPid = table.allocatePid();
		table.register(parentPid, "wasmvm", "sh", [], createCtx(), parentProc);

		const childProc = createMockDriverProcess();
		const childPid = table.allocatePid();
		table.register(childPid, "wasmvm", "echo", [], createCtx({ ppid: parentPid }), childProc);

		// Parent exits first
		table.markExited(parentPid, 0);
		parentKillSignals.length = 0;

		// Child exits — parent is already dead, no SIGCHLD delivered
		table.markExited(childPid, 0);
		expect(parentKillSignals).not.toContain(SIGCHLD);
	});

	// -----------------------------------------------------------------------
	// SIGALRM
	// -----------------------------------------------------------------------

	it("alarm(1) delivers SIGALRM after ~1 second", async () => {
		vi.useFakeTimers();
		try {
			const table = new ProcessTable();
			const killSignals: number[] = [];

			const proc = createMockDriverProcess();
			proc.kill = (signal) => { killSignals.push(signal); };

			const pid = table.allocatePid();
			table.register(pid, "wasmvm", "sleep", ["10"], createCtx(), proc);

			const prev = table.alarm(pid, 1);
			expect(prev).toBe(0);

			// Advance time by 1 second
			vi.advanceTimersByTime(1000);

			expect(killSignals).toContain(SIGALRM);
			// termSignal should be set
			const entry = table.get(pid)!;
			expect(entry.termSignal).toBe(SIGALRM);
		} finally {
			vi.useRealTimers();
		}
	});

	it("alarm(0) cancels pending alarm", async () => {
		vi.useFakeTimers();
		try {
			const table = new ProcessTable();
			const killSignals: number[] = [];

			const proc = createMockDriverProcess();
			proc.kill = (signal) => { killSignals.push(signal); };

			const pid = table.allocatePid();
			table.register(pid, "wasmvm", "sleep", ["10"], createCtx(), proc);

			table.alarm(pid, 2);

			// Cancel the alarm — returns remaining seconds (ceil)
			const remaining = table.alarm(pid, 0);
			expect(remaining).toBeGreaterThanOrEqual(1);

			// Advance time well past the original alarm — no signal should fire
			vi.advanceTimersByTime(5000);
			expect(killSignals).not.toContain(SIGALRM);
		} finally {
			vi.useRealTimers();
		}
	});

	it("second alarm replaces first", async () => {
		vi.useFakeTimers();
		try {
			const table = new ProcessTable();
			const killSignals: number[] = [];

			const proc = createMockDriverProcess();
			proc.kill = (signal) => { killSignals.push(signal); };

			const pid = table.allocatePid();
			table.register(pid, "wasmvm", "sleep", ["10"], createCtx(), proc);

			table.alarm(pid, 5);
			const prev = table.alarm(pid, 1);
			expect(prev).toBeGreaterThanOrEqual(4); // ~5 remaining from first

			// Advance 1 second — second alarm fires
			vi.advanceTimersByTime(1000);
			expect(killSignals).toContain(SIGALRM);
			killSignals.length = 0;

			// Advance 5 more seconds — first alarm should NOT fire (was replaced)
			vi.advanceTimersByTime(5000);
			expect(killSignals).not.toContain(SIGALRM);
		} finally {
			vi.useRealTimers();
		}
	});

	// -----------------------------------------------------------------------
	// SIGTSTP / SIGCONT / SIGSTOP
	// -----------------------------------------------------------------------

	it("SIGTSTP sets process status to 'stopped'", () => {
		const table = new ProcessTable();
		const killSignals: number[] = [];

		const proc = createMockDriverProcess();
		const origKill = proc.kill;
		proc.kill = (signal) => {
			killSignals.push(signal);
			// SIGTSTP suspends — don't terminate via origKill
			if (signal === SIGTSTP) return;
			origKill.call(proc, signal);
		};

		const pid = table.allocatePid();
		table.register(pid, "wasmvm", "vim", ["-"], createCtx(), proc);

		table.kill(pid, SIGTSTP);

		const entry = table.get(pid)!;
		expect(entry.status).toBe("stopped");
		expect(killSignals).toContain(SIGTSTP);
		// termSignal should NOT be set (process is stopped, not terminated)
		expect(entry.termSignal).toBe(0);
	});

	it("SIGCONT resumes a stopped process", () => {
		const table = new ProcessTable();
		const killSignals: number[] = [];

		const proc = createMockDriverProcess();
		const origKill = proc.kill;
		proc.kill = (signal) => {
			killSignals.push(signal);
			if (signal === SIGTSTP || signal === SIGCONT) return;
			origKill.call(proc, signal);
		};

		const pid = table.allocatePid();
		table.register(pid, "wasmvm", "vim", ["-"], createCtx(), proc);

		// Stop the process
		table.kill(pid, SIGTSTP);
		expect(table.get(pid)!.status).toBe("stopped");

		// Resume it
		table.kill(pid, SIGCONT);
		expect(table.get(pid)!.status).toBe("running");
		expect(killSignals).toContain(SIGCONT);
	});

	it("SIGSTOP sets process status to 'stopped' (cannot be caught)", () => {
		const table = new ProcessTable();
		const killSignals: number[] = [];

		const proc = createMockDriverProcess();
		const origKill = proc.kill;
		proc.kill = (signal) => {
			killSignals.push(signal);
			if (signal === SIGSTOP) return;
			origKill.call(proc, signal);
		};

		const pid = table.allocatePid();
		table.register(pid, "wasmvm", "cat", [], createCtx(), proc);

		table.kill(pid, SIGSTOP);

		const entry = table.get(pid)!;
		expect(entry.status).toBe("stopped");
		expect(killSignals).toContain(SIGSTOP);
		expect(entry.termSignal).toBe(0);
	});

	it("SIGCONT on a running process is a no-op for status", () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		proc.kill = () => {}; // No-op

		const pid = table.allocatePid();
		table.register(pid, "wasmvm", "sleep", ["10"], createCtx(), proc);

		table.kill(pid, SIGCONT);
		expect(table.get(pid)!.status).toBe("running");
	});

	it("stop() and cont() methods work directly", () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		proc.kill = () => {};

		const pid = table.allocatePid();
		table.register(pid, "wasmvm", "cat", [], createCtx(), proc);

		table.stop(pid);
		expect(table.get(pid)!.status).toBe("stopped");

		table.cont(pid);
		expect(table.get(pid)!.status).toBe("running");
	});

	it("process group kill with SIGTSTP stops all members", () => {
		const table = new ProcessTable();

		const proc1 = createMockDriverProcess();
		proc1.kill = (s) => { if (s === SIGTSTP) return; };
		const proc2 = createMockDriverProcess();
		proc2.kill = (s) => { if (s === SIGTSTP) return; };

		const pid1 = table.allocatePid();
		table.register(pid1, "wasmvm", "cat", [], createCtx(), proc1);
		const pid2 = table.allocatePid();
		table.register(pid2, "wasmvm", "grep", [], createCtx({ ppid: pid1 }), proc2);

		// Both in same pgid (inherited from pid1)
		expect(table.get(pid2)!.pgid).toBe(pid1);

		table.kill(-pid1, SIGTSTP);
		expect(table.get(pid1)!.status).toBe("stopped");
		expect(table.get(pid2)!.status).toBe("stopped");
	});
});
