import { transform } from "sucrase";
import {
	getRequireSetupCode,
	createCommandExecutorStub,
	createFsStub,
	createNetworkStub,
	filterEnv,
	wrapFileSystem,
	wrapNetworkAdapter,
	createInMemoryFileSystem,
	isESM,
	transformDynamicImport,
	getIsolateRuntimeSource,
	POLYFILL_CODE_MAP,
	loadFile,
	resolveModule,
	mkdir,
	exposeCustomGlobal,
	exposeMutableRuntimeStateGlobal,
} from "@secure-exec/core";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	VirtualFileSystem,
	ExecResult,
	RunResult,
	StdioChannel,
} from "@secure-exec/core";
import {
	createBrowserNetworkAdapter,
	createOpfsFileSystem,
} from "./driver.js";
import type {
	BrowserWorkerExecOptions,
	BrowserWorkerInitPayload,
	BrowserWorkerOutboundMessage,
	BrowserWorkerRequestMessage,
	BrowserWorkerResponseMessage,
	SerializedPermissions,
} from "./worker-protocol.js";
import { validatePermissionSource } from "./permission-validation.js";

let filesystem: VirtualFileSystem | null = null;
let networkAdapter: NetworkAdapter | null = null;
let commandExecutor: CommandExecutor | null = null;
let permissions: Permissions | undefined;
let initialized = false;

const dynamicImportCache = new Map<string, unknown>();
const MAX_ERROR_MESSAGE_CHARS = 8192;
const MAX_STDIO_MESSAGE_CHARS = 8192;
const MAX_STDIO_DEPTH = 6;
const MAX_STDIO_OBJECT_KEYS = 60;
const MAX_STDIO_ARRAY_ITEMS = 120;

// Payload size defaults matching the Node runtime path
const DEFAULT_BASE64_TRANSFER_BYTES = 16 * 1024 * 1024;
const DEFAULT_JSON_PAYLOAD_BYTES = 4 * 1024 * 1024;
const PAYLOAD_LIMIT_ERROR_CODE = "ERR_SANDBOX_PAYLOAD_TOO_LARGE";

let base64TransferLimitBytes = DEFAULT_BASE64_TRANSFER_BYTES;
let jsonPayloadLimitBytes = DEFAULT_JSON_PAYLOAD_BYTES;

const encoder = new TextEncoder();

function getUtf8ByteLength(text: string): number {
	return encoder.encode(text).byteLength;
}


function assertPayloadByteLength(
	payloadLabel: string,
	actualBytes: number,
	maxBytes: number,
): void {
	if (actualBytes <= maxBytes) return;
	const error = new Error(
		`[${PAYLOAD_LIMIT_ERROR_CODE}] ${payloadLabel}: payload is ${actualBytes} bytes, limit is ${maxBytes} bytes`,
	);
	(error as { code?: string }).code = PAYLOAD_LIMIT_ERROR_CODE;
	throw error;
}

function assertTextPayloadSize(
	payloadLabel: string,
	text: string,
	maxBytes: number,
): void {
	assertPayloadByteLength(payloadLabel, getUtf8ByteLength(text), maxBytes);
}

const dynamicImportModule = new Function(
	"specifier",
	"return import(specifier);",
) as (specifier: string) => Promise<Record<string, unknown>>;

function boundErrorMessage(message: string): string {
	if (message.length <= MAX_ERROR_MESSAGE_CHARS) {
		return message;
	}
	return `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}...[Truncated]`;
}

function boundStdioMessage(message: string): string {
	if (message.length <= MAX_STDIO_MESSAGE_CHARS) {
		return message;
	}
	return `${message.slice(0, MAX_STDIO_MESSAGE_CHARS)}...[Truncated]`;
}

function revivePermission(source?: string): ((req: unknown) => { allow: boolean }) | undefined {
	if (!source) return undefined;

	// Validate source before eval to prevent code injection
	if (!validatePermissionSource(source)) return undefined;

	try {
		const fn = new Function(`return (${source});`)();
		if (typeof fn === "function") return fn;
		return undefined;
	} catch {
		return undefined;
	}
}

/** Deserialize permission callbacks that were stringified for transfer across the Worker boundary. */
function revivePermissions(serialized?: SerializedPermissions): Permissions | undefined {
	if (!serialized) return undefined;
	const perms: Permissions = {};
	perms.fs = revivePermission(serialized.fs);
	perms.network = revivePermission(serialized.network);
	perms.childProcess = revivePermission(serialized.childProcess);
	perms.env = revivePermission(serialized.env);
	return perms;
}

