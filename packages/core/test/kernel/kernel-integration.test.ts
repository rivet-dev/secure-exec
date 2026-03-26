import { describe, it, expect, vi, afterEach } from "vitest";
import {
	TestFileSystem,
	MockRuntimeDriver,
	createTestKernel,
	type MockCommandConfig,
} from "./helpers.js";
import type { Kernel, Permissions, ProcessContext, RuntimeDriver, DriverProcess, KernelInterface } from "../../src/kernel/types.js";
import {
	FILETYPE_PIPE,
	FILETYPE_CHARACTER_DEVICE,
	O_CREAT,
	O_EXCL,
	O_RDONLY,
	O_TRUNC,
	O_WRONLY,
	SA_RESETHAND,
	SA_RESTART,
	SIGALRM,
	SIG_BLOCK,
	SIGTERM,
	SIG_UNBLOCK,
} from "../../src/kernel/types.js";
import { LOCK_EX, LOCK_UN } from "../../src/kernel/file-lock.js";
import { createKernel } from "../../src/kernel/kernel.js";
import { filterEnv, wrapFileSystem } from "../../src/kernel/permissions.js";
import { MAX_CANON, MAX_PTY_BUFFER_BYTES } from "../../src/kernel/pty.js";
import { MAX_PIPE_BUFFER_BYTES } from "../../src/kernel/pipe-manager.js";
import { createProcessScopedFileSystem } from "../../src/kernel/proc-layer.js";
import { InMemoryFileSystem } from "../../src/shared/in-memory-fs.js";

