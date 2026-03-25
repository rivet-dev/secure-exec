import { describe, it, expect, afterEach } from "vitest";
import { FileLockManager, LOCK_SH, LOCK_EX, LOCK_UN, LOCK_NB } from "../../src/kernel/file-lock.js";
import { createTestKernel, MockRuntimeDriver } from "./helpers.js";
import type { Kernel, KernelInterface } from "../../src/kernel/types.js";

async function flushAsyncWork(): Promise<void> {
	await Promise.resolve();
	await new Promise(resolve => setTimeout(resolve, 0));
}

describe("FileLockManager", () => {
	it("exclusive lock blocks second exclusive lock", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_EX);

		await expect(mgr.flock("/tmp/test", 2, LOCK_EX | LOCK_NB)).rejects.toMatchObject({
			code: "EAGAIN",
		});
	});

	it("two shared locks allowed simultaneously", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_SH);
		await mgr.flock("/tmp/test", 2, LOCK_SH);
		// No throw — both shared locks coexist
		expect(mgr.hasLock(1)).toBe(true);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("shared lock blocked by exclusive lock from another description", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_EX);

		await expect(mgr.flock("/tmp/test", 2, LOCK_SH | LOCK_NB)).rejects.toMatchObject({
			code: "EAGAIN",
		});
	});

	it("exclusive lock blocked by shared lock from another description", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_SH);

		await expect(mgr.flock("/tmp/test", 2, LOCK_EX | LOCK_NB)).rejects.toMatchObject({
			code: "EAGAIN",
		});
	});

	it("blocks until unlock when non-blocking flag is not set", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_EX);

		let acquired = false;
		const waiter = mgr.flock("/tmp/test", 2, LOCK_EX).then(() => {
			acquired = true;
		});

		await flushAsyncWork();
		expect(acquired).toBe(false);

		await mgr.flock("/tmp/test", 1, LOCK_UN);
		await waiter;
		expect(acquired).toBe(true);
	});

	it("LOCK_NB returns EAGAIN when locked", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_EX);

		await expect(mgr.flock("/tmp/test", 2, LOCK_EX | LOCK_NB)).rejects.toMatchObject({
			code: "EAGAIN",
		});
	});

	it("same description can re-lock without conflict", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_EX);
		// Same description re-locks — no conflict
		await mgr.flock("/tmp/test", 1, LOCK_EX);
		expect(mgr.hasLock(1)).toBe(true);
	});

	it("upgrade from shared to exclusive when no other holders", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_SH);
		await mgr.flock("/tmp/test", 1, LOCK_EX);
		expect(mgr.hasLock(1)).toBe(true);
	});

	it("downgrade from exclusive to shared", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_EX);
		await mgr.flock("/tmp/test", 1, LOCK_SH);
		// Now another description can also get shared
		await mgr.flock("/tmp/test", 2, LOCK_SH);
		expect(mgr.hasLock(1)).toBe(true);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("LOCK_UN releases lock", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_EX);
		await mgr.flock("/tmp/test", 1, LOCK_UN);

		expect(mgr.hasLock(1)).toBe(false);
		// Another description can now lock
		await mgr.flock("/tmp/test", 2, LOCK_EX);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("multiple waiters are served FIFO", async () => {
		const mgr = new FileLockManager();
		const acquireOrder: number[] = [];
		await mgr.flock("/tmp/test", 1, LOCK_EX);

		const waiter2 = mgr.flock("/tmp/test", 2, LOCK_EX).then(() => {
			acquireOrder.push(2);
		});
		let thirdAcquired = false;
		const waiter3 = mgr.flock("/tmp/test", 3, LOCK_EX).then(() => {
			acquireOrder.push(3);
			thirdAcquired = true;
		});

		await flushAsyncWork();
		await mgr.flock("/tmp/test", 1, LOCK_UN);
		await waiter2;
		expect(acquireOrder).toEqual([2]);

		await flushAsyncWork();
		expect(thirdAcquired).toBe(false);

		await mgr.flock("/tmp/test", 2, LOCK_UN);
		await waiter3;
		expect(acquireOrder).toEqual([2, 3]);
	});

	it("releaseByDescription cleans up lock", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/test", 1, LOCK_EX);
		mgr.releaseByDescription(1);
		expect(mgr.hasLock(1)).toBe(false);

		// Another description can now lock
		await mgr.flock("/tmp/test", 2, LOCK_EX);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("locks on different paths are independent", async () => {
		const mgr = new FileLockManager();
		await mgr.flock("/tmp/a", 1, LOCK_EX);
		await mgr.flock("/tmp/b", 2, LOCK_EX);
		expect(mgr.hasLock(1)).toBe(true);
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("blocking flock waits for lock release", async () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);

		// Blocking flock returns a promise
		const promise = mgr.flock("/tmp/test", 2, LOCK_EX);
		expect(promise).toBeInstanceOf(Promise);

		// Lock not yet acquired
		expect(mgr.hasLock(2)).toBe(false);

		// Release first lock — should wake the waiter
		mgr.flock("/tmp/test", 1, LOCK_UN);

		await promise;
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("blocking shared flock waits for exclusive release", async () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);

		const promise = mgr.flock("/tmp/test", 2, LOCK_SH);
		expect(promise).toBeInstanceOf(Promise);

		mgr.flock("/tmp/test", 1, LOCK_UN);
		await promise;
		expect(mgr.hasLock(2)).toBe(true);
	});

	it("multiple blocked waiters are woken in order", async () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);

		const order: number[] = [];
		const p2 = Promise.resolve(mgr.flock("/tmp/test", 2, LOCK_SH)).then(() => order.push(2));
		const p3 = Promise.resolve(mgr.flock("/tmp/test", 3, LOCK_SH)).then(() => order.push(3));

		mgr.flock("/tmp/test", 1, LOCK_UN);
		await Promise.all([p2, p3]);
		// Both shared waiters woken
		expect(mgr.hasLock(2)).toBe(true);
		expect(mgr.hasLock(3)).toBe(true);
	});

	it("releaseByDescription wakes blocked waiters", async () => {
		const mgr = new FileLockManager();
		mgr.flock("/tmp/test", 1, LOCK_EX);

		const promise = mgr.flock("/tmp/test", 2, LOCK_EX);
		mgr.releaseByDescription(1);

		await promise;
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
		const driver: any = new MockRuntimeDriver(["test-cmd"], {
			"test-cmd": { neverExit: true },
		});
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
		await capturedKernel!.flock(pid, fd, LOCK_EX);

		// Unlock
		await capturedKernel!.flock(pid, fd, LOCK_UN);
		proc.kill(15);
		await proc.wait();
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
		await capturedKernel!.flock(proc1.pid, fd1, LOCK_EX);

		// Wait for process to exit (MockRuntimeDriver exits immediately)
		await proc1.wait();

		// Process 2: should be able to lock the same file
		const proc2 = kernel.spawn("test-cmd", []);
		const fd2 = capturedKernel!.fdOpen(proc2.pid, "/tmp/lockfile", 0o100);
		// This should not throw — lock was released when proc1 exited
		await capturedKernel!.flock(proc2.pid, fd2, LOCK_EX | LOCK_NB);

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

		await expect(capturedKernel!.flock(proc.pid, 999, LOCK_EX)).rejects.toMatchObject({
			code: "EBADF",
		});

		await proc.wait();
	});
});
