/**
 * Kernel implementation.
 *
 * The kernel is the OS. It owns VFS, FD table, process table, device layer,
 * pipe manager, command registry, and permissions. Runtimes are execution
 * engines that make "syscalls" to the kernel.
 */

import type {
	Kernel,
	KernelInterface,
	KernelOptions,
	ExecOptions,
	ExecResult,
	SpawnOptions,
	ManagedProcess,
	RuntimeDriver,
	ProcessContext,
	ProcessInfo,
	FDStat,
	OpenShellOptions,
	ShellHandle,
} from "./types.js";
import type { VirtualFileSystem, VirtualStat } from "./vfs.js";
import { createDeviceLayer } from "./device-layer.js";
import { FDTableManager, ProcessFDTable } from "./fd-table.js";
import { ProcessTable } from "./process-table.js";
import { PipeManager } from "./pipe-manager.js";
import { PtyManager } from "./pty.js";
import { CommandRegistry } from "./command-registry.js";
import { wrapFileSystem, checkChildProcess } from "./permissions.js";
import { UserManager } from "./user.js";
import {
	FILETYPE_REGULAR_FILE,
	FILETYPE_DIRECTORY,
	FILETYPE_PIPE,
	SEEK_SET,
	SEEK_CUR,
	SEEK_END,
	SIGTERM,
	SIGWINCH,
	KernelError,
} from "./types.js";

export function createKernel(options: KernelOptions): Kernel {
	return new KernelImpl(options);
}

class KernelImpl implements Kernel {
	private vfs: VirtualFileSystem;
	private fdTableManager = new FDTableManager();
	private processTable = new ProcessTable();
	private pipeManager = new PipeManager();
	private ptyManager = new PtyManager((pgid, signal) => {
		try { this.processTable.kill(-pgid, signal); } catch { /* no-op if pgid gone */ }
	});
	private commandRegistry = new CommandRegistry();
	private userManager: UserManager;
	private drivers: RuntimeDriver[] = [];
	private permissions?: import("./types.js").Permissions;
	private env: Record<string, string>;
	private cwd: string;
	private disposed = false;

	constructor(options: KernelOptions) {
		// Apply device layer over the base filesystem
		let fs = createDeviceLayer(options.filesystem);

		// Apply permission wrapping
		if (options.permissions) {
			fs = wrapFileSystem(fs, options.permissions);
		}

		this.vfs = fs;
		this.permissions = options.permissions;
		this.env = { ...options.env };
		this.cwd = options.cwd ?? "/home/user";
		this.userManager = new UserManager();

		// Clean up FD table when a process exits
		this.processTable.onProcessExit = (pid) => {
			this.cleanupProcessFDs(pid);
		};
	}

	// -----------------------------------------------------------------------
	// Kernel public API
	// -----------------------------------------------------------------------

	async mount(driver: RuntimeDriver): Promise<void> {
		this.assertNotDisposed();

		// Initialize the driver with the kernel interface
		await driver.init(this.createKernelInterface());

		// Register commands
		this.commandRegistry.register(driver);
		this.drivers.push(driver);

		// Populate /bin stubs for shell PATH lookup
		await this.commandRegistry.populateBin(this.vfs);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;

		// Terminate all running processes
		await this.processTable.terminateAll();

		// Dispose all drivers (reverse mount order)
		for (let i = this.drivers.length - 1; i >= 0; i--) {
			try {
				await this.drivers[i].dispose();
			} catch {
				// Best effort cleanup
			}
		}
		this.drivers.length = 0;
	}

	async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
		this.assertNotDisposed();

		// Route through shell
		const shell = this.commandRegistry.resolve("sh");
		if (!shell) {
			throw new Error(
				"No shell available. Mount a WasmVM runtime to enable exec().",
			);
		}

		const proc = this.spawnInternal("sh", ["-c", command], options);

		// Write stdin if provided
		if (options?.stdin) {
			const data =
				typeof options.stdin === "string"
					? new TextEncoder().encode(options.stdin)
					: options.stdin;
			proc.writeStdin(data);
			proc.closeStdin();
		}

		// Collect output
		const stdoutChunks: Uint8Array[] = [];
		const stderrChunks: Uint8Array[] = [];

		proc.onStdout = (data) => {
			stdoutChunks.push(data);
			options?.onStdout?.(data);
		};
		proc.onStderr = (data) => {
			stderrChunks.push(data);
			options?.onStderr?.(data);
		};

