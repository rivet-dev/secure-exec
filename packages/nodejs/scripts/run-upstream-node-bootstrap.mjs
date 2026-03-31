#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
	"trace_events.setTraceCategoryStateUpdateHandler-noop",
	"internal/options-host-shim",
	"fs_event_wrap-fsevent-subclass",
	"tcp_wrap-owner-subclass",
	"http-cluster-host-context",
	"internal/util/debuglog-initializeDebugEnv",
	"host-internal/util/debuglog-initializeDebugEnv",
	"public-builtin-host-fallback",
	"modules-getNearestParentPackageJSON-shim",
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
		},
		setPromiseHooks(initHook, beforeHook, afterHook, settledHook) {
			state.promiseHooks = [initHook, beforeHook, afterHook, settledHook];
		},
		setupHooks(nativeHooks) {
			state.nativeHooks = nativeHooks;
		},
	});
}

function createProcessShim(payload, stdoutChunks, stderrChunks) {
	const processShim = Object.create({});
	const utilBinding = internalBinding("util");
	const cwd = payload.cwd ?? process.cwd();
	const useLiveStdio = payload.liveStdio === true;

	Object.assign(processShim, {
		versions: process.versions,
		version: process.version,
		release: process.release,
		emitWarning() {},
		env: useLiveStdio ? process.env : { ...(payload.env ?? process.env) },
		argv: payload.argv ?? ["node"],
		execArgv: payload.execArgv ?? [],
		features: process.features,
		pid: process.pid,
		ppid: process.ppid,
		platform: process.platform,
		arch: process.arch,
		cwd: () => cwd,
		nextTick: process.nextTick.bind(process),
		on: process.on.bind(process),
		once: process.once.bind(process),
		addListener: process.addListener.bind(process),
		removeListener: process.removeListener.bind(process),
		removeAllListeners: process.removeAllListeners.bind(process),
		emit: process.emit.bind(process),
		listenerCount: process.listenerCount.bind(process),
		rawListeners: process.rawListeners.bind(process),
		stdout: useLiveStdio ? process.stdout : {
			write(chunk) {
				stdoutChunks.push(normalizeChunk(chunk));
				return true;
			},
		},
		stderr: useLiveStdio ? process.stderr : {
			write(chunk) {
				stderrChunks.push(normalizeChunk(chunk));
				return true;
			},
		},
		stdin: useLiveStdio ? process.stdin : {
			isTTY: false,
			setEncoding() {},
			on() {},
			resume() {},
		},
		exit(code) {
			throw new ProcessExitSignal(code ?? 0);
		},
	});

	processShim.hrtime = process.hrtime.bind(process);
	processShim.hrtime.bigint = process.hrtime.bigint.bind(process.hrtime);
	processShim._rawDebug = (...args) => {
		stderrChunks.push(args.map((value) => String(value)).join(" "));
	};
	processShim._events = {};
	processShim._eventsCount = 0;
	processShim[utilBinding.privateSymbols.exit_info_private_symbol] =
		new Uint32Array(3);

	return processShim;
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
	const hostUserFilePath =
		typeof payload.hostFilePath === "string" && payload.hostFilePath.length > 0
			? payload.hostFilePath
			: logicalUserFilePath;
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
	const processShim = createProcessShim(payload, stdoutChunks, stderrChunks);
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

	function compileBuiltin(id) {
		const cached = compiledCache.get(id);
		if (cached) {
			return cached;
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

	function createUserRequire(referrerFilePath) {
		const builtinRequire = capturedLoaders?.requireBuiltin ?? requireBuiltin;
		const hostRequire =
			typeof referrerFilePath === "string" && referrerFilePath.length > 0
				? createRequire(pathToFileURL(referrerFilePath).href)
				: HOST_REQUIRE;
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
				return patchVmBuiltinExports(builtinId, builtinRequire(builtinId));
			}
			return hostRequire(specifier);
		};
		userRequire.resolve = (specifier) => {
			const builtinId = normalizeBuiltinRequest(specifier);
			if (builtinId) {
				return `node:${builtinId}`;
			}
			return hostRequire.resolve(specifier);
		};
		userRequire.cache = hostRequire.cache;
		userRequire.main = hostRequire.main;
		return userRequire;
	}

	function executeUserEvalCode({
		hostFilePath,
		logicalFilePath,
	} = {}) {
		Object.assign(context, hostTimerGlobals);
		const visibleFilePath = logicalFilePath ?? "[eval]";
		const visibleDirname =
			logicalFilePath === undefined
				? payload.cwd ?? process.cwd()
				: path.posix.dirname(logicalFilePath);
		const compiled = compileFunction(
			payload.code ?? "",
			["exports", "require", "module", "__filename", "__dirname"],
			{
				filename: visibleFilePath,
				parsingContext: context,
			},
		);
		const mod = {
			exports: {},
			filename: visibleFilePath,
			id: visibleFilePath,
			path: visibleDirname,
		};
		const userRequire = createUserRequire(hostFilePath);
		const result = compiled(
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

	async function executeUserInlineBackedFileCode(hostFilePath, logicalFilePath) {
		const normalizedHostPath = path.resolve(hostFilePath);
		if (shouldUseEsmFileEntry(normalizedHostPath)) {
			return { ...await import(pathToFileURL(normalizedHostPath).href) };
		}
		return executeUserEvalCode({
			hostFilePath: normalizedHostPath,
			logicalFilePath: logicalFilePath ?? normalizedHostPath,
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
		userExports = executeUserEvalCode();
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
