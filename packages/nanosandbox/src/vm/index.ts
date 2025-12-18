import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Directory, init } from "@wasmer/sdk/node";
import { NodeProcess, createDefaultNetworkAdapter, type VirtualFileSystem } from "sandboxed-node";
import {
	DATA_MOUNT_PATH,
	InteractiveSession,
	WasixInstance,
} from "../wasix/index.js";
import { createVirtualFileSystem } from "./virtual-filesystem.js";

export { WasixInstance, InteractiveSession, Directory, DATA_MOUNT_PATH };
export type { VirtualFileSystem };

export interface SpawnResult {
	stdout: string;
	stderr: string;
	code: number;
}

export interface SpawnOptions {
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface VirtualMachineOptions {
	memoryLimit?: number; // MB, default 128 for isolates
	loadNpm?: boolean; // Load npm/npx into filesystem (default: true)
}

let wasmerInitialized = false;

/**
 * Helper to create directories recursively on a Directory instance
 */
async function mkdirRecursive(directory: Directory, dirPath: string): Promise<void> {
	const parts = dirPath.split("/").filter(Boolean);
	let currentPath = "";
	for (const part of parts) {
		currentPath += `/${part}`;
		try {
			await directory.createDir(currentPath);
		} catch {
			// Directory may already exist
		}
	}
}

export class VirtualMachine {
	private directory: Directory | null = null;
	private vfs: VirtualFileSystem | null = null;
	private options: VirtualMachineOptions;
	private initialized = false;
	private nodeProcess: NodeProcess | null = null;
	private wasixInstance: WasixInstance | null = null;

	constructor(options: VirtualMachineOptions = {}) {
		this.options = options;
	}

	/**
	 * Initialize the VM (ensures wasmer is initialized)
	 */
	async init(): Promise<void> {
		if (this.initialized) return;

		if (!wasmerInitialized) {
			// SDK v0.10 expects an options object
			await init({ log: "warn" });
			wasmerInitialized = true;
		}

		// Create Directory after wasmer is initialized
		this.directory = new Directory();

		// Load npm into virtual filesystem if enabled (default: true)
		// This happens before VFS is created since it writes directly to Directory
		if (this.options.loadNpm !== false) {
			await this.loadNpm();
		}

		// Create virtual filesystem wrapper with shell fallback for non-/data paths.
		// The shell callback captures `this` via closure, so it can access wasixInstance
		// even though it's created after this call.
		this.vfs = createVirtualFileSystem(
			this.directory,
			async (command: string, args: string[]) => {
				if (!this.wasixInstance) {
					throw new Error("WasixInstance not initialized");
				}
				return this.wasixInstance.runWithIpc(command, args);
			},
		);

		// Create NodeProcess with access to virtual filesystem
		// Set homedir to /data/root so npm and other tools write to /data/*
		this.nodeProcess = new NodeProcess({
			memoryLimit: this.options.memoryLimit,
			filesystem: this.vfs,
			osConfig: { homedir: "/data/root" },
			networkAdapter: createDefaultNetworkAdapter(),
		});

		// Create WasixInstance sharing the same filesystem
		this.wasixInstance = new WasixInstance({
			directory: this.directory,
			nodeProcess: this.nodeProcess,
			memoryLimit: this.options.memoryLimit,
		});

		// Connect NodeProcess to WasixInstance for child_process support
		// This allows code running in NodeProcess to spawn child processes
		// via the WASM environment
		this.nodeProcess.setCommandExecutor(this.wasixInstance);

		this.initialized = true;
	}

	/**
	 * Get the VirtualFileSystem instance.
	 * All paths must use /data prefix to access files in the Directory.
	 * Non-/data paths can read from WASM system paths via shell fallback.
	 */
	getVirtualFileSystem(): VirtualFileSystem {
		if (!this.vfs) {
			throw new Error("VirtualMachine not initialized. Call init() first.");
		}
		return this.vfs;
	}

