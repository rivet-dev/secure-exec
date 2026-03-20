/**
 * Test helpers for kernel tests.
 * Provides a minimal in-memory VFS, MockRuntimeDriver, and createTestKernel.
 */

import type { VirtualFileSystem, VirtualStat, VirtualDirEntry } from "../src/vfs.js";
import type {
	RuntimeDriver,
	DriverProcess,
	ProcessContext,
	KernelInterface,
	Kernel,
	Permissions,
} from "../src/types.js";
import { createKernel } from "../src/kernel.js";

const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

function normalizePath(path: string): string {
	if (!path) return "/";
	let normalized = path.startsWith("/") ? path : `/${path}`;
	normalized = normalized.replace(/\/+/g, "/");
	if (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	const parts = normalized.split("/");
	const resolved: string[] = [];
	for (const part of parts) {
		if (part === "." || part === "") continue;
		if (part === "..") { resolved.pop(); } else { resolved.push(part); }
	}
	return "/" + resolved.join("/") || "/";
}

function dirname(path: string): string {
	const parts = normalizePath(path).split("/").filter(Boolean);
	if (parts.length <= 1) return "/";
	return "/" + parts.slice(0, -1).join("/");
}

let nextIno = 1;

/** Minimal in-memory VFS for kernel unit tests. */
export class TestFileSystem implements VirtualFileSystem {
	private files = new Map<string, { data: Uint8Array; mode: number; uid: number; gid: number; ino: number }>();
	private dirs = new Set<string>(["/"]);
	private dirModes = new Map<string, number>();
	private symlinks = new Map<string, string>();

	async readFile(path: string): Promise<Uint8Array> {
		const n = normalizePath(path);
		const f = this.files.get(n);
		if (!f) throw new Error(`ENOENT: no such file or directory, open '${n}'`);
		return f.data;
	}

	async readTextFile(path: string): Promise<string> {
		return new TextDecoder().decode(await this.readFile(path));
	}

	async readDir(path: string): Promise<string[]> {
		return (await this.readDirWithTypes(path)).map((e) => e.name);
	}

	async readDirWithTypes(path: string): Promise<VirtualDirEntry[]> {
		const n = normalizePath(path);
		if (!this.dirs.has(n)) throw new Error(`ENOENT: no such directory '${n}'`);
		const prefix = n === "/" ? "/" : n + "/";
		const entries = new Map<string, VirtualDirEntry>();
		for (const fp of this.files.keys()) {
			if (fp.startsWith(prefix)) {
				const rest = fp.slice(prefix.length);
				if (rest && !rest.includes("/")) entries.set(rest, { name: rest, isDirectory: false });
			}
		}
		for (const dp of this.dirs) {
			if (dp.startsWith(prefix)) {
				const rest = dp.slice(prefix.length);
				if (rest && !rest.includes("/")) entries.set(rest, { name: rest, isDirectory: true });
			}
		}
		return Array.from(entries.values());
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		const n = normalizePath(path);
		await this.mkdir(dirname(n));
		const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
		this.files.set(n, { data, mode: S_IFREG | 0o644, uid: 1000, gid: 1000, ino: nextIno++ });
	}

	async createDir(path: string): Promise<void> {
		const n = normalizePath(path);
		if (!this.dirs.has(dirname(n))) throw new Error(`ENOENT: ${n}`);
		this.dirs.add(n);
	}

	async mkdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
		const parts = normalizePath(path).split("/").filter(Boolean);
		let cur = "";
		for (const p of parts) { cur += "/" + p; this.dirs.add(cur); }
	}

	async exists(path: string): Promise<boolean> {
		const n = normalizePath(path);
		return this.files.has(n) || this.dirs.has(n) || this.symlinks.has(n);
	}

	async stat(path: string): Promise<VirtualStat> {
		const n = normalizePath(path);
		const now = Date.now();
		const f = this.files.get(n);
		if (f) return { mode: f.mode, size: f.data.length, isDirectory: false, isSymbolicLink: false, atimeMs: now, mtimeMs: now, ctimeMs: now, birthtimeMs: now, ino: f.ino, nlink: 1, uid: f.uid, gid: f.gid };
		if (this.dirs.has(n)) return { mode: S_IFDIR | (this.dirModes.get(n) ?? 0o755), size: 4096, isDirectory: true, isSymbolicLink: false, atimeMs: now, mtimeMs: now, ctimeMs: now, birthtimeMs: now, ino: 0, nlink: 2, uid: 1000, gid: 1000 };
		throw new Error(`ENOENT: ${n}`);
	}

	async removeFile(path: string): Promise<void> {
		const n = normalizePath(path);
		if (!this.files.delete(n)) throw new Error(`ENOENT: ${n}`);
	}

	async removeDir(path: string): Promise<void> {
		const n = normalizePath(path);
		if (!this.dirs.has(n)) throw new Error(`ENOENT: ${n}`);
		this.dirs.delete(n);
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const o = normalizePath(oldPath);
		const n = normalizePath(newPath);
		const f = this.files.get(o);
		if (f) { this.files.set(n, f); this.files.delete(o); return; }
		if (this.dirs.has(o)) { this.dirs.delete(o); this.dirs.add(n); return; }
		throw new Error(`ENOENT: ${o}`);
	}

	async realpath(path: string): Promise<string> {
		const n = normalizePath(path);
		// Resolve symlinks
		const target = this.symlinks.get(n);
		if (target) return normalizePath(target);
		if (this.files.has(n) || this.dirs.has(n)) return n;
		throw new Error(`ENOENT: ${n}`);
	}

	async symlink(target: string, linkPath: string): Promise<void> {
		this.symlinks.set(normalizePath(linkPath), target);
	}

	async readlink(path: string): Promise<string> {
		const n = normalizePath(path);
		const t = this.symlinks.get(n);
		if (!t) throw new Error(`ENOENT: ${n}`);
		return t;
	}

	async lstat(path: string): Promise<VirtualStat> {
		const n = normalizePath(path);
		const now = Date.now();
		if (this.symlinks.has(n)) {
			return { mode: S_IFLNK | 0o777, size: 0, isDirectory: false, isSymbolicLink: true, atimeMs: now, mtimeMs: now, ctimeMs: now, birthtimeMs: now, ino: 0, nlink: 1, uid: 1000, gid: 1000 };
		}
		return this.stat(path);
	}

	async link(oldPath: string, newPath: string): Promise<void> {
		const o = normalizePath(oldPath);
		const n = normalizePath(newPath);
		const f = this.files.get(o);
		if (!f) throw new Error(`ENOENT: ${o}`);
		this.files.set(n, f);
	}

	async chmod(path: string, mode: number): Promise<void> {
		const n = normalizePath(path);
		const f = this.files.get(n);
		if (f) { f.mode = (f.mode & 0o170000) | (mode & 0o7777); return; }
		if (this.dirs.has(n)) { this.dirModes.set(n, mode & 0o7777); return; }
		throw new Error(`ENOENT: ${n}`);
	}

	async chown(path: string, uid: number, gid: number): Promise<void> {
		const n = normalizePath(path);
		const f = this.files.get(n);
		if (f) { f.uid = uid; f.gid = gid; return; }
		if (!this.dirs.has(n)) throw new Error(`ENOENT: ${n}`);
	}

	async utimes(_path: string, _atime: number, _mtime: number): Promise<void> {
		// No-op for test VFS
	}

	async truncate(path: string, length: number): Promise<void> {
		const n = normalizePath(path);
		const f = this.files.get(n);
		if (!f) throw new Error(`ENOENT: ${n}`);
		if (length < f.data.length) f.data = f.data.slice(0, length);
		else if (length > f.data.length) {
			const nd = new Uint8Array(length);
			nd.set(f.data);
			f.data = nd;
		}
	}

	async pread(path: string, offset: number, length: number): Promise<Uint8Array> {
		const n = normalizePath(path);
		const f = this.files.get(n);
		if (!f) throw new Error(`ENOENT: no such file or directory, open '${n}'`);
		if (offset >= f.data.length) return new Uint8Array(0);
		return f.data.slice(offset, Math.min(offset + length, f.data.length));
	}
}

