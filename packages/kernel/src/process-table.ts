/**
 * Process table.
 *
 * Universal process tracking across all runtimes. Owns PID allocation,
 * parent-child relationships, waitpid, and signal routing. A WasmVM
 * shell can waitpid on a Node child process.
 */

import type { DriverProcess, ProcessContext, ProcessEntry, ProcessInfo } from "./types.js";
import { KernelError, SIGCHLD, SIGALRM, SIGCONT, SIGSTOP, SIGTSTP, WNOHANG } from "./types.js";
import { encodeExitStatus, encodeSignalStatus } from "./wstatus.js";

const ZOMBIE_TTL_MS = 60_000;

export class ProcessTable {
	private entries: Map<number, ProcessEntry> = new Map();
	private nextPid = 1;
	private waiters: Map<number, Array<(info: { pid: number; status: number; termSignal: number }) => void>> = new Map();
	private zombieTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
	/** Pending alarm timers per PID: { timer, scheduledAt (ms epoch) }. */
	private alarmTimers: Map<number, { timer: ReturnType<typeof setTimeout>; scheduledAt: number; seconds: number }> = new Map();

	/** Called when a process exits, before waiters are notified. */
	onProcessExit: ((pid: number) => void) | null = null;

	/** Called when a zombie process is reaped (removed from the table). */
	onProcessReap: ((pid: number) => void) | null = null;

	/** Atomically allocate the next PID. */
	allocatePid(): number {
		return this.nextPid++;
	}

	/** Register a process with a pre-allocated PID. */
	register(
		pid: number,
		driver: string,
		command: string,
		args: string[],
		ctx: ProcessContext,
		driverProcess: DriverProcess,
	): ProcessEntry {
		// Inherit pgid/sid/umask from parent, or default to own pid / 0o022
		const parent = ctx.ppid ? this.entries.get(ctx.ppid) : undefined;
		const pgid = parent?.pgid ?? pid;
		const sid = parent?.sid ?? pid;
		const umask = parent?.umask ?? 0o022;

		const entry: ProcessEntry = {
			pid,
			ppid: ctx.ppid,
			pgid,
			sid,
			driver,
			command,
			args,
			status: "running",
			exitCode: null,
			exitReason: null,
			termSignal: 0,
			exitTime: null,
			env: { ...ctx.env },
			cwd: ctx.cwd,
			umask,
			driverProcess,
		};
		this.entries.set(pid, entry);

		// Wire up exit callback to mark process as exited
		driverProcess.onExit = (code: number) => {
			this.markExited(pid, code);
		};

		return entry;
	}

	get(pid: number): ProcessEntry | undefined {
		return this.entries.get(pid);
	}

	/** Count pending zombie cleanup timers (test observability). */
	get zombieTimerCount(): number {
		return this.zombieTimers.size;
	}

	/** Count running (non-exited) processes. */
	runningCount(): number {
		let count = 0;
		for (const entry of this.entries.values()) {
			if (entry.status === "running") count++;
		}
		return count;
	}

	/** Mark a process as exited with the given code. Notifies waiters. */
	markExited(pid: number, exitCode: number): void {
		const entry = this.entries.get(pid);
		if (!entry) return;
		if (entry.status === "exited") return;

		entry.status = "exited";
		entry.exitCode = exitCode;
		entry.exitReason = entry.termSignal > 0 ? "signal" : "normal";
		entry.exitTime = Date.now();

		// Encode POSIX wstatus
		const wstatus = entry.termSignal > 0
			? encodeSignalStatus(entry.termSignal)
			: encodeExitStatus(exitCode);

		// Cancel pending alarm
		this.cancelAlarm(pid);

		// Clean up process resources (FD table, pipe ends)
		this.onProcessExit?.(pid);

		// Deliver SIGCHLD to parent (default action: ignore — don't terminate)
		if (entry.ppid > 0) {
			const parent = this.entries.get(entry.ppid);
			if (parent && parent.status === "running") {
				try {
					parent.driverProcess.kill(SIGCHLD);
				} catch {
					// Parent may not handle SIGCHLD — ignore errors
				}
			}
		}

		// Notify waiters
		const waiters = this.waiters.get(pid);
		if (waiters) {
			for (const resolve of waiters) {
				resolve({ pid, status: wstatus, termSignal: entry.termSignal });
			}
			this.waiters.delete(pid);
		}

		// Schedule zombie cleanup (tracked for cancellation on dispose)
		const timer = setTimeout(() => {
			this.zombieTimers.delete(pid);
			this.reap(pid);
		}, ZOMBIE_TTL_MS);
		this.zombieTimers.set(pid, timer);
	}

