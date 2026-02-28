// @ts-nocheck
import { transform } from "sucrase";
import { getRequireSetupCode } from "../shared/require-setup.js";
import {
	createCommandExecutorStub,
	createFsStub,
	createNetworkStub,
	filterEnv,
	wrapFileSystem,
	wrapNetworkAdapter,
} from "../shared/permissions.js";
import { createInMemoryFileSystem } from "../shared/in-memory-fs.js";
import {
	isESM,
	transformDynamicImport,
} from "../shared/esm-utils.js";
import { getIsolateRuntimeSource } from "../generated/isolate-runtime.js";
import { POLYFILL_CODE_MAP } from "../generated/polyfills.js";
import { loadFile, resolveModule } from "../package-bundler.js";
import { mkdir } from "../fs-helpers.js";
import {
	createBrowserNetworkAdapter,
	createOpfsFileSystem,
} from "./driver.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	VirtualFileSystem,
} from "../types.js";
import type {
	ExecOptions,
	ExecResult,
	OSConfig,
	ProcessConfig,
	RunResult,
} from "../shared/api-types.js";
import {
	exposeCustomGlobal,
	exposeMutableRuntimeStateGlobal,
} from "../shared/global-exposure.js";

type SerializedPermissions = {
	fs?: string;
	network?: string;
	childProcess?: string;
	env?: string;
};

type InitPayload = {
	processConfig?: ProcessConfig;
	osConfig?: OSConfig;
	permissions?: SerializedPermissions;
	filesystem?: "opfs" | "memory";
	networkEnabled?: boolean;
};

type RequestMessage =
	| { id: number; type: "init"; payload: InitPayload }
	| { id: number; type: "exec"; payload: { code: string; options?: ExecOptions } }
	| { id: number; type: "run"; payload: { code: string; filePath?: string } }
	| { id: number; type: "dispose" };

type ResponseMessage =
	| { id: number; ok: true; result: unknown }
	| { id: number; ok: false; error: { message: string; stack?: string; code?: string } };

let filesystem: VirtualFileSystem | null = null;
let networkAdapter: NetworkAdapter | null = null;
let commandExecutor: CommandExecutor | null = null;
let permissions: Permissions | undefined;
let initialized = false;

const dynamicImportCache = new Map<string, unknown>();

function revivePermission(source?: string): ((req: unknown) => { allow: boolean }) | undefined {
	if (!source) return undefined;
	try {
		const fn = new Function(`return (${source});`)();
		if (typeof fn === "function") return fn;
		return undefined;
	} catch {
		return undefined;
	}
}

function revivePermissions(serialized?: SerializedPermissions): Permissions | undefined {
	if (!serialized) return undefined;
	const perms: Permissions = {};
	perms.fs = revivePermission(serialized.fs);
	perms.network = revivePermission(serialized.network);
	perms.childProcess = revivePermission(serialized.childProcess);
	perms.env = revivePermission(serialized.env);
	return perms;
}

function makeApplySync<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => TResult,
) {
	return {
		applySync(_ctx: undefined, args: TArgs): TResult {
			return fn(...args);
		},
	};
}

function makeApplySyncPromise<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
) {
	return {
		applySyncPromise(_ctx: undefined, args: TArgs): Promise<TResult> {
			return fn(...args);
		},
	};
}

function makeApplyPromise<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
) {
	return {
		apply(_ctx: undefined, args: TArgs): Promise<TResult> {
			return fn(...args);
		},
	};
}