// ---------------------------------------------------------------------------
// MockRuntimeDriver
// ---------------------------------------------------------------------------

export interface MockCommandConfig {
	exitCode?: number;
	stdout?: string | Uint8Array;
	stderr?: string | Uint8Array;
	/** If true, emit stdout/stderr synchronously during spawn (before callbacks are attached) */
	emitDuringSpawn?: boolean;
	/** If provided, writeStdin pushes received Uint8Array chunks here */
	stdinCapture?: Uint8Array[];
	/** If provided, called on closeStdin */
	onCloseStdin?: () => void;
	/** If true, writeStdin data is immediately emitted as stdout via DriverProcess.onStdout */
	echoStdin?: boolean;
	/** If true, process never exits on its own — only exits when kill() is called */
	neverExit?: boolean;
	/** If provided, kill signal numbers are pushed here when kill() is called */
	killSignals?: number[];
	/** Signals that are recorded but do NOT cause the process to exit. */
	survivableSignals?: number[];
	/** If true, process reads stdin via KernelInterface FDs and echoes to stdout. */
	readStdinFromKernel?: boolean;
}

/**
 * Mock runtime driver for kernel integration tests.
 * Configurable commands, exit codes, and stdout/stderr output.
 */
export class MockRuntimeDriver implements RuntimeDriver {
	name = "mock";
	commands: string[];
	kernelInterface: KernelInterface | null = null;
	tryResolve?: (command: string) => boolean;
	private commandConfigs: Map<string, MockCommandConfig>;

