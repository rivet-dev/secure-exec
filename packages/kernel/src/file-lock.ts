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

interface LockEntry {
	descriptionId: number;
	type: "sh" | "ex";
}

interface PathLockState {
	holders: LockEntry[];
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
	flock(path: string, descId: number, operation: number): void {
		const op = operation & ~LOCK_NB;
		const nonBlocking = (operation & LOCK_NB) !== 0;

		if (op === LOCK_UN) {
			this.unlock(path, descId);
			return;
		}

		const state = this.getOrCreate(path);
		const existingIdx = state.holders.findIndex(h => h.descriptionId === descId);

		if (op === LOCK_SH) {
			// Conflict: another description holds exclusive lock
			const conflict = state.holders.some(
				h => h.type === "ex" && h.descriptionId !== descId,
			);
			if (conflict) {
				if (nonBlocking) {
					throw new KernelError("EAGAIN", "resource temporarily unavailable");
				}
				// Blocking not implemented — treat as EAGAIN
				throw new KernelError("EAGAIN", "resource temporarily unavailable");
			}
			if (existingIdx >= 0) {
				state.holders[existingIdx].type = "sh";
			} else {
				state.holders.push({ descriptionId: descId, type: "sh" });
				this.descToPath.set(descId, path);
			}
		} else if (op === LOCK_EX) {
			// Conflict: any other description holds any lock
			const conflict = state.holders.some(
				h => h.descriptionId !== descId,
			);
			if (conflict) {
				if (nonBlocking) {
					throw new KernelError("EAGAIN", "resource temporarily unavailable");
				}
				throw new KernelError("EAGAIN", "resource temporarily unavailable");
			}
			if (existingIdx >= 0) {
				state.holders[existingIdx].type = "ex";
			} else {
				state.holders.push({ descriptionId: descId, type: "ex" });
				this.descToPath.set(descId, path);
			}
		}
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
		if (state.holders.length === 0) {
			this.locks.delete(path);
		}
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
			state = { holders: [] };
			this.locks.set(path, state);
		}
		return state;
	}
}