async function initRuntime(payload: InitPayload): Promise<void> {
	if (initialized) return;

	permissions = revivePermissions(payload.permissions);

	const baseFs =
		payload.filesystem === "memory"
			? createInMemoryFileSystem()
			: await createOpfsFileSystem();
	filesystem = wrapFileSystem(baseFs, permissions);

	if (payload.networkEnabled) {
		networkAdapter = wrapNetworkAdapter(createBrowserNetworkAdapter(), permissions);
	} else {
		networkAdapter = createNetworkStub();
	}

	commandExecutor = createCommandExecutorStub();

	const fsOps = filesystem ?? createFsStub();

	const processConfig = payload.processConfig ?? {};
	processConfig.env = filterEnv(processConfig.env, permissions);
	exposeCustomGlobal("_processConfig", processConfig);
	exposeCustomGlobal("_osConfig", payload.osConfig ?? {});

	// fs bridge
	const readFileRef = makeApplySyncPromise(async (path: string) => {
		return fsOps.readTextFile(path);
	});
	const writeFileRef = makeApplySync(async (path: string, content: string) => {
		return fsOps.writeFile(path, content);
	});
	const readFileBinaryRef = makeApplySyncPromise(async (path: string) => {
		const data = await fsOps.readFile(path);
		return btoa(String.fromCharCode(...data));
	});
	const writeFileBinaryRef = makeApplySync(async (path: string, base64: string) => {
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		return fsOps.writeFile(path, bytes);
	});
	const readDirRef = makeApplySyncPromise(async (path: string) => {
		const entries = await fsOps.readDirWithTypes(path);
		return JSON.stringify(entries);
	});
	const mkdirRef = makeApplySync(async (path: string) => {
		return mkdir(fsOps, path);
	});
	const rmdirRef = makeApplySyncPromise(async (path: string) => {
		return fsOps.removeDir(path);
	});
	const existsRef = makeApplySyncPromise(async (path: string) => {
		return fsOps.exists(path);
	});
	const statRef = makeApplySyncPromise(async (path: string) => {
		const statInfo = await fsOps.stat(path);
		return JSON.stringify(statInfo);
	});
	const unlinkRef = makeApplySyncPromise(async (path: string) => {
		return fsOps.removeFile(path);
	});
	const renameRef = makeApplySyncPromise(async (oldPath: string, newPath: string) => {
		return fsOps.rename(oldPath, newPath);
	});

	exposeCustomGlobal("_fs", {
		readFile: readFileRef,
		writeFile: writeFileRef,
		readFileBinary: readFileBinaryRef,
		writeFileBinary: writeFileBinaryRef,
		readDir: readDirRef,
		mkdir: mkdirRef,
		rmdir: rmdirRef,
		exists: existsRef,
		stat: statRef,
		unlink: unlinkRef,
		rename: renameRef,
	});

	// Polyfill loader
	exposeCustomGlobal("_loadPolyfill", makeApplySyncPromise(
		async (moduleName: string) => {
			const name = moduleName.replace(/^node:/, "");
			return POLYFILL_CODE_MAP[name] ?? null;
		},
	));

	// Module resolution
	exposeCustomGlobal("_resolveModule", makeApplySyncPromise(
		async (request: string, fromDir: string) => {
			return resolveModule(request, fromDir, fsOps);
		},
	));

	exposeCustomGlobal("_loadFile", makeApplySyncPromise(
		async (path: string) => {
			const source = await loadFile(path, fsOps);
			if (source === null) return null;
			let code = source;
			if (isESM(source, path)) {
				code = transform(source, { transforms: ["imports"] }).code;
			}
			return transformDynamicImport(code);
		},
	));

	exposeCustomGlobal("_scheduleTimer", {
		apply(_ctx: undefined, args: [number]) {
			return new Promise<void>((resolve) => {
				setTimeout(resolve, args[0]);
			});
		},
	});

	// network bridge
	const netAdapter = networkAdapter ?? createNetworkStub();
	exposeCustomGlobal("_networkFetchRaw", makeApplyPromise(
		async (url: string, optionsJson: string) => {
			const options = JSON.parse(optionsJson);
			const result = await netAdapter.fetch(url, options);
			return JSON.stringify(result);
		},
	));
	exposeCustomGlobal("_networkDnsLookupRaw", makeApplyPromise(
		async (hostname: string) => {
			const result = await netAdapter.dnsLookup(hostname);
			return JSON.stringify(result);
		},
	));
	exposeCustomGlobal("_networkHttpRequestRaw", makeApplyPromise(
		async (url: string, optionsJson: string) => {
			const options = JSON.parse(optionsJson);
			const result = await netAdapter.httpRequest(url, options);
			return JSON.stringify(result);
		},
	));

	// child_process bridge
	const execAdapter = commandExecutor ?? createCommandExecutorStub();
	let nextSessionId = 1;
	const sessions = new Map<number, ReturnType<CommandExecutor["spawn"]>>();
	const getDispatch = () =>
		(globalThis as Record<string, unknown>)._childProcessDispatch as
			| ((sessionId: number, type: "stdout" | "stderr" | "exit", data: Uint8Array | number) => void)
			| undefined;

	exposeCustomGlobal("_childProcessSpawnStart", makeApplySync(
		(command: string, argsJson: string, optionsJson: string) => {
			const args = JSON.parse(argsJson) as string[];
			const options = JSON.parse(optionsJson) as { cwd?: string; env?: Record<string, string> };
			const sessionId = nextSessionId++;
			const proc = execAdapter.spawn(command, args, {
				cwd: options.cwd,
				env: options.env,
				onStdout: (data) => {
					getDispatch()?.(sessionId, "stdout", data);
				},
				onStderr: (data) => {
					getDispatch()?.(sessionId, "stderr", data);
				},
			});
			proc.wait().then((code) => {
				getDispatch()?.(sessionId, "exit", code);
				sessions.delete(sessionId);
			});
			sessions.set(sessionId, proc);
			return sessionId;
		},
	));

	exposeCustomGlobal("_childProcessStdinWrite", makeApplySync(
		(sessionId: number, data: Uint8Array) => {
			sessions.get(sessionId)?.writeStdin(data);
		},
	));

	exposeCustomGlobal("_childProcessStdinClose", makeApplySync(
		(sessionId: number) => {
			sessions.get(sessionId)?.closeStdin();
		},
	));

	exposeCustomGlobal("_childProcessKill", makeApplySync(
		(sessionId: number, signal: number) => {
			sessions.get(sessionId)?.kill(signal);
		},
	));

	exposeCustomGlobal("_childProcessSpawnSync", makeApplySyncPromise(
		async (command: string, argsJson: string, optionsJson: string) => {
			const args = JSON.parse(argsJson) as string[];
			const options = JSON.parse(optionsJson) as { cwd?: string; env?: Record<string, string> };
			const stdoutChunks: Uint8Array[] = [];
			const stderrChunks: Uint8Array[] = [];
			const proc = execAdapter.spawn(command, args, {
				cwd: options.cwd,
				env: options.env,
				onStdout: (data) => stdoutChunks.push(data),
				onStderr: (data) => stderrChunks.push(data),
			});
			const exitCode = await proc.wait();
			const decoder = new TextDecoder();
			const stdout = stdoutChunks.map((c) => decoder.decode(c)).join("");
			const stderr = stderrChunks.map((c) => decoder.decode(c)).join("");
			return JSON.stringify({ stdout, stderr, code: exitCode });
		},
	));

	// Load bridge after globals are in place
	const bridge = await import("../bridge/index.js");
	exposeCustomGlobal("_fsModule", (bridge as Record<string, unknown>).default);
	eval(getIsolateRuntimeSource("globalExposureHelpers"));

	eval(getRequireSetupCode());

	initialized = true;
}

