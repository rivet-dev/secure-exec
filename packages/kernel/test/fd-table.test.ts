import { describe, it, expect } from "vitest";
import { ProcessFDTable, FDTableManager } from "../src/fd-table.js";
import { O_RDONLY, O_WRONLY, O_CLOEXEC, FILETYPE_REGULAR_FILE, FILETYPE_CHARACTER_DEVICE } from "../src/types.js";

describe("ProcessFDTable", () => {
	it("pre-allocates stdio FDs 0, 1, 2", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		const stdin = table.get(0)!;
		const stdout = table.get(1)!;
		const stderr = table.get(2)!;

		expect(stdin.filetype).toBe(FILETYPE_CHARACTER_DEVICE);
		expect(stdout.filetype).toBe(FILETYPE_CHARACTER_DEVICE);
		expect(stderr.filetype).toBe(FILETYPE_CHARACTER_DEVICE);

		expect(stdin.description.flags).toBe(O_RDONLY);
		expect(stdout.description.flags).toBe(O_WRONLY);
		expect(stderr.description.flags).toBe(O_WRONLY);
	});

	it("opens new FDs starting at 3", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		const fd = table.open("/tmp/test.txt", O_RDONLY);
		expect(fd).toBe(3);
	});

	it("dup creates a new FD sharing the same FileDescription", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		const fd = table.open("/tmp/test.txt", O_RDONLY);
		const dupFd = table.dup(fd);

		expect(dupFd).not.toBe(fd);
		expect(table.get(fd)!.description).toBe(table.get(dupFd)!.description);
	});

	it("dup2 replaces the target FD", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		const fd = table.open("/tmp/test.txt", O_RDONLY);
		table.dup2(fd, 10);

		expect(table.get(10)).toBeDefined();
		expect(table.get(fd)!.description).toBe(table.get(10)!.description);
	});

	it("close decrements refcount", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		const fd = table.open("/tmp/test.txt", O_RDONLY);
		const dupFd = table.dup(fd);
		const desc = table.get(fd)!.description;

		expect(desc.refCount).toBe(2);
		table.close(dupFd);
		expect(desc.refCount).toBe(1);
	});

	it("fork creates an independent table with shared descriptions", () => {
		const manager = new FDTableManager();
		const parent = manager.create(1);

		const fd = parent.open("/tmp/test.txt", O_RDONLY);
		const child = manager.fork(1, 2);

		// Child has the same FDs
		expect(child.get(fd)).toBeDefined();
		// Shared description
		expect(parent.get(fd)!.description).toBe(child.get(fd)!.description);
		// Independent tables — closing in child doesn't affect parent
		child.close(fd);
		expect(parent.get(fd)).toBeDefined();
	});

	it("stat returns fd metadata", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		const fd = table.open("/tmp/test.txt", O_WRONLY, FILETYPE_REGULAR_FILE);
		const stat = table.stat(fd);

		expect(stat.filetype).toBe(FILETYPE_REGULAR_FILE);
		expect(stat.flags).toBe(O_WRONLY);
	});

	it("stat throws EBADF for invalid FD", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		expect(() => table.stat(999)).toThrow("EBADF");
	});

	it("open with O_CLOEXEC sets cloexec on the description", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		const fd = table.open("/tmp/test.txt", O_RDONLY | O_CLOEXEC);
		const entry = table.get(fd)!;
		expect(entry.description.cloexec).toBe(true);
		// O_CLOEXEC should be stripped from stored flags
		expect(entry.description.flags).toBe(O_RDONLY);
	});

	it("open without O_CLOEXEC defaults cloexec to false", () => {
		const manager = new FDTableManager();
		const table = manager.create(1);

		const fd = table.open("/tmp/test.txt", O_RDONLY);
		expect(table.get(fd)!.description.cloexec).toBe(false);
	});

	it("fork skips FDs with cloexec set", () => {
		const manager = new FDTableManager();
		const parent = manager.create(1);

		const normalFd = parent.open("/tmp/normal.txt", O_RDONLY);
		const cloexecFd = parent.open("/tmp/secret.txt", O_RDONLY | O_CLOEXEC);

		const child = manager.fork(1, 2);

		// Normal FD is inherited
		expect(child.get(normalFd)).toBeDefined();
		// Cloexec FD is NOT inherited
		expect(child.get(cloexecFd)).toBeUndefined();
	});

	it("fork inherits FDs where cloexec was cleared via fdSetCloexec", () => {
		const manager = new FDTableManager();
		const parent = manager.create(1);

		const fd = parent.open("/tmp/test.txt", O_RDONLY | O_CLOEXEC);
		expect(parent.get(fd)!.description.cloexec).toBe(true);

		// Clear cloexec
		parent.get(fd)!.description.cloexec = false;

		const child = manager.fork(1, 2);
		expect(child.get(fd)).toBeDefined();
	});
});
