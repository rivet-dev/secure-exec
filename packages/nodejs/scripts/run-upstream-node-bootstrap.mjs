#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serialize } from "node:v8";
import {
	clearImmediate as hostClearImmediate,
	clearInterval as hostClearInterval,
	clearTimeout as hostClearTimeout,
	setImmediate as hostSetImmediate,
	setTimeout as hostSetTimeout,
} from "node:timers";
import { compileFunction, createContext } from "node:vm";
import { createUpstreamFsBinding } from "./upstream-node-fs-binding.mjs";
import { createProcessMethodsBinding } from "./upstream-node-process-methods-binding.mjs";

const require = createRequire(import.meta.url);
const ASSET_ROOT_URL = new URL("../assets/upstream-node/", import.meta.url);
const BUILTIN_MANIFEST = JSON.parse(
	readFileSync(new URL("builtin-manifest.json", ASSET_ROOT_URL), "utf8"),
);
const BUILTIN_ENTRIES = new Map(
	BUILTIN_MANIFEST.builtins.map((entry) => [entry.id, entry]),
);
const HOST_REQUIRE = createRequire(import.meta.url);
const CJS_LEXER = HOST_REQUIRE("cjs-module-lexer");
const OPTION_DEFAULTS_BY_TYPE = new Map([
	[0, undefined],
	[1, undefined],
	[2, false],
	[3, 0],
	[4, 0],
	[5, ""],
	[6, null],
	[7, []],
]);
const APPLIED_BINDING_SHIMS = Object.freeze([
	"buffer.setBufferPrototype-noop",
	"async_wrap-bootstrap-hook-provider",
	"async_hooks-supported-subset-module",
	"trace_events.setTraceCategoryStateUpdateHandler-noop",
	"internal/options-host-shim",
	"fs_event_wrap-fsevent-subclass",
	"tcp_wrap-owner-subclass",
	"http-cluster-host-context",
	"internal/util/debuglog-initializeDebugEnv",
	"host-internal/util/debuglog-initializeDebugEnv",
	"public-builtin-host-fallback",
	"modules-getNearestParentPackageJSON-shim",
	"process_methods-explicit-provider",
	"module-logical-path-translation",
	"module-compile-cache-disabled",
]);
const HOST_CONTEXT_BUILTINS = new Set([
	"net",
	"http",
	"https",
	"_http_agent",
	"_http_client",
	"_http_common",
	"_http_incoming",
	"_http_outgoing",
	"_http_server",
	"internal/http",
]);

let internalBinding;
try {
	({ internalBinding } = require("internal/test/binding"));
} catch (error) {
	process.stdout.write(
		`${JSON.stringify(
			{
				status: "blocked",
				summary:
					"upstream bootstrap runner requires `node --expose-internals` so it can access internal/test/binding",
				errorMessage: error instanceof Error ? error.message : String(error),
				code: 1,
			},
			null,
			2,
		)}\n`,
	);
	process.exitCode = 1;
}

let cjsLexerReady = false;

function parseWithCjsLexer(source) {
	if (!cjsLexerReady) {
		CJS_LEXER.initSync();
		cjsLexerReady = true;
	}
	const { exports, reexports } = CJS_LEXER.parse(source);
	return [new Set(exports), reexports];
}

class ProcessExitSignal extends Error {
	constructor(code) {
		super(`process.exit(${code})`);
		this.code = code;
	}
}

function normalizeChunk(chunk, encoding) {
	if (typeof chunk === "string") {
		return chunk;
	}
	if (chunk instanceof Uint8Array) {
		return Buffer.from(chunk).toString(
			typeof encoding === "string" ? encoding : "utf8",
		);
	}
	return String(chunk);
}

function captureWrite(chunks) {
	return function write(chunk, encoding, callback) {
		let resolvedEncoding = encoding;
		let resolvedCallback = callback;
		if (typeof resolvedEncoding === "function") {
			resolvedCallback = resolvedEncoding;
			resolvedEncoding = undefined;
		}

		chunks.push(normalizeChunk(chunk, resolvedEncoding));
		if (typeof resolvedCallback === "function") {
			resolvedCallback(null);
		}
		return true;
	};
}

function patchOwnValue(target, key, value, restorers) {
	const hadOwn = Object.prototype.hasOwnProperty.call(target, key);
	const originalDescriptor = Object.getOwnPropertyDescriptor(target, key);
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: originalDescriptor?.enumerable ?? true,
		writable: true,
		value,
	});
	restorers.push(() => {
		if (hadOwn && originalDescriptor) {
			Object.defineProperty(target, key, originalDescriptor);
			return;
		}
		delete target[key];
	});
}

function configureLiveTtyState(payload, restorers) {
	if (payload.liveStdio !== true) {
		return;
	}

	patchOwnValue(process.stdin, "isTTY", payload.stdinIsTTY === true, restorers);
	patchOwnValue(process.stdout, "isTTY", payload.stdoutIsTTY === true, restorers);
	patchOwnValue(process.stderr, "isTTY", payload.stderrIsTTY === true, restorers);

	if (payload.stdinIsTTY === true) {
		patchOwnValue(process.stdin, "isRaw", false, restorers);
		patchOwnValue(
			process.stdin,
			"setRawMode",
			(mode) => {
				const nextMode = mode === true;
				process.stdin.isRaw = nextMode;
				if (typeof process.send === "function") {
					process.send({ type: "pty-set-raw-mode", mode: nextMode });
				}
				return process.stdin;
			},
			restorers,
		);
	}

	if (payload.stdoutIsTTY === true) {
		patchOwnValue(
			process.stdout,
			"columns",
			payload.terminalColumns ?? 80,
			restorers,
		);
		patchOwnValue(
			process.stdout,
			"rows",
			payload.terminalRows ?? 24,
			restorers,
		);
	}

	if (payload.stderrIsTTY === true) {
		patchOwnValue(
			process.stderr,
			"columns",
			payload.terminalColumns ?? 80,
			restorers,
		);
		patchOwnValue(
			process.stderr,
			"rows",
			payload.terminalRows ?? 24,
			restorers,
		);
	}
}

function attachLiveControlChannel(payload) {
	if (payload.liveStdio !== true || typeof process.send !== "function") {
		return () => {};
	}

	const handleMessage = (message) => {
		if (!message || typeof message !== "object") {
			return;
		}
		if (message.type !== "signal") {
			return;
		}
		if (message.signal === "SIGWINCH") {
			process.stdout.emit?.("resize");
			process.stderr.emit?.("resize");
		}
		process.emit(message.signal);
	};

	process.on("message", handleMessage);
	return () => {
		process.off?.("message", handleMessage);
	};
}

function createProcessCapture(payload, stdoutChunks, stderrChunks) {
	const originalStdoutWrite = process.stdout.write.bind(process.stdout);
	const originalStderrWrite = process.stderr.write.bind(process.stderr);
	const originalExit = process.exit.bind(process);
	const originalArgv = process.argv.slice();
	const originalExecArgv = process.execArgv.slice();
	const originalExitCode = process.exitCode;
	const originalCwd = process.cwd();
	const originalProcessSecureExecDone = process.__secureExecDone;
	const originalGlobalSecureExecDone = globalThis.__secureExecDone;
	const envSnapshot = new Map();
	const restorers = [];
	const restoreControlChannel = attachLiveControlChannel(payload);

	if (payload.liveStdio !== true) {
		process.stdout.write = captureWrite(stdoutChunks);
		process.stderr.write = captureWrite(stderrChunks);
	}
	process.exit = ((code = 0) => {
		throw new ProcessExitSignal(code);
	});
	process.exitCode = undefined;

	if (payload.cwd && payload.cwd !== originalCwd) {
		try {
			process.chdir(payload.cwd);
		} catch {
			payload.cwd = originalCwd;
		}
	}
	payload.cwd ??= process.cwd();
	if (Array.isArray(payload.argv) && payload.argv.length > 0) {
		process.argv = [...payload.argv];
	} else if (typeof payload.filePath === "string" && payload.filePath.length > 0) {
		process.argv = ["node", payload.filePath];
	}
	if (Array.isArray(payload.execArgv)) {
		process.execArgv = [...payload.execArgv];
	}
	if (payload.env && typeof payload.env === "object") {
		for (const [key, value] of Object.entries(payload.env)) {
			envSnapshot.set(key, process.env[key]);
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}

	configureLiveTtyState(payload, restorers);

	return () => {
		restoreControlChannel();
		for (let index = restorers.length - 1; index >= 0; index -= 1) {
			restorers[index]();
		}
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
		process.exit = originalExit;
		process.argv = originalArgv;
		process.execArgv = originalExecArgv;
		process.exitCode = originalExitCode;
		if (originalProcessSecureExecDone === undefined) {
			delete process.__secureExecDone;
		} else {
			process.__secureExecDone = originalProcessSecureExecDone;
		}
		if (originalGlobalSecureExecDone === undefined) {
			delete globalThis.__secureExecDone;
		} else {
			globalThis.__secureExecDone = originalGlobalSecureExecDone;
		}

		for (const [key, value] of envSnapshot) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}

		if (process.cwd() !== originalCwd) {
			process.chdir(originalCwd);
		}
	};
}

async function readPayload() {
	if (process.env.SECURE_EXEC_UPSTREAM_LIVE_STDIO === "1") {
		return await new Promise((resolve) => {
			process.once("message", resolve);
		});
	}

	let json = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) {
		json += chunk;
	}
	return JSON.parse(json || "{}");
}