function resetModuleState(cwd: string): void {
	exposeMutableRuntimeStateGlobal("_moduleCache", {});
	exposeMutableRuntimeStateGlobal("_pendingModules", {});
	exposeMutableRuntimeStateGlobal("_currentModule", { dirname: cwd });
}

function setDynamicImportFallback(): void {
	exposeCustomGlobal("__dynamicImport", function (specifier: string) {
		const cached = dynamicImportCache.get(specifier);
		if (cached) return Promise.resolve(cached);
		try {
			const mod = (globalThis as Record<string, unknown>).require(specifier);
			return Promise.resolve({ default: mod, ...(mod as Record<string, unknown>) });
		} catch (e) {
			return Promise.reject(new Error(`Cannot dynamically import '${specifier}': ${String(e)}`));
		}
	});
}

function captureConsole(): {
	stdout: string[];
	stderr: string[];
	restore: () => void;
} {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const original = console;
	const serialize = (args: unknown[]) =>
		args
			.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
			.join(" ");
	const sandboxConsole = {
		log: (...args: unknown[]) => stdout.push(serialize(args)),
		info: (...args: unknown[]) => stdout.push(serialize(args)),
		warn: (...args: unknown[]) => stderr.push(serialize(args)),
		error: (...args: unknown[]) => stderr.push(serialize(args)),
	};
	(globalThis as Record<string, unknown>).console = sandboxConsole;
	return {
		stdout,
		stderr,
		restore: () => {
			(globalThis as Record<string, unknown>).console = original;
		},
	};
}

