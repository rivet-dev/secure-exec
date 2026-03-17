import { describe, it, expect, afterEach } from "vitest";
import {
	TestFileSystem,
	MockRuntimeDriver,
	createTestKernel,
	type MockCommandConfig,
} from "./helpers.js";
import type { Kernel, Permissions } from "../src/types.js";
import { FILETYPE_PIPE, FILETYPE_CHARACTER_DEVICE } from "../src/types.js";
import { filterEnv } from "../src/permissions.js";

describe("kernel + MockRuntimeDriver integration", () => {
	let kernel: Kernel;

	afterEach(async () => {
		await kernel?.dispose();
	});

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
			expect(() => ki.kill(9999, 15)).toThrow("ESRCH");
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
			const fd = ki.fdOpen(proc.pid, "/tmp/test", 0x201); // O_CREAT | O_WRONLY
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
		it("dispose kernel after process exit → no pending zombie timers fire", async () => {
			const driver = new MockRuntimeDriver(["short-lived"], {
				"short-lived": { exitCode: 0 },
			});
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;
			const ki = driver.kernelInterface!;

			// Spawn process and let it exit (becomes zombie with 60s cleanup timer)
			const proc = kernel.spawn("short-lived", []);
			await proc.wait();

			// Process should still be in the process table as a zombie
			// (60s cleanup timer hasn't fired yet)
			expect(kernel.processes.get(proc.pid)?.status).toBe("exited");

			// Immediately dispose kernel — should clear the pending timer
			await kernel.dispose();

			// If timers weren't cleared, they'd fire 60s later referencing
			// disposed state. The test passes if no timer warnings/errors occur.
			// We verify by checking dispose completes cleanly (no throw).
		});

		it("dispose kernel with multiple zombie processes → all timers cleared", async () => {
			const N = 10;
			const commands = Array.from({ length: N }, (_, i) => `zombie-${i}`);
			const configs: Record<string, MockCommandConfig> = {};
			for (const cmd of commands) configs[cmd] = { exitCode: 0 };

			const driver = new MockRuntimeDriver(commands, configs);
			const { kernel: k } = await createTestKernel({ drivers: [driver] });
			kernel = k;

			// Spawn all processes and let them exit (each gets a 60s zombie timer)
			const procs = commands.map((cmd) => kernel.spawn(cmd, []));
			await Promise.all(procs.map((p) => p.wait()));

			// All should be in zombie state
			for (const proc of procs) {
				expect(kernel.processes.get(proc.pid)?.status).toBe("exited");
			}

			// Dispose should clear all 10 pending timers
			await kernel.dispose();
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

		it("write to slave → read from master", async () => {
			const driver = new MockRuntimeDriver(["proc"], {
				proc: { neverExit: true },
			});
			({ kernel } = await createTestKernel({ drivers: [driver] }));

			const ki = driver.kernelInterface!;
			const proc = kernel.spawn("proc", []);
			const { masterFd, slaveFd } = ki.openpty(proc.pid);

			const msg = new TextEncoder().encode("hello\n");
			ki.fdWrite(proc.pid, slaveFd, msg);

			const data = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(new TextDecoder().decode(data)).toBe("hello\n");

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

			// Master reads back echoed chars ('h', 'i', '\n')
			const echoData = await ki.fdRead(proc.pid, masterFd, 1024);
			expect(new TextDecoder().decode(echoData)).toBe("hi\n");

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

			// ^C should generate SIGINT but shell survives
			shell.write("\x03");

			await new Promise((r) => setTimeout(r, 10));

			// SIGINT delivered to foreground process group
			expect(killSignals).toContain(2);

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
	});
});