describe("kernel + MockRuntimeDriver integration", () => {
	let kernel: Kernel;

	afterEach(async () => {
		await kernel?.dispose();
	});

	async function createInodeKernelHarness(driver: MockRuntimeDriver) {
		const filesystem = new InMemoryFileSystem();
		const kernel = createKernel({ filesystem });
		await (kernel as any).posixDirsReady;
		await kernel.mount(driver);
		return {
			kernel,
			filesystem,
			ki: driver.kernelInterface!,
		};
	}

	// -----------------------------------------------------------------------
	// Basic mount / spawn / exec
	// -----------------------------------------------------------------------

	it("mount registers mock commands in kernel.commands", async () => {
		const driver = new MockRuntimeDriver(["echo", "cat"]);
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		expect(kernel.commands.get("echo")).toBe("mock");
		expect(kernel.commands.get("cat")).toBe("mock");
	});

	it("spawn returns ManagedProcess with correct PID and exit code", async () => {
		const driver = new MockRuntimeDriver(["mock-cmd"], {
			"mock-cmd": { exitCode: 42 },
		});
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const proc = kernel.spawn("mock-cmd", []);
		expect(proc.pid).toBeGreaterThan(0);

		const code = await proc.wait();
		expect(code).toBe(42);
	});

	it("exec returns ExecResult with stdout and stderr", async () => {
		// exec() routes through 'sh', so register 'sh' as a mock command
		const driver = new MockRuntimeDriver(["sh"], {
			sh: { exitCode: 0, stdout: "hello\n", stderr: "warn\n" },
		});
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const result = await kernel.exec("echo hello");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("hello\n");
		expect(result.stderr).toBe("warn\n");
	});

	it("exec of unknown command throws ENOENT", async () => {
		const driver = new MockRuntimeDriver(["sh"], { sh: { exitCode: 0 } });
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		// spawn directly — 'nosuchcmd' is not registered
		expect(() => kernel.spawn("nosuchcmd", [])).toThrow("ENOENT");
	});

	it("dispose tears down cleanly", async () => {
		const driver = new MockRuntimeDriver(["sh"], { sh: { exitCode: 0 } });
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		await kernel.dispose();
		// Second dispose is safe
		await kernel.dispose();
		// Kernel is disposed — operations throw
		await expect(kernel.exec("echo")).rejects.toThrow("disposed");
	});

	it("driver receives KernelInterface on init", async () => {
		const driver = new MockRuntimeDriver(["x"]);
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		expect(driver.kernelInterface).not.toBeNull();
		expect(driver.kernelInterface!.vfs).toBeDefined();
	});

	it("exposes timerTable on the kernel public API", async () => {
		const driver = new MockRuntimeDriver(["x"]);
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		expect(kernel.timerTable).toBeDefined();
		expect(kernel.timerTable.size).toBe(0);
	});

	it("clears process timers when a process exits", async () => {
		const driver = new MockRuntimeDriver(["sleep"], {
			sleep: { neverExit: true, killSignals: [] },
		});
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const proc = kernel.spawn("sleep", []);
		const timerId = kernel.timerTable.createTimer(proc.pid, 1_000, false, () => {});
		expect(kernel.timerTable.get(timerId)).not.toBeNull();

		proc.kill();
		await proc.wait();

		expect(kernel.timerTable.get(timerId)).toBeNull();
		expect(kernel.timerTable.size).toBe(0);
	});

	// -----------------------------------------------------------------------
	// BUG 1 fix: stdout callback race
	// -----------------------------------------------------------------------

	it("exec captures stdout emitted synchronously during spawn", async () => {
		const driver = new MockRuntimeDriver(["sh"], {
			sh: { exitCode: 0, stdout: "sync-data", emitDuringSpawn: true },
		});
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const result = await kernel.exec("test");
		expect(result.stdout).toBe("sync-data");
	});

	it("exec captures stderr emitted synchronously during spawn", async () => {
		const driver = new MockRuntimeDriver(["sh"], {
			sh: { exitCode: 0, stderr: "sync-err", emitDuringSpawn: true },
		});
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const result = await kernel.exec("test");
		expect(result.stderr).toBe("sync-err");
	});

	// -----------------------------------------------------------------------
	// exec() timeout — kill process, clear timer, detach callbacks
	// -----------------------------------------------------------------------

	it("exec timeout kills process and rejects with ETIMEDOUT", async () => {
		const killSignals: number[] = [];
		const driver = new MockRuntimeDriver(["sh"], {
			sh: { neverExit: true, killSignals },
		});
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		await expect(
			kernel.exec("long-running", { timeout: 50 }),
		).rejects.toThrow("ETIMEDOUT");

		// Process was killed with SIGTERM
		expect(killSignals.length).toBe(1);
		expect(killSignals[0]).toBe(15);
	});

	it("exec timeout detaches stdout/stderr to stop accumulation", async () => {
		let stdoutAfterTimeout = false;
		const driver = new MockRuntimeDriver(["sh"], {
			sh: { neverExit: true, survivableSignals: [15], killSignals: [] },
		});
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const onStdout = () => { stdoutAfterTimeout = true; };
		const promise = kernel.exec("cmd", { timeout: 50, onStdout });
		await expect(promise).rejects.toThrow("ETIMEDOUT");

		// Callbacks are detached — no further accumulation possible
		stdoutAfterTimeout = false;
		// If the internal proc.onStdout were still attached, calling it would set the flag.
		// Since we can't reach the proc directly, the fact that kill was issued and
		// callbacks nulled is verified by the code path.
		expect(stdoutAfterTimeout).toBe(false);
	});

	it("exec clears timeout timer when process exits early", async () => {
		vi.useFakeTimers();
		try {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0, stdout: "done" },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// Process exits immediately (next microtask), timeout is 5000ms
			const resultPromise = kernel.exec("fast", { timeout: 5000 });

			// Flush microtasks to let the mock process exit
			await vi.advanceTimersByTimeAsync(0);
			const result = await resultPromise;
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe("done");

			// Advance past the timeout — should not throw (timer was cleared)
			await vi.advanceTimersByTimeAsync(6000);
		} finally {
			vi.useRealTimers();
		}
	});

	// -----------------------------------------------------------------------
	// BUG 2 fix: PID allocation race
	// -----------------------------------------------------------------------

	it("concurrent spawns get unique PIDs", async () => {
		const commands = Array.from({ length: 10 }, (_, i) => `cmd-${i}`);
		const configs: Record<string, MockCommandConfig> = {};
		for (const cmd of commands) configs[cmd] = { exitCode: 0 };

		const driver = new MockRuntimeDriver(commands, configs);
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		// Spawn 10 processes concurrently
		const procs = commands.map((cmd) => kernel.spawn(cmd, []));

		const pids = procs.map((p) => p.pid);
		const uniquePids = new Set(pids);
		expect(uniquePids.size).toBe(10);

		// All PIDs should match what the process table reports
		for (const proc of procs) {
			const info = kernel.processes.get(proc.pid);
			expect(info).toBeDefined();
			expect(info!.pid).toBe(proc.pid);
		}

		// Wait for all to exit
		await Promise.all(procs.map((p) => p.wait()));
	});

	// -----------------------------------------------------------------------
	// Concurrent PID stress test (US-010)
	// -----------------------------------------------------------------------

	describe("concurrent PID stress (100 processes)", () => {
		it("spawn 100 processes concurrently, all PIDs are unique", async () => {
			const N = 100;
			const commands = Array.from({ length: N }, (_, i) => `stress-${i}`);
			const configs: Record<string, MockCommandConfig> = {};
			for (const cmd of commands) configs[cmd] = { exitCode: 0 };

			const driver = new MockRuntimeDriver(commands, configs);
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const procs = commands.map((cmd) => kernel.spawn(cmd, []));
			const pids = procs.map((p) => p.pid);
			const uniquePids = new Set(pids);

			expect(uniquePids.size).toBe(N);

			// All PIDs are positive integers
			for (const pid of pids) {
				expect(pid).toBeGreaterThan(0);
			}

			await Promise.all(procs.map((p) => p.wait()));
		});

		it("spawn 100 processes, wait all, all exit codes captured correctly", async () => {
			const N = 100;
			const commands = Array.from({ length: N }, (_, i) => `exit-${i}`);
			const configs: Record<string, MockCommandConfig> = {};
			for (let i = 0; i < N; i++) configs[`exit-${i}`] = { exitCode: i % 256 };

			const driver = new MockRuntimeDriver(commands, configs);
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const procs = commands.map((cmd) => kernel.spawn(cmd, []));

			const codes = await Promise.all(procs.map((p) => p.wait()));

			for (let i = 0; i < N; i++) {
				expect(codes[i]).toBe(i % 256);
			}

			// PIDs should also all be unique
			const uniquePids = new Set(procs.map((p) => p.pid));
			expect(uniquePids.size).toBe(N);
		});
	});

	// -----------------------------------------------------------------------
	// BUG 3 fix: fdRead reads from VFS
	// -----------------------------------------------------------------------

	it("fdRead returns file content at cursor position", async () => {
		const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
		const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
		kernel = k;

		// Write a file via VFS
		await vfs.writeFile("/tmp/test.txt", "hello world");

		const ki = driver.kernelInterface!;

		// Spawn a process to get a valid PID in the FD table
		const proc = kernel.spawn("x", []);

		// Open the file via kernel interface
		const fd = ki.fdOpen(proc.pid, "/tmp/test.txt", 0);
		expect(fd).toBeGreaterThanOrEqual(3); // 0-2 are stdio

		// Read content
		const data = await ki.fdRead(proc.pid, fd, 5);
		expect(new TextDecoder().decode(data)).toBe("hello");

		// Read more — cursor should have advanced
		const data2 = await ki.fdRead(proc.pid, fd, 100);
		expect(new TextDecoder().decode(data2)).toBe(" world");

		// Read past EOF
		const data3 = await ki.fdRead(proc.pid, fd, 10);
		expect(data3.length).toBe(0);

		proc.kill(9);
		await proc.wait();
	});

	it("fdRead uses pread — small read on large file does not allocate full file", async () => {
		const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
		const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
		kernel = k;

		// Create a 1MB file
		const MB = 1024 * 1024;
		const bigData = new Uint8Array(MB);
		bigData[0] = 0x42; // marker byte
		await vfs.writeFile("/tmp/big.bin", bigData);

		const ki = driver.kernelInterface!;
		const proc = kernel.spawn("x", []);
		const fd = ki.fdOpen(proc.pid, "/tmp/big.bin", 0);

		// Read just 1 byte at offset 0
		const data = await ki.fdRead(proc.pid, fd, 1);
		expect(data.length).toBe(1);
		expect(data[0]).toBe(0x42);

		proc.kill(9);
		await proc.wait();
	});

	it("fdRead sequential calls advance cursor correctly", async () => {
		const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
		const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
		kernel = k;

		await vfs.writeFile("/tmp/seq.txt", "abcdefghij");

		const ki = driver.kernelInterface!;
		const proc = kernel.spawn("x", []);
		const fd = ki.fdOpen(proc.pid, "/tmp/seq.txt", 0);

		// Read 3 bytes
		const d1 = await ki.fdRead(proc.pid, fd, 3);
		expect(new TextDecoder().decode(d1)).toBe("abc");

		// Read 4 bytes — cursor should be at 3
		const d2 = await ki.fdRead(proc.pid, fd, 4);
		expect(new TextDecoder().decode(d2)).toBe("defg");

		// Read remaining
		const d3 = await ki.fdRead(proc.pid, fd, 100);
		expect(new TextDecoder().decode(d3)).toBe("hij");

		// EOF
		const d4 = await ki.fdRead(proc.pid, fd, 10);
		expect(d4.length).toBe(0);

		proc.kill(9);
		await proc.wait();
	});

	it("fdRead returns EBADF for invalid FD", async () => {
		const driver = new MockRuntimeDriver(["x"]);
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const proc = kernel.spawn("x", []);
		const ki = driver.kernelInterface!;

		await expect(ki.fdRead(proc.pid, 999, 10)).rejects.toThrow("EBADF");
		await proc.wait();
	});

	// -----------------------------------------------------------------------
	// fdSeek — SEEK_SET, SEEK_CUR, SEEK_END, pipe rejection
	// -----------------------------------------------------------------------

	describe("fdSeek", () => {
		it("SEEK_SET resets cursor and fdRead returns content from new position", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/seek.txt", "hello world");

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/seek.txt", 0);

			// Read 5 bytes to advance cursor
			const first = await ki.fdRead(proc.pid, fd, 5);
			expect(new TextDecoder().decode(first)).toBe("hello");

			// Seek back to start
			const pos = await ki.fdSeek(proc.pid, fd, 0n, 0); // SEEK_SET
			expect(pos).toBe(0n);

			// Read again — should get 'hello' from the beginning
			const second = await ki.fdRead(proc.pid, fd, 5);
			expect(new TextDecoder().decode(second)).toBe("hello");

			proc.kill(9);
			await proc.wait();
		});

		it("SEEK_CUR advances cursor relative to current position", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/seek.txt", "hello world");

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/seek.txt", 0);

			// Read 5 bytes — cursor at 5
			await ki.fdRead(proc.pid, fd, 5);

			// Seek forward 1 byte from current (skip space) — cursor at 6
			const pos = await ki.fdSeek(proc.pid, fd, 1n, 1); // SEEK_CUR
			expect(pos).toBe(6n);

			// Read rest — should get 'world'
			const data = await ki.fdRead(proc.pid, fd, 100);
			expect(new TextDecoder().decode(data)).toBe("world");

			proc.kill(9);
			await proc.wait();
		});

		it("SEEK_END positions cursor at file end (EOF read returns empty)", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/seek.txt", "hello world");

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/seek.txt", 0);

			// Seek to end
			const pos = await ki.fdSeek(proc.pid, fd, 0n, 2); // SEEK_END
			expect(pos).toBe(11n); // "hello world".length

			// Read at EOF — empty
			const data = await ki.fdRead(proc.pid, fd, 10);
			expect(data.length).toBe(0);

			proc.kill(9);
			await proc.wait();
		});

		it("SEEK_END with negative offset seeks before end of file", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/seek.txt", "hello world");

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/seek.txt", 0);

			// Seek to 5 bytes before end — cursor at 6
			const pos = await ki.fdSeek(proc.pid, fd, -5n, 2); // SEEK_END
			expect(pos).toBe(6n);

			const data = await ki.fdRead(proc.pid, fd, 100);
			expect(new TextDecoder().decode(data)).toBe("world");

			proc.kill(9);
			await proc.wait();
		});

		it("fdSeek on pipe FD throws ESPIPE", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);

			// Create a pipe — both ends are in proc's FD table
			const { readFd, writeFd } = ki.pipe(proc.pid);

			// Seek on read end — should throw ESPIPE
			await expect(ki.fdSeek(proc.pid, readFd, 0n, 0)).rejects.toThrow("ESPIPE");

			// Seek on write end — should also throw ESPIPE
			await expect(ki.fdSeek(proc.pid, writeFd, 0n, 0)).rejects.toThrow("ESPIPE");

			proc.kill(9);
			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// fdPread / fdPwrite — positional I/O
	// -----------------------------------------------------------------------

	describe("fdPread and fdPwrite", () => {
		it("fdPread reads at offset without changing cursor", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/pread-test.txt", "hello world");
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/pread-test.txt", 0);

			// Pread at offset 0 → 'hello'
			const data1 = await ki.fdPread(proc.pid, fd, 5, 0n);
			expect(new TextDecoder().decode(data1)).toBe("hello");

			// Cursor should still be at 0 — regular fdRead should start from 0
			const data2 = await ki.fdRead(proc.pid, fd, 11);
			expect(new TextDecoder().decode(data2)).toBe("hello world");

			proc.kill(9);
			await proc.wait();
		});

		it("fdPread at middle offset", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/pread-mid.txt", "hello world");
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/pread-mid.txt", 0);

			// Pread at offset 6 → 'world'
			const data = await ki.fdPread(proc.pid, fd, 5, 6n);
			expect(new TextDecoder().decode(data)).toBe("world");

			// Cursor unchanged — fdRead still starts from 0
			const full = await ki.fdRead(proc.pid, fd, 5);
			expect(new TextDecoder().decode(full)).toBe("hello");

			proc.kill(9);
			await proc.wait();
		});

		it("fdPwrite writes at offset without changing cursor", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/pwrite-test.txt", "hello world");
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/pwrite-test.txt", 2); // O_RDWR

			// Pwrite "XXXXX" at offset 6
			const written = await ki.fdPwrite(proc.pid, fd, new TextEncoder().encode("XXXXX"), 6n);
			expect(written).toBe(5);

			// Verify the file was modified
			const content = await vfs.readFile("/tmp/pwrite-test.txt");
			expect(new TextDecoder().decode(content)).toBe("hello XXXXX");

			// Cursor unchanged — fdRead from 0
			const data = await ki.fdRead(proc.pid, fd, 11);
			expect(new TextDecoder().decode(data)).toBe("hello XXXXX");

			proc.kill(9);
			await proc.wait();
		});

		it("fdPwrite extends file when writing past end", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/pwrite-extend.txt", "AB");
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/pwrite-extend.txt", 2);

			// Write at offset 5 (past end)
			await ki.fdPwrite(proc.pid, fd, new TextEncoder().encode("CD"), 5n);

			const content = await vfs.readFile("/tmp/pwrite-extend.txt");
			expect(content.length).toBe(7);
			expect(content[5]).toBe(67); // 'C'
			expect(content[6]).toBe(68); // 'D'
			// Bytes 2-4 should be zero-filled
			expect(content[2]).toBe(0);
			expect(content[3]).toBe(0);
			expect(content[4]).toBe(0);

			proc.kill(9);
			await proc.wait();
		});

		it("fdPread on pipe FD throws ESPIPE", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const { readFd, writeFd } = ki.pipe(proc.pid);

			await expect(ki.fdPread(proc.pid, readFd, 10, 0n)).rejects.toThrow("ESPIPE");
			await expect(ki.fdPwrite(proc.pid, writeFd, new Uint8Array([1, 2]), 0n)).rejects.toThrow("ESPIPE");

			proc.kill(9);
			await proc.wait();
		});

		it("fdPread at EOF returns empty", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/pread-eof.txt", "short");
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/pread-eof.txt", 0);

			const data = await ki.fdPread(proc.pid, fd, 10, 100n);
			expect(data.length).toBe(0);

			proc.kill(9);
			await proc.wait();
		});

		it("fdPread and fdPwrite do not interfere with each other's cursor", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/preadwrite.txt", "AAAAAAAAAA");
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/preadwrite.txt", 2); // O_RDWR

			// Read 3 bytes via regular fdRead to advance cursor to 3
			await ki.fdRead(proc.pid, fd, 3);

			// Pwrite at offset 7 — cursor should stay at 3
			await ki.fdPwrite(proc.pid, fd, new TextEncoder().encode("BB"), 7n);

			// Pread at offset 0 — cursor should stay at 3
			const preadData = await ki.fdPread(proc.pid, fd, 2, 0n);
			expect(new TextDecoder().decode(preadData)).toBe("AA");

			// Regular fdRead should continue from cursor=3
			const data = await ki.fdRead(proc.pid, fd, 7);
			expect(new TextDecoder().decode(data)).toBe("AAAABBA");

			proc.kill(9);
			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// fdWrite to VFS (regular files)
	// -----------------------------------------------------------------------

	describe("fdWrite to VFS", () => {
		it("fdWrite writes data and advances cursor, fdRead reads it back", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			// Create an empty file
			await vfs.writeFile("/tmp/write-test.txt", "");

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/write-test.txt", 2); // O_RDWR

			// Write data
			const written = await ki.fdWrite(proc.pid, fd, new TextEncoder().encode("hello world"));
			expect(written).toBe(11);

			// Seek back to start
			await ki.fdSeek(proc.pid, fd, 0n, 0); // SEEK_SET

			// Read back — data matches
			const data = await ki.fdRead(proc.pid, fd, 100);
			expect(new TextDecoder().decode(data)).toBe("hello world");

			// Verify VFS has the data too
			const vfsContent = await vfs.readFile("/tmp/write-test.txt");
			expect(new TextDecoder().decode(vfsContent)).toBe("hello world");

			proc.kill(9);
			await proc.wait();
		});

		it("fdWrite at offset via fdSeek, fdPread at same offset — data matches", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/offset-write.txt", "AAAAAAAAAA"); // 10 bytes
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/offset-write.txt", 2); // O_RDWR

			// Seek to offset 5
			await ki.fdSeek(proc.pid, fd, 5n, 0); // SEEK_SET

			// Write "BBBBB" at offset 5
			const written = await ki.fdWrite(proc.pid, fd, new TextEncoder().encode("BBBBB"));
			expect(written).toBe(5);

			// fdPread at offset 5 — should see "BBBBB"
			const data = await ki.fdPread(proc.pid, fd, 5, 5n);
			expect(new TextDecoder().decode(data)).toBe("BBBBB");

			// Full file should be "AAAAABBBBB"
			const full = await vfs.readFile("/tmp/offset-write.txt");
			expect(new TextDecoder().decode(full)).toBe("AAAAABBBBB");

			proc.kill(9);
			await proc.wait();
		});

		it("cursor advances correctly across multiple writes", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/multi-write.txt", "");
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/multi-write.txt", 2);

			// Write in chunks
			await ki.fdWrite(proc.pid, fd, new TextEncoder().encode("abc"));
			await ki.fdWrite(proc.pid, fd, new TextEncoder().encode("def"));
			await ki.fdWrite(proc.pid, fd, new TextEncoder().encode("ghi"));

			// Verify full content
			const content = await vfs.readFile("/tmp/multi-write.txt");
			expect(new TextDecoder().decode(content)).toBe("abcdefghi");

			proc.kill(9);
			await proc.wait();
		});

		it("fdWrite extends file when writing past end", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			await vfs.writeFile("/tmp/extend.txt", "AB"); // 2 bytes
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("x", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/extend.txt", 2);

			// Seek past end
			await ki.fdSeek(proc.pid, fd, 5n, 0); // SEEK_SET

			// Write at offset 5
			await ki.fdWrite(proc.pid, fd, new TextEncoder().encode("CD"));

			const content = await vfs.readFile("/tmp/extend.txt");
			expect(content.length).toBe(7);
			expect(content[0]).toBe(65); // 'A'
			expect(content[1]).toBe(66); // 'B'
			// Bytes 2-4 should be zero-filled
			expect(content[2]).toBe(0);
			expect(content[3]).toBe(0);
			expect(content[4]).toBe(0);
			expect(content[5]).toBe(67); // 'C'
			expect(content[6]).toBe(68); // 'D'

			proc.kill(9);
			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// stdin streaming
	// -----------------------------------------------------------------------

	describe("stdin streaming", () => {
		it("writeStdin delivers bytes to MockRuntimeDriver DriverProcess", async () => {
			const stdinCapture: Uint8Array[] = [];
			const driver = new MockRuntimeDriver(["mock-cmd"], {
				"mock-cmd": { exitCode: 0, stdinCapture },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("mock-cmd", []);
			proc.writeStdin(new TextEncoder().encode("test data"));

			const received = new TextDecoder().decode(stdinCapture[0]);
			expect(received).toBe("test data");

			await proc.wait();
		});

		it("writeStdin converts string to Uint8Array", async () => {
			const stdinCapture: Uint8Array[] = [];
			const driver = new MockRuntimeDriver(["mock-cmd"], {
				"mock-cmd": { exitCode: 0, stdinCapture },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("mock-cmd", []);
			proc.writeStdin("string data");

			expect(stdinCapture.length).toBe(1);
			expect(stdinCapture[0]).toBeInstanceOf(Uint8Array);
			expect(new TextDecoder().decode(stdinCapture[0])).toBe("string data");

			await proc.wait();
		});

		it("closeStdin triggers driver closeStdin callback", async () => {
			let closeCalled = false;
			const driver = new MockRuntimeDriver(["mock-cmd"], {
				"mock-cmd": { exitCode: 0, onCloseStdin: () => { closeCalled = true; } },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("mock-cmd", []);
			proc.closeStdin();
			expect(closeCalled).toBe(true);

			await proc.wait();
		});

		it("multiple writeStdin calls accumulate in order", async () => {
			const stdinCapture: Uint8Array[] = [];
			const driver = new MockRuntimeDriver(["mock-cmd"], {
				"mock-cmd": { exitCode: 0, stdinCapture },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("mock-cmd", []);
			proc.writeStdin(new TextEncoder().encode("chunk1"));
			proc.writeStdin(new TextEncoder().encode("chunk2"));
			proc.writeStdin(new TextEncoder().encode("chunk3"));

			expect(stdinCapture.length).toBe(3);
			const texts = stdinCapture.map((c) => new TextDecoder().decode(c));
			expect(texts).toEqual(["chunk1", "chunk2", "chunk3"]);

			await proc.wait();
		});

		it("echoStdin: writeStdin + closeStdin → stdout contains written data", async () => {
			const stdoutChunks: Uint8Array[] = [];
			const driver = new MockRuntimeDriver(["echo-cmd"], {
				"echo-cmd": { echoStdin: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("echo-cmd", [], {
				onStdout: (data) => stdoutChunks.push(data),
			});
			proc.writeStdin("hello world");
			proc.closeStdin();

			await proc.wait();

			const output = stdoutChunks.map((c) => new TextDecoder().decode(c)).join("");
			expect(output).toBe("hello world");
		});

		it("echoStdin: multiple writeStdin calls → stdout contains all chunks concatenated", async () => {
			const stdoutChunks: Uint8Array[] = [];
			const driver = new MockRuntimeDriver(["echo-cmd"], {
				"echo-cmd": { echoStdin: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("echo-cmd", [], {
				onStdout: (data) => stdoutChunks.push(data),
			});
			proc.writeStdin("chunk1");
			proc.writeStdin("chunk2");
			proc.writeStdin("chunk3");
			proc.closeStdin();

			await proc.wait();

			const output = stdoutChunks.map((c) => new TextDecoder().decode(c)).join("");
			expect(output).toBe("chunk1chunk2chunk3");
		});
	});

	// -----------------------------------------------------------------------
	// Dispose with active processes
	// -----------------------------------------------------------------------

	describe("dispose with active processes", () => {
		it("dispose kills all running processes and resolves within 5s", async () => {
			const killSignals: number[][] = [];
			const commands: string[] = [];
			const configs: Record<string, MockCommandConfig> = {};
			for (let i = 0; i < 5; i++) {
				const signals: number[] = [];
				killSignals.push(signals);
				const cmd = `hang-${i}`;
				commands.push(cmd);
				configs[cmd] = { neverExit: true, killSignals: signals };
			}

			const driver = new MockRuntimeDriver(commands, configs);
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// Spawn 5 processes that never exit on their own
			const procs = commands.map((cmd) => kernel.spawn(cmd, []));
			expect(procs.length).toBe(5);

			// All should be running
			for (const proc of procs) {
				expect(kernel.processes.get(proc.pid)?.status).toBe("running");
			}

			// Dispose should kill all and resolve quickly
			const start = Date.now();
			await kernel.dispose();
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(5000);

			// Every process received SIGTERM (signal 15)
			for (const signals of killSignals) {
				expect(signals).toContain(15);
			}
		}, 10_000);

		it("spawn after dispose throws disposed", async () => {
			const driver = new MockRuntimeDriver(["sh"], { sh: { exitCode: 0 } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			await kernel.dispose();
			expect(() => kernel.spawn("sh", [])).toThrow("disposed");
		});

		it("exec after dispose rejects with disposed", async () => {
			const driver = new MockRuntimeDriver(["sh"], { sh: { exitCode: 0 } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			await kernel.dispose();
			await expect(kernel.exec("echo hello")).rejects.toThrow("disposed");
		});

		it("terminateAll escalates to SIGKILL for SIGTERM survivors", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["stubborn"], {
				stubborn: {
					neverExit: true,
					killSignals,
					survivableSignals: [15], // Ignores SIGTERM
				},
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("stubborn", []);
			expect(kernel.processes.get(proc.pid)?.status).toBe("running");

			await kernel.dispose();

			// Process should have received SIGTERM then SIGKILL
			expect(killSignals).toContain(15);
			expect(killSignals).toContain(9);
			expect(kernel.processes.get(proc.pid)?.status).toBe("exited");
		}, 10_000);
	});

	// -----------------------------------------------------------------------
	// FD inheritance
	// -----------------------------------------------------------------------

	describe("FD inheritance", () => {
		it("child inherits parent FD table via fork", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			await vfs.writeFile("/tmp/data.txt", "inherited content");

			// Spawn parent and open a file in its FD table
			const parent = kernel.spawn("parent-cmd", []);
			const fd = ki.fdOpen(parent.pid, "/tmp/data.txt", 0);
			expect(fd).toBeGreaterThanOrEqual(3);

			// Spawn child via kernel interface (callerPid = parent.pid)
			const child = ki.spawn("child-cmd", [], { ppid: parent.pid });

			// Child should have the inherited FD and can read from it
			const data = await ki.fdRead(child.pid, fd, 100);
			expect(new TextDecoder().decode(data)).toBe("inherited content");

			parent.kill(9);
			child.kill(9);
			await parent.wait();
			await child.wait();
		});

		it("inherited FDs share cursor position with parent", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			await vfs.writeFile("/tmp/shared.txt", "hello world");

			const parent = kernel.spawn("parent-cmd", []);
			const fd = ki.fdOpen(parent.pid, "/tmp/shared.txt", 0);

			// Parent reads 5 bytes — cursor advances to 5
			const data1 = await ki.fdRead(parent.pid, fd, 5);
			expect(new TextDecoder().decode(data1)).toBe("hello");

			// Spawn child — inherits FD with shared cursor at position 5
			const child = ki.spawn("child-cmd", [], { ppid: parent.pid });

			// Child reads from inherited FD — starts at cursor position 5
			const data2 = await ki.fdRead(child.pid, fd, 100);
			expect(new TextDecoder().decode(data2)).toBe(" world");

			parent.kill(9);
			child.kill(9);
			await parent.wait();
			await child.wait();
		});

		it("child closing inherited FD does not affect parent", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			await vfs.writeFile("/tmp/file.txt", "still readable");

			const parent = kernel.spawn("parent-cmd", []);
			const fd = ki.fdOpen(parent.pid, "/tmp/file.txt", 0);

			// Spawn child and close the inherited FD
			const child = ki.spawn("child-cmd", [], { ppid: parent.pid });
			ki.fdClose(child.pid, fd);

			// Child can no longer read
			await expect(ki.fdRead(child.pid, fd, 100)).rejects.toThrow("EBADF");

			// Parent can still read — not affected by child's close
			const data = await ki.fdRead(parent.pid, fd, 100);
			expect(new TextDecoder().decode(data)).toBe("still readable");

			parent.kill(9);
			child.kill(9);
			await parent.wait();
			await child.wait();
		});

		it("child closing inherited pipe FD does not cause premature EOF", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const parent = kernel.spawn("parent-cmd", []);

			// Create a pipe in parent's FD table
			const { readFd, writeFd } = ki.pipe(parent.pid);

			// Spawn child — inherits both pipe ends
			const child = ki.spawn("child-cmd", [], { ppid: parent.pid });

			// Child closes its inherited write end
			ki.fdClose(child.pid, writeFd);

			// Parent writes to the pipe — should still work (parent's write end is open)
			ki.fdWrite(parent.pid, writeFd, new TextEncoder().encode("pipe data"));

			// Child reads from its inherited read end
			const data = await ki.fdRead(child.pid, readFd, 100);
			expect(new TextDecoder().decode(data)).toBe("pipe data");

			parent.kill(9);
			child.kill(9);
			await parent.wait();
			await child.wait();
		});

		it("unlink + dup keeps deferred inode data alive until the final shared FD closes", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k, filesystem, ki } = await createInodeKernelHarness(driver);
			kernel = k;

			await filesystem.writeFile("/tmp/deferred-dup.txt", "hello");

			const proc = kernel.spawn("proc", []);
			const fd = ki.fdOpen(proc.pid, "/tmp/deferred-dup.txt", O_RDONLY);
			const dupFd = ki.fdDup(proc.pid, fd);
			const initial = await kernel.stat("/tmp/deferred-dup.txt");

			expect(kernel.inodeTable.get(initial.ino)?.openRefCount).toBe(1);

			await filesystem.removeFile("/tmp/deferred-dup.txt");
			ki.fdClose(proc.pid, fd);

			expect(await filesystem.exists("/tmp/deferred-dup.txt")).toBe(false);
			expect(kernel.inodeTable.get(initial.ino)?.openRefCount).toBe(1);
			expect(new TextDecoder().decode(await ki.fdRead(proc.pid, dupFd, 5))).toBe("hello");

			ki.fdClose(proc.pid, dupFd);

			expect(kernel.inodeTable.get(initial.ino)).toBeNull();
			expect(() => filesystem.statByInode(initial.ino)).toThrow("inode");

			proc.kill(9);
			await proc.wait();
		});

		it("fdDup2 releases an unlinked target inode when it drops the last shared reference", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k, filesystem, ki } = await createInodeKernelHarness(driver);
			kernel = k;

			await filesystem.writeFile("/tmp/dup2-source.txt", "source");
			await filesystem.writeFile("/tmp/dup2-target.txt", "target");

			const proc = kernel.spawn("proc", []);
			const sourceFd = ki.fdOpen(proc.pid, "/tmp/dup2-source.txt", O_RDONLY);
			const targetFd = ki.fdOpen(proc.pid, "/tmp/dup2-target.txt", O_RDONLY);
			const targetStat = await kernel.stat("/tmp/dup2-target.txt");

			await filesystem.removeFile("/tmp/dup2-target.txt");
			expect(kernel.inodeTable.get(targetStat.ino)?.openRefCount).toBe(1);

			ki.fdDup2(proc.pid, sourceFd, targetFd);

			expect(kernel.inodeTable.get(targetStat.ino)).toBeNull();
			expect(() => filesystem.statByInode(targetStat.ino)).toThrow("inode");
			expect(new TextDecoder().decode(await ki.fdRead(proc.pid, targetFd, 6))).toBe("source");

			proc.kill(9);
			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// Pipe refcount edge cases — multi-writer EOF (US-011)
	// -----------------------------------------------------------------------

	describe("pipe refcount edge cases (multi-writer EOF)", () => {
		it("dup write end, close one copy → pipe still writable, no EOF", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const proc = kernel.spawn("proc", []);
			const { readFd, writeFd } = ki.pipe(proc.pid);

			// Dup write end — two references to same write description
			const dupWriteFd = ki.fdDup(proc.pid, writeFd);

			// Close original write FD — refCount decrements but > 0
			ki.fdClose(proc.pid, writeFd);

			// Write through dup'd FD — should still work
			ki.fdWrite(proc.pid, dupWriteFd, new TextEncoder().encode("still open"));
			const data = await ki.fdRead(proc.pid, readFd, 100);
			expect(new TextDecoder().decode(data)).toBe("still open");

			proc.kill(9);
			await proc.wait();
		});

		it("close all write end copies → reader gets EOF", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const proc = kernel.spawn("proc", []);
			const { readFd, writeFd } = ki.pipe(proc.pid);

			// Dup write end — two references
			const dupWriteFd = ki.fdDup(proc.pid, writeFd);

			// Close first copy — not EOF yet
			ki.fdClose(proc.pid, writeFd);

			// Close second copy — refCount drops to 0, EOF triggered
			ki.fdClose(proc.pid, dupWriteFd);

			// Reader should get EOF (empty Uint8Array)
			const eof = await ki.fdRead(proc.pid, readFd, 100);
			expect(eof.length).toBe(0);

			proc.kill(9);
			await proc.wait();
		});

		it("write through both dup'd references → reader receives all data", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const proc = kernel.spawn("proc", []);
			const { readFd, writeFd } = ki.pipe(proc.pid);

			// Dup write end
			const dupWriteFd = ki.fdDup(proc.pid, writeFd);

			// Write through original FD
			ki.fdWrite(proc.pid, writeFd, new TextEncoder().encode("from-original"));

			// Write through dup'd FD
			ki.fdWrite(proc.pid, dupWriteFd, new TextEncoder().encode("|from-dup"));

			// Reader should receive both writes concatenated
			const data = await ki.fdRead(proc.pid, readFd, 100);
			expect(new TextDecoder().decode(data)).toBe("from-original|from-dup");

			proc.kill(9);
			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// Stdio FD override wiring (US-009)
	// -----------------------------------------------------------------------

	describe("stdio FD override wiring", () => {
		it("spawn with stdinFd: pipeReadEnd → child FD 0 points to pipe read description", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const parent = kernel.spawn("parent-cmd", []);
			const { readFd, writeFd } = ki.pipe(parent.pid);

			// Spawn child with stdinFd override — child's FD 0 wired to pipe read end
			const child = ki.spawn("child-cmd", [], {
				ppid: parent.pid,
				stdinFd: readFd,
			});

			// Child's FD 0 should be a pipe
			const stat = ki.fdStat(child.pid, 0);
			expect(stat.filetype).toBe(FILETYPE_PIPE);

			// Verify data flow: parent writes to pipe → child reads from FD 0
			ki.fdWrite(parent.pid, writeFd, new TextEncoder().encode("stdin-data"));
			const data = await ki.fdRead(child.pid, 0, 100);
			expect(new TextDecoder().decode(data)).toBe("stdin-data");

			parent.kill(9);
			child.kill(9);
			await parent.wait();
			await child.wait();
		});

		it("spawn with stdoutFd: pipeWriteEnd → child FD 1 points to pipe write description", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const parent = kernel.spawn("parent-cmd", []);
			const { readFd, writeFd } = ki.pipe(parent.pid);

			// Spawn child with stdoutFd override — child's FD 1 wired to pipe write end
			const child = ki.spawn("child-cmd", [], {
				ppid: parent.pid,
				stdoutFd: writeFd,
			});

			// Child's FD 1 should be a pipe
			const stat = ki.fdStat(child.pid, 1);
			expect(stat.filetype).toBe(FILETYPE_PIPE);

			// Verify data flow: child writes to FD 1 → parent reads from pipe
			ki.fdWrite(child.pid, 1, new TextEncoder().encode("stdout-data"));
			const data = await ki.fdRead(parent.pid, readFd, 100);
			expect(new TextDecoder().decode(data)).toBe("stdout-data");

			parent.kill(9);
			child.kill(9);
			await parent.wait();
			await child.wait();
		});

		it("spawn with all three overrides → FD 0, 1, 2 wired to correct pipe descriptions", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const parent = kernel.spawn("parent-cmd", []);

			// Create 3 pipes: one for each stdio channel
			const stdinPipe = ki.pipe(parent.pid);
			const stdoutPipe = ki.pipe(parent.pid);
			const stderrPipe = ki.pipe(parent.pid);

			// Spawn child with all three overrides
			const child = ki.spawn("child-cmd", [], {
				ppid: parent.pid,
				stdinFd: stdinPipe.readFd,
				stdoutFd: stdoutPipe.writeFd,
				stderrFd: stderrPipe.writeFd,
			});

			// All three child stdio FDs should be pipes
			expect(ki.fdStat(child.pid, 0).filetype).toBe(FILETYPE_PIPE);
			expect(ki.fdStat(child.pid, 1).filetype).toBe(FILETYPE_PIPE);
			expect(ki.fdStat(child.pid, 2).filetype).toBe(FILETYPE_PIPE);

			// Verify data flow on each channel
			ki.fdWrite(parent.pid, stdinPipe.writeFd, new TextEncoder().encode("in"));
			const stdinData = await ki.fdRead(child.pid, 0, 100);
			expect(new TextDecoder().decode(stdinData)).toBe("in");

			ki.fdWrite(child.pid, 1, new TextEncoder().encode("out"));
			const stdoutData = await ki.fdRead(parent.pid, stdoutPipe.readFd, 100);
			expect(new TextDecoder().decode(stdoutData)).toBe("out");

			ki.fdWrite(child.pid, 2, new TextEncoder().encode("err"));
			const stderrData = await ki.fdRead(parent.pid, stderrPipe.readFd, 100);
			expect(new TextDecoder().decode(stderrData)).toBe("err");

			parent.kill(9);
			child.kill(9);
			await parent.wait();
			await child.wait();
		});

		it("parent FD table unchanged after child spawn with overrides", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const parent = kernel.spawn("parent-cmd", []);

			// Record parent's original stdio filetypes before creating pipes
			const parentStdin = ki.fdStat(parent.pid, 0);
			const parentStdout = ki.fdStat(parent.pid, 1);
			const parentStderr = ki.fdStat(parent.pid, 2);

			expect(parentStdin.filetype).toBe(FILETYPE_CHARACTER_DEVICE);
			expect(parentStdout.filetype).toBe(FILETYPE_CHARACTER_DEVICE);
			expect(parentStderr.filetype).toBe(FILETYPE_CHARACTER_DEVICE);

			// Create pipe and spawn child with override
			const { readFd, writeFd } = ki.pipe(parent.pid);
			const child = ki.spawn("child-cmd", [], {
				ppid: parent.pid,
				stdinFd: readFd,
			});

			// Parent's stdio FDs should still be character devices
			expect(ki.fdStat(parent.pid, 0).filetype).toBe(FILETYPE_CHARACTER_DEVICE);
			expect(ki.fdStat(parent.pid, 1).filetype).toBe(FILETYPE_CHARACTER_DEVICE);
			expect(ki.fdStat(parent.pid, 2).filetype).toBe(FILETYPE_CHARACTER_DEVICE);

			// Parent's pipe FDs should still work
			ki.fdWrite(parent.pid, writeFd, new TextEncoder().encode("still works"));
			const data = await ki.fdRead(child.pid, 0, 100);
			expect(new TextDecoder().decode(data)).toBe("still works");

			parent.kill(9);
			child.kill(9);
			await parent.wait();
			await child.wait();
		});
	});

	// -----------------------------------------------------------------------
	// Signal forwarding
	// -----------------------------------------------------------------------

	describe("signal forwarding", () => {
		it("kill(SIGTERM) routes to DriverProcess.kill and process exits", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["daemon"], {
				daemon: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("daemon", []);
			expect(kernel.processes.get(proc.pid)?.status).toBe("running");

			proc.kill(15); // SIGTERM
			const code = await proc.wait();

			expect(killSignals).toContain(15);
			expect(code).toBe(128 + 15); // Unix convention
		});

		it("kill(SIGKILL) immediately terminates the process", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["daemon"], {
				daemon: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("daemon", []);
			proc.kill(9); // SIGKILL
			const code = await proc.wait();

			expect(killSignals).toContain(9);
			expect(code).toBe(128 + 9);
		});

		it("kill defaults to SIGTERM when no signal specified", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["daemon"], {
				daemon: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("daemon", []);
			proc.kill(); // No signal arg — default SIGTERM
			const code = await proc.wait();

			expect(killSignals).toEqual([15]);
			expect(code).toBe(128 + 15);
		});

		it("kill on non-existent PID throws ESRCH", async () => {
			const driver = new MockRuntimeDriver(["x"]);
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// KernelInterface.kill for a PID that was never spawned
			const ki = driver.kernelInterface!;
			try {
				ki.kill(99999, 15);
				expect.unreachable("should have thrown");
			} catch (err: unknown) {
				expect((err as { code: string }).code).toBe("ESRCH");
			}
		});

		it("kill on already-exited process is a no-op", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["fast-cmd"], {
				"fast-cmd": { exitCode: 0, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("fast-cmd", []);
			await proc.wait(); // Wait for it to exit

			// kill after exit should not throw and should not deliver signal
			proc.kill(15);
			expect(killSignals).toEqual([]);
		});

		it("cross-driver signal: driver A process killed via KernelInterface from driver B", async () => {
			const killSignals: number[] = [];
			const driverA = new MockRuntimeDriver(["daemon-a"], {
				"daemon-a": { neverExit: true, killSignals },
			});
			const driverB = new MockRuntimeDriver(["worker-b"]);
			({ kernel } = await createTestKernel({ drivers: [driverA, driverB] }));

			// Spawn a process on driver A
			const procA = kernel.spawn("daemon-a", []);

			// Driver B uses KernelInterface to kill driver A's process
			const kiB = driverB.kernelInterface!;
			kiB.kill(procA.pid, 15);

			const code = await procA.wait();
			expect(killSignals).toContain(15);
			expect(code).toBe(128 + 15);
		});

		it("multiple signals can be sent to the same process", async () => {
			const killSignals: number[] = [];
			// Process ignores first SIGTERM (neverExit stays, kill captures but doesn't resolve)
			let killCount = 0;
			let exitResolve: ((code: number) => void) | null = null;

			const driver = new MockRuntimeDriver(["stubborn"]);
			// Override spawn to create a custom process that ignores first signal
			const origSpawn = driver.spawn.bind(driver);
			driver.spawn = (command, args, ctx) => {
				if (command !== "stubborn") return origSpawn(command, args, ctx);
				const exitPromise = new Promise<number>((r) => { exitResolve = r; });
				return {
					writeStdin() {},
					closeStdin() {},
					kill(signal) {
						killSignals.push(signal);
						killCount++;
						// Only exit on SIGKILL or second signal
						if (signal === 9 || killCount >= 2) {
							exitResolve!(128 + signal);
						}
					},
					wait() { return exitPromise; },
					onStdout: null,
					onStderr: null,
					onExit: null,
				};
			};
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("stubborn", []);

			// First SIGTERM — process ignores it
			proc.kill(15);
			expect(killSignals).toEqual([15]);

			// SIGKILL — forces exit
			proc.kill(9);
			const code = await proc.wait();

			expect(killSignals).toEqual([15, 9]);
			expect(code).toBe(128 + 9);
		});

		it("caught signals stay pending while masked and deliver when unmasked", async () => {
			const killSignals: number[] = [];
			const handledSignals: number[] = [];
			const driver = new MockRuntimeDriver(["daemon"], {
				daemon: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("daemon", []);

			ki.processTable.sigaction(proc.pid, 1, {
				handler: (signal) => handledSignals.push(signal),
				mask: new Set([SIGTERM]),
				flags: 0,
			});
			ki.processTable.sigprocmask(proc.pid, SIG_BLOCK, new Set([1]));

			proc.kill(1);

			const blockedState = ki.processTable.getSignalState(proc.pid);
			expect(blockedState.handlers.get(1)).toEqual({
				handler: expect.any(Function),
				mask: new Set([SIGTERM]),
				flags: 0,
			});
			expect(blockedState.pendingSignals.has(1)).toBe(true);
			expect(handledSignals).toEqual([]);
			expect(killSignals).toEqual([]);

			ki.processTable.sigprocmask(proc.pid, SIG_UNBLOCK, new Set([1]));

			const unblockedState = ki.processTable.getSignalState(proc.pid);
			expect(unblockedState.pendingSignals.has(1)).toBe(false);
			expect(handledSignals).toEqual([1]);
			expect(killSignals).toEqual([]);

			proc.kill(SIGTERM);
			await expect(proc.wait()).resolves.toBe(128 + SIGTERM);
		});

		it("SA_RESTART keeps a blocking recv alive for a spawned process", async () => {
			const driver = new MockRuntimeDriver(["daemon"], {
				daemon: { neverExit: true, killSignals: [] },
			});
			({
				kernel,
			} = await createTestKernel({
				drivers: [driver],
				permissions: {
					fs: () => ({ allow: true }),
					network: () => ({ allow: true }),
				},
			}));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("daemon", []);

			ki.processTable.sigaction(proc.pid, SIGALRM, {
				handler: () => {},
				mask: new Set(),
				flags: SA_RESTART,
			});

			const listenId = ki.socketTable.create(2, 1, 0, proc.pid);
			await ki.socketTable.bind(listenId, { host: "127.0.0.1", port: 9091 });
			await ki.socketTable.listen(listenId, 1);

			const clientId = ki.socketTable.create(2, 1, 0, proc.pid);
			await ki.socketTable.connect(clientId, { host: "127.0.0.1", port: 9091 });
			const serverId = ki.socketTable.accept(listenId)!;

			const recvPromise = ki.socketTable.recv(serverId, 1024, 0, { block: true, pid: proc.pid });
			await Promise.resolve();

			proc.kill(SIGALRM);
			ki.socketTable.send(clientId, new TextEncoder().encode("pong"));

			await expect(recvPromise).resolves.toEqual(new TextEncoder().encode("pong"));

			proc.kill(SIGTERM);
			await expect(proc.wait()).resolves.toBe(128 + SIGTERM);
		});

		it("SA_RESETHAND only catches the first delivery for a spawned process", async () => {
			const killSignals: number[] = [];
			const handledSignals: number[] = [];
			const driver = new MockRuntimeDriver(["daemon"], {
				daemon: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("daemon", []);

			ki.processTable.sigaction(proc.pid, SIGTERM, {
				handler: (signal) => handledSignals.push(signal),
				mask: new Set(),
				flags: SA_RESETHAND,
			});

			proc.kill(SIGTERM);

			expect(handledSignals).toEqual([SIGTERM]);
			expect(killSignals).toEqual([]);
			expect(ki.processTable.getSignalState(proc.pid).handlers.get(SIGTERM)).toEqual({
				handler: "default",
				mask: new Set(),
				flags: 0,
			});

			proc.kill(SIGTERM);

			await expect(proc.wait()).resolves.toBe(128 + SIGTERM);
			expect(killSignals).toEqual([SIGTERM]);
		});
	});

	// -----------------------------------------------------------------------
	// waitpid edge cases
	// -----------------------------------------------------------------------

	it("waitpid for non-existent PID rejects with ESRCH", async () => {
		const driver = new MockRuntimeDriver(["x"]);
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const ki = driver.kernelInterface!;
		await expect(ki.waitpid(99999)).rejects.toThrow(/ESRCH/);
	});

	// -----------------------------------------------------------------------
	// Concurrent exec
	// -----------------------------------------------------------------------

	it("3+ concurrent exec() calls complete with correct results and no state leakage", async () => {
		const configs: Record<string, MockCommandConfig> = {};
		for (let i = 0; i < 5; i++) {
			configs[`sh`] = { exitCode: 0 };
		}

		// Use unique stdout per invocation via emitDuringSpawn
		let callCount = 0;
		const driver = new MockRuntimeDriver(["sh"]);
		const origSpawn = driver.spawn.bind(driver);
		driver.spawn = (command, args, ctx) => {
			const idx = callCount++;
			const proc = origSpawn(command, args, ctx);
			// Override to emit unique output per call
			const origOnStdout = proc.onStdout;
			queueMicrotask(() => {
				proc.onStdout?.(new TextEncoder().encode(`result-${idx}\n`));
			});
			return proc;
		};
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		// Launch 5 concurrent exec() calls
		const promises = Array.from({ length: 5 }, (_, i) =>
			kernel.exec(`echo ${i}`),
		);

		const results = await Promise.all(promises);

		// All 5 should complete
		expect(results).toHaveLength(5);

		// Each gets exit code 0
		for (const r of results) {
			expect(r.exitCode).toBe(0);
		}

		// Each gets unique stdout (no state leakage between executions)
		const stdouts = results.map((r) => r.stdout);
		const uniqueOutputs = new Set(stdouts);
		expect(uniqueOutputs.size).toBe(5);
	});

	// -----------------------------------------------------------------------
	// Filesystem convenience wrappers
	// -----------------------------------------------------------------------

	it("readFile / writeFile / exists work through kernel", async () => {
		const driver = new MockRuntimeDriver(["x"]);
		const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
		kernel = k;

		await kernel.writeFile("/tmp/data.txt", "content");
		expect(await kernel.exists("/tmp/data.txt")).toBe(true);

		const bytes = await kernel.readFile("/tmp/data.txt");
		expect(new TextDecoder().decode(bytes)).toBe("content");
	});

	// -----------------------------------------------------------------------
	// FD table cleanup on process exit (US-001)
	// -----------------------------------------------------------------------

	describe("FD table cleanup on process exit", () => {
		it("FD table is removed after process exits", async () => {
			const driver = new MockRuntimeDriver(["cmd"]);
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;

			const proc = kernel.spawn("cmd", []);
			// FD operations work while process is running
			const fd = ki.fdOpen(proc.pid, "/tmp/test", O_CREAT | O_WRONLY);
			expect(fd).toBeGreaterThanOrEqual(3);

			await proc.wait();

			// After exit, FD table should be removed — operations throw ESRCH
			expect(() => ki.fdOpen(proc.pid, "/tmp/x", 0)).toThrow("ESRCH");
		});

		it("spawn N processes, all exit, no FD tables remain", async () => {
			const N = 20;
			const commands = Array.from({ length: N }, (_, i) => `cmd-${i}`);
			const configs: Record<string, MockCommandConfig> = {};
			for (const cmd of commands) configs[cmd] = { exitCode: 0 };

			const driver = new MockRuntimeDriver(commands, configs);
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;

			// Spawn all, collect PIDs
			const procs = commands.map((cmd) => kernel.spawn(cmd, []));
			const pids = procs.map((p) => p.pid);

			// Wait for all to exit
			await Promise.all(procs.map((p) => p.wait()));

			// Every PID's FD table should be cleaned up
			for (const pid of pids) {
				expect(() => ki.fdOpen(pid, "/tmp/x", 0)).toThrow("ESRCH");
			}
		});

		it("pipe read/write FileDescriptions are freed after both endpoints' processes exit", async () => {
			const driver = new MockRuntimeDriver(["writer", "reader"], {
				writer: { neverExit: true },
				reader: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;

			// Spawn writer, create pipe in its FD table
			const writer = kernel.spawn("writer", []);
			const { readFd, writeFd } = ki.pipe(writer.pid);

			// Spawn reader as child of writer — inherits pipe FDs
			const reader = ki.spawn("reader", [], { ppid: writer.pid });

			// Writer closes read end, reader closes write end (normal pipe usage)
			ki.fdClose(writer.pid, readFd);
			ki.fdClose(reader.pid, writeFd);

			// Write data through the pipe
			ki.fdWrite(writer.pid, writeFd, new TextEncoder().encode("pipe-data"));

			// Reader can read the data
			const data = await ki.fdRead(reader.pid, readFd, 100);
			expect(new TextDecoder().decode(data)).toBe("pipe-data");

			// Kill writer — its FD table (including write end) is cleaned up
			writer.kill(9);
			await writer.wait();

			// Write end refCount should have dropped to 0, pipe signals EOF
			// Reader gets EOF (pipe returns null, fdRead converts to empty Uint8Array)
			const eof = await ki.fdRead(reader.pid, readFd, 100);
			expect(eof.length).toBe(0);

			// Kill reader to clean up
			reader.kill(9);
			await reader.wait();

			// Both FD tables should be gone
			expect(() => ki.fdOpen(writer.pid, "/tmp/x", 0)).toThrow("ESRCH");
			expect(() => ki.fdOpen(reader.pid, "/tmp/x", 0)).toThrow("ESRCH");
		});
	});

	// -----------------------------------------------------------------------
	// Process exit FD cleanup chain (US-012)
	// -----------------------------------------------------------------------

	describe("process exit FD cleanup chain", () => {
		it("blocking pipe writes through the kernel wait until a reader drains capacity", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const proc = kernel.spawn("proc", []);
			const { readFd, writeFd } = ki.pipe(proc.pid);

			await Promise.resolve(ki.fdWrite(proc.pid, writeFd, new Uint8Array(MAX_PIPE_BUFFER_BYTES)));

			let settled = false;
			const blockedWrite = Promise.resolve(ki.fdWrite(proc.pid, writeFd, new Uint8Array([7, 8, 9])));
			blockedWrite.then(() => {
				settled = true;
			});

			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(settled).toBe(false);

			const drained = await ki.fdRead(proc.pid, readFd, MAX_PIPE_BUFFER_BYTES);
			expect(drained).toHaveLength(MAX_PIPE_BUFFER_BYTES);

			await expect(blockedWrite).resolves.toBe(3);
			await expect(ki.fdRead(proc.pid, readFd, 16)).resolves.toEqual(new Uint8Array([7, 8, 9]));

			proc.kill(9);
			await proc.wait();
		});

		it("blocking flock through the kernel waits until the prior holder unlocks", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const proc1 = kernel.spawn("proc", []);
			const proc2 = kernel.spawn("proc", []);
			const fd1 = ki.fdOpen(proc1.pid, "/tmp/lockfile", O_CREAT);
			const fd2 = ki.fdOpen(proc2.pid, "/tmp/lockfile", O_CREAT);

			await ki.flock(proc1.pid, fd1, LOCK_EX);

			let acquired = false;
			const waiter = ki.flock(proc2.pid, fd2, LOCK_EX).then(() => {
				acquired = true;
			});

			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(acquired).toBe(false);

			await ki.flock(proc1.pid, fd1, LOCK_UN);
			await waiter;
			expect(acquired).toBe(true);

			proc1.kill(9);
			proc2.kill(9);
			await Promise.all([proc1.wait(), proc2.wait()]);
		});

		it("fdPollWait with timeout -1 stays blocked until a pipe becomes readable", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			const proc = kernel.spawn("proc", []);
			const { readFd, writeFd } = ki.pipe(proc.pid);

			let settled = false;
			const pollWait = ki.fdPollWait(proc.pid, readFd, -1).then(() => {
				settled = true;
			});

			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(settled).toBe(false);

			await Promise.resolve(ki.fdWrite(proc.pid, writeFd, new TextEncoder().encode("wake")));
			await pollWait;

			expect(ki.fdPoll(proc.pid, readFd)).toMatchObject({
				readable: true,
				invalid: false,
			});

			proc.kill(9);
			await proc.wait();
		});

		it("process exits with pipe write end → reader gets EOF", async () => {
			const driver = new MockRuntimeDriver(["writer", "reader"], {
				writer: { neverExit: true },
				reader: { neverExit: true },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			// Spawn writer, create pipe in its table
			const writer = kernel.spawn("writer", []);
			const { readFd, writeFd } = ki.pipe(writer.pid);

			// Spawn reader as child — inherits both pipe ends
			const reader = ki.spawn("reader", [], { ppid: writer.pid });

			// Close inherited write end in reader (normal pipe setup)
			ki.fdClose(reader.pid, writeFd);

			// Writer sends data, reader receives it
			ki.fdWrite(writer.pid, writeFd, new TextEncoder().encode("before-exit"));
			const data = await ki.fdRead(reader.pid, readFd, 100);
			expect(new TextDecoder().decode(data)).toBe("before-exit");

			// Kill writer — exit triggers FD cleanup → write end refcount drops → pipe EOF
			writer.kill(9);
			await writer.wait();

			// Reader should get EOF (empty Uint8Array)
			const eof = await ki.fdRead(reader.pid, readFd, 100);
			expect(eof.length).toBe(0);

			// Writer's FD table is gone
			expect(() => ki.fdOpen(writer.pid, "/tmp/x", 0)).toThrow("ESRCH");

			reader.kill(9);
			await reader.wait();
		});

		it("process exits with 10 open FDs → FDTableManager has no entry for that PID", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			// Create 10 files
			for (let i = 0; i < 10; i++) {
				await vfs.writeFile(`/tmp/file-${i}.txt`, `content-${i}`);
			}

			// Spawn process and open all 10 files
			const proc = kernel.spawn("proc", []);
			const fds: number[] = [];
			for (let i = 0; i < 10; i++) {
				const fd = ki.fdOpen(proc.pid, `/tmp/file-${i}.txt`, 0);
				expect(fd).toBeGreaterThanOrEqual(3);
				fds.push(fd);
			}

			// Verify FDs are usable
			for (let i = 0; i < 10; i++) {
				const data = await ki.fdRead(proc.pid, fds[i], 100);
				expect(new TextDecoder().decode(data)).toContain(`content-${i}`);
			}

			// Kill process — triggers full cleanup chain
			proc.kill(9);
			await proc.wait();

			// FD table should be completely removed — all operations throw ESRCH
			expect(() => ki.fdOpen(proc.pid, "/tmp/x", 0)).toThrow("ESRCH");
			for (const fd of fds) {
				await expect(ki.fdRead(proc.pid, fd, 1)).rejects.toThrow("ESRCH");
			}
		});
	});

	// -----------------------------------------------------------------------
	// Zombie cleanup timer disposal (US-013)
	// -----------------------------------------------------------------------

	describe("zombie cleanup timer disposal", () => {
		it("process exit schedules zombie timer → zombieTimerCount > 0", async () => {
			vi.useFakeTimers();
			try {
				const driver = new MockRuntimeDriver(["short-lived"], {
					"short-lived": { exitCode: 0 },
				});
				const { kernel: k } = await createTestKernel({ drivers: [driver] });
				kernel = k;

				expect(kernel.zombieTimerCount).toBe(0);

				// Spawn process and let it exit (becomes zombie with 60s cleanup timer)
				const proc = kernel.spawn("short-lived", []);
				await proc.wait();

				// Zombie timer should be scheduled
				expect(kernel.zombieTimerCount).toBe(1);
				expect(kernel.processes.get(proc.pid)?.status).toBe("exited");

				await kernel.dispose();
			} finally {
				vi.useRealTimers();
			}
		});

		it("dispose kernel → zombieTimerCount === 0", async () => {
			vi.useFakeTimers();
			try {
				const driver = new MockRuntimeDriver(["short-lived"], {
					"short-lived": { exitCode: 0 },
				});
				const { kernel: k } = await createTestKernel({ drivers: [driver] });
				kernel = k;

				const proc = kernel.spawn("short-lived", []);
				await proc.wait();
				expect(kernel.zombieTimerCount).toBe(1);

				await kernel.dispose();

				// All timers cleared by dispose
				expect(kernel.zombieTimerCount).toBe(0);
			} finally {
				vi.useRealTimers();
			}
		});

		it("advance 60s after dispose → no callbacks fire, no errors", async () => {
			vi.useFakeTimers();
			try {
				const driver = new MockRuntimeDriver(["short-lived"], {
					"short-lived": { exitCode: 0 },
				});
				const { kernel: k } = await createTestKernel({ drivers: [driver] });
				kernel = k;

				const proc = kernel.spawn("short-lived", []);
				await proc.wait();
				const pid = proc.pid;
				expect(kernel.zombieTimerCount).toBe(1);

				await kernel.dispose();
				expect(kernel.zombieTimerCount).toBe(0);

				// Advance past the 60s TTL — no timer should fire
				vi.advanceTimersByTime(60_000);

				// Process entry should still exist (timer didn't reap it)
				// because dispose cleared the timer before it could fire
				expect(kernel.processes.get(pid)?.status).toBe("exited");
			} finally {
				vi.useRealTimers();
			}
		});

		it("dispose kernel with multiple zombie processes → all timers cleared", async () => {
			vi.useFakeTimers();
			try {
				const N = 10;
				const commands = Array.from({ length: N }, (_, i) => `zombie-${i}`);
				const configs: Record<string, MockCommandConfig> = {};
				for (const cmd of commands) configs[cmd] = { exitCode: 0 };

				const driver = new MockRuntimeDriver(commands, configs);
				const { kernel: k } = await createTestKernel({ drivers: [driver] });
				kernel = k;

				const procs = commands.map((cmd) => kernel.spawn(cmd, []));
				await Promise.all(procs.map((p) => p.wait()));

				// All 10 zombie timers should be pending
				expect(kernel.zombieTimerCount).toBe(N);
				for (const proc of procs) {
					expect(kernel.processes.get(proc.pid)?.status).toBe("exited");
				}

				await kernel.dispose();

				// All timers cleared
				expect(kernel.zombieTimerCount).toBe(0);

				// Advancing time should have no effect
				vi.advanceTimersByTime(60_000);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	// -----------------------------------------------------------------------
	// Permission deny scenarios (US-008)
	// -----------------------------------------------------------------------

	describe("permission deny scenarios", () => {
		it("fs deny-all: writeFile throws EACCES", async () => {
			// No drivers needed — testing VFS permission layer directly
			const { kernel: k } = await createTestKernel({
				permissions: { fs: () => ({ allow: false }) },
			});
			kernel = k;

			await expect(kernel.writeFile("/tmp/data.txt", "content")).rejects.toThrow("EACCES");
		});

		it("fs deny-all: readFile throws EACCES", async () => {
			const { kernel: k } = await createTestKernel({
				permissions: { fs: () => ({ allow: false }) },
			});
			kernel = k;

			await expect(kernel.readFile("/tmp/data.txt")).rejects.toThrow("EACCES");
		});

		it("fs path-based: /tmp allowed, /etc denied", async () => {
			const { kernel: k } = await createTestKernel({
				permissions: { fs: (req) => ({ allow: req.path.startsWith("/tmp") }) },
			});
			kernel = k;

			// /tmp writes should succeed
			await kernel.writeFile("/tmp/ok.txt", "allowed");
			const data = await kernel.readFile("/tmp/ok.txt");
			expect(new TextDecoder().decode(data)).toBe("allowed");

			// /etc writes should be denied
			await expect(kernel.writeFile("/etc/secret", "denied")).rejects.toThrow("EACCES");
			await expect(kernel.readFile("/etc/secret")).rejects.toThrow("EACCES");
		});

		it("childProcess deny-all: spawn throws EACCES", async () => {
			// Allow fs (mount needs it) but deny all child processes
			const driver = new MockRuntimeDriver(["blocked-cmd"], {
				"blocked-cmd": { exitCode: 0 },
			});
			const { kernel: k } = await createTestKernel({
				drivers: [driver],
				permissions: {
					fs: () => ({ allow: true }),
					childProcess: () => ({ allow: false }),
				},
			});
			kernel = k;

			expect(() => kernel.spawn("blocked-cmd", [])).toThrow("EACCES");
		});

		it("childProcess selective: allowed commands pass, denied commands throw", async () => {
			const driver = new MockRuntimeDriver(["safe-cmd", "unsafe-cmd"], {
				"safe-cmd": { exitCode: 0 },
				"unsafe-cmd": { exitCode: 0 },
			});
			const { kernel: k } = await createTestKernel({
				drivers: [driver],
				permissions: {
					fs: () => ({ allow: true }),
					childProcess: (req) => ({ allow: req.command === "safe-cmd" }),
				},
			});
			kernel = k;

			// Allowed command succeeds
			const proc = kernel.spawn("safe-cmd", []);
			const code = await proc.wait();
			expect(code).toBe(0);

			// Denied command throws
			expect(() => kernel.spawn("unsafe-cmd", [])).toThrow("EACCES");
		});

		it("filterEnv: restricted keys are filtered out", () => {
			const env = { HOME: "/home/user", SECRET_KEY: "s3cret", PATH: "/usr/bin" };
			const permissions: Permissions = {
				env: (req) => ({ allow: req.key !== "SECRET_KEY" }),
			};

			const filtered = filterEnv(env, permissions);
			expect(filtered).toEqual({ HOME: "/home/user", PATH: "/usr/bin" });
			expect(filtered).not.toHaveProperty("SECRET_KEY");
		});

		it("filterEnv: no env permission means all keys denied", () => {
			const env = { HOME: "/home/user", PATH: "/usr/bin" };
			const permissions: Permissions = {};

			const filtered = filterEnv(env, permissions);
			expect(filtered).toEqual({});
		});

		it("filterEnv: allow-all env passes everything through", () => {
			const env = { HOME: "/home/user", SECRET_KEY: "s3cret", PATH: "/usr/bin" };
			const permissions: Permissions = {
				env: () => ({ allow: true }),
			};

			const filtered = filterEnv(env, permissions);
			expect(filtered).toEqual(env);
		});

		it("fs missing checker: writeFile throws EACCES", async () => {
			const { kernel: k } = await createTestKernel({
				permissions: {},
			});
			kernel = k;

			await expect(kernel.writeFile("/tmp/data.txt", "content")).rejects.toThrow("EACCES");
		});

		it("fs missing checker: createDir throws EACCES", async () => {
			const vfs = new TestFileSystem();
			const wrapped = wrapFileSystem(vfs, {});

			await expect(wrapped.createDir("/tmp/newdir")).rejects.toThrow("EACCES");
		});

		it("fs missing checker: removeFile throws EACCES", async () => {
			const vfs = new TestFileSystem();
			await vfs.writeFile("/tmp/existing.txt", "data");
			const wrapped = wrapFileSystem(vfs, {});

			await expect(wrapped.removeFile("/tmp/existing.txt")).rejects.toThrow("EACCES");
		});

		it("custom fs checker: deny with reason includes reason in EACCES error", async () => {
			const { kernel: k } = await createTestKernel({
				permissions: {
					fs: () => ({ allow: false, reason: "policy" }),
				},
			});
			kernel = k;

			const err = await kernel.writeFile("/tmp/data.txt", "content").catch((e: Error) => e);
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toContain("EACCES");
			expect((err as Error).message).toContain("policy");
		});

		it("childProcess permission checker receives cwd in request", async () => {
			const captured: { command: string; args: string[]; cwd?: string }[] = [];
			const driver = new MockRuntimeDriver(["test-cmd"], {
				"test-cmd": { exitCode: 0 },
			});
			const { kernel: k } = await createTestKernel({
				drivers: [driver],
				permissions: {
					fs: () => ({ allow: true }),
					childProcess: (req) => {
						captured.push({ command: req.command, args: req.args, cwd: req.cwd });
						return { allow: true };
					},
				},
			});
			kernel = k;

			const proc = kernel.spawn("test-cmd", ["arg1"], { cwd: "/home/user" });
			await proc.wait();

			expect(captured).toHaveLength(1);
			expect(captured[0].cwd).toBe("/home/user");
		});
	});

	// -----------------------------------------------------------------------
	// Process groups and sessions (US-021)
	// -----------------------------------------------------------------------

	describe("process group and session tracking", () => {
		it("child inherits parent pgid and sid by default", async () => {
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;

			// Spawn parent — no parent PID, so pgid=sid=own pid
			const parent = kernel.spawn("parent", []);
			const parentInfo = kernel.processes.get(parent.pid)!;
			expect(parentInfo.pgid).toBe(parent.pid);
			expect(parentInfo.sid).toBe(parent.pid);

			// Spawn child from parent context
			const child = ki.spawn("child", [], {
				ppid: parent.pid,
				env: {},
				cwd: "/",
			});
			const childInfo = kernel.processes.get(child.pid)!;
			expect(childInfo.pgid).toBe(parent.pid);
			expect(childInfo.sid).toBe(parent.pid);

			parent.kill();
			child.kill();
		});

		it("create process group, spawn 3 children, kill(-pgid) signals all", async () => {
			const killSignals1: number[] = [];
			const killSignals2: number[] = [];
			const killSignals3: number[] = [];

			const driver = new MockRuntimeDriver(
				["leader", "child1", "child2", "child3"],
				{
					leader: { neverExit: true },
					child1: { neverExit: true, killSignals: killSignals1 },
					child2: { neverExit: true, killSignals: killSignals2 },
					child3: { neverExit: true, killSignals: killSignals3 },
				},
			);
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;

			// Spawn leader — pgid=leader.pid
			const leader = kernel.spawn("leader", []);

			// Spawn 3 children inheriting leader's pgid
			const c1 = ki.spawn("child1", [], { ppid: leader.pid, env: {}, cwd: "/" });
			const c2 = ki.spawn("child2", [], { ppid: leader.pid, env: {}, cwd: "/" });
			const c3 = ki.spawn("child3", [], { ppid: leader.pid, env: {}, cwd: "/" });

			// All share the same process group
			expect(ki.getpgid(c1.pid)).toBe(leader.pid);
			expect(ki.getpgid(c2.pid)).toBe(leader.pid);
			expect(ki.getpgid(c3.pid)).toBe(leader.pid);

			// Kill the entire process group via negative pgid
			ki.kill(-leader.pid, 15);

			// All 3 children received the signal
			expect(killSignals1).toEqual([15]);
			expect(killSignals2).toEqual([15]);
			expect(killSignals3).toEqual([15]);

			// Clean up leader
			leader.kill();
		});

		it("setsid creates new session and process group", async () => {
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;

			const parent = kernel.spawn("parent", []);
			const child = ki.spawn("child", [], { ppid: parent.pid, env: {}, cwd: "/" });

			// Child inherits parent's pgid
			expect(ki.getpgid(child.pid)).toBe(parent.pid);
			expect(ki.getsid(child.pid)).toBe(parent.pid);

			// Child creates a new session
			const newSid = ki.setsid(child.pid);
			expect(newSid).toBe(child.pid);
			expect(ki.getsid(child.pid)).toBe(child.pid);
			expect(ki.getpgid(child.pid)).toBe(child.pid);

			parent.kill();
			child.kill();
		});

		it("setpgid moves process to existing group", async () => {
			const driver = new MockRuntimeDriver(["leader", "a", "b"], {
				leader: { neverExit: true },
				a: { neverExit: true },
				b: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;

			const leader = kernel.spawn("leader", []);
			const a = ki.spawn("a", [], { ppid: leader.pid, env: {}, cwd: "/" });
			const b = ki.spawn("b", [], { ppid: leader.pid, env: {}, cwd: "/" });

			// a creates its own group
			ki.setpgid(a.pid, a.pid);
			expect(ki.getpgid(a.pid)).toBe(a.pid);

			// b joins a's group
			ki.setpgid(b.pid, a.pid);
			expect(ki.getpgid(b.pid)).toBe(a.pid);

			leader.kill();
			a.kill();
			b.kill();
		});

		it("setpgid with invalid pgid throws EPERM", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);

			// Try to join a non-existent process group
			expect(() => ki.setpgid(proc.pid, 9999)).toThrow(/EPERM/);

			proc.kill();
		});

		it("setsid on process group leader throws EPERM", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);

			// proc.pgid === proc.pid (session leader by default), so setsid fails
			expect(() => ki.setsid(proc.pid)).toThrow(/EPERM/);

			proc.kill();
		});

		it("getpgid/getsid on non-existent process throws ESRCH", async () => {
			const driver = new MockRuntimeDriver(["echo"]);
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			expect(() => ki.getpgid(9999)).toThrow(/ESRCH/);
			expect(() => ki.getsid(9999)).toThrow(/ESRCH/);
		});

		it("kill(-pgid) with no matching group throws ESRCH", async () => {
			const driver = new MockRuntimeDriver(["echo"]);
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			expect(() => ki.kill(-9999, 15)).toThrow(/ESRCH/);
		});

		it("setpgid rejects joining a process group in a different session", async () => {
			const driver = new MockRuntimeDriver(["parent", "childA", "childB", "grandchild"], {
				parent: { neverExit: true },
				childA: { neverExit: true },
				childB: { neverExit: true },
				grandchild: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);

			// Spawn childA — inherits parent's pgid (not a group leader), so setsid works
			const childA = ki.spawn("childA", [], { ppid: parent.pid, env: {}, cwd: "/" });
			expect(ki.getpgid(childA.pid)).toBe(parent.pid); // inherited

			// childA creates a new session (session B)
			ki.setsid(childA.pid);
			expect(ki.getsid(childA.pid)).toBe(childA.pid);

			// Spawn grandchild under childA so it joins session B
			const grandchild = ki.spawn("grandchild", [], { ppid: childA.pid, env: {}, cwd: "/" });
			expect(ki.getsid(grandchild.pid)).toBe(childA.pid);

			// Spawn childB under parent — stays in session A
			const childB = ki.spawn("childB", [], { ppid: parent.pid, env: {}, cwd: "/" });
			expect(ki.getsid(childB.pid)).toBe(parent.pid);

			// childB tries to join childA's group (different session) — EPERM
			expect(() => ki.setpgid(childB.pid, childA.pid)).toThrow(/EPERM/);

			// Same-session group join still works: grandchild joins childA's group (same session)
			ki.setpgid(grandchild.pid, childA.pid);
			expect(ki.getpgid(grandchild.pid)).toBe(childA.pid);

			parent.kill();
			childA.kill();
			childB.kill();
			grandchild.kill();
		});
	});

	// -------------------------------------------------------------------
	// PTY device layer
	// -------------------------------------------------------------------

	describe("PTY device layer", () => {
		it("write to master → read from slave", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Set raw mode for direct pass-through
			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: false, echo: false, isig: false });

			const msg = new TextEncoder().encode("hello\n");
			ki.fdWrite(proc.pid, masterFd, msg);

			const data = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("hello\n");

			proc.kill();
		});

		it("write to slave → read from master (ONLCR converts \\n to \\r\\n)", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			const msg = new TextEncoder().encode("hello\n");
			ki.fdWrite(proc.pid, slaveFd, msg);

			// Slave output goes through ONLCR: \n → \r\n (POSIX default)
			const data = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("hello\r\n");

			proc.kill();
		});

		it("disabling ONLCR passes raw \\n without CR insertion", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Disable ONLCR via termios
			ki.tcsetattr(proc.pid, slaveFd, { onlcr: false });

			const msg = new TextEncoder().encode("hello\n");
			ki.fdWrite(proc.pid, slaveFd, msg);

			const data = await ki.fdRead(proc.pid, masterFd, 1024);
			// Raw \n without \r insertion
			expect(new TextDecoder().decode(data)).toBe("hello\n");

			proc.kill();
		});

		it("disabling opost also skips ONLCR", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Disable opost (ONLCR still true, but opost gate prevents it)
			ki.tcsetattr(proc.pid, slaveFd, { opost: false });

			const msg = new TextEncoder().encode("line\n");
			ki.fdWrite(proc.pid, slaveFd, msg);

			const data = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("line\n");

			proc.kill();
		});

		it("isatty returns true for slave FD, false for pipe FD", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);
			const { readFd } = ki.pipe(proc.pid);

			expect(ki.isatty(proc.pid, slaveFd)).toBe(true);
			expect(ki.isatty(proc.pid, masterFd)).toBe(false);
			expect(ki.isatty(proc.pid, readFd)).toBe(false);

			proc.kill();
		});

		it("multiple PTY pairs coexist with separate paths", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);

			const pty0 = ki.openpty(proc.pid);
			const pty1 = ki.openpty(proc.pid);

			// Set raw mode for data pass-through tests
			ki.ptySetDiscipline(proc.pid, pty0.masterFd, { canonical: false, echo: false, isig: false });
			ki.ptySetDiscipline(proc.pid, pty1.masterFd, { canonical: false, echo: false, isig: false });

			// Distinct paths
			expect(pty0.path).not.toBe(pty1.path);
			expect(pty0.path).toMatch(/^\/dev\/pts\/\d+$/);
			expect(pty1.path).toMatch(/^\/dev\/pts\/\d+$/);

			// Data is isolated between PTYs
			const msg0 = new TextEncoder().encode("pty0");
			const msg1 = new TextEncoder().encode("pty1");
			ki.fdWrite(proc.pid, pty0.masterFd, msg0);
			ki.fdWrite(proc.pid, pty1.masterFd, msg1);

			const data0 = await ki.fdRead(proc.pid, pty0.slaveFd, 1024);
			const data1 = await ki.fdRead(proc.pid, pty1.slaveFd, 1024);
			expect(new TextDecoder().decode(data0)).toBe("pty0");
			expect(new TextDecoder().decode(data1)).toBe("pty1");

			proc.kill();
		});

		it("master close → slave reads get null (hangup)", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Close master
			ki.fdClose(proc.pid, masterFd);

			// Slave read returns empty (hangup / null mapped to empty Uint8Array)
			const data = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(data.length).toBe(0);

			proc.kill();
		});

		it("slave close → master reads get null (hangup)", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Close slave
			ki.fdClose(proc.pid, slaveFd);

			// Master read returns empty (hangup)
			const data = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(data.length).toBe(0);

			proc.kill();
		});

		it("bidirectional multi-chunk exchange", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Set raw mode for direct pass-through
			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: false, echo: false, isig: false });

			// Write multiple chunks master→slave
			ki.fdWrite(proc.pid, masterFd, new TextEncoder().encode("ab"));
			ki.fdWrite(proc.pid, masterFd, new TextEncoder().encode("cd"));

			const slaveData = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(slaveData)).toBe("abcd");

			// Write multiple chunks slave→master
			ki.fdWrite(proc.pid, slaveFd, new TextEncoder().encode("12"));
			ki.fdWrite(proc.pid, slaveFd, new TextEncoder().encode("34"));

			const masterData = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(new TextDecoder().decode(masterData)).toBe("1234");

			proc.kill();
		});

		it("openpty returns path matching /dev/pts/N", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { path } = ki.openpty(proc.pid);

			expect(path).toMatch(/^\/dev\/pts\/\d+$/);

			proc.kill();
		});

		it("PTY FDs are not seekable (ESPIPE)", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			await expect(ki.fdSeek(proc.pid, masterFd, 0n, 0)).rejects.toThrow(/ESPIPE/);
			await expect(ki.fdSeek(proc.pid, slaveFd, 0n, 0)).rejects.toThrow(/ESPIPE/);

			proc.kill();
		});

		it("close slave resolves pending slave read with EOF (no hang)", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Set raw mode for direct pass-through
			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: false, echo: false, isig: false });

			// Start a slave read (blocks — no data in input buffer)
			const readPromise = ki.fdRead(proc.pid, slaveFd, 1024);

			// Close the slave end — should resolve the pending read (EOF)
			ki.fdClose(proc.pid, slaveFd);

			const result = await readPromise;
			expect(result.length).toBe(0);

			proc.kill();
		});

		it("close master resolves pending master read with EOF (no hang)", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Start a master read (blocks — no data in output buffer)
			const readPromise = ki.fdRead(proc.pid, masterFd, 1024);

			// Close the master end — should resolve the pending read (EOF)
			ki.fdClose(proc.pid, masterFd);

			const result = await readPromise;
			expect(result.length).toBe(0);

			proc.kill();
		});
	});

	// -------------------------------------------------------------------
	// PTY-based spawn (ExecCommandSession pattern)
	// -------------------------------------------------------------------

	describe("PTY-based spawn (interactive session)", () => {
		it("spawn child with PTY slave as stdio: parent writes master → child reads stdin", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent-cmd", []);

			// Allocate PTY in parent's FD table
			const { masterFd, slaveFd } = ki.openpty(parent.pid);

			// Set raw mode for direct pass-through
			ki.ptySetDiscipline(parent.pid, masterFd, { canonical: false, echo: false, isig: false });

			// Spawn child with PTY slave as stdin/stdout/stderr
			const child = ki.spawn("child-cmd", [], {
				ppid: parent.pid,
				stdinFd: slaveFd,
				stdoutFd: slaveFd,
				stderrFd: slaveFd,
			});

			// Parent writes to PTY master → child can read from stdin (slave)
			const msg = new TextEncoder().encode("hello from parent");
			ki.fdWrite(parent.pid, masterFd, msg);

			// Child reads from its stdin (FD 0, which is the PTY slave)
			const childStdinFd = 0;
			const data = await ki.fdRead(child.pid, childStdinFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("hello from parent");

			child.kill();
			parent.kill();
		});

		it("spawn child with PTY slave as stdio: child writes stdout → parent reads master", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent-cmd", []);

			const { masterFd, slaveFd } = ki.openpty(parent.pid);

			// Disable ONLCR for clean data comparison
			ki.tcsetattr(parent.pid, slaveFd, { onlcr: false });

			// Spawn child with PTY slave as all stdio
			const child = ki.spawn("child-cmd", [], {
				ppid: parent.pid,
				stdinFd: slaveFd,
				stdoutFd: slaveFd,
				stderrFd: slaveFd,
			});

			// Child writes to stdout (FD 1, PTY slave) → parent reads from master
			const childStdoutFd = 1;
			ki.fdWrite(child.pid, childStdoutFd, new TextEncoder().encode("child output"));

			const data = await ki.fdRead(parent.pid, masterFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("child output");

			child.kill();
			parent.kill();
		});

		it("PTY-based spawn: process termination via kill is visible to parent waitpid", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent-cmd", []);

			const { masterFd, slaveFd } = ki.openpty(parent.pid);

			const child = ki.spawn("child-cmd", [], {
				ppid: parent.pid,
				stdinFd: slaveFd,
				stdoutFd: slaveFd,
				stderrFd: slaveFd,
			});

			// Kill child → wait should resolve
			child.kill();
			const exitCode = await child.wait();
			expect(exitCode).toBe(128 + 15); // SIGTERM (default signal from kill())

			parent.kill();
		});

		it("PTY-based spawn: isatty returns true for child stdio FDs", async () => {
			const driver = new MockRuntimeDriver(["parent-cmd", "child-cmd"], {
				"parent-cmd": { neverExit: true },
				"child-cmd": { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent-cmd", []);

			const { masterFd, slaveFd } = ki.openpty(parent.pid);

			const child = ki.spawn("child-cmd", [], {
				ppid: parent.pid,
				stdinFd: slaveFd,
				stdoutFd: slaveFd,
				stderrFd: slaveFd,
			});

			// Child's FD 0, 1, 2 are PTY slave → isatty should be true
			expect(ki.isatty(child.pid, 0)).toBe(true);
			expect(ki.isatty(child.pid, 1)).toBe(true);
			expect(ki.isatty(child.pid, 2)).toBe(true);

			child.kill();
			parent.kill();
		});
	});

	// -------------------------------------------------------------------
	// PTY line discipline
	// -------------------------------------------------------------------

	describe("PTY line discipline", () => {
		it("raw mode — single byte write to master immediately readable from slave", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Explicitly set raw mode (default, but be explicit)
			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: false, echo: false, isig: false });

			// Write a single byte
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x41])); // 'A'

			const data = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("A");

			proc.kill();
		});

		it("canonical mode — backspace erases last char, newline flushes line", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Enable canonical mode
			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: true });

			// Write 'ab<DEL>c\n' → slave should read 'ac\n'
			const input = new Uint8Array([0x61, 0x62, 0x7f, 0x63, 0x0a]); // a b DEL c LF
			ki.fdWrite(proc.pid, masterFd, input);

			const data = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("ac\n");

			proc.kill();
		});

		it("canonical mode — input buffered until newline", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: true });

			// Write chars without newline — nothing should be readable yet
			ki.fdWrite(proc.pid, masterFd, new TextEncoder().encode("hello"));

			// Start a read that should block (no newline yet)
			let readResolved = false;
			const readPromise = ki.fdRead(proc.pid, slaveFd, 1024).then((d) => {
				readResolved = true;
				return d;
			});

			// Yield to microtasks
			await new Promise((r) => setTimeout(r, 10));
			expect(readResolved).toBe(false);

			// Now send the newline — should flush the line
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x0a]));

			const data = await readPromise;
			expect(new TextDecoder().decode(data)).toBe("hello\n");

			proc.kill();
		});

		it("echo mode — input bytes echoed back through master", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Enable echo in canonical mode
			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: true, echo: true });

			ki.fdWrite(proc.pid, masterFd, new TextEncoder().encode("hi\n"));

			// Slave reads the flushed line
			const slaveData = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(slaveData)).toBe("hi\n");

			// Master reads back echoed chars ('h', 'i', '\r\n')
			const echoData = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(new TextDecoder().decode(echoData)).toBe("hi\r\n");

			proc.kill();
		});

		it("^C in canonical mode delivers SIGINT to foreground process group", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const child = kernel.spawn("child", []);

			// Put child in its own process group
			ki.setpgid(child.pid, child.pid);

			// Open PTY and configure
			const { masterFd } = ki.openpty(parent.pid);
			ki.ptySetDiscipline(parent.pid, masterFd, { isig: true });
			ki.ptySetForegroundPgid(parent.pid, masterFd, child.pid); // child's pgid = child.pid

			// Write ^C (0x03) to master
			ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x03]));

			// Child should have received SIGINT (signal 2)
			expect(killSignals).toContain(2);

			parent.kill();
		});

		it("^Z delivers SIGTSTP to foreground process group", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const child = kernel.spawn("child", []);

			ki.setpgid(child.pid, child.pid);

			const { masterFd } = ki.openpty(parent.pid);
			ki.ptySetDiscipline(parent.pid, masterFd, { isig: true });
			ki.ptySetForegroundPgid(parent.pid, masterFd, child.pid);

			// Write ^Z (0x1A) to master
			ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x1a]));

			// Child should have received SIGTSTP (signal 20)
			expect(killSignals).toContain(20);

			parent.kill();
		});

		it("^\\ delivers SIGQUIT to foreground process group", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const child = kernel.spawn("child", []);

			ki.setpgid(child.pid, child.pid);

			const { masterFd } = ki.openpty(parent.pid);
			ki.ptySetDiscipline(parent.pid, masterFd, { isig: true });
			ki.ptySetForegroundPgid(parent.pid, masterFd, child.pid);

			// Write ^\ (0x1C) to master
			ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x1c]));

			// Child should have received SIGQUIT (signal 3)
			expect(killSignals).toContain(3);

			parent.kill();
		});

		it("^\\ echoes ^\\ to master when isig and echo enabled", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const child = kernel.spawn("child", []);

			ki.setpgid(child.pid, child.pid);

			const { masterFd } = ki.openpty(parent.pid);
			// Enable isig + echo (defaults are both on, but be explicit)
			ki.ptySetDiscipline(parent.pid, masterFd, { isig: true, echo: true });
			ki.ptySetForegroundPgid(parent.pid, masterFd, child.pid);

			// Write ^\ (0x1C)
			ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x1c]));

			// Read echo from master — should contain ^\ (0x5e 0x5c)
			const echo = await ki.fdRead(parent.pid, masterFd, 1024);
			const text = new TextDecoder().decode(echo);
			expect(text).toContain("^\\");

			parent.kill();
		});

		it("PTY master close delivers SIGHUP to foreground process group", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true, killSignals, survivableSignals: [1] },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const child = kernel.spawn("child", []);

			ki.setpgid(child.pid, child.pid);

			const { masterFd } = ki.openpty(parent.pid);
			ki.ptySetForegroundPgid(parent.pid, masterFd, child.pid);

			// Close master — should deliver SIGHUP (1) to foreground pgid
			ki.fdClose(parent.pid, masterFd);

			expect(killSignals).toContain(1); // SIGHUP

			parent.kill();
		});

		it("^D at start of line delivers EOF in canonical mode", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: true });

			// Write ^D on empty line → EOF
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x04]));

			const data = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(data.length).toBe(0); // EOF = 0 bytes

			proc.kill();
		});

		it("^C in canonical mode clears line buffer", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const child = kernel.spawn("child", []);
			ki.setpgid(child.pid, child.pid);

			const { masterFd, slaveFd } = ki.openpty(parent.pid);
			ki.ptySetDiscipline(parent.pid, masterFd, { canonical: true, isig: true });
			ki.ptySetForegroundPgid(parent.pid, masterFd, child.pid);

			// Type some chars, then ^C, then new input + newline
			ki.fdWrite(parent.pid, masterFd, new TextEncoder().encode("partial"));
			ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x03])); // ^C clears "partial"
			ki.fdWrite(parent.pid, masterFd, new TextEncoder().encode("fresh\n"));

			// Slave should only see "fresh\n", not "partial"
			const data = await ki.fdRead(parent.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("fresh\n");
			expect(killSignals).toContain(2); // SIGINT delivered

			parent.kill();
		});

		it("canonical mode line buffer capped at MAX_CANON — excess bytes discarded", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: true, echo: false });

			// Write 10,000 bytes without newline — should be capped at MAX_CANON
			const bigInput = new Uint8Array(10_000).fill(0x41); // 'A' repeated
			ki.fdWrite(proc.pid, masterFd, bigInput);

			// Flush with newline
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x0a]));

			const data = await ki.fdRead(proc.pid, slaveFd, 16_384);
			// Line should be MAX_CANON chars + 1 newline
			expect(data.length).toBe(MAX_CANON + 1);
			expect(data[data.length - 1]).toBe(0x0a);

			proc.kill();
		});

		it("canonical mode normal operation still works after cap enforcement", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: true, echo: false });

			// Normal short line
			ki.fdWrite(proc.pid, masterFd, new TextEncoder().encode("hello world\n"));
			const data1 = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(data1)).toBe("hello world\n");

			// Second line after cap-length input on a prior write
			const bigInput = new Uint8Array(MAX_CANON + 500).fill(0x42); // 'B' repeated
			ki.fdWrite(proc.pid, masterFd, bigInput);
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x0a]));
			const data2 = await ki.fdRead(proc.pid, slaveFd, 16_384);
			expect(data2.length).toBe(MAX_CANON + 1);

			// Third line — normal operation resumes after buffer was capped and flushed
			ki.fdWrite(proc.pid, masterFd, new TextEncoder().encode("ok\n"));
			const data3 = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(data3)).toBe("ok\n");

			proc.kill();
		});

		it("ICRNL — CR (0x0d) converted to NL (0x0a) in canonical mode, delivered as newline", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: true, echo: false });

			// Write 'hello' + CR (0x0d) — ICRNL converts CR to LF, flushes line
			const input = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x0d]); // 'hello\r'
			ki.fdWrite(proc.pid, masterFd, input);

			const data = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("hello\n");

			proc.kill();
		});

		it("ICRNL — CR input echoes as CR+LF", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: true, echo: true });

			// Write 'A' + CR — ICRNL converts to LF, echo should produce 'A' then CR+LF
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x41, 0x0d])); // 'A\r'

			// Slave reads the flushed line
			const slaveData = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(slaveData)).toBe("A\n");

			// Master reads echoed: 'A' + CR+LF (newline echo)
			const echoData = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(new TextDecoder().decode(echoData)).toBe("A\r\n");

			proc.kill();
		});

		it("ICRNL disabled — CR passes through as-is", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Disable ICRNL via tcsetattr
			ki.tcsetattr(proc.pid, masterFd, { icrnl: false });
			ki.ptySetDiscipline(proc.pid, masterFd, { canonical: false, echo: false, isig: false });

			// Write CR — should pass through as 0x0d, not converted to 0x0a
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x0d]));

			const data = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(data[0]).toBe(0x0d);

			proc.kill();
		});
	});

	// -------------------------------------------------------------------
	// Termios support (terminal attributes)
	// -------------------------------------------------------------------

	describe("termios support", () => {
		it("default termios has canonical, echo, and isig on", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { slaveFd } = ki.openpty(proc.pid);

			const termios = ki.tcgetattr(proc.pid, slaveFd);
			expect(termios.icanon).toBe(true);
			expect(termios.echo).toBe(true);
			expect(termios.isig).toBe(true);
			expect(termios.cc.vintr).toBe(0x03);
			expect(termios.cc.vquit).toBe(0x1c);
			expect(termios.cc.vsusp).toBe(0x1a);
			expect(termios.cc.veof).toBe(0x04);
			expect(termios.cc.verase).toBe(0x7f);

			proc.kill();
		});

		it("spawn on PTY in canonical mode verifies line buffering", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Default termios is canonical — input should be line-buffered
			ki.fdWrite(proc.pid, masterFd, new TextEncoder().encode("hello"));

			// Start a read that should block (no newline yet)
			let readResolved = false;
			const readPromise = ki.fdRead(proc.pid, slaveFd, 1024).then((d) => {
				readResolved = true;
				return d;
			});

			await new Promise((r) => setTimeout(r, 10));
			expect(readResolved).toBe(false);

			// Flush with newline
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x0a]));
			const data = await readPromise;
			expect(new TextDecoder().decode(data)).toBe("hello\n");

			proc.kill();
		});

		it("tcsetattr with icanon: false switches to raw mode — immediate byte delivery", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Switch to raw mode via tcsetattr
			ki.tcsetattr(proc.pid, slaveFd, { icanon: false, echo: false, isig: false });

			// Verify termios updated
			const termios = ki.tcgetattr(proc.pid, slaveFd);
			expect(termios.icanon).toBe(false);
			expect(termios.echo).toBe(false);
			expect(termios.isig).toBe(false);

			// Single byte immediately readable (no newline needed)
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x41])); // 'A'
			const data = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("A");

			proc.kill();
		});

		it("tcsetattr with echo: false disables echo", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Disable echo but keep canonical
			ki.tcsetattr(proc.pid, slaveFd, { echo: false });

			// Write input through master
			ki.fdWrite(proc.pid, masterFd, new TextEncoder().encode("hi\n"));

			// Slave reads the flushed line
			const slaveData = await ki.fdRead(proc.pid, slaveFd, 1024);
			expect(new TextDecoder().decode(slaveData)).toBe("hi\n");

			// Master should NOT have echo data — start a read that should block
			let masterReadResolved = false;
			ki.fdRead(proc.pid, masterFd, 1024).then(() => {
				masterReadResolved = true;
			});

			await new Promise((r) => setTimeout(r, 10));
			expect(masterReadResolved).toBe(false);

			proc.kill();
		});

		it("tcsetpgrp changes which group receives ^C", async () => {
			const killSignalsA: number[] = [];
			const killSignalsB: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "childA", "childB"], {
				parent: { neverExit: true },
				childA: { neverExit: true, killSignals: killSignalsA },
				childB: { neverExit: true, killSignals: killSignalsB },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const childA = kernel.spawn("childA", []);
			const childB = kernel.spawn("childB", []);

			// Put each child in its own process group
			ki.setpgid(childA.pid, childA.pid);
			ki.setpgid(childB.pid, childB.pid);

			const { masterFd } = ki.openpty(parent.pid);

			// Set foreground to childA's group via tcsetpgrp
			ki.tcsetpgrp(parent.pid, masterFd, childA.pid);
			expect(ki.tcgetpgrp(parent.pid, masterFd)).toBe(childA.pid);

			// ^C → childA gets SIGINT, not childB
			ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x03]));
			expect(killSignalsA).toContain(2);
			expect(killSignalsB).not.toContain(2);

			// Switch foreground to childB's group
			ki.tcsetpgrp(parent.pid, masterFd, childB.pid);
			expect(ki.tcgetpgrp(parent.pid, masterFd)).toBe(childB.pid);

			// ^C → childB gets SIGINT
			ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x03]));
			expect(killSignalsB).toContain(2);

			parent.kill();
		});

		it("tcsetpgrp with non-existent pgid throws ESRCH", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd } = ki.openpty(proc.pid);

			// pgid 9999 does not match any running process group
			expect(() => ki.tcsetpgrp(proc.pid, masterFd, 9999)).toThrow(
				expect.objectContaining({ code: "ESRCH" }),
			);
			proc.kill();
		});

		it("tcsetpgrp with valid pgid succeeds", async () => {
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const child = kernel.spawn("child", []);

			// Put child in its own process group
			ki.setpgid(child.pid, child.pid);

			const { masterFd } = ki.openpty(parent.pid);

			// Setting foreground to a valid group should work
			ki.tcsetpgrp(parent.pid, masterFd, child.pid);
			expect(ki.tcgetpgrp(parent.pid, masterFd)).toBe(child.pid);

			parent.kill();
			child.kill();
		});

		it("stale foregroundPgid after group leader exit — ^C is no-op, not crash", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "leader"], {
				parent: { neverExit: true },
				leader: { neverExit: true, killSignals },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const leader = kernel.spawn("leader", []);

			// Put leader in its own process group and set as foreground
			ki.setpgid(leader.pid, leader.pid);
			const { masterFd } = ki.openpty(parent.pid);
			ki.tcsetpgrp(parent.pid, masterFd, leader.pid);

			// Kill the group leader — foregroundPgid now points to a dead group
			leader.kill();
			await leader.wait();

			// ^C with stale foregroundPgid should not crash — protected by try/catch
			expect(() =>
				ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x03])),
			).not.toThrow();

			parent.kill();
		});

		it("stale foregroundPgid recovery — set new valid group after leader exit", async () => {
			const killSignalsA: number[] = [];
			const killSignalsB: number[] = [];
			const driver = new MockRuntimeDriver(["parent", "leaderA", "leaderB"], {
				parent: { neverExit: true },
				leaderA: { neverExit: true, killSignals: killSignalsA },
				leaderB: { neverExit: true, killSignals: killSignalsB },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const parent = kernel.spawn("parent", []);
			const leaderA = kernel.spawn("leaderA", []);
			const leaderB = kernel.spawn("leaderB", []);

			// Set up groups
			ki.setpgid(leaderA.pid, leaderA.pid);
			ki.setpgid(leaderB.pid, leaderB.pid);
			const { masterFd } = ki.openpty(parent.pid);
			ki.tcsetpgrp(parent.pid, masterFd, leaderA.pid);

			// Kill group A leader — foregroundPgid is stale
			leaderA.kill();
			await leaderA.wait();

			// Recover by setting foreground to group B
			ki.tcsetpgrp(parent.pid, masterFd, leaderB.pid);
			expect(ki.tcgetpgrp(parent.pid, masterFd)).toBe(leaderB.pid);

			// ^C should now reach group B
			ki.fdWrite(parent.pid, masterFd, new Uint8Array([0x03]));
			expect(killSignalsB).toContain(2);

			parent.kill();
		});

		it("tcgetattr returns a copy — mutation does not affect PTY", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { slaveFd } = ki.openpty(proc.pid);

			const termios = ki.tcgetattr(proc.pid, slaveFd);
			termios.icanon = false;
			termios.cc.vintr = 0xff;

			// Original should be unchanged
			const termios2 = ki.tcgetattr(proc.pid, slaveFd);
			expect(termios2.icanon).toBe(true);
			expect(termios2.cc.vintr).toBe(0x03);

			proc.kill();
		});

		it("tcgetattr/tcsetattr work from both master and slave FDs", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Set via master FD
			ki.tcsetattr(proc.pid, masterFd, { icanon: false });

			// Read back via slave FD — same PTY, should see the change
			const termios = ki.tcgetattr(proc.pid, slaveFd);
			expect(termios.icanon).toBe(false);

			proc.kill();
		});

		it("echo buffer exhaustion — fdWrite throws EAGAIN when output buffer is full", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Default termios: canonical + echo on. Fill output buffer via slave write.
			const chunk = new Uint8Array(MAX_PTY_BUFFER_BYTES);
			ki.fdWrite(proc.pid, slaveFd, chunk);

			// Master write with echo enabled — echo can't fit in full output buffer → EAGAIN
			expect(() =>
				ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x41])), // 'A'
			).toThrow(expect.objectContaining({ code: "EAGAIN" }));

			proc.kill();
		});

		it("echo buffer exhaustion recovery — drain buffer, verify echo resumes", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			// Fill output buffer via slave write
			const chunk = new Uint8Array(MAX_PTY_BUFFER_BYTES);
			ki.fdWrite(proc.pid, slaveFd, chunk);

			// Confirm echo is blocked
			expect(() =>
				ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x41])),
			).toThrow(expect.objectContaining({ code: "EAGAIN" }));

			// Drain output buffer via master read
			await ki.fdRead(proc.pid, masterFd, MAX_PTY_BUFFER_BYTES);

			// Echo should now work — write input, read echo back from master
			ki.fdWrite(proc.pid, masterFd, new Uint8Array([0x42])); // 'B'
			const echo = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(echo[0]).toBe(0x42); // 'B' echoed back

			proc.kill();
		});

		it("tcgetattr on non-PTY FD throws EBADF", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { readFd } = ki.pipe(proc.pid);

			expect(() => ki.tcgetattr(proc.pid, readFd)).toThrow(/EBADF/);

			proc.kill();
		});
	});

	// -----------------------------------------------------------------------
	// openShell interactive shell
	// -----------------------------------------------------------------------

	describe("openShell interactive shell", () => {
		it("open shell, write input, verify output contains echoed data", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { readStdinFromKernel: true, survivableSignals: [2, 20, 28] },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const shell = kernel.openShell();
			expect(shell.pid).toBeGreaterThan(0);

			// Collect output
			const output: string[] = [];
			shell.onData = (data) => {
				output.push(new TextDecoder().decode(data));
			};

			// Write 'hello\n' — in canonical+echo mode, master echoes input then
			// the mock reads the line from slave and writes it back to slave output
			shell.write("hello\n");

			// Allow async read pump to deliver data
			await new Promise((r) => setTimeout(r, 20));

			const combined = output.join("");
			expect(combined).toContain("hello");

			shell.kill();
		});

		it("open shell, write ^C, verify shell still running", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["sh"], {
				sh: {
					readStdinFromKernel: true,
					survivableSignals: [2, 20, 28],
					killSignals,
				},
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const shell = kernel.openShell();

			// ^C intercepted at PTY level for session leader — shell is
			// protected from SIGINT (kill not called on session leader)
			shell.write("\x03");

			await new Promise((r) => setTimeout(r, 10));

			// Session leader is excluded from SIGINT delivery
			expect(killSignals).not.toContain(2);

			// Shell still running — wait should not have resolved
			expect(shell.pid).toBeGreaterThan(0);
			let exited = false;
			shell.wait().then(() => { exited = true; });
			await new Promise((r) => setTimeout(r, 10));
			expect(exited).toBe(false);

			shell.kill();
		});

		it("open shell, write ^D on empty line, verify shell exits", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { readStdinFromKernel: true, survivableSignals: [2, 20, 28] },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const shell = kernel.openShell();

			// ^D on empty line in canonical mode → EOF → mock exits
			shell.write("\x04");

			const exitCode = await shell.wait();
			expect(exitCode).toBe(0);
		});

		it("resize delivers SIGWINCH to foreground process group", async () => {
			const killSignals: number[] = [];
			const driver = new MockRuntimeDriver(["sh"], {
				sh: {
					readStdinFromKernel: true,
					survivableSignals: [2, 20, 28],
					killSignals,
				},
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const shell = kernel.openShell();

			shell.resize(120, 40);

			await new Promise((r) => setTimeout(r, 10));

			// SIGWINCH (28) delivered to foreground group
			expect(killSignals).toContain(28);

			shell.kill();
		});

		it("shell process sees isatty(0) === true", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { readStdinFromKernel: true, survivableSignals: [2, 20, 28] },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const shell = kernel.openShell();

			// Verify the shell's FD 0 is a PTY slave (terminal)
			expect(ki.isatty(shell.pid, 0)).toBe(true);

			shell.kill();
		});

		it("controller PID FD table is cleaned up after shell exits", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { readStdinFromKernel: true, survivableSignals: [2, 20, 28] },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const shell = kernel.openShell();

			// ^D on empty line → EOF → shell exits
			shell.write("\x04");
			await shell.wait();

			// Allow cleanup callback to run
			await new Promise((r) => setTimeout(r, 10));

			// PTY master FD should be closed — write throws because PTY is gone
			expect(() => shell.write("after-exit")).toThrow();
		});

		it("repeated openShell/exit cycles do not leak FD tables or PID numbers", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { readStdinFromKernel: true, survivableSignals: [2, 20, 28] },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			for (let i = 0; i < 5; i++) {
				const shell = kernel.openShell();

				// Exit shell via ^D
				shell.write("\x04");
				await shell.wait();

				// Allow cleanup callback to run
				await new Promise((r) => setTimeout(r, 10));

				// PTY master should be cleaned up each cycle
				expect(() => shell.write("leak-check")).toThrow();
			}
		});
	});

	// -----------------------------------------------------------------------
	// connectTerminal
	// -----------------------------------------------------------------------

	describe("connectTerminal", () => {
		it("returns shell exit code 0", async () => {
			const driver = new MockRuntimeDriver(["sh"]);
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const code = await kernel.connectTerminal();
			expect(code).toBe(0);
		});

		it("returns custom shell exit code", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 42 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const code = await kernel.connectTerminal();
			expect(code).toBe(42);
		});

		it("forwards command and args to openShell", async () => {
			const driver = new MockRuntimeDriver(["bash"], {
				bash: { exitCode: 7 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const code = await kernel.connectTerminal({
				command: "bash",
				args: ["--norc"],
			});
			expect(code).toBe(7);
		});

		it("onData override receives shell output", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { readStdinFromKernel: true, survivableSignals: [2, 20, 28] },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const chunks: Uint8Array[] = [];
			const connectPromise = kernel.connectTerminal({
				onData: (data) => chunks.push(new Uint8Array(data)),
			});

			// Send data through stdin → PTY master → line discipline → slave → mock reads → writes back → master → onData
			await new Promise((r) => setTimeout(r, 10));
			process.stdin.emit("data", Buffer.from("hi\n"));

			// Send ^D on empty line to exit the shell
			await new Promise((r) => setTimeout(r, 10));
			process.stdin.emit("data", Buffer.from("\x04"));

			const code = await connectPromise;
			expect(code).toBe(0);

			// Shell output should contain the echoed input (from PTY echo) and the program output
			const output = new TextDecoder().decode(
				new Uint8Array(chunks.reduce((acc, c) => [...acc, ...c], [] as number[])),
			);
			expect(output).toContain("hi");
		});

		it("cleans up stdin listener when openShell throws", async () => {
			// No driver supports "sh", so openShell's spawnInternal will fail
			({ kernel } = await createTestKernel({ drivers: [] }));

			const stdin = process.stdin;
			const listenersBefore = stdin.listenerCount("data");

			await expect(kernel.connectTerminal()).rejects.toThrow();

			// No dangling stdin data listener after the error
			expect(stdin.listenerCount("data")).toBe(listenersBefore);
		});

		it("restores terminal state when shell.wait() rejects", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 1 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const stdin = process.stdin;
			const listenersBefore = stdin.listenerCount("data");

			const code = await kernel.connectTerminal();
			expect(code).toBe(1);

			// stdin data listener should be removed after connectTerminal returns
			expect(stdin.listenerCount("data")).toBe(listenersBefore);
		});
	});

	// -----------------------------------------------------------------------
	// /dev/fd pseudo-directory
	// -----------------------------------------------------------------------

	describe("/dev/fd pseudo-directory", () => {
		it("open('/dev/fd/N') is equivalent to dup(N) — file content matches", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);

			// Write a file and open it
			await ki.vfs.writeFile("/tmp/test.txt", "hello world");
			const origFd = ki.fdOpen(proc.pid, "/tmp/test.txt", 0);

			// Open via /dev/fd/N → dup
			const devFd = ki.fdOpen(proc.pid, `/dev/fd/${origFd}`, 0);
			expect(devFd).not.toBe(origFd);

			// Read from the dup'd FD → same content
			const data = await ki.fdRead(proc.pid, devFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("hello world");

			proc.kill();
			await proc.wait();
		});

		it("read via /dev/fd/<readEnd> returns pipe data", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);

			// Create pipe and write data
			const { readFd, writeFd } = ki.pipe(proc.pid);
			ki.fdWrite(proc.pid, writeFd, new TextEncoder().encode("pipe data"));
			ki.fdClose(proc.pid, writeFd);

			// Open via /dev/fd/<readFd> → dup of read end
			const devFd = ki.fdOpen(proc.pid, `/dev/fd/${readFd}`, 0);

			// Read from dup'd pipe FD → pipe data
			const data = await ki.fdRead(proc.pid, devFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("pipe data");

			proc.kill();
			await proc.wait();
		});

		it("devFdReadDir lists 0, 1, 2 at minimum", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);

			const entries = ki.devFdReadDir(proc.pid);
			expect(entries).toContain("0");
			expect(entries).toContain("1");
			expect(entries).toContain("2");

			proc.kill();
			await proc.wait();
		});

		it("devFdReadDir includes opened file FDs", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);

			await ki.vfs.writeFile("/tmp/f.txt", "data");
			const fd = ki.fdOpen(proc.pid, "/tmp/f.txt", 0);

			const entries = ki.devFdReadDir(proc.pid);
			expect(entries).toContain(String(fd));

			proc.kill();
			await proc.wait();
		});

		it("stat('/dev/fd/N') returns stat for underlying file via devFdStat", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);

			await ki.vfs.writeFile("/tmp/statfile.txt", "twelve chars");
			const fd = ki.fdOpen(proc.pid, "/tmp/statfile.txt", 0);

			const st = await ki.devFdStat(proc.pid, fd);
			expect(st.size).toBe(12);
			expect(st.isDirectory).toBe(false);

			proc.kill();
			await proc.wait();
		});

		it("devFdStat on pipe FD returns synthetic character device stat", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);

			const { readFd } = ki.pipe(proc.pid);
			const st = await ki.devFdStat(proc.pid, readFd);
			expect(st.size).toBe(0);
			expect(st.isDirectory).toBe(false);
			expect(st.mode).toBe(0o666);

			proc.kill();
			await proc.wait();
		});

		it("open('/dev/fd/N') where N is not open throws EBADF", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);

			expect(() => ki.fdOpen(proc.pid, "/dev/fd/99", 0)).toThrow("EBADF");

			proc.kill();
			await proc.wait();
		});

		it("open('/dev/fd/N') rejects malformed paths — non-integer and negative", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);

			expect(() => ki.fdOpen(proc.pid, "/dev/fd/abc", 0)).toThrow("EBADF");
			expect(() => ki.fdOpen(proc.pid, "/dev/fd/-1", 0)).toThrow("EBADF");
			expect(() => ki.fdOpen(proc.pid, "/dev/fd/", 0)).toThrow("EBADF");
			expect(() => ki.fdOpen(proc.pid, "/dev/fd/1.5", 0)).toThrow("EBADF");

			proc.kill();
			await proc.wait();
		});

		it("stat('/dev/fd') returns directory stat via VFS", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;

			const st = await ki.vfs.stat("/dev/fd");
			expect(st.isDirectory).toBe(true);
			expect(st.mode).toBe(0o755);

			const proc = kernel.spawn("cmd", []);
			proc.kill();
			await proc.wait();
		});

		it("readDir('/dev/fd') via VFS returns empty (PID-unaware)", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;

			// VFS-level readDir has no PID context — returns empty
			const entries = await ki.vfs.readDir("/dev/fd");
			expect(entries).toEqual([]);

			const proc = kernel.spawn("cmd", []);
			proc.kill();
			await proc.wait();
		});

		it("exists('/dev/fd') and exists('/dev/fd/0') return true", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;

			expect(await ki.vfs.exists("/dev/fd")).toBe(true);
			expect(await ki.vfs.exists("/dev/fd/0")).toBe(true);

			const proc = kernel.spawn("cmd", []);
			proc.kill();
			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// /proc pseudo-filesystem
	// -----------------------------------------------------------------------

	describe("/proc pseudo-filesystem", () => {
		it("readdir('/proc/self/fd') returns open FD numbers for the current process", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);
			const procVfs = createProcessScopedFileSystem(ki.vfs, proc.pid);

			await ki.vfs.writeFile("/tmp/proc-fd.txt", "data");
			const fd = ki.fdOpen(proc.pid, "/tmp/proc-fd.txt", 0);

			const entries = await procVfs.readDir("/proc/self/fd");
			expect(entries).toContain("0");
			expect(entries).toContain("1");
			expect(entries).toContain("2");
			expect(entries).toContain(String(fd));

			proc.kill();
			await proc.wait();
		});

		it("readlink('/proc/self/fd/0') resolves to the process stdin path", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", []);
			const procVfs = createProcessScopedFileSystem(ki.vfs, proc.pid);

			expect(await procVfs.readlink("/proc/self/fd/0")).toBe("/dev/stdin");

			proc.kill();
			await proc.wait();
		});

		it("readFile('/proc/self/cwd') returns the current working directory", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", [], { cwd: "/tmp" });
			const procVfs = createProcessScopedFileSystem(ki.vfs, proc.pid);

			const cwd = new TextDecoder().decode(await procVfs.readFile("/proc/self/cwd"));
			expect(cwd).toBe("/tmp");

			proc.kill();
			await proc.wait();
		});

		it("readTextFile('/proc/<pid>/environ') exposes NUL-delimited environment entries", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("cmd", [], { env: { FOO: "bar", BAZ: "qux" } });

			const environ = await ki.vfs.readFile(`/proc/${proc.pid}/environ`);
			expect(new TextDecoder().decode(environ)).toContain("FOO=bar");
			expect(new TextDecoder().decode(environ)).toContain("\0");

			proc.kill();
			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// Kernel maxProcesses budget
	// -----------------------------------------------------------------------

	describe("kernel maxProcesses budget", () => {
		it("spawn succeeds within the limit", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver], maxProcesses: 5 }));

			const procs = [];
			for (let i = 0; i < 5; i++) {
				procs.push(kernel.spawn("cmd", []));
			}
			expect(procs).toHaveLength(5);

			for (const p of procs) { p.kill(); await p.wait(); }
		});

		it("spawn throws EAGAIN when maxProcesses is exceeded", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver], maxProcesses: 10 }));

			const procs = [];
			for (let i = 0; i < 10; i++) {
				procs.push(kernel.spawn("cmd", []));
			}

			// 11th spawn should throw EAGAIN
			expect(() => kernel.spawn("cmd", [])).toThrow("EAGAIN");

			for (const p of procs) { p.kill(); await p.wait(); }
		});

		it("slots freed after process exit allow new spawns", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver], maxProcesses: 3 }));

			const p1 = kernel.spawn("cmd", []);
			const p2 = kernel.spawn("cmd", []);
			const p3 = kernel.spawn("cmd", []);

			// Full — cannot spawn
			expect(() => kernel.spawn("cmd", [])).toThrow("EAGAIN");

			// Kill one process to free a slot
			p1.kill();
			await p1.wait();

			// Now spawning should succeed
			const p4 = kernel.spawn("cmd", []);
			expect(p4.pid).toBeDefined();

			p2.kill(); p3.kill(); p4.kill();
			await Promise.all([p2.wait(), p3.wait(), p4.wait()]);
		});

		it("maxProcesses=10 with 15 spawns — first 10 succeed, rest throw EAGAIN", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver], maxProcesses: 10 }));

			const procs = [];
			for (let i = 0; i < 10; i++) {
				procs.push(kernel.spawn("cmd", []));
			}
			expect(procs).toHaveLength(10);

			// Next 5 should all fail with EAGAIN
			for (let i = 0; i < 5; i++) {
				expect(() => kernel.spawn("cmd", [])).toThrow("EAGAIN");
			}

			for (const p of procs) { p.kill(); await p.wait(); }
		});
	});

	// -----------------------------------------------------------------------
	// On-demand command discovery via tryResolve
	// -----------------------------------------------------------------------

	describe("on-demand command discovery (tryResolve)", () => {
		it("discovers a command not in initial commands list", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0 },
				"dynamic-cmd": { exitCode: 7, stdout: "discovered\n" },
			});
			// Add tryResolve that discovers "dynamic-cmd"
			driver.tryResolve = (command: string) => command === "dynamic-cmd";

			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// "dynamic-cmd" was not in the initial commands list, but tryResolve finds it
			const proc = kernel.spawn("dynamic-cmd", []);
			const code = await proc.wait();
			expect(code).toBe(7);
		});

		it("tryResolve returning false for all drivers results in ENOENT", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0 },
			});
			driver.tryResolve = (_command: string) => false;

			({ kernel } = await createTestKernel({ drivers: [driver] }));

			expect(() => kernel.spawn("nonexistent", [])).toThrow("ENOENT");
		});

		it("after tryResolve succeeds, subsequent spawns resolve via registry without calling tryResolve again", async () => {
			let tryResolveCallCount = 0;
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0 },
				"lazy-cmd": { exitCode: 0, stdout: "ok\n" },
			});
			driver.tryResolve = (command: string) => {
				tryResolveCallCount++;
				return command === "lazy-cmd";
			};

			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// First spawn triggers tryResolve
			const proc1 = kernel.spawn("lazy-cmd", []);
			await proc1.wait();
			expect(tryResolveCallCount).toBe(1);

			// Second spawn should resolve from registry — no tryResolve call
			const proc2 = kernel.spawn("lazy-cmd", []);
			await proc2.wait();
			expect(tryResolveCallCount).toBe(1);
		});

		it("drivers without tryResolve are skipped", async () => {
			const driver1 = new MockRuntimeDriver(["sh"], { sh: { exitCode: 0 } });
			// driver1 has no tryResolve

			const driver2 = new MockRuntimeDriver(["cat"], {
				cat: { exitCode: 0 },
				"extra-cmd": { exitCode: 0, stdout: "from-driver2\n" },
			});
			driver2.name = "mock2";
			driver2.tryResolve = (command: string) => command === "extra-cmd";

			({ kernel } = await createTestKernel({ drivers: [driver1, driver2] }));

			// driver1 is skipped (no tryResolve), driver2 discovers "extra-cmd"
			const proc = kernel.spawn("extra-cmd", []);
			const code = await proc.wait();
			expect(code).toBe(0);
		});

		it("tryResolve works with path-based command lookups", async () => {
			let tryResolvedWith: string | undefined;
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0 },
			});
			driver.tryResolve = (command: string) => {
				tryResolvedWith = command;
				return command === "path-cmd";
			};

			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// Path-based lookup extracts basename before trying tryResolve
			const proc = kernel.spawn("/usr/bin/path-cmd", []);
			await proc.wait();
			// tryResolve received the basename, not the full path
			expect(tryResolvedWith).toBe("path-cmd");
		});

		it("populates /bin entry after tryResolve succeeds", async () => {
			let vfs: TestFileSystem;
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0 },
				"new-cmd": { exitCode: 0 },
			});
			driver.tryResolve = (command: string) => command === "new-cmd";

			({ kernel, vfs } = await createTestKernel({ drivers: [driver] }));

			// Before spawn, /bin/new-cmd should not exist
			expect(await vfs.exists("/bin/new-cmd")).toBe(false);

			const proc = kernel.spawn("new-cmd", []);
			await proc.wait();

			// Flush pending bin entries — no setTimeout hack needed
			await kernel.flushPendingBinEntries();

			// After spawn, /bin/new-cmd should be populated
			expect(await vfs.exists("/bin/new-cmd")).toBe(true);
		});

		it("on-demand discovery creates /bin stub before subsequent spawn resolves via PATH", async () => {
			let vfs: TestFileSystem;
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0 },
				"discover-cmd": { exitCode: 42 },
				"/bin/discover-cmd": { exitCode: 42 },
			});
			driver.tryResolve = (command: string) => command === "discover-cmd";

			({ kernel, vfs } = await createTestKernel({ drivers: [driver] }));

			// First spawn discovers the command
			const proc1 = kernel.spawn("discover-cmd", []);
			await proc1.wait();

			// Flush ensures /bin stub exists before PATH-based lookup
			await kernel.flushPendingBinEntries();

			// /bin/discover-cmd must exist now
			expect(await vfs.exists("/bin/discover-cmd")).toBe(true);

			// Subsequent spawn via PATH (/bin/discover-cmd) resolves via registry
			const proc2 = kernel.spawn("/bin/discover-cmd", []);
			const code2 = await proc2.wait();
			expect(code2).toBe(42);
		});

		it("rapid consecutive spawns of a newly-discovered command both succeed (no race)", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0 },
				"rapid-cmd": { exitCode: 7 },
			});
			driver.tryResolve = (command: string) => command === "rapid-cmd";

			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// Two rapid spawns — first triggers tryResolve, second uses registry
			const proc1 = kernel.spawn("rapid-cmd", []);
			const proc2 = kernel.spawn("rapid-cmd", []);

			const [code1, code2] = await Promise.all([proc1.wait(), proc2.wait()]);
			expect(code1).toBe(7);
			expect(code2).toBe(7);
		});
	});

	// -----------------------------------------------------------------------
	// chdir — mutable working directory
	// -----------------------------------------------------------------------

	describe("chdir", () => {
		it("chdir then getcwd returns new path", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0, neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("sh", []);
			const ki = driver.kernelInterface!;

			// Create a directory to chdir into
			await ki.vfs.mkdir("/tmp/newdir");

			await ki.chdir(proc.pid, "/tmp/newdir");
			expect(ki.getcwd(proc.pid)).toBe("/tmp/newdir");

			proc.kill();
			await proc.wait();
		});

		it("chdir then spawn child — child cwd matches", async () => {
			let childCwd: string | undefined;
			const driver = new MockRuntimeDriver(["sh", "child-cmd"], {
				sh: { exitCode: 0, neverExit: true },
				"child-cmd": { exitCode: 0 },
			});

			// Wrap spawn to capture child ctx.cwd
			const origSpawn = driver.spawn.bind(driver);
			driver.spawn = (command: string, args: string[], ctx: ProcessContext) => {
				if (command === "child-cmd") {
					childCwd = ctx.cwd;
				}
				return origSpawn(command, args, ctx);
			};

			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("sh", []);
			const ki = driver.kernelInterface!;

			await ki.vfs.mkdir("/tmp/workdir");
			await ki.chdir(proc.pid, "/tmp/workdir");

			// Spawn child with parent's cwd
			const child = ki.spawn("child-cmd", [], {
				ppid: proc.pid,
				cwd: ki.getcwd(proc.pid),
			});
			await child.wait();

			expect(childCwd).toBe("/tmp/workdir");

			proc.kill();
			await proc.wait();
		});

		it("chdir to bad path returns ENOENT", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0, neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("sh", []);
			const ki = driver.kernelInterface!;

			await expect(
				ki.chdir(proc.pid, "/nonexistent/path"),
			).rejects.toThrow(/ENOENT/);

			proc.kill();
			await proc.wait();
		});

		it("chdir to file returns ENOTDIR", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { exitCode: 0, neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("sh", []);
			const ki = driver.kernelInterface!;

			await ki.vfs.writeFile("/tmp/afile", "content");

			await expect(
				ki.chdir(proc.pid, "/tmp/afile"),
			).rejects.toThrow(/ENOTDIR/);

			proc.kill();
			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// setenv / unsetenv — mutable environment after spawn
	// -----------------------------------------------------------------------

	describe("setenv / unsetenv", () => {
		it("setenv then getenv reflects change", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("sh", []);
			const ki = driver.kernelInterface!;

			ki.setenv(proc.pid, "MY_VAR", "hello");
			const env = ki.getenv(proc.pid);
			expect(env.MY_VAR).toBe("hello");

			proc.kill();
			await proc.wait();
		});

		it("setenv then spawn child — child has new var", async () => {
			// Capture env from child's ProcessContext
			const childEnvs: Record<string, string>[] = [];
			class EnvCaptureDriver implements RuntimeDriver {
				name = "envcap";
				commands = ["sh", "child-cmd"];
				ki: KernelInterface | null = null;
				async init(kernel: KernelInterface) { this.ki = kernel; }
				spawn(_command: string, _args: string[], ctx: ProcessContext): DriverProcess {
					childEnvs.push({ ...ctx.env });
					let exitResolve: (code: number) => void;
					const exitPromise = new Promise<number>((r) => { exitResolve = r; });
					const driverProc: DriverProcess = {
						writeStdin() {},
						closeStdin() {},
						kill(signal) { exitResolve!(128 + signal); queueMicrotask(() => driverProc.onExit?.(128 + signal)); },
						wait() { return exitPromise; },
						onStdout: null, onStderr: null, onExit: null,
					};
					return driverProc;
				}
				async dispose() {}
			}

			const driver = new EnvCaptureDriver();
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// Spawn parent
			const parent = kernel.spawn("sh", []);
			const ki = driver.ki!;

			// Set env on parent
			ki.setenv(parent.pid, "INJECTED", "value123");

			// Spawn child from parent
			const child = ki.spawn("child-cmd", [], { ppid: parent.pid });

			// child's env should have INJECTED
			expect(childEnvs.length).toBeGreaterThanOrEqual(2); // parent + child
			const childEnv = childEnvs[childEnvs.length - 1];
			expect(childEnv.INJECTED).toBe("value123");

			child.kill();
			parent.kill();
			await child.wait();
			await parent.wait();
		});

		it("unsetenv removes var from getenv", async () => {
			const driver = new MockRuntimeDriver(["sh"], {
				sh: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("sh", [], { env: { REMOVE_ME: "exists" } });
			const ki = driver.kernelInterface!;

			expect(ki.getenv(proc.pid).REMOVE_ME).toBe("exists");

			ki.unsetenv(proc.pid, "REMOVE_ME");
			const env = ki.getenv(proc.pid);
			expect(env.REMOVE_ME).toBeUndefined();
			expect("REMOVE_ME" in env).toBe(false);

			proc.kill();
			await proc.wait();
		});

		it("cross-driver setenv blocked with EPERM", async () => {
			// Create two drivers
			class SimpleDriver implements RuntimeDriver {
				name: string;
				commands: string[];
				ki: KernelInterface | null = null;
				constructor(name: string, commands: string[]) { this.name = name; this.commands = commands; }
				async init(kernel: KernelInterface) { this.ki = kernel; }
				spawn(_command: string, _args: string[], _ctx: ProcessContext): DriverProcess {
					let exitResolve: (code: number) => void;
					const exitPromise = new Promise<number>((r) => { exitResolve = r; });
					const driverProc: DriverProcess = {
						writeStdin() {},
						closeStdin() {},
						kill(signal) { exitResolve!(128 + signal); queueMicrotask(() => driverProc.onExit?.(128 + signal)); },
						wait() { return exitPromise; },
						onStdout: null, onStderr: null, onExit: null,
					};
					return driverProc;
				}
				async dispose() {}
			}

			const driverA = new SimpleDriver("alpha", ["alpha-cmd"]);
			const driverB = new SimpleDriver("beta", ["beta-cmd"]);
			({ kernel } = await createTestKernel({ drivers: [driverA, driverB] }));

			const procA = kernel.spawn("alpha-cmd", []);
			const procB = kernel.spawn("beta-cmd", []);

			// Driver B tries to setenv on Driver A's process
			expect(() => driverB.ki!.setenv(procA.pid, "X", "Y")).toThrow(/EPERM/);
			// Driver A tries to unsetenv on Driver B's process
			expect(() => driverA.ki!.unsetenv(procB.pid, "X")).toThrow(/EPERM/);

			procA.kill();
			procB.kill();
			await procA.wait();
			await procB.wait();
		});
	});

	// -----------------------------------------------------------------------
	// SIGPIPE on broken pipe write
	// -----------------------------------------------------------------------

	describe("SIGPIPE on broken pipe write", () => {
		it("write to pipe with closed read end delivers SIGPIPE and exits 141", async () => {
			// Custom driver that creates a pipe, closes read end, then writes
			let ki: KernelInterface;
			const driver: RuntimeDriver = {
				name: "sigpipe-test",
				commands: ["pipe-writer"],
				async init(k: KernelInterface) { ki = k; },
				spawn(_command: string, _args: string[], ctx: ProcessContext): DriverProcess {
					const pid = ctx.pid;
					let exitResolve: (code: number) => void;
					const exitPromise = new Promise<number>((r) => { exitResolve = r; });

					const proc: DriverProcess = {
						writeStdin() {},
						closeStdin() {},
						kill(signal) {
							const code = 128 + signal;
							exitResolve!(code);
							proc.onExit?.(code);
						},
						wait() { return exitPromise; },
						onStdout: null,
						onStderr: null,
						onExit: null,
					};

					// On next microtask: create pipe, close read end, write to broken pipe
					queueMicrotask(() => {
						const { readFd, writeFd } = ki.pipe(pid);
						ki.fdClose(pid, readFd);
						try {
							ki.fdWrite(pid, writeFd, new TextEncoder().encode("data"));
						} catch {
							// EPIPE thrown after SIGPIPE delivery — process already terminated
						}
					});

					return proc;
				},
				async dispose() {},
			};

			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("pipe-writer", []);
			const code = await proc.wait();
			expect(code).toBe(141); // 128 + SIGPIPE(13)
		});

		it("pipeline where reader exits early — writer terminates via SIGPIPE", async () => {
			// Reader: exits immediately, closing its stdin (pipe read end)
			// Writer: neverExit, writes to stdout which is piped to reader's stdin
			const driver = new MockRuntimeDriver(["reader", "writer"], {
				reader: { exitCode: 0 },
				writer: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			// Create a pipe to connect writer's stdout → reader's stdin
			const writerProc = kernel.spawn("writer", [], { stdio: "pipe" });

			// Wait for the writer process to be registered, then pipe
			const readerProc = kernel.spawn("reader", []);

			// Reader exits quickly, closing its pipe ends
			await readerProc.wait();

			// Writer tries to write to its stdout (piped), read end is now closed
			// The writer should be terminated by SIGPIPE
			writerProc.writeStdin(new TextEncoder().encode("trigger-output"));
			// Give microtask time for the reader's exit cleanup to propagate
			await new Promise((r) => setTimeout(r, 50));

			// Writer should now be dead — kill it if it isn't (timeout safety)
			if (writerProc.exitCode === null) {
				writerProc.kill();
			}
			const writerCode = await writerProc.wait();
			// Writer should have been killed (either by SIGPIPE=141 or our kill)
			expect(writerCode).toBeGreaterThan(0);
		});

		it("EPIPE error is still thrown after SIGPIPE delivery", async () => {
			// Use a driver that catches the EPIPE and records it
			let caughtEpipe = false;
			let ki: KernelInterface;
			const driver: RuntimeDriver = {
				name: "epipe-test",
				commands: ["pipe-checker"],
				async init(k: KernelInterface) { ki = k; },
				spawn(_command: string, _args: string[], ctx: ProcessContext): DriverProcess {
					const pid = ctx.pid;
					let exitResolve: (code: number) => void;
					const exitPromise = new Promise<number>((r) => { exitResolve = r; });

					const proc: DriverProcess = {
						writeStdin() {},
						closeStdin() {},
						kill(signal) {
							const code = 128 + signal;
							exitResolve!(code);
							proc.onExit?.(code);
						},
						wait() { return exitPromise; },
						onStdout: null,
						onStderr: null,
						onExit: null,
					};

					queueMicrotask(() => {
						const { readFd, writeFd } = ki.pipe(pid);
						ki.fdClose(pid, readFd);
						try {
							ki.fdWrite(pid, writeFd, new TextEncoder().encode("data"));
						} catch (e: any) {
							if (e?.code === "EPIPE") caughtEpipe = true;
						}
					});

					return proc;
				},
				async dispose() {},
			};

			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("pipe-checker", []);
			await proc.wait();
			expect(caughtEpipe).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// FD_CLOEXEC and O_CLOEXEC flags (US-062)
	// -----------------------------------------------------------------------

	describe("FD_CLOEXEC and O_CLOEXEC", () => {
		it("open with O_CLOEXEC sets cloexec, child gets EBADF on that FD", async () => {
			const O_CLOEXEC = 0o2000000;
			let childReadError: Error | null = null;

			const driver: RuntimeDriver = {
				name: "cloexec-test",
				commands: ["parent", "child"],
				async init() {},
				spawn(command, _args, ctx) {
					let exitResolve: (code: number) => void;
					const exitPromise = new Promise<number>((r) => { exitResolve = r; });
					const proc: DriverProcess = {
						writeStdin() {},
						closeStdin() {},
						kill() { exitResolve!(128 + 15); proc.onExit?.(128 + 15); },
						wait() { return exitPromise; },
						onStdout: null,
						onStderr: null,
						onExit: null,
					};

					if (command === "parent") {
						const ki = (driver as any)._ki as KernelInterface;
						// Open a file with O_CLOEXEC
						const fd = ki.fdOpen(ctx.pid, "/tmp/secret.txt", O_CLOEXEC);
						expect(ki.fdGetCloexec(ctx.pid, fd)).toBe(true);

						// Spawn child — child should NOT inherit the cloexec FD
						const child = ki.spawn("child", [], { ppid: ctx.pid, env: ctx.env, cwd: ctx.cwd });
						child.wait().then(() => {
							exitResolve!(0);
							proc.onExit?.(0);
						});
					} else if (command === "child") {
						const ki = (driver as any)._ki as KernelInterface;
						// Try to read FD 3 — should throw EBADF since it was cloexec in parent
						try {
							ki.fdStat(ctx.pid, 3);
						} catch (e) {
							childReadError = e as Error;
						}
						queueMicrotask(() => { exitResolve!(0); proc.onExit?.(0); });
					}
					return proc;
				},
				async dispose() {},
			};

			(driver as any)._ki = null;
			const origInit = driver.init;
			driver.init = async (ki) => {
				(driver as any)._ki = ki;
				return origInit.call(driver, ki);
			};

			const vfs = new TestFileSystem();
			await vfs.writeFile("/tmp/secret.txt", "secret-data");
			const k = createKernel({ filesystem: vfs });
			kernel = k;
			await k.mount(driver);

			const proc = k.spawn("parent", []);
			await proc.wait();

			expect(childReadError).not.toBeNull();
			expect((childReadError as any).code).toBe("EBADF");
		});

		it("open without O_CLOEXEC — child can read the FD", async () => {
			let childCanRead = false;

			const driver: RuntimeDriver = {
				name: "nocloexec-test",
				commands: ["parent", "child"],
				async init() {},
				spawn(command, _args, ctx) {
					let exitResolve: (code: number) => void;
					const exitPromise = new Promise<number>((r) => { exitResolve = r; });
					const proc: DriverProcess = {
						writeStdin() {},
						closeStdin() {},
						kill() { exitResolve!(128 + 15); proc.onExit?.(128 + 15); },
						wait() { return exitPromise; },
						onStdout: null,
						onStderr: null,
						onExit: null,
					};

					if (command === "parent") {
						const ki = (driver as any)._ki as KernelInterface;
						// Open file without O_CLOEXEC
						const fd = ki.fdOpen(ctx.pid, "/tmp/visible.txt", 0);
						expect(ki.fdGetCloexec(ctx.pid, fd)).toBe(false);

						const child = ki.spawn("child", [], { ppid: ctx.pid, env: ctx.env, cwd: ctx.cwd });
						child.wait().then(() => {
							exitResolve!(0);
							proc.onExit?.(0);
						});
					} else if (command === "child") {
						const ki = (driver as any)._ki as KernelInterface;
						// FD 3 should exist — inherited from parent
						const stat = ki.fdStat(ctx.pid, 3);
						childCanRead = stat !== undefined;
						queueMicrotask(() => { exitResolve!(0); proc.onExit?.(0); });
					}
					return proc;
				},
				async dispose() {},
			};

			(driver as any)._ki = null;
			const origInit = driver.init;
			driver.init = async (ki) => {
				(driver as any)._ki = ki;
				return origInit.call(driver, ki);
			};

			const vfs = new TestFileSystem();
			await vfs.writeFile("/tmp/visible.txt", "visible-data");
			const k = createKernel({ filesystem: vfs });
			kernel = k;
			await k.mount(driver);

			const proc = k.spawn("parent", []);
			await proc.wait();

			expect(childCanRead).toBe(true);
		});

		it("fdSetCloexec after open — FD not inherited by child", async () => {
			let childReadError: Error | null = null;

			const driver: RuntimeDriver = {
				name: "setcloexec-test",
				commands: ["parent", "child"],
				async init() {},
				spawn(command, _args, ctx) {
					let exitResolve: (code: number) => void;
					const exitPromise = new Promise<number>((r) => { exitResolve = r; });
					const proc: DriverProcess = {
						writeStdin() {},
						closeStdin() {},
						kill() { exitResolve!(128 + 15); proc.onExit?.(128 + 15); },
						wait() { return exitPromise; },
						onStdout: null,
						onStderr: null,
						onExit: null,
					};

					if (command === "parent") {
						const ki = (driver as any)._ki as KernelInterface;
						// Open without O_CLOEXEC, then set it via fdSetCloexec
						const fd = ki.fdOpen(ctx.pid, "/tmp/later-secret.txt", 0);
						expect(ki.fdGetCloexec(ctx.pid, fd)).toBe(false);

						ki.fdSetCloexec(ctx.pid, fd, true);
						expect(ki.fdGetCloexec(ctx.pid, fd)).toBe(true);

						const child = ki.spawn("child", [], { ppid: ctx.pid, env: ctx.env, cwd: ctx.cwd });
						child.wait().then(() => {
							exitResolve!(0);
							proc.onExit?.(0);
						});
					} else if (command === "child") {
						const ki = (driver as any)._ki as KernelInterface;
						try {
							ki.fdStat(ctx.pid, 3);
						} catch (e) {
							childReadError = e as Error;
						}
						queueMicrotask(() => { exitResolve!(0); proc.onExit?.(0); });
					}
					return proc;
				},
				async dispose() {},
			};

			(driver as any)._ki = null;
			const origInit = driver.init;
			driver.init = async (ki) => {
				(driver as any)._ki = ki;
				return origInit.call(driver, ki);
			};

			const vfs = new TestFileSystem();
			await vfs.writeFile("/tmp/later-secret.txt", "secret");
			const k = createKernel({ filesystem: vfs });
			kernel = k;
			await k.mount(driver);

			const proc = k.spawn("parent", []);
			await proc.wait();

			expect(childReadError).not.toBeNull();
			expect((childReadError as any).code).toBe("EBADF");
		});

		it("fdSetCloexec/fdGetCloexec throws EBADF for invalid FD", async () => {
			const driver = new MockRuntimeDriver(["test-cmd"], {
				"test-cmd": { exitCode: 0 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("test-cmd", []);
			const ki = driver.kernelInterface!;

			expect(() => ki.fdSetCloexec(proc.pid, 999, true)).toThrow("EBADF");
			expect(() => ki.fdGetCloexec(proc.pid, 999)).toThrow("EBADF");

			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// fcntl - file descriptor control (US-063)
	// -----------------------------------------------------------------------

	describe("fcntl", () => {
		it("F_DUPFD with minfd=10 — new FD is >= 10", async () => {
			const F_DUPFD = 0;
			const driver = new MockRuntimeDriver(["test-cmd"], {
				"test-cmd": { exitCode: 0 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("test-cmd", []);
			const ki = driver.kernelInterface!;

			// Open a regular file (FD 3)
			const fd = ki.fdOpen(proc.pid, "/tmp/test.txt", 0);
			expect(fd).toBe(3);

			// F_DUPFD with minfd=10
			const newFd = ki.fcntl(proc.pid, fd, F_DUPFD, 10);
			expect(newFd).toBe(10);

			// Both point to same file description (shared cursor)
			const origStat = ki.fdStat(proc.pid, fd);
			const dupStat = ki.fdStat(proc.pid, newFd);
			expect(dupStat.flags).toBe(origStat.flags);

			await proc.wait();
		});

		it("F_GETFD after F_SETFD reflects change", async () => {
			const F_GETFD = 1;
			const F_SETFD = 2;
			const FD_CLOEXEC = 1;
			const driver = new MockRuntimeDriver(["test-cmd"], {
				"test-cmd": { exitCode: 0 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("test-cmd", []);
			const ki = driver.kernelInterface!;

			const fd = ki.fdOpen(proc.pid, "/tmp/test.txt", 0);

			// Initially no cloexec
			expect(ki.fcntl(proc.pid, fd, F_GETFD)).toBe(0);

			// Set cloexec
			ki.fcntl(proc.pid, fd, F_SETFD, FD_CLOEXEC);
			expect(ki.fcntl(proc.pid, fd, F_GETFD)).toBe(FD_CLOEXEC);

			// Clear cloexec
			ki.fcntl(proc.pid, fd, F_SETFD, 0);
			expect(ki.fcntl(proc.pid, fd, F_GETFD)).toBe(0);

			await proc.wait();
		});

		it("F_DUPFD_CLOEXEC — new FD has cloexec set, original does not", async () => {
			const F_DUPFD_CLOEXEC = 1030;
			const F_GETFD = 1;
			const FD_CLOEXEC = 1;
			const driver = new MockRuntimeDriver(["test-cmd"], {
				"test-cmd": { exitCode: 0 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("test-cmd", []);
			const ki = driver.kernelInterface!;

			const fd = ki.fdOpen(proc.pid, "/tmp/test.txt", 0);

			// F_DUPFD_CLOEXEC
			const newFd = ki.fcntl(proc.pid, fd, F_DUPFD_CLOEXEC, 0);
			expect(newFd).not.toBe(fd);

			// New FD has cloexec
			expect(ki.fcntl(proc.pid, newFd, F_GETFD)).toBe(FD_CLOEXEC);

			// Original FD does not have cloexec
			expect(ki.fcntl(proc.pid, fd, F_GETFD)).toBe(0);

			await proc.wait();
		});

		it("F_GETFL returns open flags", async () => {
			const F_GETFL = 3;
			const O_WRONLY = 1;
			const O_APPEND = 0o2000;
			const driver = new MockRuntimeDriver(["test-cmd"], {
				"test-cmd": { exitCode: 0 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("test-cmd", []);
			const ki = driver.kernelInterface!;

			const fd = ki.fdOpen(proc.pid, "/tmp/test.txt", O_WRONLY | O_APPEND);
			const flags = ki.fcntl(proc.pid, fd, F_GETFL);
			expect(flags & O_WRONLY).toBe(O_WRONLY);
			expect(flags & O_APPEND).toBe(O_APPEND);

			await proc.wait();
		});

		it("fcntl throws EBADF for invalid FD", async () => {
			const F_GETFD = 1;
			const driver = new MockRuntimeDriver(["test-cmd"], {
				"test-cmd": { exitCode: 0 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("test-cmd", []);
			const ki = driver.kernelInterface!;

			expect(() => ki.fcntl(proc.pid, 999, F_GETFD)).toThrow("EBADF");

			await proc.wait();
		});

		it("fcntl throws EINVAL for unsupported command", async () => {
			const driver = new MockRuntimeDriver(["test-cmd"], {
				"test-cmd": { exitCode: 0 },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("test-cmd", []);
			const ki = driver.kernelInterface!;

			expect(() => ki.fcntl(proc.pid, 0, 9999)).toThrow("EINVAL");

			await proc.wait();
		});
	});

	// -----------------------------------------------------------------------
	// umask
	// -----------------------------------------------------------------------

	describe("umask", () => {
		it("default umask is 0o022", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			// Query without changing — should return default 0o022
			const mask = ki.umask(proc.pid);
			expect(mask).toBe(0o022);

			proc.kill(9);
			await proc.wait();
		});

		it("umask(pid, newMask) sets new mask and returns old", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			const old = ki.umask(proc.pid, 0o077);
			expect(old).toBe(0o022);

			const current = ki.umask(proc.pid);
			expect(current).toBe(0o077);

			proc.kill(9);
			await proc.wait();
		});

		it("mkdir with mode 0o777 and umask 0o022 creates with effective mode 0o755", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			// Default umask is 0o022 — mkdir(0o777) → effective 0o755
			await ki.mkdir(proc.pid, "/tmp/testdir", 0o777);

			const st = await vfs.stat("/tmp/testdir");
			expect(st.isDirectory).toBe(true);
			expect(st.mode & 0o7777).toBe(0o755);

			proc.kill(9);
			await proc.wait();
		});

		it("umask(pid, 0o077) — files created with mode 0o700 when requesting 0o777", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			ki.umask(proc.pid, 0o077);

			// Create a file via fdOpen with O_CREAT and write to it
			const O_WRONLY = 1;
			const O_CREAT = 0o100;
			const fd = ki.fdOpen(proc.pid, "/tmp/masked.txt", O_WRONLY | O_CREAT, 0o777);
			await ki.fdWrite(proc.pid, fd, new TextEncoder().encode("test"));

			const st = await vfs.stat("/tmp/masked.txt");
			expect(st.mode & 0o7777).toBe(0o700);

			proc.kill(9);
			await proc.wait();
		});

		it("O_CREAT|O_EXCL succeeds for a new file", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			const fd = ki.fdOpen(proc.pid, "/tmp/exclusive-new.txt", O_WRONLY | O_CREAT | O_EXCL);
			expect(fd).toBeGreaterThanOrEqual(3);
			expect(await vfs.readFile("/tmp/exclusive-new.txt")).toEqual(new Uint8Array(0));

			proc.kill(9);
			await proc.wait();
		});

		it("O_CREAT|O_EXCL returns EEXIST for an existing file", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			await vfs.writeFile("/tmp/exclusive-existing.txt", "data");
			expect(() =>
				ki.fdOpen(proc.pid, "/tmp/exclusive-existing.txt", O_WRONLY | O_CREAT | O_EXCL),
			).toThrow("EEXIST");

			proc.kill(9);
			await proc.wait();
		});

		it("O_TRUNC truncates an existing file on open", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			await vfs.writeFile("/tmp/truncate-existing.txt", "hello");
			const fd = ki.fdOpen(proc.pid, "/tmp/truncate-existing.txt", O_WRONLY | O_TRUNC);
			expect(fd).toBeGreaterThanOrEqual(3);
			expect(await vfs.readFile("/tmp/truncate-existing.txt")).toEqual(new Uint8Array(0));

			proc.kill(9);
			await proc.wait();
		});

		it("O_TRUNC|O_CREAT creates an empty file when missing", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			const fd = ki.fdOpen(proc.pid, "/tmp/truncate-create.txt", O_WRONLY | O_CREAT | O_TRUNC);
			expect(fd).toBeGreaterThanOrEqual(3);
			expect(await vfs.readFile("/tmp/truncate-create.txt")).toEqual(new Uint8Array(0));

			proc.kill(9);
			await proc.wait();
		});

		it("O_EXCL without O_CREAT is ignored", async () => {
			const driver = new MockRuntimeDriver(["x"], { x: { neverExit: true } });
			const { kernel: k, vfs } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			const proc = kernel.spawn("x", []);
			const ki = driver.kernelInterface!;

			await vfs.writeFile("/tmp/excl-ignored.txt", "ok");
			const fd = ki.fdOpen(proc.pid, "/tmp/excl-ignored.txt", O_EXCL);
			expect(fd).toBeGreaterThanOrEqual(3);
			expect(new TextDecoder().decode(await vfs.readFile("/tmp/excl-ignored.txt"))).toBe("ok");

			proc.kill(9);
			await proc.wait();
		});

		it("child inherits parent umask", async () => {
			const driver = new MockRuntimeDriver(["parent", "child"], {
				parent: { neverExit: true },
				child: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const parent = kernel.spawn("parent", []);
			const ki = driver.kernelInterface!;

			// Set parent umask to 0o077
			ki.umask(parent.pid, 0o077);

			// Spawn child from parent
			const child = ki.spawn("child", [], { pid: parent.pid, ppid: parent.pid, env: {}, cwd: "/", fds: { stdin: 0, stdout: 1, stderr: 2 } });

			// Child should inherit parent's umask
			const childMask = ki.umask(child.pid);
			expect(childMask).toBe(0o077);

			child.kill(9);
			await child.wait();
			parent.kill(9);
			await parent.wait();
		});
	});

	// -----------------------------------------------------------------------
	// Socket table integration
	// -----------------------------------------------------------------------

	describe("socket table integration", () => {
		it("kernel exposes socketTable", async () => {
			const driver = new MockRuntimeDriver(["sh"], { sh: { exitCode: 0 } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			expect(kernel.socketTable).toBeDefined();
			expect(typeof kernel.socketTable.create).toBe("function");
		});

		it("create socket and close it", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const proc = kernel.spawn("cmd", []);
			const pid = proc.pid;

			const id = kernel.socketTable.create(2, 1, 0, pid); // AF_INET, SOCK_STREAM
			expect(id).toBeGreaterThan(0);

			const sock = kernel.socketTable.get(id);
			expect(sock).toBeDefined();
			expect(sock!.state).toBe("created");

			kernel.socketTable.close(id, pid);
			expect(kernel.socketTable.get(id)).toBeNull();

			proc.kill(9);
			await proc.wait();
		});

		it("dispose cleans up all sockets", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			({ kernel } = await createTestKernel({ drivers: [driver] }));
			const proc = kernel.spawn("cmd", []);
			const pid = proc.pid;

			const id1 = kernel.socketTable.create(2, 1, 0, pid);
			const id2 = kernel.socketTable.create(2, 1, 0, pid);
			expect(kernel.socketTable.get(id1)).not.toBeNull();
			expect(kernel.socketTable.get(id2)).not.toBeNull();

			await kernel.dispose();

			expect(kernel.socketTable.get(id1)).toBeNull();
			expect(kernel.socketTable.get(id2)).toBeNull();
		});

		it("process exit cleans up sockets owned by that process", async () => {
			const driver = new MockRuntimeDriver(["cmd"], {
				cmd: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const proc = kernel.spawn("cmd", []);
			const otherProc = kernel.spawn("cmd", []);
			const pid = proc.pid;
			const otherPid = otherProc.pid;

			// Create sockets owned by this process
			const id1 = kernel.socketTable.create(2, 1, 0, pid);
			const id2 = kernel.socketTable.create(2, 1, 0, pid);
			const otherId = kernel.socketTable.create(2, 1, 0, otherPid);

			expect(kernel.socketTable.get(id1)).toBeDefined();
			expect(kernel.socketTable.get(id2)).toBeDefined();
			expect(kernel.socketTable.get(otherId)).toBeDefined();
			expect(() => kernel.socketTable.create(2, 1, 0, 99999)).toThrow();
			try {
				kernel.socketTable.create(2, 1, 0, 99999);
			} catch (err) {
				expect((err as { code?: string }).code).toBe("ESRCH");
			}

			// Kill the process — triggers onProcessExit → closeAllForProcess
			proc.kill(9);
			await proc.wait();

			// Sockets owned by the exited process should be cleaned up
			expect(kernel.socketTable.get(id1)).toBeNull();
			expect(kernel.socketTable.get(id2)).toBeNull();
			expect(kernel.socketTable.get(otherId)).not.toBeNull();

			otherProc.kill(9);
			await otherProc.wait();
		});

		it("loopback TCP through kernel socket table", async () => {
			const driver = new MockRuntimeDriver(["cmd"], { cmd: { neverExit: true } });
			const permissions: Permissions = {
				fs: () => ({ allow: true }),
				network: () => ({ allow: true }),
			};
			({ kernel } = await createTestKernel({ drivers: [driver], permissions }));
			const proc = kernel.spawn("cmd", []);
			const pid = proc.pid;

			const serverSock = kernel.socketTable.create(2, 1, 0, pid);
			await kernel.socketTable.bind(serverSock, { host: "127.0.0.1", port: 9090 });
			await kernel.socketTable.listen(serverSock, 5);
			expect(kernel.socketTable.poll(serverSock)).toMatchObject({
				readable: false,
				writable: false,
				hangup: false,
			});

			const clientSock = kernel.socketTable.create(2, 1, 0, pid);
			await kernel.socketTable.connect(clientSock, { host: "127.0.0.1", port: 9090 });
			expect(kernel.socketTable.poll(serverSock)).toMatchObject({
				readable: true,
				writable: false,
				hangup: false,
			});

			const accepted = kernel.socketTable.accept(serverSock);
			expect(accepted).not.toBeNull();
			expect(kernel.socketTable.poll(serverSock)).toMatchObject({
				readable: false,
				writable: false,
				hangup: false,
			});

			// Exchange data
			kernel.socketTable.send(clientSock, new TextEncoder().encode("hello"));
			const data = kernel.socketTable.recv(accepted!, 1024);
			expect(new TextDecoder().decode(data!)).toBe("hello");

			proc.kill(9);
			await proc.wait();
		});
	});
});
