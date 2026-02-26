import { createEaccesError, createEnosysError } from "./errors.js";
import type {
	ChildProcessAccessRequest,
	CommandExecutor,
	EnvAccessRequest,
	FsAccessRequest,
	NetworkAccessRequest,
	NetworkAdapter,
	Permissions,
	SpawnedProcess,
	VirtualFileSystem,
} from "../types.js";

function checkPermission<T>(
	check: ((request: T) => { allow: boolean; reason?: string }) | undefined,
	request: T,
	onDenied: (request: T) => Error,
): void {
	if (!check) return;
	const decision = check(request);
	if (!decision?.allow) {
		throw onDenied(request);
	}
}

function fsOpToSyscall(op: FsAccessRequest["op"]): string {
	switch (op) {
		case "read":
			return "open";
		case "write":
			return "write";
		case "mkdir":
		case "createDir":
			return "mkdir";
		case "readdir":
			return "scandir";
		case "stat":
			return "stat";
		case "rm":
			return "unlink";
		case "rename":
			return "rename";
		case "exists":
			return "access";
		default:
			return "open";
	}
}

export function wrapFileSystem(
	fs: VirtualFileSystem,
	permissions?: Permissions,
): VirtualFileSystem {
	return {
		readFile: async (path) => {
			checkPermission(
				permissions?.fs,
				{ op: "read", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.readFile(path);
		},
		readTextFile: async (path) => {
			checkPermission(
				permissions?.fs,
				{ op: "read", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.readTextFile(path);
		},
		readDir: async (path) => {
			checkPermission(
				permissions?.fs,
				{ op: "readdir", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.readDir(path);
		},
		writeFile: async (path, content) => {
			checkPermission(
				permissions?.fs,
				{ op: "write", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.writeFile(path, content);
		},
		createDir: async (path) => {
			checkPermission(
				permissions?.fs,
				{ op: "createDir", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.createDir(path);
		},
		mkdir: async (path) => {
			checkPermission(
				permissions?.fs,
				{ op: "mkdir", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.mkdir(path);
		},
		exists: async (path) => {
			checkPermission(
				permissions?.fs,
				{ op: "exists", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.exists(path);
		},
		removeFile: async (path) => {
			checkPermission(
				permissions?.fs,
				{ op: "rm", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.removeFile(path);
		},
		removeDir: async (path) => {
			checkPermission(
				permissions?.fs,
				{ op: "rm", path },
				(req) => createEaccesError(fsOpToSyscall(req.op), req.path),
			);
			return fs.removeDir(path);
		},
	};
}

export function wrapNetworkAdapter(
	adapter: NetworkAdapter,
	permissions?: Permissions,
): NetworkAdapter {
	return {
		honoServe: adapter.honoServe
			? async (options) => {
					checkPermission(
						permissions?.network,
						{
							op: "listen",
							hostname: options.hostname,
							url: options.hostname
								? `http://${options.hostname}:${options.port ?? 3000}`
								: `http://0.0.0.0:${options.port ?? 3000}`,
							method: "LISTEN",
						},
						(req) => createEaccesError("listen", req.url),
					);
					return adapter.honoServe!(options);
				}
			: undefined,
		honoClose: adapter.honoClose
			? async (serverId) => {
					return adapter.honoClose!(serverId);
				}
			: undefined,
		fetch: async (url, options) => {
			checkPermission(
				permissions?.network,
				{ op: "fetch", url, method: options?.method },
				(req) => createEaccesError("connect", req.url),
			);
			return adapter.fetch(url, options);
		},
		dnsLookup: async (hostname) => {
			checkPermission(
				permissions?.network,
				{ op: "dns", hostname },
				(req) => createEaccesError("connect", req.hostname),
			);
			return adapter.dnsLookup(hostname);
		},
		httpRequest: async (url, options) => {
			checkPermission(
				permissions?.network,
				{ op: "http", url, method: options?.method },
				(req) => createEaccesError("connect", req.url),
			);
			return adapter.httpRequest(url, options);
		},
	};
}

export function wrapCommandExecutor(
	executor: CommandExecutor,
	permissions?: Permissions,
): CommandExecutor {
	return {
		spawn: (command, args, options) => {
			checkPermission(
				permissions?.childProcess,
				{ command, args, cwd: options.cwd, env: options.env },
				(req) => createEaccesError("spawn", req.command),
			);
			return executor.spawn(command, args, options);
		},
	};
}

export function envAccessAllowed(
	permissions: Permissions | undefined,
	request: EnvAccessRequest,
): void {
	checkPermission(permissions?.env, request, (req) =>
		createEaccesError("access", req.key),
	);
}

export function createFsStub(): VirtualFileSystem {
	const stub = (op: string, path?: string) => {
		throw createEnosysError(op, path);
	};
	return {
		readFile: async (path) => stub("open", path),
		readTextFile: async (path) => stub("open", path),
		readDir: async (path) => stub("scandir", path),
		writeFile: async (path) => stub("write", path),
		createDir: async (path) => stub("mkdir", path),
		mkdir: async (path) => stub("mkdir", path),
		exists: async (path) => stub("access", path),
		removeFile: async (path) => stub("unlink", path),
		removeDir: async (path) => stub("rmdir", path),
	};
}

export function createNetworkStub(): NetworkAdapter {
	const stub = (op: string, path?: string) => {
		throw createEnosysError(op, path);
	};
	return {
		honoServe: async () => stub("listen"),
		honoClose: async () => stub("close"),
		fetch: async (url) => stub("connect", url),
		dnsLookup: async (hostname) => stub("connect", hostname),
		httpRequest: async (url) => stub("connect", url),
	};
}

export function createCommandExecutorStub(): CommandExecutor {
	return {
		spawn: () => {
			throw createEnosysError("spawn");
		},
	};
}

export function filterEnv(
	env: Record<string, string> | undefined,
	permissions?: Permissions,
): Record<string, string> {
	if (!env) return {};
	if (!permissions?.env) return { ...env };
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		const request: EnvAccessRequest = { op: "read", key, value };
		const decision = permissions.env(request);
		if (decision?.allow) {
			result[key] = value;
		}
	}
	return result;
}
