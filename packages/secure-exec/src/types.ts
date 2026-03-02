/**
 * Minimal filesystem interface for secure-exec.
 *
 * This interface abstracts filesystem operations needed by the sandbox.
 */
export interface VirtualDirEntry {
	name: string;
	isDirectory: boolean;
}

export interface VirtualStat {
	mode: number;
	size: number;
	isDirectory: boolean;
	atimeMs: number;
	mtimeMs: number;
	ctimeMs: number;
	birthtimeMs: number;
}

export interface VirtualFileSystem {
	/**
	 * Read a file as binary data.
	 * @throws Error if file doesn't exist.
	 */
	readFile(path: string): Promise<Uint8Array>;

	/**
	 * Read a file as text (UTF-8).
	 * @throws Error if file doesn't exist.
	 */
	readTextFile(path: string): Promise<string>;

	/**
	 * Read directory entries (file/folder names).
	 * @throws Error if directory doesn't exist.
	 */
	readDir(path: string): Promise<string[]>;

	/**
	 * Read directory entries with type metadata.
	 * @throws Error if directory doesn't exist.
	 */
	readDirWithTypes(path: string): Promise<VirtualDirEntry[]>;

	/**
	 * Write a file (creates parent directories as needed).
	 * @param path - Absolute path to the file.
	 * @param content - String or binary content.
	 */
	writeFile(path: string, content: string | Uint8Array): Promise<void>;

	/**
	 * Create a single directory level.
	 * @throws Error if parent doesn't exist.
	 */
	createDir(path: string): Promise<void>;

	/**
	 * Create a directory recursively (creates parent directories as needed).
	 * Should not throw if directory already exists.
	 */
	mkdir(path: string): Promise<void>;

	/**
	 * Check if a path exists (file or directory).
	 */
	exists(path: string): Promise<boolean>;

	/**
	 * Get file or directory metadata.
	 * @throws Error if path doesn't exist.
	 */
	stat(path: string): Promise<VirtualStat>;

	/**
	 * Remove a file.
	 * @throws Error if file doesn't exist.
	 */
	removeFile(path: string): Promise<void>;

	/**
	 * Remove an empty directory.
	 * @throws Error if directory doesn't exist or is not empty.
	 */
	removeDir(path: string): Promise<void>;

	/**
	 * Rename or move a file/directory.
	 * Behavior SHOULD be atomic when supported by the backing store.
	 */
	rename(oldPath: string, newPath: string): Promise<void>;
}

export interface SpawnedProcess {
	writeStdin(data: Uint8Array | string): void;
	closeStdin(): void;
	kill(signal?: number): void;
	wait(): Promise<number>;
}

export interface CommandExecutor {
	spawn(
		command: string,
		args: string[],
		options: {
			cwd?: string;
			env?: Record<string, string>;
			onStdout?: (data: Uint8Array) => void;
			onStderr?: (data: Uint8Array) => void;
		},
	): SpawnedProcess;
}

export interface NetworkServerAddress {
	address: string;
	family: string;
	port: number;
}

export interface NetworkServerRequest {
	method: string;
	url: string;
	headers: Record<string, string>;
	rawHeaders: string[];
	bodyBase64?: string;
}

export interface NetworkServerResponse {
	status: number;
	headers?: Array<[string, string]>;
	body?: string;
	bodyEncoding?: "utf8" | "base64";
}

export interface NetworkServerListenOptions {
	serverId: number;
	port?: number;
	hostname?: string;
	onRequest(
		request: NetworkServerRequest,
	): Promise<NetworkServerResponse> | NetworkServerResponse;
}

export interface NetworkAdapter {
	httpServerListen?(
		options: NetworkServerListenOptions,
	): Promise<{ address: NetworkServerAddress | null }>;
	httpServerClose?(serverId: number): Promise<void>;
	fetch(
		url: string,
		options: {
			method?: string;
			headers?: Record<string, string>;
			body?: string | null;
		},
	): Promise<{
		ok: boolean;
		status: number;
		statusText: string;
		headers: Record<string, string>;
		body: string;
		url: string;
		redirected: boolean;
	}>;
	dnsLookup(hostname: string): Promise<
		| {
				address: string;
				family: number;
		  }
		| { error: string; code: string }
	>;
	httpRequest(
		url: string,
		options: {
			method?: string;
			headers?: Record<string, string>;
			body?: string | null;
		},
	): Promise<{
		status: number;
		statusText: string;
		headers: Record<string, string>;
		body: string;
		url: string;
	}>;
}

export interface PermissionDecision {
	allow: boolean;
	reason?: string;
}

export type PermissionCheck<T> = (request: T) => PermissionDecision;

export interface FsAccessRequest {
	op:
		| "read"
		| "write"
		| "mkdir"
		| "createDir"
		| "readdir"
		| "stat"
		| "rm"
		| "rename"
		| "exists";
	path: string;
}

export interface NetworkAccessRequest {
	op: "fetch" | "http" | "dns" | "listen";
	url?: string;
	method?: string;
	hostname?: string;
}

export interface ChildProcessAccessRequest {
	command: string;
	args: string[];
	cwd?: string;
	env?: Record<string, string>;
}

export interface EnvAccessRequest {
	op: "read" | "write";
	key: string;
	value?: string;
}

export interface Permissions {
	fs?: PermissionCheck<FsAccessRequest>;
	network?: PermissionCheck<NetworkAccessRequest>;
	childProcess?: PermissionCheck<ChildProcessAccessRequest>;
	env?: PermissionCheck<EnvAccessRequest>;
}

export type {
	DriverRuntimeConfig,
	RuntimeExecutionDriver,
	RuntimeExecutionDriverFactory,
	RuntimeExecutionDriverOptions,
	RuntimeDriver,
} from "./runtime-driver.js";
