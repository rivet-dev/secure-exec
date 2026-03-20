import { describe, it, expect } from "vitest";
import { PipeManager } from "../src/pipe-manager.js";

describe("PipeManager", () => {
	it("creates a pipe with read and write ends", () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		expect(read.description.id).not.toBe(write.description.id);
		expect(manager.isPipe(read.description.id)).toBe(true);
		expect(manager.isPipe(write.description.id)).toBe(true);
	});

	it("write then read delivers data", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		const data = new TextEncoder().encode("hello");
		manager.write(write.description.id, data);

		const result = await manager.read(read.description.id, 1024);
		expect(new TextDecoder().decode(result!)).toBe("hello");
	});

	it("read blocks until write", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		// Start read (will block)
		const readPromise = manager.read(read.description.id, 1024);

		// Write after a delay
		setTimeout(() => {
			manager.write(write.description.id, new TextEncoder().encode("delayed"));
		}, 10);

		const result = await readPromise;
		expect(new TextDecoder().decode(result!)).toBe("delayed");
	});

	it("read returns null (EOF) when write end is closed", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		manager.close(write.description.id);

		const result = await manager.read(read.description.id, 1024);
		expect(result).toBeNull();
	});

	it("close write end delivers EOF to waiting readers", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		const readPromise = manager.read(read.description.id, 1024);

		setTimeout(() => {
			manager.close(write.description.id);
		}, 10);

		const result = await readPromise;
		expect(result).toBeNull();
	});

	it("isPipe returns false for non-pipe descriptors", () => {
		const manager = new PipeManager();
		expect(manager.isPipe(999)).toBe(false);
	});

	it("multiple writes accumulate in buffer", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		manager.write(write.description.id, new TextEncoder().encode("hello "));
		manager.write(write.description.id, new TextEncoder().encode("world"));

		// Read drains all buffered chunks up to requested length
		const result = await manager.read(read.description.id, 1024);
		expect(new TextDecoder().decode(result!)).toBe("hello world");
	});

	it("partial read returns only requested bytes, preserves remainder", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		// Write 100 bytes
		const data = new Uint8Array(100);
		for (let i = 0; i < 100; i++) data[i] = i;
		manager.write(write.description.id, data);

		// Read only 10 bytes
		const first = await manager.read(read.description.id, 10);
		expect(first!.length).toBe(10);
		expect(Array.from(first!)).toEqual(Array.from(data.subarray(0, 10)));

		// Remaining 90 bytes still available
		const rest = await manager.read(read.description.id, 1024);
		expect(rest!.length).toBe(90);
		expect(Array.from(rest!)).toEqual(Array.from(data.subarray(10)));
	});

	it("write after read-end close throws EPIPE", () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		manager.close(read.description.id);

		expect(() => {
			manager.write(write.description.id, new TextEncoder().encode("fail"));
		}).toThrow(expect.objectContaining({ code: "EPIPE" }));
	});

	it("write with open read end succeeds", () => {
		const manager = new PipeManager();
		const { write } = manager.createPipe();

		const bytes = manager.write(write.description.id, new TextEncoder().encode("ok"));
		expect(bytes).toBe(2);
	});

	it("multiple partial reads drain pipe incrementally", async () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		const data = new Uint8Array(50);
		for (let i = 0; i < 50; i++) data[i] = i + 100;
		manager.write(write.description.id, data);

		// Drain in 10-byte increments
		const collected: number[] = [];
		for (let i = 0; i < 5; i++) {
			const chunk = await manager.read(read.description.id, 10);
			expect(chunk!.length).toBe(10);
			collected.push(...chunk!);
		}
		expect(collected).toEqual(Array.from(data));

		// Buffer now empty — close write end so next read returns EOF
		manager.close(write.description.id);
		const eof = await manager.read(read.description.id, 10);
		expect(eof).toBeNull();
	});

	// -----------------------------------------------------------------------
	// SIGPIPE on broken pipe
	// -----------------------------------------------------------------------

	it("onBrokenPipe callback fires with writerPid when writing to closed read end", () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();
		const signaled: number[] = [];

		manager.onBrokenPipe = (pid) => signaled.push(pid);
		manager.close(read.description.id);

		expect(() => {
			manager.write(write.description.id, new TextEncoder().encode("data"), 42);
		}).toThrow(expect.objectContaining({ code: "EPIPE" }));

		expect(signaled).toEqual([42]);
	});

	it("EPIPE is still thrown after onBrokenPipe delivery", () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();

		manager.onBrokenPipe = () => {}; // no-op handler
		manager.close(read.description.id);

		expect(() => {
			manager.write(write.description.id, new TextEncoder().encode("data"), 1);
		}).toThrow(expect.objectContaining({ code: "EPIPE" }));
	});

	it("onBrokenPipe not called when writerPid is omitted", () => {
		const manager = new PipeManager();
		const { read, write } = manager.createPipe();
		let called = false;

		manager.onBrokenPipe = () => { called = true; };
		manager.close(read.description.id);

		expect(() => {
			manager.write(write.description.id, new TextEncoder().encode("data"));
		}).toThrow(expect.objectContaining({ code: "EPIPE" }));

		expect(called).toBe(false);
	});
});
