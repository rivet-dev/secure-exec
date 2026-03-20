/**
 * Resource exhaustion and unbounded buffering tests.
 *
 * Verifies that the kernel enforces bounded buffers and FD limits
 * to prevent host memory buildup from sandboxed code.
 */

import { describe, it, expect } from "vitest";
import { PipeManager, MAX_PIPE_BUFFER_BYTES } from "../src/pipe-manager.js";
import { ProcessFDTable, FDTableManager, MAX_FDS_PER_PROCESS, type DescriptionAllocator } from "../src/fd-table.js";
import { PtyManager, MAX_PTY_BUFFER_BYTES, MAX_CANON } from "../src/pty.js";
import { KernelError } from "../src/types.js";

let _testDescId = 1;
const testAllocDesc: DescriptionAllocator = (path, flags) => ({
	id: _testDescId++,
	path,
	cursor: 0n,
	flags,
	refCount: 1,
});

describe("pipe buffer limit", () => {
	it("rejects writes that exceed MAX_PIPE_BUFFER_BYTES when no reader", () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		// Fill the buffer up to the limit
		const chunk = new Uint8Array(MAX_PIPE_BUFFER_BYTES);
		manager.write(write.description.id, chunk);

		// Next write should fail with EAGAIN
		const extra = new Uint8Array(1);
		expect(() => manager.write(write.description.id, extra)).toThrowError(
			expect.objectContaining({ code: "EAGAIN" }),
		);

		// Keep reference alive to prevent cleanup
		expect(manager.isPipe(read.description.id)).toBe(true);
	});

	it("allows writes when a reader drains the buffer", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		// Fill buffer
		const chunk = new Uint8Array(MAX_PIPE_BUFFER_BYTES);
		manager.write(write.description.id, chunk);

		// Drain the buffer
		await manager.read(read.description.id, MAX_PIPE_BUFFER_BYTES);

		// Write should succeed again
		expect(() =>
			manager.write(write.description.id, new Uint8Array(1024)),
		).not.toThrow();
	});

	it("delivers directly to waiting reader without buffering (no limit hit)", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		// Start a read (blocks waiting for data)
		const readPromise = manager.read(read.description.id, MAX_PIPE_BUFFER_BYTES + 1024);

		// Write large data — delivered directly to waiter, not buffered
		const bigChunk = new Uint8Array(MAX_PIPE_BUFFER_BYTES + 1024);
		expect(() => manager.write(write.description.id, bigChunk)).not.toThrow();

		const result = await readPromise;
		expect(result!.length).toBe(MAX_PIPE_BUFFER_BYTES + 1024);
	});
});

describe("FD exhaustion", () => {
	it("throws EMFILE when per-process FD limit is reached", () => {
		const table = new ProcessFDTable(testAllocDesc);

		// Open FDs up to the limit (3 stdio FDs are not pre-allocated unless initStdio is called)
		const opened: number[] = [];
		for (let i = 0; i < MAX_FDS_PER_PROCESS; i++) {
			opened.push(table.open(`/tmp/file-${i}`, 0));
		}
		expect(opened.length).toBe(MAX_FDS_PER_PROCESS);

		// Next open should fail
		expect(() => table.open("/tmp/overflow", 0)).toThrowError(
			expect.objectContaining({ code: "EMFILE" }),
		);
	});

	it("allows new FDs after closing old ones", () => {
		const table = new ProcessFDTable(testAllocDesc);

		// Fill to limit, keep track of first FD
		let firstFd = -1;
		for (let i = 0; i < MAX_FDS_PER_PROCESS; i++) {
			const fd = table.open(`/tmp/file-${i}`, 0);
			if (i === 0) firstFd = fd;
		}

		// Close one
		table.close(firstFd);

		// Should be able to open one more
		expect(() => table.open("/tmp/reclaimed", 0)).not.toThrow();
	});

	it("dup counts toward FD limit", () => {
		const table = new ProcessFDTable(testAllocDesc);

		// Fill to limit - 1, then open one
		for (let i = 0; i < MAX_FDS_PER_PROCESS - 1; i++) {
			table.open(`/tmp/file-${i}`, 0);
		}
		const lastFd = table.open("/tmp/last", 0);

		// dup should fail (already at limit)
		expect(() => table.dup(lastFd)).toThrowError(
			expect.objectContaining({ code: "EMFILE" }),
		);
	});
});