		// Wait with optional timeout
		let exitCode: number;
		if (options?.timeout) {
			exitCode = await Promise.race([
				proc.wait(),
				new Promise<number>((_, reject) =>
					setTimeout(
						() => reject(new KernelError("ETIMEDOUT", "exec timeout")),
						options.timeout,
					),
				),
			]);
		} else {
			exitCode = await proc.wait();
		}

		return {
			exitCode,
			stdout: concatUint8(stdoutChunks),
			stderr: concatUint8(stderrChunks),
		};
	}

	spawn(
		command: string,
		args: string[],
		options?: SpawnOptions,
	): ManagedProcess {
		this.assertNotDisposed();
		return this.spawnManaged(command, args, options);
	}

	openShell(options?: OpenShellOptions): ShellHandle {
		this.assertNotDisposed();

		const command = options?.command ?? "sh";
		const args = options?.args ?? [];

		// Allocate a controller PID with an FD table to hold the PTY master
		const controllerPid = this.processTable.allocatePid();
		const controllerTable = this.fdTableManager.create(controllerPid);

		// Create PTY pair in the controller's FD table
		const { masterFd, slaveFd } = this.ptyManager.createPtyFDs(controllerTable);
		const masterDescId = controllerTable.get(masterFd)!.description.id;

		// Spawn shell with PTY slave as stdin/stdout/stderr
		const proc = this.spawnInternal(command, args, {
			env: options?.env,
			cwd: options?.cwd,
			stdinFd: slaveFd,
			stdoutFd: slaveFd,
			stderrFd: slaveFd,
		}, controllerPid);

		// Shell becomes its own process group leader, set as PTY foreground
		this.processTable.setpgid(proc.pid, proc.pid);
		this.ptyManager.setForegroundPgid(masterDescId, proc.pid);

		// Start read pump: master reads → onData callback
		let onDataCallback: ((data: Uint8Array) => void) | null = null;
		const readPump = async () => {
			try {
				while (true) {
					const data = await this.ptyManager.read(masterDescId, 4096);
					if (!data || data.length === 0) break;
					onDataCallback?.(data);
				}
			} catch {
				// Master closed or PTY gone
			}
		};
		readPump();

		return {
			pid: proc.pid,
			write: (data) => {
				const bytes = typeof data === "string"
					? new TextEncoder().encode(data)
					: data;
				this.ptyManager.write(masterDescId, bytes);
			},
			get onData() { return onDataCallback; },
			set onData(fn) { onDataCallback = fn; },
			resize: (_cols, _rows) => {
				const fgPgid = this.ptyManager.getForegroundPgid(masterDescId);
				if (fgPgid > 0) {
					try { this.processTable.kill(-fgPgid, SIGWINCH); } catch { /* pgid may be gone */ }
				}
			},
			kill: (signal) => {
				proc.kill(signal ?? SIGTERM);
			},
			wait: () => proc.wait(),
		};
	}

	// Filesystem convenience wrappers
	readFile(path: string): Promise<Uint8Array> { return this.vfs.readFile(path); }
	writeFile(path: string, content: string | Uint8Array): Promise<void> { return this.vfs.writeFile(path, content); }
	mkdir(path: string): Promise<void> { return this.vfs.mkdir(path); }
	readdir(path: string): Promise<string[]> { return this.vfs.readDir(path); }
	stat(path: string): Promise<VirtualStat> { return this.vfs.stat(path); }
	exists(path: string): Promise<boolean> { return this.vfs.exists(path); }

	// Introspection
	get commands(): ReadonlyMap<string, string> {
		return this.commandRegistry.list();
	}

	get processes(): ReadonlyMap<number, ProcessInfo> {
		return this.processTable.listProcesses();
	}

	// -----------------------------------------------------------------------
	// Internal spawn
	// -----------------------------------------------------------------------

	private spawnInternal(
		command: string,
		args: string[],
		options?: SpawnOptions,
		callerPid?: number,
	): InternalProcess {
		const driver = this.commandRegistry.resolve(command);
		if (!driver) {
			throw new KernelError("ENOENT", `command not found: ${command}`);
		}

		// Check childProcess permission
		checkChildProcess(this.permissions, command, args, options?.cwd);

		// Allocate PID atomically
		const pid = this.processTable.allocatePid();

		// Create FD table — wire pipe FDs when overrides are provided
		const table = this.createChildFDTable(pid, options, callerPid);

		// Check which stdio channels are piped (data flows through kernel, not callbacks)
		const stdoutPiped = this.isStdioPiped(table, 1);
		const stderrPiped = this.isStdioPiped(table, 2);

		// Buffer stdout/stderr — wired before spawn so nothing is lost
		const stdoutBuf: Uint8Array[] = [];
		const stderrBuf: Uint8Array[] = [];

		// Build process context with pre-wired callbacks
		const ctx: ProcessContext = {
			pid,
			ppid: callerPid ?? 0,
			env: { ...this.env, ...options?.env },
			cwd: options?.cwd ?? this.cwd,
			fds: { stdin: 0, stdout: 1, stderr: 2 },
			onStdout: stdoutPiped ? undefined : (data) => stdoutBuf.push(data),
			onStderr: stderrPiped ? undefined : (data) => stderrBuf.push(data),
		};

		// Spawn via driver
		const driverProcess = driver.spawn(command, args, ctx);

		// Also buffer data emitted via DriverProcess callbacks after spawn returns
		if (!stdoutPiped) driverProcess.onStdout = (data) => stdoutBuf.push(data);
		if (!stderrPiped) driverProcess.onStderr = (data) => stderrBuf.push(data);

		// Register in process table
		const entry = this.processTable.register(
			pid,
			driver.name,
			command,
			args,
			ctx,
			driverProcess,
		);

		return {
			pid: entry.pid,
			driverProcess,
			wait: () => driverProcess.wait(),
			writeStdin: (data) => driverProcess.writeStdin(data),
			closeStdin: () => driverProcess.closeStdin(),
			kill: (signal) => driverProcess.kill(signal ?? 15),
			get onStdout() { return driverProcess.onStdout; },
			set onStdout(fn) {
				driverProcess.onStdout = fn;
				// Replay buffered data
				if (fn) for (const chunk of stdoutBuf) fn(chunk);
				stdoutBuf.length = 0;
			},
			get onStderr() { return driverProcess.onStderr; },
			set onStderr(fn) {
				driverProcess.onStderr = fn;
				if (fn) for (const chunk of stderrBuf) fn(chunk);
				stderrBuf.length = 0;
			},
		};
	}

	private spawnManaged(
		command: string,
		args: string[],
		options?: SpawnOptions,
		callerPid?: number,
	): ManagedProcess {
		const internal = this.spawnInternal(command, args, options, callerPid);
		let exitCode: number | null = null;

		// Forward stdout/stderr callbacks from options (replays buffered data)
		if (options?.onStdout) {
			internal.onStdout = options.onStdout;
		}
		if (options?.onStderr) {
			internal.onStderr = options.onStderr;
		}

		internal.driverProcess.wait().then((code) => {
			exitCode = code;
		});

		return {
			pid: internal.pid,
			writeStdin: (data) => {
				const bytes = typeof data === "string"
					? new TextEncoder().encode(data)
					: data;
				internal.writeStdin(bytes);
			},
			closeStdin: () => internal.closeStdin(),
			kill: (signal) => this.processTable.kill(internal.pid, signal ?? 15),
			wait: () => internal.driverProcess.wait(),
			get exitCode() { return exitCode; },
		};
	}

	// -----------------------------------------------------------------------
	// Kernel interface (exposed to drivers)
	// -----------------------------------------------------------------------

	private createKernelInterface(): KernelInterface {
		return {
			vfs: this.vfs,

			// FD operations
			fdOpen: (pid, path, flags, mode) => {
				const table = this.getTable(pid);
				const filetype = FILETYPE_REGULAR_FILE;
				return table.open(path, flags, filetype);
			},
			fdRead: async (pid, fd, length) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);

				// Pipe reads route through PipeManager
				if (this.pipeManager.isPipe(entry.description.id)) {
					const data = await this.pipeManager.read(entry.description.id, length);
					return data ?? new Uint8Array(0);
				}

				// PTY reads route through PtyManager
				if (this.ptyManager.isPty(entry.description.id)) {
					const data = await this.ptyManager.read(entry.description.id, length);
					return data ?? new Uint8Array(0);
				}

				// Read from VFS at cursor position
				const content = await this.vfs.readFile(entry.description.path);
				const cursor = Number(entry.description.cursor);
				if (cursor >= content.length) return new Uint8Array(0);
				const end = Math.min(cursor + length, content.length);
				const slice = content.slice(cursor, end);
				entry.description.cursor = BigInt(end);
				return slice;
			},
			fdWrite: (pid, fd, data) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);

				if (this.pipeManager.isPipe(entry.description.id)) {
					return this.pipeManager.write(entry.description.id, data);
				}

				if (this.ptyManager.isPty(entry.description.id)) {
					return this.ptyManager.write(entry.description.id, data);
				}

				return data.length;
			},
			fdClose: (pid, fd) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) return;

				const descId = entry.description.id;
				const isPipe = this.pipeManager.isPipe(descId);
				const isPty = this.ptyManager.isPty(descId);

				// Close FD first (decrements refCount on shared FileDescription)
				table.close(fd);

				// Only signal pipe/pty closure when last reference is dropped
				if (isPipe && entry.description.refCount <= 0) {
					this.pipeManager.close(descId);
				}
				if (isPty && entry.description.refCount <= 0) {
					this.ptyManager.close(descId);
				}
			},
			fdSeek: async (pid, fd, offset, whence) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);

				// Pipes and PTYs are not seekable
				if (this.pipeManager.isPipe(entry.description.id) || this.ptyManager.isPty(entry.description.id)) {
					throw new KernelError("ESPIPE", "illegal seek");
				}

				let newCursor: bigint;
				switch (whence) {
					case SEEK_SET:
						newCursor = offset;
						break;
					case SEEK_CUR:
						newCursor = entry.description.cursor + offset;
						break;
					case SEEK_END: {
						const content = await this.vfs.readFile(entry.description.path);
						newCursor = BigInt(content.length) + offset;
						break;
					}
					default:
						throw new KernelError("EINVAL", `invalid whence ${whence}`);
				}

				if (newCursor < 0n) throw new KernelError("EINVAL", "negative seek position");

				entry.description.cursor = newCursor;
				return newCursor;
			},
			fdDup: (pid, fd) => {
				return this.getTable(pid).dup(fd);
			},
			fdDup2: (pid, oldFd, newFd) => {
				this.getTable(pid).dup2(oldFd, newFd);
			},
			fdStat: (pid, fd) => {
				return this.getTable(pid).stat(fd);
			},

			// Process operations
			spawn: (command, args, ctx) => {
				return this.spawnManaged(command, args, {
					env: ctx.env,
					cwd: ctx.cwd,
					onStdout: ctx.onStdout,
					onStderr: ctx.onStderr,
					stdinFd: ctx.stdinFd,
					stdoutFd: ctx.stdoutFd,
					stderrFd: ctx.stderrFd,
				}, ctx.ppid);
			},
			waitpid: (pid) => {
				return this.processTable.waitpid(pid);
			},
			kill: (pid, signal) => {
				this.processTable.kill(pid, signal);
			},
			getpid: (pid) => pid,
			getppid: (pid) => {
				return this.processTable.getppid(pid);
			},

			// Process group / session
			setpgid: (pid, pgid) => {
				this.processTable.setpgid(pid, pgid);
			},
			getpgid: (pid) => {
				return this.processTable.getpgid(pid);
			},
			setsid: (pid) => {
				return this.processTable.setsid(pid);
			},
			getsid: (pid) => {
				return this.processTable.getsid(pid);
			},

			// Pipe operations
			pipe: (pid) => {
				// Create pipe and install both ends in the process's FD table
				const table = this.getTable(pid);
				return this.pipeManager.createPipeFDs(table);
			},

			// PTY operations
			openpty: (pid) => {
				const table = this.getTable(pid);
				return this.ptyManager.createPtyFDs(table);
			},
			isatty: (pid, fd) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) return false;
				return this.ptyManager.isSlave(entry.description.id);
			},
			ptySetDiscipline: (pid, fd, config) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);
				this.ptyManager.setDiscipline(entry.description.id, config);
			},
			ptySetForegroundPgid: (pid, fd, pgid) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);
				this.ptyManager.setForegroundPgid(entry.description.id, pgid);
			},

			// Termios operations
			tcgetattr: (pid, fd) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);
				return this.ptyManager.getTermios(entry.description.id);
			},
			tcsetattr: (pid, fd, termios) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);
				this.ptyManager.setTermios(entry.description.id, termios);
			},
			tcsetpgrp: (pid, fd, pgid) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);
				this.ptyManager.setForegroundPgid(entry.description.id, pgid);
			},
			tcgetpgrp: (pid, fd) => {
				const table = this.getTable(pid);
				const entry = table.get(fd);
				if (!entry) throw new KernelError("EBADF", `bad file descriptor ${fd}`);
				return this.ptyManager.getForegroundPgid(entry.description.id);
			},

			// Environment
			getenv: (pid) => {
				const entry = this.processTable.get(pid);
				return entry?.env ?? { ...this.env };
			},
			getcwd: (pid) => {
				const entry = this.processTable.get(pid);
				return entry?.cwd ?? this.cwd;
			},
		};
	}

	/**
	 * Create FD table for a child process via fork + optional FD overrides.
	 *
	 * When callerPid exists, forks the parent's FD table so the child inherits
	 * all open FDs (shared cursors via refcounted FileDescription). Then applies
	 * stdinFd/stdoutFd/stderrFd overrides on top of the forked table.
	 */
	private createChildFDTable(
		childPid: number,
		options?: SpawnOptions,
		callerPid?: number,
	): ProcessFDTable {
		// Fork parent's FD table if parent exists
		if (callerPid && this.fdTableManager.get(callerPid)) {
			const table = this.fdTableManager.fork(callerPid, childPid);

			// Apply FD overrides on top of the forked table
			const hasFdOverrides =
				options?.stdinFd !== undefined ||
				options?.stdoutFd !== undefined ||
				options?.stderrFd !== undefined;

			if (hasFdOverrides) {
				const callerTable = this.fdTableManager.get(callerPid)!;
				this.applyStdioOverride(table, callerTable, 0, options!.stdinFd);
				this.applyStdioOverride(table, callerTable, 1, options!.stdoutFd);
				this.applyStdioOverride(table, callerTable, 2, options!.stderrFd);
			}

			return table;
		}

		return this.fdTableManager.create(childPid);
	}

	/** Close inherited stdio FD and install an override from the caller's table. */
	private applyStdioOverride(
		childTable: ProcessFDTable,
		callerTable: ProcessFDTable,
		targetFd: number,
		overrideFd: number | undefined,
	): void {
		if (overrideFd === undefined) return;
		if (overrideFd === 0xFFFFFFFF) return; // /dev/null sentinel — keep inherited

		const entry = callerTable.get(overrideFd);
		if (!entry) return;

		// Close the inherited FD and install the override
		childTable.close(targetFd);
		childTable.openWith(entry.description, entry.filetype, targetFd);
	}

	/** Check if a stdio FD (0/1/2) in a process's table is a pipe or PTY. */
	private isStdioPiped(table: ProcessFDTable, fd: number): boolean {
		const entry = table.get(fd);
		if (!entry) return false;
		return this.pipeManager.isPipe(entry.description.id) || this.ptyManager.isPty(entry.description.id);
	}

	/** Clean up all FDs for a process, closing pipe/PTY ends when last reference drops. */
	private cleanupProcessFDs(pid: number): void {
		const table = this.fdTableManager.get(pid);
		if (!table) return;

		// Collect pipe/PTY descriptions before closing so we can check refCounts after
		const managedDescs: { id: number; description: { refCount: number }; type: "pipe" | "pty" }[] = [];
		for (const entry of table) {
			if (this.pipeManager.isPipe(entry.description.id)) {
				managedDescs.push({ id: entry.description.id, description: entry.description, type: "pipe" });
			} else if (this.ptyManager.isPty(entry.description.id)) {
				managedDescs.push({ id: entry.description.id, description: entry.description, type: "pty" });
			}
		}

		// Close all FDs and remove the table
		this.fdTableManager.remove(pid);

		// Signal closure for descriptions whose last reference was dropped
		for (const { id, description, type } of managedDescs) {
			if (description.refCount <= 0) {
				if (type === "pipe") this.pipeManager.close(id);
				else this.ptyManager.close(id);
			}
		}
	}

	private getTable(pid: number): ProcessFDTable {
		const table = this.fdTableManager.get(pid);
		if (!table) throw new KernelError("ESRCH", `no FD table for PID ${pid}`);
		return table;
	}

	private assertNotDisposed(): void {
		if (this.disposed) throw new Error("Kernel is disposed");
	}
}

interface InternalProcess {
	pid: number;
	driverProcess: import("./types.js").DriverProcess;
	wait(): Promise<number>;
	writeStdin(data: Uint8Array): void;
	closeStdin(): void;
	kill(signal: number): void;
	onStdout: ((data: Uint8Array) => void) | null;
	onStderr: ((data: Uint8Array) => void) | null;
}

function concatUint8(chunks: Uint8Array[]): string {
	if (chunks.length === 0) return "";
	const total = chunks.reduce((sum, c) => sum + c.length, 0);
	const buf = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		buf.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder().decode(buf);
}
