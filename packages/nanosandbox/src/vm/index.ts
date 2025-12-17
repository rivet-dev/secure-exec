import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Directory, init } from "@wasmer/sdk/node";
import { NodeProcess } from "sandboxed-node";
import { SystemBridge } from "../system-bridge/index.js";
import {
	DATA_MOUNT_PATH,
	InteractiveSession,
	WasixInstance,
} from "../wasix/index.js";

export { WasixInstance, InteractiveSession, Directory, DATA_MOUNT_PATH };

export interface SpawnResult {
	stdout: string;
	stderr: string;
	code: number;
}

export interface VirtualMachineOptions {
	memoryLimit?: number; // MB, default 128 for isolates
	loadNpm?: boolean; // Load npm/npx into filesystem (default: true)
}

let wasmerInitialized = false;

export class VirtualMachine {
	private bridge: SystemBridge | null = null;
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
			await init();
			wasmerInitialized = true;
		}

		// Create SystemBridge after wasmer is initialized
		this.bridge = new SystemBridge();

		// Load npm into virtual filesystem if enabled (default: true)
		if (this.options.loadNpm !== false) {
			await this.loadNpm();
		}

		// Create NodeProcess with access to virtual filesystem
		this.nodeProcess = new NodeProcess({
			memoryLimit: this.options.memoryLimit,
			directory: this.bridge.getDirectory(),
		});

		// Create WasixInstance sharing the same filesystem
		this.wasixInstance = new WasixInstance({
			directory: this.bridge.getDirectory(),
			nodeProcess: this.nodeProcess,
			memoryLimit: this.options.memoryLimit,
		});

		this.initialized = true;
	}

	/**
	 * Load npm and npx into the virtual filesystem
	 */
	private async loadNpm(): Promise<void> {
		if (!this.bridge) return;

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
		await loadHostDirectory(npmAssetsPath, "/opt/npm", this.bridge);

		// Create default /etc/npmrc
		// Note: mkdir is needed even if /etc exists - it signals the fs layer
		this.bridge.mkdir("/etc");
		this.bridge.writeFile(
			"/etc/npmrc",
			`; Default npm configuration
prefix=/usr/local
cache=/tmp/.npm
`,
		);

		// npm is accessible at DATA_MOUNT_PATH + /opt/npm (e.g., /data/opt/npm)
		// To run npm: node /data/opt/npm/lib/node_modules/npm/bin/npm-cli.js
	}

	/**
	 * Get the path where npm is installed in the WASM virtual filesystem (bash/wasix).
	 * Returns the full path including the DATA_MOUNT_PATH prefix.
	 * Use this path for shell commands like: bash -c "ls ${getNpmPath()}"
	 * Returns null if npm is not loaded.
	 */
	getNpmPath(): string | null {
		if (this.options.loadNpm === false) {
			return null;
		}
		return `${DATA_MOUNT_PATH}/opt/npm`;
	}

	/**
	 * Get the path where npm is installed in the Directory (node/filesystem API).
	 * Returns the path without DATA_MOUNT_PATH prefix.
	 * Use this path for node commands like: node ${getNpmDirectoryPath()}/lib/node_modules/npm/bin/npm-cli.js
	 * Returns null if npm is not loaded.
	 */
	getNpmDirectoryPath(): string | null {
		if (this.options.loadNpm === false) {
			return null;
		}
		return "/opt/npm";
	}

	/**
	 * Ensure VM is initialized (throws if not)
	 */
	private ensureInitialized(): SystemBridge {
		if (!this.bridge) {
			throw new Error("VirtualMachine not initialized. Call init() first.");
		}
		return this.bridge;
	}

	/**
	 * Get the underlying SystemBridge
	 */
	getSystemBridge(): SystemBridge {
		return this.ensureInitialized();
	}

	/**
	 * Get the underlying Directory instance
	 */
	getDirectory(): Directory {
		return this.ensureInitialized().getDirectory();
	}

	/**
	 * Write a file to the virtual filesystem
	 */
	writeFile(path: string, content: string | Uint8Array): void {
		this.ensureInitialized().writeFile(path, content);
	}

	/**
	 * Read a file from the virtual filesystem
	 */
	async readFile(path: string): Promise<string> {
		return this.ensureInitialized().readFile(path);
	}

	/**
	 * Read a file as binary
	 */
	async readFileBinary(path: string): Promise<Uint8Array> {
		return this.ensureInitialized().readFileBinary(path);
	}

	/**
	 * Check if a path exists
	 */
	async exists(path: string): Promise<boolean> {
		return this.ensureInitialized().exists(path);
	}

	/**
	 * Read directory contents
	 */
	async readDir(path: string): Promise<string[]> {
		return this.ensureInitialized().readDir(path);
	}

	/**
	 * Create a directory
	 */
	mkdir(path: string): void {
		this.ensureInitialized().mkdir(path);
	}

	/**
	 * Remove a file
	 */
	async remove(path: string): Promise<void> {
		return this.ensureInitialized().remove(path);
	}

	/**
	 * Load files from host filesystem into the virtual filesystem
	 * This recursively copies all files from the host path into the virtual fs
	 * @param hostPath - Path on the host filesystem to copy from
	 * @param virtualBasePath - Where to mount in virtual fs (default "/")
	 */
	async loadFromHost(
		hostPath: string,
		virtualBasePath: string = "/",
	): Promise<void> {
		const { loadHostDirectory } = await import("./host-loader.js");
		const bridge = this.ensureInitialized();
		await loadHostDirectory(hostPath, virtualBasePath, bridge);
	}

	/**
	 * Spawn a command in the virtual machine
	 * Routes to appropriate runtime (node -> NodeProcess, linux -> WasixInstance)
	 */
	async spawn(command: string, args: string[] = []): Promise<SpawnResult> {
		await this.init();

		if (!this.nodeProcess || !this.wasixInstance || !this.bridge) {
			throw new Error("VirtualMachine not properly initialized");
		}

		// Route node commands to NodeProcess
		if (command === "node") {
			return this.spawnNode(args);
		}

		// Route all other commands to WasixInstance with IPC support
		// This allows shell scripts to call node via IPC
		return this.wasixInstance.runWithIpc(command, args);
	}

	/**
	 * Execute node via NodeProcess
	 */
	private async spawnNode(args: string[]): Promise<SpawnResult> {
		if (!this.nodeProcess || !this.bridge) {
			throw new Error("NodeProcess not initialized");
		}

		// Parse node args to extract code
		let code = "";

		for (let i = 0; i < args.length; i++) {
			if (args[i] === "-e" || args[i] === "--eval") {
				code = args[i + 1] || "";
				break;
			} else if (!args[i].startsWith("-")) {
				// It's a script file path
				const scriptPath = args[i];
				try {
					code = await this.bridge.readFile(scriptPath);
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

		const result = await this.nodeProcess.exec(code);
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.code,
		};
	}

	/**
	 * Run an interactive command with streaming I/O
	 * Returns an InteractiveSession for stream access
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
		this.bridge = null;
		this.initialized = false;
	}
}
