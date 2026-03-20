import { describe, it, expect, afterEach } from "vitest";
import { FileLockManager, LOCK_SH, LOCK_EX, LOCK_UN, LOCK_NB } from "../src/file-lock.js";
import { createTestKernel, MockRuntimeDriver } from "./helpers.js";
import type { Kernel, KernelInterface } from "../src/types.js";

describe("FileLockManager", () => {
	it("exclusive lock blocks second exclusive lock", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);

		expect(() => mgr.flock("/tmp/test", 2, LOCK_EX | LOCK_NB)).toThrow();
	});

	it("two shared locks allowed simultaneously", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_SH);
		mgr.flock("/tmp/test", 2, LOCK_SH);
		// No throw — both shared locks coexist
		expect(mgr.hasLock(1)).toBe(true);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("shared lock blocked by exclusive lock from another description", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);

		expect(() => mgr.flock("/tmp/test", 2, LOCK_SH | LOCK_NB)).toThrow();
	});

	it("exclusive lock blocked by shared lock from another description", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_SH);

		expect(() => mgr.flock("/tmp/test", 2, LOCK_EX | LOCK_NB)).toThrow();
	});

	it("LOCK_NB returns EAGAIN when locked", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);

		try {
			mgr.flock("/tmp/test", 2, LOCK_EX | LOCK_NB);
			expect.unreachable("should have thrown");
		} catch (err: any) {
			expect(err.code).toBe("EAGAIN");
		}
	});

	it("same description can re-lock without conflict", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);
		// Same description re-locks — no conflict
		mgr.flock("/tmp/test", 1, LOCK_EX);
		expect(mgr.hasLock(1)).toBe(true);
	});

	it("upgrade from shared to exclusive when no other holders", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_SH);
		mgr.flock("/tmp/test", 1, LOCK_EX);
		expect(mgr.hasLock(1)).toBe(true);
	});

	it("downgrade from exclusive to shared", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);
		mgr.flock("/tmp/test", 1, LOCK_SH);
		// Now another description can also get shared
		mgr.flock("/tmp/test", 2, LOCK_SH);
		expect(mgr.hasLock(1)).toBe(true);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("LOCK_UN releases lock", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);
		mgr.flock("/tmp/test", 1, LOCK_UN);

		expect(mgr.hasLock(1)).toBe(false);
		// Another description can now lock
		mgr.flock("/tmp/test", 2, LOCK_EX);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("releaseByDescription cleans up lock", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);
		mgr.releaseByDescription(1);
		expect(mgr.hasLock(1)).toBe(false);

		// Another description can now lock
		mgr.flock("/tmp/test", 2, LOCK_EX);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("locks on different paths are independent", () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/a", 1, LOCK_EX);
		mgr.flock("/tmp/b", 2, LOCK_EX);
		expect(mgr.hasLock(1)).toBe(true);
		expect(mgr.hasLock(2)).toBe(true);
	});
});

describe("kernel flock integration", () => {
	let kernel: Kernel;
	let kernelIface: KernelInterface;

	afterEach(async () => {
		await kernel?.dispose();
	});

	it("flock through kernel interface locks and unlocks", async () => {
		let capturedKernel: KernelInterface;
		const driver: any = new MockRuntimeDriver(["test-cmd"]);
		const origInit = driver.init.bind(driver);
		driver.init = async (k: KernelInterface) => {
			capturedKernel = k;
			return origInit(k);
		};
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		// Spawn a process to get a PID
		const proc = kernel.spawn("test-cmd", []);
		const pid = proc.pid;

		// Open a file to get an FD
		const fd = capturedKernel!.fdOpen(pid, "/tmp/lockfile", 0o100 /* O_CREAT */);

		// Lock exclusively
		capturedKernel!.flock(pid, fd, LOCK_EX);

		// Unlock
		capturedKernel!.flock(pid, fd, LOCK_UN);
	});

	it("process exit releases locks", async () => {
		let capturedKernel: KernelInterface;
		const driver: any = new MockRuntimeDriver(["test-cmd"]);
		const origInit = driver.init.bind(driver);
		driver.init = async (k: KernelInterface) => {
			capturedKernel = k;
			return origInit(k);
		};
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		// Process 1: lock and exit
		const proc1 = kernel.spawn("test-cmd", []);
		const fd1 = capturedKernel!.fdOpen(proc1.pid, "/tmp/lockfile", 0o100);
		capturedKernel!.flock(proc1.pid, fd1, LOCK_EX);

		// Wait for process to exit (MockRuntimeDriver exits immediately)
		await proc1.wait();

		// Process 2: should be able to lock the same file
		const proc2 = kernel.spawn("test-cmd", []);
		const fd2 = capturedKernel!.fdOpen(proc2.pid, "/tmp/lockfile", 0o100);
		// This should not throw — lock was released when proc1 exited
		capturedKernel!.flock(proc2.pid, fd2, LOCK_EX | LOCK_NB);

		await proc2.wait();
	});

	it("flock on bad fd throws EBADF", async () => {
		let capturedKernel: KernelInterface;
		const driver: any = new MockRuntimeDriver(["test-cmd"]);
		const origInit = driver.init.bind(driver);
		driver.init = async (k: KernelInterface) => {
			capturedKernel = k;
			return origInit(k);
		};
		({ kernel } = await createTestKernel({ drivers: [driver] }));

		const proc = kernel.spawn("test-cmd", []);

		try {
			capturedKernel!.flock(proc.pid, 999, LOCK_EX);
			expect.unreachable("should have thrown");
		} catch (err: any) {
			expect(err.code).toBe("EBADF");
		}

		await proc.wait();
	});
});