	/**
	 * Load npm and npx into the virtual filesystem.
	 * Writes directly to Directory (paths without /data prefix).
	 * These files will appear at /data/* in the WASM filesystem.
	 */
	private async loadNpm(): Promise<void> {
		if (!this.directory) return;

		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const npmAssetsPath = path.resolve(currentDir, "../../assets/npm");

		// Check if npm assets exist
		try {
			await fs.stat(npmAssetsPath);
		} catch {
			// npm assets not built - skip loading
			return;
		}

		// Load npm module to /opt/npm
		// IMPORTANT: Do NOT use /usr/lib/node_modules/npm - the wasix runtime.webc
		// bundles coreutils and bash under /usr, and writing to /usr via the Directory
		// API conflicts with the webc's filesystem, breaking IPC-based node execution.
		const { loadHostDirectory } = await import("./host-loader.js");
		await loadHostDirectory(npmAssetsPath, "/opt/npm", this.directory);

		// Create default /etc/npmrc
		await mkdirRecursive(this.directory, "/etc");
		await this.directory.writeFile(
			"/etc/npmrc",
			`; Default npm configuration
prefix=/usr/local
cache=/tmp/.npm
`,
		);

		// npm is accessible at DATA_MOUNT_PATH + /opt/npm (e.g., /data/opt/npm)
		// To run npm: node /data/opt/npm/bin/npm-cli.js (via spawn)
		// Note: PATH lookup doesn't work for mounted directories in wasix,
		// so npm must be invoked via explicit path or node spawn.

		// Create simple wrapper scripts in /bin for convenience
		await mkdirRecursive(this.directory, "/bin");
		await this.directory.writeFile(
			"/bin/npm",
			`#!/bin/bash
node /data/opt/npm/bin/npm-cli.js "$@"
`,
		);
		await this.directory.writeFile(
			"/bin/npx",
			`#!/bin/bash
node /data/opt/npm/bin/npx-cli.js "$@"
`,
		);
	}

	/**
	 * Get the path where npm is installed in the WASM virtual filesystem.
	 * Returns the full path including the DATA_MOUNT_PATH prefix.
	 * Use this path in scripts: require('/data/opt/npm/...')
	 * Returns null if npm is not loaded.
	 */
	getNpmPath(): string | null {
		if (this.options.loadNpm === false) {
			return null;
		}
		return `${DATA_MOUNT_PATH}/opt/npm`;
	}

	/**
	 * Ensure VM is initialized and return VFS (throws if not)
	 */
	private ensureInitialized(): VirtualFileSystem {
		if (!this.vfs || !this.directory) {
			throw new Error("VirtualMachine not initialized. Call init() first.");
		}
		return this.vfs;
	}

	/**
	 * Get the underlying Directory instance.
	 * Note: For most operations, use the VirtualMachine methods instead.
	 * Direct Directory access bypasses path validation.
	 */
	getDirectory(): Directory {
		if (!this.directory) {
			throw new Error("VirtualMachine not initialized. Call init() first.");
		}
		return this.directory;
	}

	/**
	 * Write a file to the virtual filesystem.
	 * Path must start with /data/ (e.g., /data/app/index.js)
	 */
	async writeFile(filePath: string, content: string | Uint8Array): Promise<void> {
		const vfs = this.ensureInitialized();
		await vfs.writeFile(filePath, content);
	}

	/**
	 * Read a file from the virtual filesystem as text.
	 * /data/* paths read from Directory, others from WASM system via shell.
	 */
	async readFile(filePath: string): Promise<string> {
		const vfs = this.ensureInitialized();
		return vfs.readTextFile(filePath);
	}

	/**
	 * Read a file as binary.
	 * /data/* paths read from Directory, others from WASM system via shell.
	 */
	async readFileBinary(filePath: string): Promise<Uint8Array> {
		const vfs = this.ensureInitialized();
		return vfs.readFile(filePath);
	}

	/**
	 * Check if a path exists.
	 * /data/* paths check Directory, others check WASM system via shell.
	 */
	async exists(filePath: string): Promise<boolean> {
		const vfs = this.ensureInitialized();
		return vfs.exists(filePath);
	}

	/**
	 * Read directory contents.
	 * /data/* paths read from Directory, others from WASM system via shell.
	 */
	async readDir(dirPath: string): Promise<string[]> {
		const vfs = this.ensureInitialized();
		return vfs.readDir(dirPath);
	}

