import { describe, it, expect } from "vitest";
import { ProcessTable } from "../src/process-table.js";
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
		isTTY: { stdin: false, stdout: false, stderr: false },
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
		expect(result.pid).toBe(1);
		expect(result.status).toBe(0);
	});

	it("waitpid resolves immediately for already-exited process", async () => {
		const table = new ProcessTable();
		const proc = createMockDriverProcess();
		table.register(table.allocatePid(), "wasmvm", "true", [], createCtx(), proc);

		// Manually mark as exited
		table.markExited(1, 42);

		const result = await table.waitpid(1);
		expect(result.status).toBe(42);
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

	it("listProcesses returns read-only view", () => {
		const table = new ProcessTable();
		table.register(table.allocatePid(), "wasmvm", "ls", [], createCtx(), createMockDriverProcess());
		table.register(table.allocatePid(), "node", "node", [], createCtx(), createMockDriverProcess());

		const list = table.listProcesses();
		expect(list.size).toBe(2);
		expect(list.get(1)!.command).toBe("ls");
		expect(list.get(2)!.command).toBe("node");
	});
});