function getBuiltinSource(id) {
	const entry = BUILTIN_ENTRIES.get(id);
	if (!entry) {
		throw new Error(`Unknown vendored builtin: ${id}`);
	}
	return readFileSync(new URL(entry.assetPath, ASSET_ROOT_URL), "utf8");
}

function compileVendoredBuiltin(id, parameters, context) {
	return compileFunction(getBuiltinSource(id), parameters, {
		filename: `node:${id}`,
		parsingContext: context,
	});
}

function getBuiltinCompileParameters(id) {
	if (id === "internal/bootstrap/realm") {
		return [
			"process",
			"getLinkedBinding",
			"getInternalBinding",
			"primordials",
		];
	}
	if (id.startsWith("internal/bootstrap/") || id.startsWith("internal/main/")) {
		return ["process", "require", "internalBinding", "primordials"];
	}
	if (id.startsWith("internal/per_context/")) {
		return [
			"exports",
			"primordials",
			"privateSymbols",
			"perIsolateSymbols",
		];
	}
	return [
		"exports",
		"require",
		"module",
		"process",
		"internalBinding",
		"primordials",
	];
}

function createDefaultOptionValue(flag, optionInfo) {
	const metadata = optionInfo.options.get(flag);
	if (!metadata) {
		return undefined;
	}
	return OPTION_DEFAULTS_BY_TYPE.get(metadata.type);
}

function uniqueSorted(values) {
	return [...values].sort();
}

function normalizeVendoredPublicBuiltins(values) {
	if (!Array.isArray(values)) {
		return new Set();
	}
	return new Set(values.filter((value) => typeof value === "string"));
}

function normalizeBuiltinRequest(specifier) {
	if (typeof specifier !== "string") {
		return null;
	}

	const normalized = specifier.startsWith("node:")
		? specifier.slice("node:".length)
		: specifier;

	return BUILTIN_ENTRIES.has(normalized) ? normalized : null;
}

function createFsEventWrapBinding() {
	const hostFsEventWrap = internalBinding("fs_event_wrap");
	if (
		!hostFsEventWrap ||
		typeof hostFsEventWrap !== "object" ||
		typeof hostFsEventWrap.FSEvent !== "function"
	) {
		return hostFsEventWrap;
	}

	class UpstreamFSEvent extends hostFsEventWrap.FSEvent {}

	return {
		...hostFsEventWrap,
		FSEvent: UpstreamFSEvent,
	};
}

function createTcpWrapBinding() {
	const hostTcpWrap = internalBinding("tcp_wrap");
	if (
		!hostTcpWrap ||
		typeof hostTcpWrap !== "object" ||
		typeof hostTcpWrap.TCP !== "function"
	) {
		return hostTcpWrap;
	}

	class UpstreamTCP extends hostTcpWrap.TCP {}

	return {
		...hostTcpWrap,
		TCP: UpstreamTCP,
	};
}

function createModulesBinding() {
	const hostModulesBinding = internalBinding("modules");

	function getNearestParentPackageJSON(checkPath) {
		if (typeof hostModulesBinding.getNearestParentPackageJSON === "function") {
			return hostModulesBinding.getNearestParentPackageJSON(checkPath);
		}

		let currentDir = path.dirname(path.resolve(checkPath));
		while (true) {
			const packageJsonPath = path.join(currentDir, "package.json");
			try {
				return hostModulesBinding.readPackageJSON(packageJsonPath, false);
			} catch (error) {
				if (
					error?.code !== "ENOENT" &&
					error?.code !== "ENOTDIR"
				) {
					throw error;
				}
			}

			const parentDir = path.dirname(currentDir);
			if (parentDir === currentDir) {
				return undefined;
			}
			currentDir = parentDir;
		}
	}

	return {
		...hostModulesBinding,
		getNearestParentPackageJSON,
	};
}

function createModuleWrapBinding() {
	return internalBinding("module_wrap");
}

function createContextifyBinding() {
	return internalBinding("contextify");
}

function createTimersBinding() {
	const hostTimersBinding = internalBinding("timers");
	if (
		!hostTimersBinding ||
		typeof hostTimersBinding !== "object" ||
		typeof hostTimersBinding.setupTimers !== "function"
	) {
		return hostTimersBinding;
	}

	return {
		...hostTimersBinding,
		setupTimers: hostTimersBinding.setupTimers.bind(hostTimersBinding),
	};
}

function createAsyncWrapBinding() {
	const hostAsyncWrap = internalBinding("async_wrap");
	const state = {
		callbackTrampoline: undefined,
		nativeHooks: undefined,
		promiseHooks: [undefined, undefined, undefined, undefined],
	};

	return Object.assign(Object.create(hostAsyncWrap), {
		getPromiseHooks() {
			return [...state.promiseHooks];
		},
		setCallbackTrampoline(callback) {
			state.callbackTrampoline = callback;
			if (typeof hostAsyncWrap.setCallbackTrampoline === "function") {
				hostAsyncWrap.setCallbackTrampoline(callback);
			}
		},
		setPromiseHooks(initHook, beforeHook, afterHook, settledHook) {
			state.promiseHooks = [initHook, beforeHook, afterHook, settledHook];
			if (typeof hostAsyncWrap.setPromiseHooks === "function") {
				hostAsyncWrap.setPromiseHooks(
					initHook,
					beforeHook,
					afterHook,
					settledHook,
				);
			}
		},
		setupHooks(nativeHooks) {
			state.nativeHooks = nativeHooks;
		},
	});
}

function createProcessShim(payload, stdoutChunks, stderrChunks) {
	const processShim = Object.create({});
	const utilBinding = internalBinding("util");
	const useLiveStdio = payload.liveStdio === true;
	let currentCwd = payload.cwd ?? process.cwd();
	let currentUmask = process.umask();

	function createCapturedStdout() {
		return {
			write(chunk, encoding, callback) {
				let resolvedEncoding = encoding;
				let resolvedCallback = callback;
				if (typeof resolvedEncoding === "function") {
					resolvedCallback = resolvedEncoding;
					resolvedEncoding = undefined;
				}
				stdoutChunks.push(normalizeChunk(chunk, resolvedEncoding));
				if (typeof resolvedCallback === "function") {
					resolvedCallback(null);
				}
				return true;
			},
		};
	}

	function createCapturedStderr() {
		return {
			write(chunk, encoding, callback) {
				let resolvedEncoding = encoding;
				let resolvedCallback = callback;
				if (typeof resolvedEncoding === "function") {
					resolvedCallback = resolvedEncoding;
					resolvedEncoding = undefined;
				}
				stderrChunks.push(normalizeChunk(chunk, resolvedEncoding));
				if (typeof resolvedCallback === "function") {
					resolvedCallback(null);
				}
				return true;
			},
		};
	}

	function createCapturedStdin() {
		return {
			isTTY: false,
			setEncoding() {},
			on() {
				return this;
			},
			once() {
				return this;
			},
			pause() {
				return this;
			},
			removeAllListeners() {
				return this;
			},
			removeListener() {
				return this;
			},
			resume() {
				return this;
			},
		};
	}

	function resetStdioForTesting() {
		processShim.stdout = useLiveStdio ? process.stdout : createCapturedStdout();
		processShim.stderr = useLiveStdio ? process.stderr : createCapturedStderr();
		processShim.stdin = useLiveStdio ? process.stdin : createCapturedStdin();
	}

	Object.assign(processShim, {
		versions: process.versions,
		version: process.version,
		release: process.release,
		emitWarning() {},
		env: useLiveStdio ? process.env : { ...(payload.env ?? process.env) },
		argv: [...(payload.argv ?? ["node"])],
		execArgv: [...(payload.execArgv ?? [])],
		execPath: process.execPath,
		title: process.title,
		debugPort: process.debugPort,
		features: process.features,
		pid: process.pid,
		ppid: process.ppid,
		platform: process.platform,
		arch: process.arch,
		cwd: () => currentCwd,
		chdir(directory) {
			currentCwd = directory;
		},
		umask(mask) {
			const previous = currentUmask;
			if (typeof mask === "number") {
				currentUmask = mask & 0o777;
			}
			return previous;
		},
		nextTick: process.nextTick.bind(process),
		on: process.on.bind(process),
		once: process.once.bind(process),
		addListener: process.addListener.bind(process),
		removeListener: process.removeListener.bind(process),
		removeAllListeners: process.removeAllListeners.bind(process),
		emit: process.emit.bind(process),
		listenerCount: process.listenerCount.bind(process),
		rawListeners: process.rawListeners.bind(process),
		exit(code) {
			throw new ProcessExitSignal(code ?? 0);
		},
	});

	resetStdioForTesting();

	processShim.hrtime = process.hrtime.bind(process);
	processShim.hrtime.bigint = process.hrtime.bigint.bind(process.hrtime);
	processShim._rawDebug = (...args) => {
		stderrChunks.push(args.map((value) => String(value)).join(" "));
	};
	processShim._events = {};
	processShim._eventsCount = 0;
	processShim[utilBinding.privateSymbols.exit_info_private_symbol] =
		new Uint32Array(3);

	return {
		processShim,
		resetStdioForTesting,
		useLiveStdio,
	};
}