/**
 * Wrap a sync function in the bridge calling convention (`applySync`) so
 * bridge code can call it the same way it calls isolated-vm References.
 */
function makeApplySync<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => TResult,
) {
	const applySync = (_ctx: undefined, args: TArgs): TResult => fn(...args);
	return {
		applySync,
		applySyncPromise: applySync,
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

// Save real postMessage before sandbox code can replace it
const _realPostMessage = self.postMessage.bind(self);

function postResponse(message: BrowserWorkerResponseMessage): void {
	_realPostMessage(message satisfies BrowserWorkerOutboundMessage);
}

function postStdio(
	requestId: number,
	channel: StdioChannel,
	message: string,
): void {
	const payload: BrowserWorkerOutboundMessage = {
		type: "stdio",
		requestId,
		channel,
		message,
	};
	_realPostMessage(payload);
}

function formatConsoleValue(
	value: unknown,
	seen = new WeakSet<object>(),
	depth = 0,
): string {
	if (value === null) {
		return "null";
	}
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (typeof value === "bigint") {
		return `${value.toString()}n`;
	}
	if (typeof value === "symbol") {
		return value.toString();
	}
	if (typeof value === "function") {
		return `[Function ${value.name || "anonymous"}]`;
	}
	if (typeof value !== "object") {
		return String(value);
	}
	if (seen.has(value)) {
		return "[Circular]";
	}
	if (depth >= MAX_STDIO_DEPTH) {
		return "[MaxDepth]";
	}

	seen.add(value);
	try {
		if (Array.isArray(value)) {
			const out = value
				.slice(0, MAX_STDIO_ARRAY_ITEMS)
				.map((item) => formatConsoleValue(item, seen, depth + 1));
			if (value.length > MAX_STDIO_ARRAY_ITEMS) {
				out.push('"[Truncated]"');
			}
			return `[${out.join(", ")}]`;
		}

		const entries: string[] = [];
		for (const key of Object.keys(value).slice(0, MAX_STDIO_OBJECT_KEYS)) {
			entries.push(
				`${key}: ${formatConsoleValue(
					(value as Record<string, unknown>)[key],
					seen,
					depth + 1,
				)}`,
			);
		}
		if (Object.keys(value).length > MAX_STDIO_OBJECT_KEYS) {
			entries.push('"[Truncated]"');
		}
		return `{ ${entries.join(", ")} }`;
	} catch {
		return "[Unserializable]";
	} finally {
		seen.delete(value);
	}
}

function emitStdio(
	requestId: number,
	channel: StdioChannel,
	args: unknown[],
): void {
	const message = boundStdioMessage(
		args.map((arg) => formatConsoleValue(arg)).join(" "),
	);
	postStdio(requestId, channel, message);
}

/**
 * Initialize the worker-side runtime: set up filesystem, network, bridge
 * globals, and load the bridge bundle. Called once before any exec/run.
 */
async function initRuntime(payload: BrowserWorkerInitPayload): Promise<void> {
	if (initialized) return;

	permissions = revivePermissions(payload.permissions);

	// Apply payload limits (use defaults if not configured)
	base64TransferLimitBytes = payload.payloadLimits?.base64TransferBytes ?? DEFAULT_BASE64_TRANSFER_BYTES;
	jsonPayloadLimitBytes = payload.payloadLimits?.jsonPayloadBytes ?? DEFAULT_JSON_PAYLOAD_BYTES;

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

	// Set up filesystem bridge globals before loading runtime shims.
	const readFileRef = makeApplySyncPromise(async (path: string) => {
		const text = await fsOps.readTextFile(path);
		assertTextPayloadSize(`fs.readFile ${path}`, text, jsonPayloadLimitBytes);
		return text;
	});
	const writeFileRef = makeApplySyncPromise(async (path: string, content: string) => {
		return fsOps.writeFile(path, content);
	});
	const readFileBinaryRef = makeApplySyncPromise(async (path: string) => {
		const data = await fsOps.readFile(path);
		assertPayloadByteLength(
			`fs.readFileBinary ${path}`,
			data.byteLength,
			base64TransferLimitBytes,
		);
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	});
	const writeFileBinaryRef = makeApplySyncPromise(async (path: string, binaryContent: Uint8Array) => {
		assertPayloadByteLength(`fs.writeFileBinary ${path}`, binaryContent.byteLength, base64TransferLimitBytes);
		return fsOps.writeFile(path, binaryContent);
	});
	const readDirRef = makeApplySyncPromise(async (path: string) => {
		const entries = await fsOps.readDirWithTypes(path);
		const json = JSON.stringify(entries);
		assertTextPayloadSize(`fs.readDir ${path}`, json, jsonPayloadLimitBytes);
		return json;
	});
	const mkdirRef = makeApplySyncPromise(async (path: string) => {
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

	exposeCustomGlobal("_loadPolyfill", makeApplySyncPromise(
		async (moduleName: string) => {
			const name = moduleName.replace(/^node:/, "");
			const polyfillMap = POLYFILL_CODE_MAP as Record<string, string>;
			return polyfillMap[name] ?? null;
		},
	));

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
				code = transform(code, { transforms: ["imports"] }).code;
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

	if (!("SharedArrayBuffer" in globalThis)) {
		class SharedArrayBufferShim {
			private readonly backing: ArrayBuffer;

			constructor(length: number) {
				this.backing = new ArrayBuffer(length);
			}

			get byteLength(): number {
				return this.backing.byteLength;
			}

			get growable(): boolean {
				return false;
			}

			get maxByteLength(): number {
				return this.backing.byteLength;
			}

			slice(start?: number, end?: number): ArrayBuffer {
				return this.backing.slice(start, end);
			}
		}
		Object.defineProperty(globalThis, "SharedArrayBuffer", {
			value: SharedArrayBufferShim,
			configurable: true,
			writable: true,
		});
	}
	let bridgeModule: Record<string, unknown>;
	try {
		bridgeModule = await dynamicImportModule("@secure-exec/core/internal/bridge");
	} catch {
		// Vite browser tests may need source fallback.
		try {
			bridgeModule = await dynamicImportModule("@secure-exec/core/internal/bridge");
		} catch {
			throw new Error("Failed to load bridge module from @secure-exec/core");
		}
	}
	exposeCustomGlobal("_fsModule", bridgeModule.default);
	eval(getIsolateRuntimeSource("globalExposureHelpers"));
	exposeMutableRuntimeStateGlobal("_moduleCache", {});
	exposeMutableRuntimeStateGlobal("_pendingModules", {});
	exposeMutableRuntimeStateGlobal("_currentModule", { dirname: "/" });
	eval(getRequireSetupCode());

	// Block dangerous Web APIs that bypass bridge permission checks
	const dangerousApis = [
		"XMLHttpRequest",
		"WebSocket",
		"importScripts",
		"indexedDB",
		"caches",
		"BroadcastChannel",
	];
	for (const api of dangerousApis) {
		try {
			delete (self as unknown as Record<string, unknown>)[api];
		} catch {
			// May not exist or may be non-configurable
		}
		Object.defineProperty(self, api, {
			get() {
				throw new ReferenceError(`${api} is not available in sandbox`);
			},
			configurable: false,
		});
	}

	// Lock down self.onmessage so sandbox code cannot hijack the control channel
	const currentHandler = self.onmessage;
	Object.defineProperty(self, "onmessage", {
		value: currentHandler,
		writable: false,
		configurable: false,
	});

	// Block self.postMessage so sandbox code cannot forge responses to host
	Object.defineProperty(self, "postMessage", {
		get() {
			throw new TypeError("postMessage is not available in sandbox");
		},
		configurable: false,
	});

	initialized = true;
}

function resetModuleState(cwd: string): void {
	exposeMutableRuntimeStateGlobal("_moduleCache", {});
	exposeMutableRuntimeStateGlobal("_pendingModules", {});
	exposeMutableRuntimeStateGlobal("_currentModule", { dirname: cwd });
}

function setDynamicImportFallback(): void {
	exposeMutableRuntimeStateGlobal("__dynamicImport", function (specifier: string) {
		const cached = dynamicImportCache.get(specifier);
		if (cached) return Promise.resolve(cached);
		try {
			const runtimeRequire = (globalThis as Record<string, unknown>).require as
				| ((request: string) => unknown)
				| undefined;
			if (typeof runtimeRequire !== "function") {
				throw new Error("require is not available in browser runtime");
			}
			const mod = runtimeRequire(specifier);
			return Promise.resolve({ default: mod, ...(mod as Record<string, unknown>) });
		} catch (e) {
			return Promise.reject(new Error(`Cannot dynamically import '${specifier}': ${String(e)}`));
		}
	});
}

function captureConsole(
	requestId: number,
	captureStdio: boolean,
): {
	restore: () => void;
} {
	const original = console;
	if (!captureStdio) {
		const sandboxConsole = {
			log: () => undefined,
			info: () => undefined,
			warn: () => undefined,
			error: () => undefined,
		};
		(globalThis as Record<string, unknown>).console = sandboxConsole;
		return {
			restore: () => {
				(globalThis as Record<string, unknown>).console = original;
			},
		};
	}

	const sandboxConsole = {
		log: (...args: unknown[]) => emitStdio(requestId, "stdout", args),
		info: (...args: unknown[]) => emitStdio(requestId, "stdout", args),
		warn: (...args: unknown[]) => emitStdio(requestId, "stderr", args),
		error: (...args: unknown[]) => emitStdio(requestId, "stderr", args),
	};
	(globalThis as Record<string, unknown>).console = sandboxConsole;
	return {
		restore: () => {
			(globalThis as Record<string, unknown>).console = original;
		},
	};
}

function updateProcessConfig(options?: BrowserWorkerExecOptions): void {
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

/**
 * Execute user code as a script (process-style). Transforms ESM/dynamic
 * imports, sets up module/exports globals, and waits for active handles.
 */
async function execScript(
	requestId: number,
	code: string,
	options?: BrowserWorkerExecOptions,
	captureStdio = false,
): Promise<ExecResult> {
	resetModuleState(options?.cwd ?? "/");
	updateProcessConfig(options);
	setDynamicImportFallback();

	const { restore } = captureConsole(requestId, captureStdio);
	try {
		let transformed = code;
		if (isESM(code, options?.filePath)) {
			transformed = transform(transformed, { transforms: ["imports"] }).code;
		}
		transformed = transformDynamicImport(transformed);

		exposeMutableRuntimeStateGlobal("module", { exports: {} });
		const moduleRef = (globalThis as Record<string, unknown>).module as {
			exports?: unknown;
		};
		exposeMutableRuntimeStateGlobal(
			"exports",
			moduleRef.exports,
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

		// Await the eval result so async IIFEs / top-level promise expressions
		// resolve before we check for active handles.
		const evalResult = eval(transformed);
		if (evalResult && typeof evalResult === "object" && typeof (evalResult as Record<string,unknown>).then === "function") {
			await evalResult;
		}

		const waitForActiveHandles = (globalThis as Record<string, unknown>)
			._waitForActiveHandles as (() => Promise<void>) | undefined;
		if (typeof waitForActiveHandles === "function") {
			await waitForActiveHandles();
		}

		const exitCode =
			((globalThis as Record<string, unknown>).process as { exitCode?: number })
				?.exitCode ?? 0;

		return {
			code: exitCode,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const exitMatch = message.match(/process\.exit\((\d+)\)/);
		if (exitMatch) {
			const exitCode = Number.parseInt(exitMatch[1], 10);
			return {
				code: exitCode,
			};
		}
		return {
			code: 1,
			errorMessage: boundErrorMessage(message),
		};
	} finally {
		restore();
	}
}

async function runScript<T = unknown>(
	requestId: number,
	code: string,
	filePath?: string,
	captureStdio = false,
): Promise<RunResult<T>> {
	const execResult = await execScript(
		requestId,
		code,
		{ filePath },
		captureStdio,
	);
	const moduleObj = (globalThis as Record<string, unknown>).module as { exports?: T };
	return {
		...execResult,
		exports: moduleObj?.exports,
	};
}

self.onmessage = async (event: MessageEvent<BrowserWorkerRequestMessage>) => {
	const message = event.data;
	try {
		if (message.type === "init") {
			await initRuntime(message.payload);
			postResponse({ type: "response", id: message.id, ok: true, result: true });
			return;
		}
		if (!initialized) {
			throw new Error("Sandbox worker not initialized");
		}
		if (message.type === "exec") {
			const result = await execScript(
				message.id,
				message.payload.code,
				message.payload.options,
				message.payload.captureStdio,
			);
			postResponse({ type: "response", id: message.id, ok: true, result });
			return;
		}
		if (message.type === "run") {
			const result = await runScript(
				message.id,
				message.payload.code,
				message.payload.filePath,
				message.payload.captureStdio,
			);
			postResponse({ type: "response", id: message.id, ok: true, result });
			return;
		}
		if (message.type === "dispose") {
			postResponse({ type: "response", id: message.id, ok: true, result: true });
			close();
		}
	} catch (err) {
		const error = err as { message?: string; stack?: string; code?: string };
		postResponse({
			type: "response",
			id: message.id,
			ok: false,
			error: {
				message: error?.message ?? String(err),
				stack: error?.stack,
				code: error?.code,
			},
		});
	}
};