	/**
	 * Wait for a process to exit.
	 * If already exited, resolves immediately. Otherwise blocks until exit.
	 * With WNOHANG option, returns null immediately if process is still running.
	 */
	waitpid(pid: number, options?: number): Promise<{ pid: number; status: number; termSignal: number } | null> {
		const entry = this.entries.get(pid);
		if (!entry) {
			return Promise.reject(new Error(`ESRCH: no such process ${pid}`));
		}

		if (entry.status === "exited") {
			const wstatus = entry.termSignal > 0
				? encodeSignalStatus(entry.termSignal)
				: encodeExitStatus(entry.exitCode!);
			return Promise.resolve({ pid, status: wstatus, termSignal: entry.termSignal });
		}

		// WNOHANG: return null immediately if process is still running
		if (options && (options & WNOHANG)) {
			return Promise.resolve(null);
		}

		return new Promise((resolve) => {
			let waiters = this.waiters.get(pid);
			if (!waiters) {
				waiters = [];
				this.waiters.set(pid, waiters);
			}
			waiters.push(resolve);
		});
	}

	/**
	 * Send a signal to a process or process group.
	 * If pid > 0, signal a single process.
	 * If pid < 0, signal all processes in process group abs(pid).
	 */
	kill(pid: number, signal: number): void {
		// Validate signal range (POSIX: 0 = existence check, 1-64 = real signals)
		if (signal < 0 || signal > 64) {
			throw new KernelError("EINVAL", `invalid signal ${signal}`);
		}

		if (pid < 0) {
			// Process group kill
			const pgid = -pid;
			let found = false;
			for (const entry of this.entries.values()) {
				if (entry.pgid === pgid && entry.status !== "exited") {
					found = true;
					if (signal !== 0) {
						this.deliverSignal(entry, signal);
					}
				}
			}
			if (!found) throw new KernelError("ESRCH", `no such process group ${pgid}`);
			return;
		}
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);
		if (entry.status === "exited") return;
		// Signal 0: existence check only — don't deliver
		if (signal === 0) return;
		this.deliverSignal(entry, signal);
	}

	/** Apply signal default action: stop/cont signals update status, others forward to driver. */
	private deliverSignal(entry: ProcessEntry, signal: number): void {
		if (signal === SIGTSTP || signal === SIGSTOP) {
			this.stop(entry.pid);
			entry.driverProcess.kill(signal);
		} else if (signal === SIGCONT) {
			this.cont(entry.pid);
			entry.driverProcess.kill(signal);
		} else {
			entry.termSignal = signal;
			entry.driverProcess.kill(signal);
		}
	}

	/**
	 * Schedule SIGALRM delivery after `seconds`. Returns previous alarm remaining (0 if none).
	 * alarm(pid, 0) cancels any pending alarm. A new alarm replaces the previous one.
	 */
	alarm(pid: number, seconds: number): number {
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);

		// Calculate remaining time from any existing alarm
		let remaining = 0;
		const existing = this.alarmTimers.get(pid);
		if (existing) {
			const elapsed = (Date.now() - existing.scheduledAt) / 1000;
			remaining = Math.max(0, Math.ceil(existing.seconds - elapsed));
			clearTimeout(existing.timer);
			this.alarmTimers.delete(pid);
		}

		if (seconds === 0) return remaining;

		// Schedule new alarm
		const scheduledAt = Date.now();
		const timer = setTimeout(() => {
			this.alarmTimers.delete(pid);
			const e = this.entries.get(pid);
			if (!e || e.status !== "running") return;

			// Default SIGALRM action: terminate with 128+14=142
			e.termSignal = SIGALRM;
			e.driverProcess.kill(SIGALRM);
		}, seconds * 1000);
		this.alarmTimers.set(pid, { timer, scheduledAt, seconds });

		return remaining;
	}

	/** Suspend a process (SIGTSTP/SIGSTOP). Sets status to 'stopped'. */
	stop(pid: number): void {
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);
		if (entry.status !== "running") return;
		entry.status = "stopped";
	}

	/** Resume a stopped process (SIGCONT). Sets status back to 'running'. */
	cont(pid: number): void {
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);
		if (entry.status !== "stopped") return;
		entry.status = "running";
	}

	/** Cancel a pending alarm for a process. */
	private cancelAlarm(pid: number): void {
		const existing = this.alarmTimers.get(pid);
		if (existing) {
			clearTimeout(existing.timer);
			this.alarmTimers.delete(pid);
		}
	}

	/** Set process group ID. Process can join existing group or create new one. */
	setpgid(pid: number, pgid: number): void {
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);

		// pgid 0 means "use own PID as pgid"
		const targetPgid = pgid === 0 ? pid : pgid;

		// Can only join an existing group or create own group
		if (targetPgid !== pid) {
			let groupExists = false;
			for (const e of this.entries.values()) {
				if (e.pgid === targetPgid && e.status !== "exited") {
					// Reject cross-session group joining (POSIX)
					if (e.sid !== entry.sid) {
						throw new KernelError("EPERM", `cannot join process group in different session`);
					}
					groupExists = true;
					break;
				}
			}
			if (!groupExists) throw new KernelError("EPERM", `no such process group ${targetPgid}`);
		}

		entry.pgid = targetPgid;
	}

	/** Get process group ID. */
	getpgid(pid: number): number {
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);
		return entry.pgid;
	}

	/** Create a new session. Process becomes session leader and process group leader. */
	setsid(pid: number): number {
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);

		// Process must not already be a process group leader
		if (entry.pgid === pid) {
			throw new KernelError("EPERM", `process ${pid} is already a process group leader`);
		}

		entry.sid = pid;
		entry.pgid = pid;
		return pid;
	}

	/** Get session ID. */
	getsid(pid: number): number {
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);
		return entry.sid;
	}

	/** Get the parent PID for a process. */
	getppid(pid: number): number {
		const entry = this.entries.get(pid);
		if (!entry) throw new KernelError("ESRCH", `no such process ${pid}`);
		return entry.ppid;
	}

	/**
	 * Send a signal to a process group, skipping session leaders.
	 * Returns count of processes actually signaled.
	 * Used for PTY-originated SIGINT where the session leader (shell)
	 * cannot handle signals gracefully (WasmVM worker.terminate()).
	 */
	killGroupExcludeLeaders(pgid: number, signal: number): number {
		if (signal < 0 || signal > 64) {
			throw new KernelError("EINVAL", `invalid signal ${signal}`);
		}
		let count = 0;
		for (const entry of this.entries.values()) {
			if (entry.pgid === pgid && entry.status !== "exited") {
				if (entry.pid === entry.sid) continue; // Skip session leaders
				if (signal !== 0) {
					this.deliverSignal(entry, signal);
				}
				count++;
			}
		}
		return count;
	}

	/** Check if any running process belongs to the given process group. */
	hasProcessGroup(pgid: number): boolean {
		for (const entry of this.entries.values()) {
			if (entry.pgid === pgid && entry.status !== "exited") return true;
		}
		return false;
	}

	/** Get a read-only view of process info for all processes. */
	listProcesses(): Map<number, ProcessInfo> {
		const result = new Map<number, ProcessInfo>();
		for (const [pid, entry] of this.entries) {
			result.set(pid, {
				pid: entry.pid,
				ppid: entry.ppid,
				pgid: entry.pgid,
				sid: entry.sid,
				driver: entry.driver,
				command: entry.command,
				status: entry.status,
				exitCode: entry.exitCode,
			});
		}
		return result;
	}

	/** Remove a zombie process. */
	private reap(pid: number): void {
		const entry = this.entries.get(pid);
		if (entry?.status === "exited") {
			this.onProcessReap?.(pid);
			this.entries.delete(pid);
		}
	}

	/** Terminate all running processes and clear pending timers. */
	async terminateAll(): Promise<void> {
		// Clear all zombie cleanup timers to prevent post-dispose firings
		for (const timer of this.zombieTimers.values()) {
			clearTimeout(timer);
		}
		this.zombieTimers.clear();

		// Clear all pending alarm timers
		for (const { timer } of this.alarmTimers.values()) {
			clearTimeout(timer);
		}
		this.alarmTimers.clear();

		const running = [...this.entries.values()].filter(
			(e) => e.status !== "exited",
		);
		for (const entry of running) {
			try {
				entry.driverProcess.kill(15); // SIGTERM
			} catch {
				// Best effort
			}
		}
		// Wait briefly for graceful exits
		await Promise.allSettled(
			running.map((e) =>
				Promise.race([
					e.driverProcess.wait(),
					new Promise((r) => setTimeout(r, 1000)),
				]),
			),
		);

		// Escalate to SIGKILL for processes that survived SIGTERM
		const survivors = running.filter((e) => e.status !== "exited");
		for (const entry of survivors) {
			try {
				entry.driverProcess.kill(9); // SIGKILL
			} catch {
				// Best effort
			}
		}
		if (survivors.length > 0) {
			await Promise.allSettled(
				survivors.map((e) =>
					Promise.race([
						e.driverProcess.wait(),
						new Promise((r) => setTimeout(r, 500)),
					]),
				),
			);
		}
	}
}