function createInternalOptionsShim(optionInfo, optionsValues) {
	return {
		getCLIOptionsInfo: () => optionInfo,
		getOptionValue: (flag) => {
			if (Object.prototype.hasOwnProperty.call(optionsValues, flag)) {
				return optionsValues[flag];
			}
			return createDefaultOptionValue(flag, optionInfo);
		},
		getOptionsAsFlagsFromBinding: () => [],
		getAllowUnauthorized: () => false,
		getEmbedderOptions: () => ({}),
		generateConfigJsonSchema: () => ({ __proto__: null }),
		refreshOptions() {},
	};
}

function serializeExportsValue(value) {
	return Buffer.from(serialize(value)).toString("base64");
}

async function createBootstrapExecution(payload, stdoutChunks, stderrChunks) {
	const context = createContext({
		console,
		URL,
		URLSearchParams,
		TextEncoder,
		TextDecoder,
		Buffer,
		clearImmediate,
		clearInterval,
		clearTimeout,
		setImmediate,
		setInterval,
		setTimeout,
		queueMicrotask,
		structuredClone,
		performance,
		navigator: { userAgent: "secure-exec-upstream-runtime" },
	});
	context.globalThis = context;

	const bootstrapPhases = [];
	const hostTimerGlobals = {
		clearImmediate: hostClearImmediate,
		clearInterval: hostClearInterval,
		clearTimeout: hostClearTimeout,
		queueMicrotask,
		setImmediate: hostSetImmediate,
		setInterval,
		setTimeout: hostSetTimeout,
	};
	const requestedBindings = new Set();
	const publicBuiltinFallbacks = new Set();
	const vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
		payload.vendoredPublicBuiltins,
	);
	const logicalUserFilePath =
		typeof payload.filePath === "string" && payload.filePath.length > 0
			? payload.filePath
			: undefined;
	const logicalResolutionFilePath =
		typeof payload.resolutionFilePath === "string" &&
		payload.resolutionFilePath.length > 0
			? payload.resolutionFilePath
			: logicalUserFilePath;
	const hostUserFilePath =
		typeof payload.hostFilePath === "string" && payload.hostFilePath.length > 0
			? payload.hostFilePath
			: logicalUserFilePath;
	const hostStageRoot =
		typeof payload.stageRoot === "string" && payload.stageRoot.length > 0
			? path.resolve(payload.stageRoot)
			: undefined;
	const executeUserInlineFileCode =
		typeof payload.code === "string" &&
		typeof hostUserFilePath === "string" &&
		hostUserFilePath.length > 0;
	const executeUserCodeDirectly =
		payload.returnExports === true || payload.awaitCompletionSignal === true;
	const executeUserFileEntry =
		!executeUserInlineFileCode &&
		typeof hostUserFilePath === "string" &&
		hostUserFilePath.length > 0;
	const vendoredPublicBuiltinsLoaded = new Set();
	const optionInfo = internalBinding("options").getCLIOptionsInfo();
	const fsBindingProvider =
		vendoredPublicBuiltins.has("fs")
			? createUpstreamFsBinding({ internalBinding })
			: null;
	const asyncWrapBinding = createAsyncWrapBinding();
	const contextifyBinding = createContextifyBinding();
	const fsEventWrapBinding = createFsEventWrapBinding();
	const moduleWrapBinding = createModuleWrapBinding();
	const timersBinding = createTimersBinding();
	const tcpWrapBinding = createTcpWrapBinding();
	const modulesBinding = createModulesBinding();
	const optionsValues = {
		"--eval": executeUserCodeDirectly ? "" : payload.code ?? "",
		"--experimental-vm-modules": Array.isArray(payload.execArgv)
			? payload.execArgv.includes("--experimental-vm-modules")
			: false,
		"--print": false,
		"--import": [],
		"--experimental-loader": [],
		"--input-type": "commonjs",
		"--strip-types": false,
		"--inspect-brk": false,
	};
	const {
		processShim,
		resetStdioForTesting,
		useLiveStdio,
	} = createProcessShim(payload, stdoutChunks, stderrChunks);
	const processMethodsBinding = createProcessMethodsBinding({
		processShim,
		resetStdioForTesting,
		raiseProcessExit(code) {
			throw new ProcessExitSignal(code ?? 0);
		},
		stderrChunks,
		useLiveStdio,
	});
	const privateSymbols = {
		transfer_mode_private_symbol: Symbol("transfer_mode_private_symbol"),
	};
	const perIsolateSymbols = {
		messaging_clone_symbol: Symbol("messaging_clone_symbol"),
		messaging_deserialize_symbol: Symbol("messaging_deserialize_symbol"),
	};
	const primordials = {};
	const compiledCache = new Map();
	const exportCache = new Map();
	const hostPublicBuiltinCache = new Map();
	const internalOptionsShim = createInternalOptionsShim(optionInfo, optionsValues);
	let resolveCompletionSignal;
	let rejectCompletionSignal;
	const completionSignalPromise = new Promise((resolve, reject) => {
		resolveCompletionSignal = resolve;
		rejectCompletionSignal = reject;
	});

	context.process = processShim;
	context.__secureExecDone = (error) => {
		if (error === undefined || error === null) {
			resolveCompletionSignal();
			return;
		}
		rejectCompletionSignal(
			error instanceof Error ? error : new Error(String(error)),
		);
	};
	processShim.__secureExecDone = context.__secureExecDone;
	process.__secureExecDone = context.__secureExecDone;
	globalThis.__secureExecDone = context.__secureExecDone;

	const supportedAsyncHooksBuiltin = (() => {
		const activeHooks = new Set();
		const rootResource = {};
		let installed = false;
		let nextAsyncId = 2;
		let currentAsyncId = 1;
		let currentTriggerAsyncId = 0;
		let currentResource = rootResource;
		let currentStores = new Map();
		const emitterListenerWrappers = new WeakMap();
		const trackedHandleExecutions = new WeakMap();
		const originalSetTimeout = context.setTimeout ?? hostSetTimeout;
		const originalClearTimeout = context.clearTimeout ?? hostClearTimeout;
		const originalSetImmediate = context.setImmediate ?? hostSetImmediate;
		const originalClearImmediate = context.clearImmediate ?? hostClearImmediate;
		const originalSetInterval = context.setInterval ?? setInterval;
		const originalClearInterval = context.clearInterval ?? hostClearInterval;
		const originalQueueMicrotask = context.queueMicrotask ?? queueMicrotask;
		const originalNextTick = processShim.nextTick.bind(processShim);
		const hostEvents = HOST_REQUIRE("node:events");
		const eventEmitterPrototype = hostEvents.EventEmitter?.prototype;
		const originalEmitterMethods =
			eventEmitterPrototype &&
			Object.freeze({
				addListener: eventEmitterPrototype.addListener,
				off: eventEmitterPrototype.off,
				on: eventEmitterPrototype.on,
				once: eventEmitterPrototype.once,
				prependListener: eventEmitterPrototype.prependListener,
				prependOnceListener: eventEmitterPrototype.prependOnceListener,
				removeListener: eventEmitterPrototype.removeListener,
			});

		function createArgTypeError(name) {
			const error = new TypeError(
				`The "${name}" argument must be of type function`,
			);
			error.code = "ERR_INVALID_ARG_TYPE";
			return error;
		}

		function createAsyncTypeError() {
			const error = new TypeError("The value of \"type\" is invalid. Received an empty string");
			error.code = "ERR_ASYNC_TYPE";
			return error;
		}

		function createInvalidAsyncIdError(name, value) {
			const error = new RangeError(
				`The value of "${name}" is out of range. It must be an integer. Received ${value}`,
			);
			error.code = "ERR_INVALID_ASYNC_ID";
			return error;
		}

		function createAsyncCallbackError(name) {
			const error = new TypeError(`${name} must be a function`);
			error.code = "ERR_ASYNC_CALLBACK";
			return error;
		}

		function isTrackedHandle(handle) {
			return (
				(typeof handle === "object" && handle !== null) ||
				typeof handle === "function"
			);
		}

		function captureState() {
			return {
				asyncId: currentAsyncId,
				resource: currentResource,
				stores: new Map(currentStores),
				triggerAsyncId: currentTriggerAsyncId,
			};
		}

		function restoreState(state) {
			currentAsyncId = state.asyncId;
			currentTriggerAsyncId = state.triggerAsyncId;
			currentResource = state.resource;
			currentStores = state.stores;
		}

		function emitHook(name, ...args) {
			for (const hook of activeHooks) {
				const callback = hook[name];
				if (typeof callback === "function") {
					callback(...args);
				}
			}
		}

		function createExecution(type, triggerAsyncId, resource, stores) {
			const asyncId = nextAsyncId++;
			emitHook("init", asyncId, type, triggerAsyncId, resource);
			return {
				asyncId,
				destroyed: false,
				handle: undefined,
				triggerAsyncId,
				resource,
				stores: new Map(stores),
			};
		}

		function destroyExecution(execution) {
			if (!execution || execution.destroyed) {
				return;
			}
			execution.destroyed = true;
			if (isTrackedHandle(execution.handle)) {
				trackedHandleExecutions.delete(execution.handle);
			}
			emitHook("destroy", execution.asyncId);
		}

		function runWithExecution(execution, callback, thisArg, args, destroyAfter) {
			const previousState = captureState();
			currentAsyncId = execution.asyncId;
			currentTriggerAsyncId = execution.triggerAsyncId;
			currentResource = execution.resource;
			currentStores = new Map(execution.stores);
			emitHook("before", execution.asyncId);
			try {
				return callback.apply(thisArg, args);
			} finally {
				emitHook("after", execution.asyncId);
				restoreState(previousState);
				if (destroyAfter) {
					destroyExecution(execution);
				}
			}
		}

		function createScheduledExecution(type) {
			const capturedState = captureState();
			return {
				asyncId: nextAsyncId++,
				destroyed: false,
				handle: undefined,
				triggerAsyncId: capturedState.asyncId,
				resource: {},
				stores: new Map(capturedState.stores),
				type,
			};
		}

		function createWrappedExecutionCallback(execution, callback, destroyAfter) {
			return function wrappedScheduledCallback(...args) {
				return runWithExecution(execution, callback, this, args, destroyAfter);
			};
		}

		function attachExecutionHandle(execution, resource) {
			execution.resource = resource ?? {};
			execution.handle = resource;
			if (isTrackedHandle(resource)) {
				trackedHandleExecutions.set(resource, execution);
			}
		}

		function scheduleTrackedCallback(
			type,
			scheduler,
			callback,
			args,
			destroyAfter = true,
		) {
			if (typeof callback !== "function") {
				return scheduler(callback, ...args);
			}
			const execution = createScheduledExecution(type);
			const resource = scheduler(
				createWrappedExecutionCallback(execution, callback, destroyAfter),
				...args,
			);
			attachExecutionHandle(execution, resource);
			emitHook(
				"init",
				execution.asyncId,
				type,
				execution.triggerAsyncId,
				execution.resource,
			);
			return resource;
		}

		function clearTrackedExecution(handle, clearer) {
			if (isTrackedHandle(handle)) {
				destroyExecution(trackedHandleExecutions.get(handle));
			}
			return clearer(handle);
		}

		function getEmitterWrapperStore(emitter, eventName, create = false) {
			let emitterStore = emitterListenerWrappers.get(emitter);
			if (!emitterStore) {
				if (!create) {
					return undefined;
				}
				emitterStore = new Map();
				emitterListenerWrappers.set(emitter, emitterStore);
			}
			let eventStore = emitterStore.get(eventName);
			if (!eventStore) {
				if (!create) {
					return undefined;
				}
				eventStore = new Map();
				emitterStore.set(eventName, eventStore);
			}
			return eventStore;
		}

		function rememberEmitterWrapper(emitter, eventName, listener, wrapped) {
			const eventStore = getEmitterWrapperStore(emitter, eventName, true);
			const wrappers = eventStore.get(listener) ?? [];
			wrappers.push(wrapped);
			eventStore.set(listener, wrappers);
		}

		function takeEmitterWrapper(emitter, eventName, listener) {
			const eventStore = getEmitterWrapperStore(emitter, eventName);
			if (!eventStore) {
				return undefined;
			}
			const wrappers = eventStore.get(listener);
			if (!wrappers || wrappers.length === 0) {
				return undefined;
			}
			const wrapped = wrappers.shift();
			if (wrappers.length === 0) {
				eventStore.delete(listener);
			}
			return wrapped;
		}

		function getEventEmitterExecutionType(emitter, eventName) {
			const emitterType =
				typeof emitter?.constructor?.name === "string" &&
				emitter.constructor.name.length > 0
					? emitter.constructor.name
					: "EventEmitter";
			const eventType =
				typeof eventName === "symbol" ? eventName.toString() : String(eventName);
			return `${emitterType}.${eventType}`;
		}

		function wrapEmitterListener(emitter, eventName, listener, once = false) {
			if (typeof listener !== "function") {
				return listener;
			}
			const capturedState = captureState();
			const execution = createExecution(
				getEventEmitterExecutionType(emitter, eventName),
				capturedState.asyncId,
				emitter,
				capturedState.stores,
			);
			const wrapped = function wrappedEmitterListener(...args) {
				return runWithExecution(execution, listener, this, args, once);
			};
			Object.defineProperty(wrapped, "listener", {
				value: listener,
				configurable: true,
				enumerable: false,
				writable: false,
			});
			wrapped.__secureExecExecution = execution;
			rememberEmitterWrapper(emitter, eventName, listener, wrapped);
			return wrapped;
		}

		function applyPatchedSchedulers() {
			context.setTimeout = function setTimeoutWithAsyncContext(
				callback,
				delay,
				...args
			) {
				return scheduleTrackedCallback(
					"Timeout",
					(scheduledCallback, ...scheduledArgs) =>
						originalSetTimeout(scheduledCallback, delay, ...scheduledArgs),
					callback,
					args,
				);
			};
			context.clearTimeout = function clearTimeoutWithAsyncContext(handle) {
				return clearTrackedExecution(handle, originalClearTimeout);
			};
			context.setImmediate = function setImmediateWithAsyncContext(
				callback,
				...args
			) {
				return scheduleTrackedCallback(
					"Immediate",
					(scheduledCallback, ...scheduledArgs) =>
						originalSetImmediate(scheduledCallback, ...scheduledArgs),
					callback,
					args,
				);
			};
			context.clearImmediate = function clearImmediateWithAsyncContext(handle) {
				return clearTrackedExecution(handle, originalClearImmediate);
			};
			context.setInterval = function setIntervalWithAsyncContext(
				callback,
				delay,
				...args
			) {
				return scheduleTrackedCallback(
					"Timeout",
					(scheduledCallback, ...scheduledArgs) =>
						originalSetInterval(scheduledCallback, delay, ...scheduledArgs),
					callback,
					args,
					false,
				);
			};
			context.clearInterval = function clearIntervalWithAsyncContext(handle) {
				return clearTrackedExecution(handle, originalClearInterval);
			};
			context.queueMicrotask = function queueMicrotaskWithAsyncContext(callback) {
				if (typeof callback !== "function") {
					return originalQueueMicrotask(callback);
				}
				const execution = createScheduledExecution("Microtask");
				emitHook(
					"init",
					execution.asyncId,
					"Microtask",
					execution.triggerAsyncId,
					execution.resource,
				);
				return originalQueueMicrotask(
					createWrappedExecutionCallback(execution, callback, true),
				);
			};
			processShim.nextTick = function nextTickWithAsyncContext(callback, ...args) {
				if (typeof callback !== "function") {
					return originalNextTick(callback, ...args);
				}
				const execution = createScheduledExecution("TickObject");
				emitHook(
					"init",
					execution.asyncId,
					"TickObject",
					execution.triggerAsyncId,
					execution.resource,
				);
				return originalNextTick(
					createWrappedExecutionCallback(execution, callback, true),
					...args,
				);
			};
		}

		function ensureInstalled() {
			applyPatchedSchedulers();
			if (installed) {
				return;
			}
			installed = true;
			if (originalEmitterMethods) {
				eventEmitterPrototype.on = function onWithAsyncContext(
					eventName,
					listener,
				) {
					return originalEmitterMethods.on.call(
						this,
						eventName,
						wrapEmitterListener(this, eventName, listener),
					);
				};
				eventEmitterPrototype.addListener = function addListenerWithAsyncContext(
					eventName,
					listener,
				) {
					return originalEmitterMethods.addListener.call(
						this,
						eventName,
						wrapEmitterListener(this, eventName, listener),
					);
				};
				eventEmitterPrototype.prependListener =
					function prependListenerWithAsyncContext(eventName, listener) {
						return originalEmitterMethods.prependListener.call(
							this,
							eventName,
							wrapEmitterListener(this, eventName, listener),
						);
					};
				eventEmitterPrototype.once = function onceWithAsyncContext(
					eventName,
					listener,
				) {
					return originalEmitterMethods.once.call(
						this,
						eventName,
						wrapEmitterListener(this, eventName, listener, true),
					);
				};
				eventEmitterPrototype.prependOnceListener =
					function prependOnceListenerWithAsyncContext(eventName, listener) {
						return originalEmitterMethods.prependOnceListener.call(
							this,
							eventName,
							wrapEmitterListener(this, eventName, listener, true),
						);
					};
				eventEmitterPrototype.removeListener =
					function removeListenerWithAsyncContext(eventName, listener) {
						const wrapped = takeEmitterWrapper(this, eventName, listener);
						if (wrapped?.__secureExecExecution) {
							destroyExecution(wrapped.__secureExecExecution);
						}
						return originalEmitterMethods.removeListener.call(
							this,
							eventName,
							wrapped ?? listener,
						);
					};
				eventEmitterPrototype.off = function offWithAsyncContext(
					eventName,
					listener,
				) {
					const wrapped = takeEmitterWrapper(this, eventName, listener);
					if (wrapped?.__secureExecExecution) {
						destroyExecution(wrapped.__secureExecExecution);
					}
					return originalEmitterMethods.off.call(
						this,
						eventName,
						wrapped ?? listener,
					);
				};
			}
		}

		class AsyncHookHandle {
			constructor(callbacks = {}) {
				for (const name of [
					"init",
					"before",
					"after",
					"destroy",
					"promiseResolve",
				]) {
					if (
						callbacks[name] !== undefined &&
						typeof callbacks[name] !== "function"
					) {
						throw createAsyncCallbackError(`hook.${name}`);
					}
					this[name] = callbacks[name];
				}
			}

			enable() {
				ensureInstalled();
				activeHooks.add(this);
				return this;
			}

			disable() {
				activeHooks.delete(this);
				return this;
			}
		}

		class AsyncResource {
			constructor(type, options = {}) {
				if (typeof type !== "string") {
					throw createArgTypeError("type");
				}
				if (type.length === 0) {
					throw createAsyncTypeError();
				}
				let triggerAsyncId = currentAsyncId;
				if (typeof options === "number") {
					triggerAsyncId = options;
				} else if (
					options &&
					typeof options === "object" &&
					typeof options.triggerAsyncId === "number"
				) {
					triggerAsyncId = options.triggerAsyncId;
				}
				if (
					!Number.isInteger(triggerAsyncId) ||
					triggerAsyncId < 0
				) {
					throw createInvalidAsyncIdError("triggerAsyncId", triggerAsyncId);
				}
				this.type = type;
				this._asyncId = nextAsyncId++;
				this._destroyed = false;
				this._stores = new Map(currentStores);
				this._triggerAsyncId = triggerAsyncId;
				emitHook("init", this._asyncId, type, triggerAsyncId, this);
			}

			asyncId() {
				return this._asyncId;
			}

			triggerAsyncId() {
				return this._triggerAsyncId;
			}

			runInAsyncScope(callback, thisArg, ...args) {
				if (typeof callback !== "function") {
					throw createArgTypeError("fn");
				}
				return runWithExecution(
					{
						asyncId: this._asyncId,
						triggerAsyncId: this._triggerAsyncId,
						resource: this,
						stores: this._stores,
					},
					callback,
					thisArg,
					args,
					false,
				);
			}

			bind(callback, thisArg) {
				if (typeof callback !== "function") {
					throw createArgTypeError("fn");
				}
				const resource = this;
				const hasExplicitThisArg = arguments.length >= 2;
				const bound = function boundAsyncResourceCallback(...args) {
					return resource.runInAsyncScope(
						callback,
						hasExplicitThisArg ? thisArg : this,
						...args,
					);
				};
				Object.defineProperties(bound, {
					asyncResource: {
						configurable: true,
						enumerable: true,
						get() {
							return resource;
						},
					},
					length: {
						configurable: true,
						enumerable: false,
						value: callback.length,
						writable: false,
					},
				});
				return bound;
			}

			emitDestroy() {
				if (this._destroyed) {
					return;
				}
				this._destroyed = true;
				emitHook("destroy", this._asyncId);
			}

			static bind(callback, type, thisArg) {
				if (typeof callback !== "function") {
					throw createArgTypeError("fn");
				}
				const resource = new AsyncResource(
					type || callback.name || "bound-anonymous-fn",
				);
				if (arguments.length >= 3) {
					return resource.bind(callback, thisArg);
				}
				return resource.bind(callback);
			}
		}

		class AsyncLocalStorage {
			run(store, callback, ...args) {
				const previousState = captureState();
				currentStores = new Map(currentStores);
				currentStores.set(this, store);
				try {
					return callback(...args);
				} finally {
					restoreState(previousState);
				}
			}

			enterWith(store) {
				currentStores = new Map(currentStores);
				currentStores.set(this, store);
			}

			getStore() {
				return currentStores.get(this);
			}

			disable() {
				if (currentStores.has(this)) {
					currentStores = new Map(currentStores);
					currentStores.delete(this);
				}
			}

			exit(callback, ...args) {
				const previousState = captureState();
				currentStores = new Map(currentStores);
				currentStores.delete(this);
				try {
					return callback(...args);
				} finally {
					restoreState(previousState);
				}
			}

			static bind(callback) {
				if (typeof callback !== "function") {
					throw createArgTypeError("fn");
				}
				return AsyncResource.bind(callback);
			}

			static snapshot() {
				const bound = AsyncResource.bind((callback, ...args) => {
					if (typeof callback !== "function") {
						throw createArgTypeError("fn");
					}
					return callback(...args);
				});
				return function runSnapshot(callback, ...args) {
					return bound(callback, ...args);
				};
			}
		}

		return {
			ensureInstalled,
			refreshInstalledState() {
				if (installed) {
					applyPatchedSchedulers();
				}
			},
			module: {
				AsyncLocalStorage,
				AsyncResource,
				asyncWrapProviders: Object.freeze({}),
				createHook(callbacks) {
					return new AsyncHookHandle(callbacks);
				},
				executionAsyncId() {
					return currentAsyncId;
				},
				executionAsyncResource() {
					return currentResource;
				},
				triggerAsyncId() {
					return currentTriggerAsyncId;
				},
			},
		};
	})();

	function normalizeModuleFilename(filenameOrURL) {
		if (filenameOrURL instanceof URL) {
			return fileURLToPath(filenameOrURL);
		}
		if (typeof filenameOrURL !== "string") {
			throw new TypeError("filename must be a string or file URL");
		}
		if (filenameOrURL.startsWith("file:")) {
			return fileURLToPath(filenameOrURL);
		}
		return filenameOrURL;
	}

	function isWithinStageRoot(candidatePath) {
		return (
			typeof hostStageRoot === "string" &&
			(candidatePath === hostStageRoot ||
				candidatePath.startsWith(`${hostStageRoot}${path.sep}`))
		);
	}

	function mapLogicalPathToHost(logicalPath) {
		if (
			typeof hostStageRoot !== "string" ||
			typeof logicalPath !== "string" ||
			!path.posix.isAbsolute(logicalPath)
		) {
			return logicalPath;
		}
		return path.join(hostStageRoot, logicalPath.slice(1));
	}

	function mapHostPathToLogical(hostPath) {
		if (typeof hostPath !== "string") {
			return hostPath;
		}
		if (!isWithinStageRoot(hostPath)) {
			return null;
		}
		const relative = path.relative(hostStageRoot, hostPath);
		if (relative === "") {
			return "/";
		}
		return `/${relative.split(path.sep).join("/")}`;
	}

	function withCompileCacheDisabled(callback) {
		const previousDisableCompileCache = process.env.NODE_DISABLE_COMPILE_CACHE;
		process.env.NODE_DISABLE_COMPILE_CACHE = "1";
		try {
			return callback();
		} finally {
			if (previousDisableCompileCache === undefined) {
				delete process.env.NODE_DISABLE_COMPILE_CACHE;
			} else {
				process.env.NODE_DISABLE_COMPILE_CACHE = previousDisableCompileCache;
			}
		}
	}

	function createInvalidArgTypeError(message) {
		const error = new TypeError(message);
		error.code = "ERR_INVALID_ARG_TYPE";
		return error;
	}

	function validateCompileCacheOptions(options) {
		if (options === undefined || typeof options === "string") {
			return;
		}
		if (
			options === null ||
			typeof options !== "object" ||
			Array.isArray(options)
		) {
			throw createInvalidArgTypeError("cacheDir should be a string");
		}
		const hasDirectory = Object.prototype.hasOwnProperty.call(
			options,
			"directory",
		);
		const hasPortable = Object.prototype.hasOwnProperty.call(
			options,
			"portable",
		);
		if (!hasDirectory && !hasPortable) {
			throw createInvalidArgTypeError("cacheDir should be a string");
		}
		if (
			hasDirectory &&
			options.directory !== undefined &&
			typeof options.directory !== "string"
		) {
			throw createInvalidArgTypeError("cacheDir should be a string");
		}
		if (
			hasPortable &&
			options.portable !== undefined &&
			typeof options.portable !== "boolean"
		) {
			throw createInvalidArgTypeError("portable should be a boolean");
		}
	}

	function normalizeLogicalModulePath(modulePath) {
		if (typeof modulePath !== "string" || modulePath.length === 0) {
			return undefined;
		}
		if (path.posix.isAbsolute(modulePath)) {
			return path.posix.normalize(modulePath);
		}
		if (path.isAbsolute(modulePath)) {
			return path.resolve(modulePath);
		}
		return undefined;
	}

	function translateModuleLocationToSandbox(filenameOrURL) {
		let hostValue = filenameOrURL;
		let hostFilePath;
		let logicalFilePath;

		if (filenameOrURL instanceof URL) {
			if (filenameOrURL.protocol !== "file:") {
				return { useSandbox: false, hostValue: filenameOrURL };
			}
			hostFilePath = fileURLToPath(filenameOrURL);
			if (!isWithinStageRoot(hostFilePath)) {
				const logicalPath = normalizeLogicalModulePath(hostFilePath);
				hostFilePath =
					typeof logicalPath === "string"
						? path.resolve(mapLogicalPathToHost(logicalPath))
						: path.resolve(hostFilePath);
			}
			logicalFilePath =
				mapHostPathToLogical(hostFilePath) ??
				normalizeLogicalModulePath(fileURLToPath(filenameOrURL));
			hostValue = pathToFileURL(hostFilePath);
			hostValue.search = filenameOrURL.search;
			hostValue.hash = filenameOrURL.hash;
		} else if (
			typeof filenameOrURL === "string" &&
			filenameOrURL.startsWith("file:")
		) {
			const fileUrl = new URL(filenameOrURL);
			const translated = translateModuleLocationToSandbox(fileUrl);
			return {
				...translated,
				hostValue:
					translated.useSandbox && translated.hostValue instanceof URL
						? translated.hostValue.href
						: translated.hostValue,
			};
		} else if (
			typeof filenameOrURL === "string" &&
			path.isAbsolute(filenameOrURL)
		) {
			hostFilePath = isWithinStageRoot(filenameOrURL)
				? path.resolve(filenameOrURL)
				: path.resolve(mapLogicalPathToHost(filenameOrURL));
			logicalFilePath =
				mapHostPathToLogical(hostFilePath) ??
				normalizeLogicalModulePath(filenameOrURL);
			hostValue = hostFilePath;
		} else {
			return { useSandbox: false, hostValue: filenameOrURL };
		}

		return {
			useSandbox: true,
			hostValue,
			hostFilePath,
			logicalFilePath,
		};
	}

	function createSandboxRequire(referrerHostFilePath, referrerLogicalFilePath) {
		const effectiveLogicalReferrer =
			typeof referrerLogicalFilePath === "string" &&
			referrerLogicalFilePath.length > 0
				? referrerLogicalFilePath
				: logicalResolutionFilePath;
		let effectiveHostReferrer;
		if (
			typeof referrerHostFilePath === "string" &&
			referrerHostFilePath.length > 0
		) {
			effectiveHostReferrer = referrerHostFilePath;
		} else if (
			typeof effectiveLogicalReferrer === "string" &&
			effectiveLogicalReferrer.length > 0
		) {
			effectiveHostReferrer =
				mapLogicalPathToHost(effectiveLogicalReferrer) ??
				effectiveLogicalReferrer;
		} else {
			effectiveHostReferrer = path.join(
				payload.cwd ?? process.cwd(),
				"__secure_exec_eval__.js",
			);
		}
		const hostRequire = createRequire(
			pathToFileURL(path.resolve(effectiveHostReferrer)).href,
		);

		function resolveNonBuiltin(specifier, options) {
			const mappedOptions =
				options &&
				Array.isArray(options.paths)
					? {
							...options,
							paths: options.paths.map((candidatePath) =>
								mapLogicalPathToHost(candidatePath),
							),
						}
					: options;
			const resolved = hostRequire.resolve(specifier, mappedOptions);
			if (
				typeof resolved === "string" &&
				typeof hostStageRoot === "string" &&
				!isWithinStageRoot(resolved)
			) {
				const moduleNotFoundError = new Error(
					`Cannot find module '${specifier}'`,
				);
				moduleNotFoundError.code = "MODULE_NOT_FOUND";
				throw moduleNotFoundError;
			}
			return resolved;
		}

		const sandboxRequire = (specifier) => {
			const builtinId = normalizeBuiltinRequest(specifier);
			if (builtinId) {
				if (
					executeUserCodeDirectly &&
					vendoredPublicBuiltins.has(builtinId) &&
					HOST_CONTEXT_BUILTINS.has(builtinId)
				) {
					return requireHostVendoredBuiltin(builtinId);
				}
				if (builtinId === "module") {
					return patchModuleBuiltinExports(
						patchVmBuiltinExports(builtinId, requireBuiltin(builtinId)),
					);
				}
				return patchVmBuiltinExports(builtinId, requireBuiltin(builtinId));
			}

			const resolved = resolveNonBuiltin(specifier);
			let executionPath = resolved;
			try {
				executionPath = realpathSync(resolved);
			} catch {
				// Use the resolved path directly when it is not a symlinked package root.
			}
			return hostRequire(executionPath);
		};

		sandboxRequire.resolve = (specifier, options) => {
			const builtinId = normalizeBuiltinRequest(specifier);
			if (builtinId) {
				return specifier.startsWith("node:") ? `node:${builtinId}` : builtinId;
			}
			const resolved = resolveNonBuiltin(specifier, options);
			return mapHostPathToLogical(resolved) ?? resolved;
		};

		sandboxRequire.resolve.paths = (specifier) => {
			const builtinId = normalizeBuiltinRequest(specifier);
			if (builtinId) {
				return null;
			}
			const candidatePaths = hostRequire.resolve.paths(specifier);
			if (!Array.isArray(candidatePaths)) {
				return candidatePaths;
			}
			return candidatePaths
				.map((candidatePath) => mapHostPathToLogical(candidatePath))
				.filter(Boolean);
		};

		sandboxRequire.cache = hostRequire.cache;
		sandboxRequire.main = hostRequire.main;
		return sandboxRequire;
	}

	function patchModuleBuiltinExports(exportsValue) {
		if (
			(typeof exportsValue !== "object" || exportsValue === null) &&
			typeof exportsValue !== "function"
		) {
			return exportsValue;
		}
		if (typeof exportsValue.createRequire !== "function") {
			return exportsValue;
		}
		if (exportsValue.__secureExecModuleBuiltinPatched === true) {
			return exportsValue;
		}

		const originalCreateRequire = exportsValue.createRequire.bind(exportsValue);
		exportsValue.createRequire = (filenameOrURL) => {
			const translated = translateModuleLocationToSandbox(filenameOrURL);
			if (
				translated.useSandbox !== true ||
				typeof translated.hostFilePath !== "string" ||
				typeof translated.logicalFilePath !== "string"
			) {
				return originalCreateRequire(filenameOrURL);
			}
			return createSandboxRequire(
				translated.hostFilePath,
				translated.logicalFilePath,
			);
		};

		if (typeof exportsValue.findPackageJSON === "function") {
			const originalFindPackageJSON =
				exportsValue.findPackageJSON.bind(exportsValue);
			exportsValue.findPackageJSON = (specifier, base) => {
				const translatedSpecifier = translateModuleLocationToSandbox(specifier);
				const translatedBase = translateModuleLocationToSandbox(base);
				const resolvedPackageJson = originalFindPackageJSON(
					translatedSpecifier.hostValue,
					translatedBase.hostValue,
				);
				return mapHostPathToLogical(resolvedPackageJson) ?? resolvedPackageJson;
			};
		}

		if (typeof exportsValue.enableCompileCache === "function") {
			const originalEnableCompileCache =
				exportsValue.enableCompileCache.bind(exportsValue);
			exportsValue.enableCompileCache = (...args) => {
				validateCompileCacheOptions(args[0]);
				return withCompileCacheDisabled(() => originalEnableCompileCache(...args));
			};
		}

		if (typeof exportsValue.getCompileCacheDir === "function") {
			const originalGetCompileCacheDir =
				exportsValue.getCompileCacheDir.bind(exportsValue);
			exportsValue.getCompileCacheDir = (...args) =>
				withCompileCacheDisabled(() => originalGetCompileCacheDir(...args));
		}

		if (typeof exportsValue.flushCompileCache === "function") {
			const originalFlushCompileCache =
				exportsValue.flushCompileCache.bind(exportsValue);
			exportsValue.flushCompileCache = (...args) =>
				withCompileCacheDisabled(() => originalFlushCompileCache(...args));
		}

		if (typeof exportsValue.findSourceMap === "function") {
			const originalFindSourceMap = exportsValue.findSourceMap.bind(exportsValue);
			exportsValue.findSourceMap = (sourceURL) => {
				const translated = translateModuleLocationToSandbox(sourceURL);
				return originalFindSourceMap(translated.hostValue);
			};
		}

		Object.defineProperty(exportsValue, "__secureExecModuleBuiltinPatched", {
			value: true,
			configurable: true,
			enumerable: false,
			writable: false,
		});
		return exportsValue;
	}

	function compileBuiltin(id) {
		const cached = compiledCache.get(id);
		if (cached) {
			return cached;
		}

		if (id === "async_hooks") {
			const asyncHooksBuiltin = (exports, requireFn, module) => {
				supportedAsyncHooksBuiltin.ensureInstalled();
				vendoredPublicBuiltinsLoaded.add(id);
				module.exports = supportedAsyncHooksBuiltin.module;
				return module.exports;
			};
			compiledCache.set(id, asyncHooksBuiltin);
			return asyncHooksBuiltin;
		}

		const entry = BUILTIN_ENTRIES.get(id);
		if (!entry) {
			throw new Error(`Unknown vendored builtin: ${id}`);
		}

		if (
			entry.classification === "public" &&
			!vendoredPublicBuiltins.has(id)
		) {
			const hostFallback = (exports, requireFn, module) => {
				publicBuiltinFallbacks.add(id);
				const hostExports = HOST_REQUIRE(`node:${id}`);
				module.exports = hostExports;
				return hostExports;
			};
			compiledCache.set(id, hostFallback);
			return hostFallback;
		}

		if (entry.classification === "public") {
			vendoredPublicBuiltinsLoaded.add(id);
		}

		const compiled = compileVendoredBuiltin(
			id,
			getBuiltinCompileParameters(id),
			context,
		);
		compiledCache.set(id, compiled);
		return compiled;
	}

	let capturedLoaders;
	function internalBindingShim(name) {
		requestedBindings.add(name);

		if (name === "builtins") {
			return {
				builtinIds: BUILTIN_MANIFEST.builtins.map((entry) => entry.id),
				compileFunction(id) {
					return compileBuiltin(id);
				},
				setInternalLoaders(internalBindingFn, requireBuiltinFn) {
					capturedLoaders = {
						internalBinding: internalBindingFn,
						requireBuiltin: requireBuiltinFn,
					};
				},
				config: JSON.stringify({ target_defaults: {}, variables: {} }),
			};
		}

		if (name === "buffer") {
			return {
				...internalBinding("buffer"),
				setBufferPrototype() {},
			};
		}

		if (name === "module_wrap") {
			return moduleWrapBinding;
		}

		if (name === "contextify") {
			return contextifyBinding;
		}

		if (name === "async_wrap") {
			return asyncWrapBinding;
		}

		if (name === "trace_events") {
			return {
				...internalBinding("trace_events"),
				setTraceCategoryStateUpdateHandler() {},
			};
		}

		if (name === "timers") {
			return timersBinding;
		}

		if (name === "process_methods") {
			return processMethodsBinding;
		}

		if (name === "cjs_lexer") {
			return {
				parse: parseWithCjsLexer,
			};
		}

		if (name === "fs" && fsBindingProvider && !executeUserFileEntry) {
			return fsBindingProvider.binding;
		}

		if (name === "fs_event_wrap") {
			return fsEventWrapBinding;
		}

		if (name === "tcp_wrap") {
			return tcpWrapBinding;
		}

		if (name === "modules") {
			return modulesBinding;
		}

		return internalBinding(name);
	}

	function shouldUseEsmFileEntry(entryFilePath) {
		if (
			entryFilePath.endsWith(".mjs") ||
			entryFilePath.endsWith(".mts") ||
			entryFilePath.endsWith(".wasm")
		) {
			return true;
		}
		if (
			entryFilePath.endsWith(".cjs") ||
			entryFilePath.endsWith(".cts")
		) {
			return false;
		}
		if (!entryFilePath.endsWith(".js") && !entryFilePath.endsWith(".ts")) {
			return false;
		}
		return (
			modulesBinding.getNearestParentPackageJSONType?.(entryFilePath) === "module"
		);
	}

	async function executeUserFileCode(entryFilePath) {
		const normalizedEntryPath = path.resolve(entryFilePath);
		if (shouldUseEsmFileEntry(normalizedEntryPath)) {
			return { ...await import(pathToFileURL(normalizedEntryPath).href) };
		}

		const cjsLoader = requireBuiltin("internal/modules/cjs/loader");
		return cjsLoader.wrapModuleLoad(normalizedEntryPath, null, true);
	}

	function requireBuiltin(id) {
		if (id === "internal/options") {
			return internalOptionsShim;
		}

		if (exportCache.has(id)) {
			return exportCache.get(id).exports;
		}

		const mod = { exports: {} };
		exportCache.set(id, mod);
		const compiled = compileBuiltin(id);

		if (id === "internal/bootstrap/realm") {
			compiled(processShim, () => ({}), internalBindingShim, primordials);
			if (capturedLoaders) {
				mod.exports = capturedLoaders.requireBuiltin(id);
			}
		} else if (id === "internal/util/debuglog") {
			const hostDebuglog = HOST_REQUIRE("internal/util/debuglog");
			hostDebuglog.initializeDebugEnv(process.env.NODE_DEBUG);
			mod.exports = hostDebuglog;
		} else if (
			id.startsWith("internal/bootstrap/") ||
			id.startsWith("internal/main/")
		) {
			const result = compiled(
				processShim,
				requireBuiltin,
				internalBindingShim,
				primordials,
			);
			if (result !== undefined) {
				mod.exports = result;
			}
		} else if (id.startsWith("internal/per_context/")) {
			compiled(mod.exports, primordials, privateSymbols, perIsolateSymbols);
		} else {
			const result = compiled(
				mod.exports,
				requireBuiltin,
				mod,
				processShim,
				internalBindingShim,
				primordials,
			);
			if (result !== undefined) {
				mod.exports = result;
			}
		}

		exportCache.set(id, mod);
		return patchVmBuiltinExports(id, mod.exports);
	}

	function patchVmBuiltinExports(id, exportsValue) {
		if (
			id !== "vm" ||
			!internalOptionsShim.getOptionValue("--experimental-vm-modules")
		) {
			return exportsValue;
		}
		if (
			(typeof exportsValue !== "object" || exportsValue === null) &&
			typeof exportsValue !== "function"
		) {
			return exportsValue;
		}
		if (
			typeof exportsValue.Module === "function" &&
			typeof exportsValue.SourceTextModule === "function" &&
			typeof exportsValue.SyntheticModule === "function"
		) {
			return exportsValue;
		}

		const { Module, SourceTextModule, SyntheticModule } = requireBuiltin(
			"internal/vm/module",
		);
		exportsValue.Module = Module;
		exportsValue.SourceTextModule = SourceTextModule;
		exportsValue.SyntheticModule = SyntheticModule;
		return exportsValue;
	}

	function requireHostVendoredBuiltin(id) {
		if (hostPublicBuiltinCache.has(id)) {
			return hostPublicBuiltinCache.get(id).exports;
		}

		const entry = BUILTIN_ENTRIES.get(id);
		if (!entry) {
			throw new Error(`Unknown vendored builtin: ${id}`);
		}
		if (entry.classification === "public") {
			vendoredPublicBuiltinsLoaded.add(id);
		}
		const mod = { exports: {} };
		hostPublicBuiltinCache.set(id, mod);
		const hostRequire = (specifier) => {
			const builtinId = normalizeBuiltinRequest(specifier);
			if (!builtinId) {
				return HOST_REQUIRE(specifier);
			}
			if (builtinId === id) {
				return mod.exports;
			}
			if (
				executeUserCodeDirectly &&
				HOST_CONTEXT_BUILTINS.has(builtinId) &&
				(
					vendoredPublicBuiltins.has(builtinId) ||
					BUILTIN_ENTRIES.get(builtinId)?.classification === "internal"
				)
			) {
				return requireHostVendoredBuiltin(builtinId);
			}
			const requestedEntry = BUILTIN_ENTRIES.get(builtinId);
			if (requestedEntry?.classification === "internal") {
				return HOST_REQUIRE(builtinId);
			}
			return HOST_REQUIRE(`node:${builtinId}`);
		};
		hostRequire.resolve = (specifier) => {
			const builtinId = normalizeBuiltinRequest(specifier);
			if (builtinId) {
				return `node:${builtinId}`;
			}
			return HOST_REQUIRE.resolve(specifier);
		};
		hostRequire.cache = HOST_REQUIRE.cache;
		hostRequire.main = HOST_REQUIRE.main;

		const compiled = compileFunction(
			getBuiltinSource(id),
			getBuiltinCompileParameters(id),
			{
				filename: `node:${id}`,
			},
		);
		if (id === "internal/bootstrap/realm") {
			const result = compiled(
				process,
				() => ({}),
				internalBindingShim,
				primordials,
			);
			if (result !== undefined) {
				mod.exports = result;
			}
		} else if (id.startsWith("internal/bootstrap/") || id.startsWith("internal/main/")) {
			const result = compiled(process, hostRequire, internalBindingShim, primordials);
			if (result !== undefined) {
				mod.exports = result;
			}
		} else if (id.startsWith("internal/per_context/")) {
			compiled(mod.exports, primordials, privateSymbols, perIsolateSymbols);
		} else {
			const result = compiled(
				mod.exports,
				hostRequire,
				mod,
				process,
				internalBindingShim,
				primordials,
			);
			if (result !== undefined) {
				mod.exports = result;
			}
		}
		hostPublicBuiltinCache.set(id, mod);
		return patchVmBuiltinExports(id, mod.exports);
	}

	function createUserRequire(referrerFilePath, referrerLogicalFilePath) {
		const builtinRequire = capturedLoaders?.requireBuiltin ?? requireBuiltin;
		const sandboxRequire = createSandboxRequire(
			referrerFilePath,
			referrerLogicalFilePath,
		);
		const userRequire = (specifier) => {
			const builtinId = normalizeBuiltinRequest(specifier);
			if (builtinId) {
				if (
					executeUserCodeDirectly &&
					vendoredPublicBuiltins.has(builtinId) &&
					HOST_CONTEXT_BUILTINS.has(builtinId)
				) {
					return requireHostVendoredBuiltin(builtinId);
				}
				if (builtinId === "module") {
					return patchModuleBuiltinExports(
						patchVmBuiltinExports(builtinId, builtinRequire(builtinId)),
					);
				}
				return patchVmBuiltinExports(builtinId, builtinRequire(builtinId));
			}
			return sandboxRequire(specifier);
		};
		userRequire.resolve = sandboxRequire.resolve;
		userRequire.cache = sandboxRequire.cache;
		userRequire.main = sandboxRequire.main;
		return userRequire;
	}

	function executeUserEvalCode({
		hostFilePath,
		logicalFilePath,
		resolutionFilePath,
	} = {}) {
		Object.assign(context, hostTimerGlobals);
		supportedAsyncHooksBuiltin.refreshInstalledState();
		const visibleFilePath = logicalFilePath ?? "[eval]";
		const visibleDirname =
			logicalFilePath === undefined
				? payload.cwd ?? process.cwd()
				: path.posix.dirname(logicalFilePath);
		const useAsyncEvalWrapper = payload.awaitCompletionSignal === true;
		const compileOptions =
			useAsyncEvalWrapper
				? {
						filename: visibleFilePath,
					}
				: {
						filename: visibleFilePath,
						parsingContext: context,
					};
		const parameterNames = useAsyncEvalWrapper
			? [
					"exports",
					"require",
					"module",
					"__filename",
					"__dirname",
					"process",
					"setTimeout",
					"clearTimeout",
					"setImmediate",
					"clearImmediate",
					"setInterval",
					"clearInterval",
					"queueMicrotask",
				]
			: ["exports", "require", "module", "__filename", "__dirname"];
		const compiled = compileFunction(
			payload.code ?? "",
			parameterNames,
			compileOptions,
		);
		const mod = {
			exports: {},
			filename: visibleFilePath,
			id: visibleFilePath,
			path: visibleDirname,
		};
		const userRequire = createUserRequire(
			hostFilePath,
			resolutionFilePath ?? logicalFilePath,
		);
		const result = useAsyncEvalWrapper
			? compiled(
					mod.exports,
					userRequire,
					mod,
					visibleFilePath,
					visibleDirname,
					processShim,
					(...args) => context.setTimeout(...args),
					(...args) => context.clearTimeout(...args),
					(...args) => context.setImmediate(...args),
					(...args) => context.clearImmediate(...args),
					(...args) => context.setInterval(...args),
					(...args) => context.clearInterval(...args),
					(...args) => context.queueMicrotask(...args),
				)
			: compiled(
					mod.exports,
					userRequire,
					mod,
					visibleFilePath,
					visibleDirname,
				);
		if (result !== undefined) {
			mod.exports = result;
		}
		return mod.exports;
	}

	function preparePostBootstrapAsyncEval() {
		processShim.nextTick = process.nextTick.bind(process);
		if (typeof process._tickCallback === "function") {
			processShim._tickCallback = process._tickCallback.bind(process);
		}
		const hostInternalTimers = HOST_REQUIRE("internal/timers");
		if (
			typeof hostInternalTimers?.getTimerCallbacks === "function" &&
			typeof timersBinding?.setupTimers === "function" &&
			typeof process._tickCallback === "function"
		) {
			const { processImmediate, processTimers } =
				hostInternalTimers.getTimerCallbacks(process._tickCallback.bind(process));
			timersBinding.setupTimers(processImmediate, processTimers);
		}
	}

	async function executeUserInlineBackedFileCode(hostFilePath, logicalFilePath) {
		const normalizedHostPath = path.resolve(hostFilePath);
		if (shouldUseEsmFileEntry(normalizedHostPath)) {
			return { ...await import(pathToFileURL(normalizedHostPath).href) };
		}
		return executeUserEvalCode({
			hostFilePath: normalizedHostPath,
			logicalFilePath: logicalFilePath ?? normalizedHostPath,
			resolutionFilePath: logicalFilePath ?? normalizedHostPath,
		});
	}

	bootstrapPhases.push("internal/per_context/primordials");
	compileBuiltin("internal/per_context/primordials")(
		{},
		primordials,
		privateSymbols,
		perIsolateSymbols,
	);

	bootstrapPhases.push("internal/per_context/domexception");
	requireBuiltin("internal/per_context/domexception");

	bootstrapPhases.push("internal/per_context/messageport");
	requireBuiltin("internal/per_context/messageport");

	bootstrapPhases.push("internal/bootstrap/realm");
	requireBuiltin("internal/bootstrap/realm");

	bootstrapPhases.push("internal/bootstrap/node");
	requireBuiltin("internal/bootstrap/node");

	(capturedLoaders?.requireBuiltin("internal/util/debuglog") ??
		requireBuiltin("internal/util/debuglog")).initializeDebugEnv(
		processShim.env.NODE_DEBUG,
	);
	HOST_REQUIRE("internal/util/debuglog").initializeDebugEnv(
		process.env.NODE_DEBUG,
	);
	patchModuleBuiltinExports(HOST_REQUIRE("node:module"));
	if (executeUserCodeDirectly) {
		preparePostBootstrapAsyncEval();
	}

	let entrypoint = "internal/main/eval_string";
	let userExports;
	if (executeUserFileEntry) {
		entrypoint = "secure_exec/file_entry";
		userExports = await executeUserFileCode(hostUserFilePath);
	} else if (executeUserInlineFileCode) {
		entrypoint = "secure_exec/file_backed_eval";
		userExports = await executeUserInlineBackedFileCode(
			hostUserFilePath,
			logicalUserFilePath,
		);
	} else if (executeUserCodeDirectly) {
		entrypoint = "secure_exec/post_bootstrap_eval";
		userExports = executeUserEvalCode({
			hostFilePath: hostUserFilePath,
			resolutionFilePath: logicalResolutionFilePath,
		});
	} else {
		bootstrapPhases.push("internal/main/eval_string");
		requireBuiltin("internal/main/eval_string");
	}

	return {
		entrypoint,
		awaitCompletionSignal: payload.awaitCompletionSignal === true,
		bootstrapPhases,
		completionSignalPromise,
		requestedBindings: uniqueSorted(requestedBindings),
		publicBuiltinFallbacks: uniqueSorted(publicBuiltinFallbacks),
		vendoredPublicBuiltinsLoaded: uniqueSorted(vendoredPublicBuiltinsLoaded),
		describeFsBackendUsage: () => fsBindingProvider?.describeUsage(),
		userExports,
	};
}