	/**
	 * Create a directory (recursively creates parents).
	 * Path must start with /data/ (e.g., /data/app/lib)
	 */
	async mkdir(dirPath: string): Promise<void> {
		const vfs = this.ensureInitialized();
		await vfs.mkdir(dirPath);
	}

	/**
	 * Remove a file.
	 * Path must start with /data/
	 */
	async remove(filePath: string): Promise<void> {
		const vfs = this.ensureInitialized();
		await vfs.removeFile(filePath);
	}

	/**
	 * Load files from host filesystem into the virtual filesystem.
	 * This recursively copies all files from the host path into the virtual fs.
	 * @param hostPath - Path on the host filesystem to copy from
	 * @param virtualBasePath - Where to mount in Directory (without /data prefix)
	 *                          Files will be accessible at /data/{virtualBasePath}/...
	 */
	async loadFromHost(
		hostPath: string,
		virtualBasePath: string = "/",
	): Promise<void> {
		if (!this.directory) {
			throw new Error("VirtualMachine not initialized. Call init() first.");
		}
		const { loadHostDirectory } = await import("./host-loader.js");
		await loadHostDirectory(hostPath, virtualBasePath, this.directory);
	}

	/**
	 * Spawn a command in the virtual machine.
	 * Routes to appropriate runtime (node -> NodeProcess, others -> WasixInstance)
	 */
	async spawn(command: string, options: SpawnOptions = {}): Promise<SpawnResult> {
		await this.init();

		if (!this.nodeProcess || !this.wasixInstance || !this.vfs) {
			throw new Error("VirtualMachine not properly initialized");
		}

		const { args = [], env, cwd } = options;

		// Route node commands to NodeProcess
		if (command === "node") {
			return this.spawnNode(args, env, cwd);
		}

		// Route all other commands to WasixInstance with IPC support
		// This allows shell scripts to call node via IPC
		return this.wasixInstance.runWithIpc(command, args, env, cwd);
	}

	/**
	 * Execute node via NodeProcess
	 */
	private async spawnNode(
		args: string[],
		env?: Record<string, string>,
		cwd?: string,
	): Promise<SpawnResult> {
		if (!this.nodeProcess || !this.vfs) {
			throw new Error("NodeProcess not initialized");
		}

		// Parse node args to extract code
		let code = "";
		let scriptPath: string | undefined;

		for (let i = 0; i < args.length; i++) {
			if (args[i] === "-e" || args[i] === "--eval") {
				code = args[i + 1] || "";
				break;
			} else if (!args[i].startsWith("-")) {
				// It's a script file path - should be /data/... path
				scriptPath = args[i];
				try {
					code = await this.vfs.readTextFile(scriptPath);
				} catch {
					return {
						stdout: "",
						stderr: `Cannot find module '${scriptPath}'`,
						code: 1,
					};
				}
				break;
			}
		}

		if (!code) {
			return { stdout: "", stderr: "", code: 0 };
		}

		// Pass the script path so __dirname/__filename are set correctly
		const result = await this.nodeProcess.exec(code, { filePath: scriptPath, env, cwd });
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.code,
		};
	}

	/**
	 * Run an interactive command with streaming I/O.
	 * Returns an InteractiveSession for stream access.
	 */
	async runInteractive(
		command: string,
		args: string[] = [],
	): Promise<InteractiveSession> {
		await this.init();

		if (!this.wasixInstance) {
			throw new Error("VirtualMachine not properly initialized");
		}

		return this.wasixInstance.runInteractive(command, args);
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		if (this.nodeProcess) {
			this.nodeProcess.dispose();
			this.nodeProcess = null;
		}
		this.wasixInstance = null;
		this.vfs = null;
		this.directory = null;
		this.initialized = false;
	}

	/**
	 * Dispose of resources and wait for async cleanup to settle.
	 * Use this in tests to avoid wasmer SDK async cleanup errors.
	 */
	async disposeAsync(): Promise<void> {
		this.dispose();
		// Give wasmer SDK time to complete async cleanup operations
		// This works around wasmer-js bugs where cleanup throws after disposal
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}