describe("PTY buffer limit", () => {
	it("rejects slave writes that exceed MAX_PTY_BUFFER_BYTES when master does not read", () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// Fill output buffer (slave write → master read direction)
		const chunk = new Uint8Array(MAX_PTY_BUFFER_BYTES);
		manager.write(slave.description.id, chunk);

		// Next write should fail
		expect(() =>
			manager.write(slave.description.id, new Uint8Array(1)),
		).toThrowError(expect.objectContaining({ code: "EAGAIN" }));

		// Keep references alive
		expect(manager.isPty(master.description.id)).toBe(true);
	});

	it("rejects master writes that exceed MAX_PTY_BUFFER_BYTES when slave does not read", () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// Disable line discipline for raw pass-through
		manager.setDiscipline(master.description.id, {
			canonical: false,
			echo: false,
			isig: false,
		});

		// Fill input buffer (master write → slave read direction)
		const chunk = new Uint8Array(MAX_PTY_BUFFER_BYTES);
		manager.write(master.description.id, chunk);

		// Next write should fail
		expect(() =>
			manager.write(master.description.id, new Uint8Array(1)),
		).toThrowError(expect.objectContaining({ code: "EAGAIN" }));

		// Keep references alive
		expect(manager.isPty(slave.description.id)).toBe(true);
	});

	it("allows writes after draining", async () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// Fill output buffer
		const chunk = new Uint8Array(MAX_PTY_BUFFER_BYTES);
		manager.write(slave.description.id, chunk);

		// Drain via master read
		await manager.read(master.description.id, MAX_PTY_BUFFER_BYTES);

		// Write should succeed again
		expect(() =>
			manager.write(slave.description.id, new Uint8Array(1024)),
		).not.toThrow();
	});

	it("echo throws EAGAIN when output buffer is full", async () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// Echo is on by default (canonical + echo). Fill output buffer via slave write.
		const chunk = new Uint8Array(MAX_PTY_BUFFER_BYTES);
		manager.write(slave.description.id, chunk);

		// Master write with echo enabled — echo can't fit in full output buffer → EAGAIN
		expect(() =>
			manager.write(master.description.id, new Uint8Array([0x41])), // 'A'
		).toThrowError(expect.objectContaining({ code: "EAGAIN" }));

		// Drain master (output buffer) and verify echo resumes
		await manager.read(master.description.id, MAX_PTY_BUFFER_BYTES);

		// Now echo should work — write input, read echo back from master
		manager.write(master.description.id, new Uint8Array([0x42])); // 'B'
		const echo = await manager.read(master.description.id, 1);
		expect(echo[0]).toBe(0x42);
	});
});