	constructor(
		commandList: string[],
		configs?: Record<string, MockCommandConfig>,
	) {
		this.commands = commandList;
		this.commandConfigs = new Map(Object.entries(configs ?? {}));
	}

	async init(kernel: KernelInterface): Promise<void> {
		this.kernelInterface = kernel;
	}

	spawn(command: string, _args: string[], ctx: ProcessContext): DriverProcess {
		const config = this.commandConfigs.get(command) ?? {};
		const exitCode = config.exitCode ?? 0;
		const stdoutData = typeof config.stdout === "string"
			? new TextEncoder().encode(config.stdout)
			: config.stdout;
		const stderrData = typeof config.stderr === "string"
			? new TextEncoder().encode(config.stderr)
			: config.stderr;

		let exitResolve: (code: number) => void;
		const exitPromise = new Promise<number>((r) => { exitResolve = r; });

		const proc: DriverProcess = {
			writeStdin(data) {
				if (config.stdinCapture) config.stdinCapture.push(data);
				if (config.echoStdin) proc.onStdout?.(data);
			},
			closeStdin() {
				config.onCloseStdin?.();
				if (config.echoStdin) {
					exitResolve!(exitCode);
					proc.onExit?.(exitCode);
				}
			},
			kill(_signal) {
				config.killSignals?.push(_signal);
				if (config.survivableSignals?.includes(_signal)) return;
				const code = 128 + _signal;
				exitResolve!(code);
				proc.onExit?.(code);
			},
			wait() { return exitPromise; },
			onStdout: null,
			onStderr: null,
			onExit: null,
		};

		if (config.readStdinFromKernel && this.kernelInterface) {
			// Read from stdin FD via kernel and echo to stdout FD
			const ki = this.kernelInterface;
			const pid = ctx.pid;
			const stdinFd = ctx.fds.stdin;
			const stdoutFd = ctx.fds.stdout;
			(async () => {
				try {
					while (true) {
						const data = await ki.fdRead(pid, stdinFd, 4096);
						if (data.length === 0) {
							exitResolve!(exitCode);
							proc.onExit?.(exitCode);
							break;
						}
						ki.fdWrite(pid, stdoutFd, data);
					}
				} catch {
					exitResolve!(exitCode);
					proc.onExit?.(exitCode);
				}
			})();
		} else if (config.neverExit || config.echoStdin) {
			// Process hangs until kill() or closeStdin() (echoStdin)
		} else if (config.emitDuringSpawn) {
			// Emit synchronously during spawn via ctx callbacks
			if (stdoutData) ctx.onStdout?.(stdoutData);
			if (stderrData) ctx.onStderr?.(stderrData);
			// Resolve exit on next microtask
			queueMicrotask(() => {
				exitResolve!(exitCode);
				proc.onExit?.(exitCode);
			});
		} else {
			// Emit on next microtask via DriverProcess callbacks
			queueMicrotask(() => {
				if (stdoutData) proc.onStdout?.(stdoutData);
				if (stderrData) proc.onStderr?.(stderrData);
				exitResolve!(exitCode);
				proc.onExit?.(exitCode);
			});
		}

		return proc;
	}

	async dispose(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// createTestKernel
// ---------------------------------------------------------------------------

export interface TestKernelResult {
	kernel: Kernel;
	vfs: TestFileSystem;
}

/**
 * Create a kernel with TestFileSystem, optionally mounting provided drivers.
 */
export async function createTestKernel(options?: {
	drivers?: RuntimeDriver[];
	permissions?: Permissions;
	maxProcesses?: number;
}): Promise<TestKernelResult> {
	const vfs = new TestFileSystem();
	const kernel = createKernel({ filesystem: vfs, permissions: options?.permissions, maxProcesses: options?.maxProcesses });

	if (options?.drivers) {
		for (const driver of options.drivers) {
			await kernel.mount(driver);
		}
	}

	return { kernel, vfs };
}