if (internalBinding) {
	void (async () => {
	const stdoutChunks = [];
	const stderrChunks = [];
	const payload = await readPayload();
	const restoreProcess = createProcessCapture(payload, stdoutChunks, stderrChunks);
	let exitCode = 0;
	let execution;

	try {
		if (
			typeof payload.code !== "string" &&
			typeof payload.filePath !== "string"
		) {
			throw new Error(
				"bootstrap runner payload requires a string `code` or `filePath` field",
			);
		}

		execution = await createBootstrapExecution(payload, stdoutChunks, stderrChunks);
		if (execution.awaitCompletionSignal) {
			await Promise.race([
				execution.completionSignalPromise,
				new Promise((_, reject) => {
					hostSetTimeout(() => {
						reject(
							new Error(
								"vendored bootstrap runner timed out waiting for __secureExecDone()",
							),
						);
					}, 2_000);
				}),
			]);
		}
		exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
		restoreProcess();
		if (payload.liveStdio === true) {
			process.exitCode = exitCode;
			return;
		}
		process.stdout.write(
			`${JSON.stringify(
				{
					status: "pass",
					summary:
						"vendored internal/per_context/*, internal/bootstrap/realm, internal/bootstrap/node, and internal/main/eval_string completed in snapshot-free mode with explicit host shims",
					entrypoint: execution.entrypoint,
					code: exitCode,
					stdout: stdoutChunks.join(""),
					stderr: stderrChunks.join(""),
					bootstrapPhases: execution.bootstrapPhases,
					internalBindings: execution.requestedBindings,
					publicBuiltinFallbacks: execution.publicBuiltinFallbacks,
					vendoredPublicBuiltinsLoaded:
						execution.vendoredPublicBuiltinsLoaded,
					fsBackendAbiVersion: execution.describeFsBackendUsage?.()?.abiVersion,
					fsBackendArtifacts:
						execution.describeFsBackendUsage?.()?.artifacts ?? [],
					fsBackendOperations:
						execution.describeFsBackendUsage?.()?.operations ?? [],
					appliedBindingShims: [...APPLIED_BINDING_SHIMS],
					serializedExports:
						payload.returnExports === true
							? serializeExportsValue(execution.userExports)
							: undefined,
				},
				null,
				2,
			)}\n`,
		);
	} catch (error) {
		if (error instanceof ProcessExitSignal) {
			exitCode = error.code;
			restoreProcess();
			if (payload.liveStdio === true) {
				process.exitCode = exitCode;
				return;
			}
			process.stdout.write(
				`${JSON.stringify(
					{
						status: "pass",
						summary:
							"vendored bootstrap reached internal/main/eval_string and user code exited explicitly",
						entrypoint: execution?.entrypoint ?? "internal/main/eval_string",
						code: exitCode,
						stdout: stdoutChunks.join(""),
						stderr: stderrChunks.join(""),
						bootstrapPhases: execution?.bootstrapPhases ?? [
							"internal/per_context/primordials",
							"internal/per_context/domexception",
							"internal/per_context/messageport",
							"internal/bootstrap/realm",
							"internal/bootstrap/node",
							"internal/main/eval_string",
						],
						internalBindings: execution?.requestedBindings ?? [],
						publicBuiltinFallbacks: execution?.publicBuiltinFallbacks ?? [],
						vendoredPublicBuiltinsLoaded:
							execution?.vendoredPublicBuiltinsLoaded ?? [],
						fsBackendAbiVersion:
							execution?.describeFsBackendUsage?.()?.abiVersion,
						fsBackendArtifacts:
							execution?.describeFsBackendUsage?.()?.artifacts ?? [],
						fsBackendOperations:
							execution?.describeFsBackendUsage?.()?.operations ?? [],
						appliedBindingShims: [...APPLIED_BINDING_SHIMS],
						serializedExports:
							payload.returnExports === true && execution
								? serializeExportsValue(execution.userExports)
								: undefined,
					},
					null,
					2,
				)}\n`,
			);
		} else {
			restoreProcess();
			if (payload.liveStdio === true) {
				process.stderr.write(
					error instanceof Error ? `${error.stack ?? error.message}\n` : `${String(error)}\n`,
				);
				process.exitCode = 1;
				return;
			}
			process.stdout.write(
				`${JSON.stringify(
					{
						status: "blocked",
						summary:
							"vendored bootstrap bring-up failed before the internal/main/eval_string smoke path completed",
						errorMessage: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
						code: 1,
						stdout: stdoutChunks.join(""),
						stderr: stderrChunks.join(""),
					},
					null,
					2,
				)}\n`,
			);
			process.exitCode = 1;
		}
	}
	})().catch((error) => {
		process.stdout.write(
			`${JSON.stringify(
				{
					status: "blocked",
					summary:
						"vendored bootstrap bring-up failed before the internal/main/eval_string smoke path completed",
					errorMessage: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					code: 1,
					stdout: "",
					stderr: "",
				},
				null,
				2,
			)}\n`,
		);
		process.exitCode = 1;
	});
}