describe("PTY adversarial stress", () => {
	it("rapid sequential writes (100+ chunks) with no slave reader — EAGAIN and bounded memory", () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// Raw mode so writes go directly to input buffer
		manager.setDiscipline(master.description.id, {
			canonical: false,
			echo: false,
			isig: false,
		});

		// Write 1KB chunks until EAGAIN
		const chunk = new Uint8Array(1024);
		let writtenChunks = 0;
		let hitEagain = false;

		for (let i = 0; i < 200; i++) {
			try {
				manager.write(master.description.id, chunk);
				writtenChunks++;
			} catch (err) {
				expect(err).toBeInstanceOf(KernelError);
				expect((err as KernelError).code).toBe("EAGAIN");
				hitEagain = true;
				break;
			}
		}

		// Must have hit EAGAIN before writing all 200 chunks
		expect(hitEagain).toBe(true);
		// Written bytes must be bounded by MAX_PTY_BUFFER_BYTES
		expect(writtenChunks * 1024).toBeLessThanOrEqual(MAX_PTY_BUFFER_BYTES);

		// Keep references alive
		expect(manager.isPty(slave.description.id)).toBe(true);
	});

	it("single large write (1MB+) — immediate EAGAIN, no partial buffering", () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// Raw mode for direct pass-through
		manager.setDiscipline(master.description.id, {
			canonical: false,
			echo: false,
			isig: false,
		});

		// 1MB write should fail immediately (buffer limit is 64KB)
		const megabyte = new Uint8Array(1024 * 1024);
		expect(() => manager.write(master.description.id, megabyte)).toThrowError(
			expect.objectContaining({ code: "EAGAIN" }),
		);

		// Verify no partial data was buffered — slave read should block (no data available)
		let readResolved = false;
		const readPromise = manager.read(slave.description.id, 1).then(() => {
			readResolved = true;
		});

		// After a microtask, read should still be pending (nothing was buffered)
		return Promise.resolve().then(() => {
			expect(readResolved).toBe(false);
			// Clean up: close master so pending read resolves with null
			manager.close(master.description.id);
			return readPromise;
		});
	});

	it("single large slave write (1MB+) — immediate EAGAIN, no partial buffering", () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// 1MB slave write should fail immediately
		const megabyte = new Uint8Array(1024 * 1024);
		expect(() => manager.write(slave.description.id, megabyte)).toThrowError(
			expect.objectContaining({ code: "EAGAIN" }),
		);

		// Verify no partial data in output buffer — master read should block
		let readResolved = false;
		const readPromise = manager.read(master.description.id, 1).then(() => {
			readResolved = true;
		});

		return Promise.resolve().then(() => {
			expect(readResolved).toBe(false);
			manager.close(slave.description.id);
			return readPromise;
		});
	});

	it("multiple PTY pairs simultaneously filled — isolation between pairs", () => {
		const manager = new PtyManager();
		const pairs = Array.from({ length: 5 }, () => manager.createPty());

		// Set all to raw mode
		for (const { master } of pairs) {
			manager.setDiscipline(master.description.id, {
				canonical: false,
				echo: false,
				isig: false,
			});
		}

		// Fill each pair's input buffer to the limit
		const chunk = new Uint8Array(MAX_PTY_BUFFER_BYTES);
		for (const { master } of pairs) {
			manager.write(master.description.id, chunk);
		}

		// Each pair should independently reject the next write
		for (const { master } of pairs) {
			expect(() =>
				manager.write(master.description.id, new Uint8Array(1)),
			).toThrowError(expect.objectContaining({ code: "EAGAIN" }));
		}

		// Drain one pair — the rest should remain full
		const drainIdx = 2;
		manager.read(pairs[drainIdx].slave.description.id, MAX_PTY_BUFFER_BYTES);

		// Drained pair should accept writes again
		expect(() =>
			manager.write(pairs[drainIdx].master.description.id, new Uint8Array(1024)),
		).not.toThrow();

		// Other pairs should still reject
		for (let i = 0; i < pairs.length; i++) {
			if (i === drainIdx) continue;
			expect(() =>
				manager.write(pairs[i].master.description.id, new Uint8Array(1)),
			).toThrowError(expect.objectContaining({ code: "EAGAIN" }));
		}
	});

	it("canonical mode line buffer under sustained input without newline — bounded at MAX_CANON", () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// Default canonical + echo mode. Disable echo to isolate input buffering.
		manager.setDiscipline(master.description.id, {
			canonical: true,
			echo: false,
			isig: false,
		});

		// Write 2× MAX_CANON bytes without newline — excess should be silently dropped
		const oversizedInput = new Uint8Array(MAX_CANON * 2).fill(0x41); // 'A'
		manager.write(master.description.id, oversizedInput);

		// No data delivered to slave yet (canonical mode waits for newline)
		let readResolved = false;
		const readPromise = manager.read(slave.description.id, MAX_CANON * 2).then((data) => {
			readResolved = true;
			return data;
		});

		return Promise.resolve().then(async () => {
			expect(readResolved).toBe(false);

			// Send newline to flush the line buffer
			manager.write(master.description.id, new Uint8Array([0x0a]));

			const data = await readPromise;
			// Line buffer capped at MAX_CANON, plus the newline byte
			expect(data!.length).toBe(MAX_CANON + 1);
			// All buffered bytes should be 'A' (capped) + newline
			expect(data![0]).toBe(0x41);
			expect(data![MAX_CANON]).toBe(0x0a);
		});
	});

	it("canonical mode with echo — sustained input stays bounded despite echo output", async () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		// Canonical + echo, no signals
		manager.setDiscipline(master.description.id, {
			canonical: true,
			echo: true,
			isig: false,
		});

		// Start a master reader to drain echo output (prevent echo backpressure)
		const echoChunks: Uint8Array[] = [];
		const drainEcho = async () => {
			try {
				while (true) {
					const data = await manager.read(master.description.id, 4096);
					if (data === null) break;
					echoChunks.push(data);
				}
			} catch {
				// EBADF after close — drain is done
			}
		};
		const echoDrain = drainEcho();

		// Write MAX_CANON + 1000 bytes without newline — excess silently dropped
		const input = new Uint8Array(MAX_CANON + 1000).fill(0x42); // 'B'
		manager.write(master.description.id, input);

		// Flush with newline and read from slave
		manager.write(master.description.id, new Uint8Array([0x0a]));

		const data = await manager.read(slave.description.id, MAX_CANON * 2);
		// Line capped at MAX_CANON + newline
		expect(data!.length).toBe(MAX_CANON + 1);

		// Echo output should be at most MAX_CANON bytes of chars + CR+LF for newline
		manager.close(slave.description.id);
		manager.close(master.description.id);
		await echoDrain;
		const totalEcho = echoChunks.reduce((sum, c) => sum + c.length, 0);
		expect(totalEcho).toBeLessThanOrEqual(MAX_CANON + 2); // chars + CR+LF
	});

	it("rapid sequential slave writes (100+ chunks) with no master reader — EAGAIN and bounded memory", () => {
		const manager = new PtyManager();
		const { master, slave } = manager.createPty();

		const chunk = new Uint8Array(1024);
		let writtenChunks = 0;
		let hitEagain = false;

		for (let i = 0; i < 200; i++) {
			try {
				manager.write(slave.description.id, chunk);
				writtenChunks++;
			} catch (err) {
				expect(err).toBeInstanceOf(KernelError);
				expect((err as KernelError).code).toBe("EAGAIN");
				hitEagain = true;
				break;
			}
		}

		expect(hitEagain).toBe(true);
		expect(writtenChunks * 1024).toBeLessThanOrEqual(MAX_PTY_BUFFER_BYTES);

		expect(manager.isPty(master.description.id)).toBe(true);
	});
});

