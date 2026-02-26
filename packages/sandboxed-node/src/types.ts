/**
 * Minimal filesystem interface for sandboxed-node.
 *
 * This interface abstracts filesystem operations needed by the sandbox.
 */
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
	 * Remove a file.
	 * @throws Error if file doesn't exist.
	 */
	removeFile(path: string): Promise<void>;

	/**
	 * Remove an empty directory.
	 * @throws Error if directory doesn't exist or is not empty.
	 */
	removeDir(path: string): Promise<void>;
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

export interface NetworkAdapter {
	honoServe?(
		options: {
			port?: number;
			hostname?: string;
			fetch: (request: Request) => Promise<Response> | Response;
		},
	): Promise<{
		serverId: number;
		address:
			| {
					address: string;
					family: string;
					port: number;
			  }
			| null;
	}>;
	honoClose?(serverId: number): Promise<void>;
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

export interface SandboxDriver {
	filesystem?: VirtualFileSystem;
	network?: NetworkAdapter;
	commandExecutor?: CommandExecutor;
	permissions?: Permissions;
}