function updateProcessConfig(options?: ExecOptions): void {
	const proc = (globalThis as Record<string, unknown>).process as Record<string, unknown>;
	if (!proc) return;
	if (options?.cwd && typeof proc.chdir === "function") {
		proc.chdir(options.cwd);
	}
	if (options?.env) {
		const filtered = filterEnv(options.env, permissions);
		const currentEnv =
			proc.env && typeof proc.env === "object"
				? (proc.env as Record<string, string>)
				: {};
		proc.env = { ...currentEnv, ...filtered };
	}
	if (options?.stdin !== undefined) {
		exposeMutableRuntimeStateGlobal("_stdinData", options.stdin);
		exposeMutableRuntimeStateGlobal("_stdinPosition", 0);
		exposeMutableRuntimeStateGlobal("_stdinEnded", false);
		exposeMutableRuntimeStateGlobal("_stdinFlowMode", false);
	}
}

async function execScript(
	code: string,
	options?: ExecOptions,
): Promise<ExecResult> {
	resetModuleState(options?.cwd ?? "/");
	updateProcessConfig(options);
	setDynamicImportFallback();

	const { stdout, stderr, restore } = captureConsole();
	try {
		let transformed = code;
		if (isESM(code, options?.filePath)) {
			transformed = transform(code, { transforms: ["imports"] }).code;
		}
		transformed = transformDynamicImport(transformed);

		exposeMutableRuntimeStateGlobal("module", { exports: {} });
		exposeMutableRuntimeStateGlobal(
			"exports",
			(globalThis as Record<string, unknown>).module.exports,
		);

		if (options?.filePath) {
			const dirname = options.filePath.includes("/")
				? options.filePath.substring(0, options.filePath.lastIndexOf("/")) || "/"
				: "/";
			exposeMutableRuntimeStateGlobal("__filename", options.filePath);
			exposeMutableRuntimeStateGlobal("__dirname", dirname);
			exposeMutableRuntimeStateGlobal("_currentModule", {
				dirname,
				filename: options.filePath,
			});
		}

		eval(transformed);

		if (typeof (globalThis as Record<string, unknown>)._waitForActiveHandles === "function") {
			await (globalThis as Record<string, unknown>)._waitForActiveHandles();
		}

		const exitCode =
			((globalThis as Record<string, unknown>).process as { exitCode?: number })
				?.exitCode ?? 0;

		return {
			stdout: stdout.join("\n") + (stdout.length ? "\n" : ""),
			stderr: stderr.join("\n") + (stderr.length ? "\n" : ""),
			code: exitCode,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const exitMatch = message.match(/process\.exit\((\d+)\)/);
		if (exitMatch) {
			const exitCode = Number.parseInt(exitMatch[1], 10);
			return {
				stdout: stdout.join("\n") + (stdout.length ? "\n" : ""),
				stderr: stderr.join("\n") + (stderr.length ? "\n" : ""),
				code: exitCode,
			};
		}
		stderr.push(message);
		return {
			stdout: stdout.join("\n") + (stdout.length ? "\n" : ""),
			stderr: stderr.join("\n") + (stderr.length ? "\n" : ""),
			code: 1,
		};
	} finally {
		restore();
	}
}

async function runScript<T = unknown>(
	code: string,
	filePath?: string,
): Promise<RunResult<T>> {
	const execResult = await execScript(code, { filePath });
	const moduleObj = (globalThis as Record<string, unknown>).module as { exports?: T };
	return {
		...execResult,
		exports: moduleObj?.exports,
	};
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
	const message = event.data;
	try {
		if (message.type === "init") {
			await initRuntime(message.payload);
			const response: ResponseMessage = { id: message.id, ok: true, result: true };
			self.postMessage(response);
			return;
		}
		if (!initialized) {
			throw new Error("Sandbox worker not initialized");
		}
		if (message.type === "exec") {
			const result = await execScript(message.payload.code, message.payload.options);
			const response: ResponseMessage = { id: message.id, ok: true, result };
			self.postMessage(response);
			return;
		}
		if (message.type === "run") {
			const result = await runScript(message.payload.code, message.payload.filePath);
			const response: ResponseMessage = { id: message.id, ok: true, result };
			self.postMessage(response);
			return;
		}
		if (message.type === "dispose") {
			close();
		}
	} catch (err) {
		const error = err as { message?: string; stack?: string; code?: string };
		const response: ResponseMessage = {
			id: message.id,
			ok: false,
			error: {
				message: error?.message ?? String(err),
				stack: error?.stack,
				code: error?.code,
			},
		};
		self.postMessage(response);
	}
};