describe("PTY signal callback error handling", () => {
	it("onSignal throw does not crash PTY — subsequent operations still work", async () => {
		const throwingSignalHandler = () => {
			throw new Error("signal handler exploded");
		};
		const manager = new PtyManager(throwingSignalHandler);
		const { master, slave } = manager.createPty();

		// Configure canonical + echo + isig (defaults), set foreground pgid
		manager.setForegroundPgid(master.description.id, 42);

		// Send ^C (0x03) — triggers onSignal which throws, should be caught internally
		expect(() =>
			manager.write(master.description.id, new Uint8Array([0x03])),
		).not.toThrow();

		// PTY still functional — write and read through it
		manager.write(master.description.id, new Uint8Array([0x41, 0x0a])); // 'A\n'
		const echo = await manager.read(master.description.id, 1024);
		expect(echo).toContain(0x41); // 'A' echoed back

		const input = await manager.read(slave.description.id, 1024);
		expect(input).toContain(0x41); // 'A' delivered to slave
	});

	it("after failed signal delivery, echo and line discipline continue", async () => {
		const throwingSignalHandler = () => {
			throw new Error("boom");
		};
		const manager = new PtyManager(throwingSignalHandler);
		const { master, slave } = manager.createPty();

		manager.setForegroundPgid(master.description.id, 99);

		// Send multiple ^C characters — each should be caught, not accumulate errors
		const sigBytes = new Uint8Array([0x03, 0x03, 0x03]);
		expect(() => manager.write(master.description.id, sigBytes)).not.toThrow();

		// Echo still works — write 'B' + newline
		manager.write(master.description.id, new Uint8Array([0x42, 0x0a])); // 'B\n'
		const echo = await manager.read(master.description.id, 1024);
		expect(echo).toContain(0x42);

		// Read from slave — data delivered correctly
		const data = await manager.read(slave.description.id, 1024);
		expect(data).toContain(0x42);
	});
});

