/**
 * Advisory file lock manager (flock semantics).
 *
 * Locks are per-path (inode proxy). Multiple FDs sharing the same
 * FileDescription (via dup) share the same lock. Locks are released
 * when the description's refCount drops to zero (all FDs closed).
 */

import { KernelError } from "./types.js";

// flock operation flags (POSIX)
export const LOCK_SH = 1;
export const LOCK_EX = 2;
export const LOCK_UN = 8;
export const LOCK_NB = 4;

/** Max time a blocking flock waits before ETIMEDOUT (30s). */
const FLOCK_TIMEOUT_MS = 30_000;

interface LockEntry {
	descriptionId: number;
	type: "sh" | "ex";
}

interface Waiter {
	descId: number;
	op: number;
	resolve: () => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface PathLockState {
	holders: LockEntry[];
	waiters: Waiter[];
}

export class FileLockManager {
	/** path -> lock state */
	private locks = new Map<string, PathLockState>();
	/** descriptionId -> path (for cleanup) */
	private descToPath = new Map<number, string>();

	/**
	 * Acquire, upgrade/downgrade, or release a lock.
	 *
	 * @param path      Resolved file path (inode proxy)
	 * @param descId    FileDescription id (shared across dup'd FDs)
	 * @param operation LOCK_SH | LOCK_EX | LOCK_UN, optionally | LOCK_NB
	 */
	async flock(path: string, descId: number, operation: number): Promise<void> {
		const op = operation & ~LOCK_NB;
		const nonBlocking = (operation & LOCK_NB) !== 0;

		if (op === LOCK_UN) {
			this.unlock(path, descId);
			return;
		}

		const state = this.getOrCreate(path);
		if (this.tryAcquire(state, descId, op)) {
			this.descToPath.set(descId, path);
			return;
		}

		if (nonBlocking) {
			throw new KernelError("EAGAIN", "resource temporarily unavailable");
		}

		return new Promise<void>((resolve, reject) => {
			const waiter: Waiter = {
				descId,
				op,
				resolve,
				reject,
				timer: setTimeout(() => {
					const idx = state.waiters.indexOf(waiter);
					if (idx >= 0) state.waiters.splice(idx, 1);
					reject(new KernelError("ETIMEDOUT", "flock timed out"));
				}, FLOCK_TIMEOUT_MS),
			};
			state.waiters.push(waiter);
		});
	}

	/** Release the lock held by a specific description on a path. */
	private unlock(path: string, descId: number): void {
		const state = this.locks.get(path);
		if (!state) return;

		const idx = state.holders.findIndex(h => h.descriptionId === descId);
		if (idx >= 0) {
			state.holders.splice(idx, 1);
			this.descToPath.delete(descId);
		}

		this.processWaiters(path, state);

		if (state.holders.length === 0 && state.waiters.length === 0) {
			this.locks.delete(path);
		}
	}

	/** Try to grant queued locks after a release. */
	private processWaiters(path: string, state: PathLockState): void {
		let i = 0;
		while (i < state.waiters.length) {
			const waiter = state.waiters[i];
			if (!this.tryAcquire(state, waiter.descId, waiter.op)) {
				i++;
				continue;
			}

			state.waiters.splice(i, 1);
			this.descToPath.set(waiter.descId, path);
			clearTimeout(waiter.timer);
			waiter.resolve();
		}
	}

	/** Try to acquire the lock without blocking. Returns true on success. */
	private tryAcquire(state: PathLockState, descId: number, op: number): boolean {
		const existingIdx = state.holders.findIndex(h => h.descriptionId === descId);

		if (op === LOCK_SH) {
			const conflict = state.holders.some(
				h => h.type === "ex" && h.descriptionId !== descId,
			);
			if (conflict) return false;

			if (existingIdx >= 0) {
				state.holders[existingIdx].type = "sh";
			} else {
				state.holders.push({ descriptionId: descId, type: "sh" });
			}
			return true;
		}

		if (op === LOCK_EX) {
			const conflict = state.holders.some(h => h.descriptionId !== descId);
			if (conflict) return false;

			if (existingIdx >= 0) {
				state.holders[existingIdx].type = "ex";
			} else {
				state.holders.push({ descriptionId: descId, type: "ex" });
			}
			return true;
		}

		throw new KernelError("EINVAL", `unsupported flock operation ${op}`);
	}

	/** Release all locks held by a specific description (called on FD close when refCount drops to 0). */
	releaseByDescription(descId: number): void {
		const path = this.descToPath.get(descId);
		if (path === undefined) return;
		this.unlock(path, descId);
	}

	/** Check if a description holds any lock. */
	hasLock(descId: number): boolean {
		return this.descToPath.has(descId);
	}

	private getOrCreate(path: string): PathLockState {
		let state = this.locks.get(path);
		if (!state) {
			state = { holders: [], waiters: [] };
			this.locks.set(path, state);
		}
		return state;
	}
}