describe("ID counter isolation", () => {
	it("100 FD descriptions, 100 pipes, 100 PTYs — all IDs unique, no range overlap", () => {
		const fdManager = new FDTableManager();
		const pipeManager = new PipeManager();
		const ptyManager = new PtyManager();

		const allIds = new Set<number>();

		// Create 100 FD descriptions via fdManager.create (3 stdio descs each)
		const fdDescIds: number[] = [];
		for (let i = 0; i < 100; i++) {
			const table = fdManager.create(i + 1);
			for (const entry of table) {
				fdDescIds.push(entry.description.id);
				allIds.add(entry.description.id);
			}
		}

		// Create 100 pipes (2 description IDs each)
		const pipeDescIds: number[] = [];
		for (let i = 0; i < 100; i++) {
			const { read, write } = pipeManager.createPipe();
			pipeDescIds.push(read.description.id);
			pipeDescIds.push(write.description.id);
			allIds.add(read.description.id);
			allIds.add(write.description.id);
		}

		// Create 100 PTYs (2 description IDs each)
		const ptyDescIds: number[] = [];
		for (let i = 0; i < 100; i++) {
			const { master, slave } = ptyManager.createPty();
			ptyDescIds.push(master.description.id);
			ptyDescIds.push(slave.description.id);
			allIds.add(master.description.id);
			allIds.add(slave.description.id);
		}

		// Total unique IDs should equal sum of all IDs collected
		const totalCollected = fdDescIds.length + pipeDescIds.length + ptyDescIds.length;
		expect(allIds.size).toBe(totalCollected);

		// Verify range separation: FD desc < 100_000, pipe desc >= 100_000 < 200_000, PTY desc >= 200_000
		for (const id of fdDescIds) {
			expect(id).toBeLessThan(100_000);
		}
		for (const id of pipeDescIds) {
			expect(id).toBeGreaterThanOrEqual(100_000);
			expect(id).toBeLessThan(200_000);
		}
		for (const id of ptyDescIds) {
			expect(id).toBeGreaterThanOrEqual(200_000);
		}
	});

	it("isPipe and isPty return false for FD description IDs and vice versa", () => {
		const fdManager = new FDTableManager();
		const pipeManager = new PipeManager();
		const ptyManager = new PtyManager();

		// Create some of each
		const table = fdManager.create(1);
		const fdDescIds: number[] = [];
		for (const entry of table) {
			fdDescIds.push(entry.description.id);
		}

		const { read, write } = pipeManager.createPipe();
		const pipeDescIds = [read.description.id, write.description.id];

		const { master, slave } = ptyManager.createPty();
		const ptyDescIds = [master.description.id, slave.description.id];

		// FD description IDs should not be pipes or PTYs
		for (const id of fdDescIds) {
			expect(pipeManager.isPipe(id)).toBe(false);
			expect(ptyManager.isPty(id)).toBe(false);
		}

		// Pipe description IDs should not be PTYs
		for (const id of pipeDescIds) {
			expect(ptyManager.isPty(id)).toBe(false);
		}

		// PTY description IDs should not be pipes
		for (const id of ptyDescIds) {
			expect(pipeManager.isPipe(id)).toBe(false);
		}
	});

	it("separate kernel instances have independent ID counters", () => {
		const fdManager1 = new FDTableManager();
		const fdManager2 = new FDTableManager();

		const table1 = fdManager1.create(1);
		const table2 = fdManager2.create(1);

		const ids1: number[] = [];
		for (const entry of table1) ids1.push(entry.description.id);

		const ids2: number[] = [];
		for (const entry of table2) ids2.push(entry.description.id);

		// Both instances start from 1 — IDs should overlap (proving per-instance counters)
		expect(ids1).toEqual(ids2);

		// Same for pipes
		const pipes1 = new PipeManager();
		const pipes2 = new PipeManager();
		const p1 = pipes1.createPipe();
		const p2 = pipes2.createPipe();
		expect(p1.read.description.id).toBe(p2.read.description.id);

		// Same for PTYs
		const ptys1 = new PtyManager();
		const ptys2 = new PtyManager();
		const t1 = ptys1.createPty();
		const t2 = ptys2.createPty();
		expect(t1.master.description.id).toBe(t2.master.description.id);
	});
});
