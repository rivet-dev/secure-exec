#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
	"async_wrap.setupHooks-noop",
	"trace_events.setTraceCategoryStateUpdateHandler-noop",
	"internal/options-host-shim",
	"public-builtin-host-fallback",
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

	process.stdout.write = captureWrite(stdoutChunks);
	process.stderr.write = captureWrite(stderrChunks);
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

	return () => {
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

function createProcessShim(payload, stdoutChunks, stderrChunks) {
	const processShim = Object.create({});
	const utilBinding = internalBinding("util");
	const cwd = payload.cwd ?? process.cwd();

	Object.assign(processShim, {
		versions: process.versions,
		version: process.version,
		release: process.release,
		emitWarning() {},
		env: { ...(payload.env ?? process.env) },
		argv: payload.argv ?? ["node"],
		execArgv: payload.execArgv ?? [],
		features: process.features,
		pid: process.pid,
		ppid: process.ppid,
		platform: process.platform,
		arch: process.arch,
		cwd: () => cwd,
		nextTick: process.nextTick.bind(process),
		on: () => processShim,
		once: () => processShim,
		emit: () => false,
		stdout: {
			write(chunk) {
				stdoutChunks.push(normalizeChunk(chunk));
				return true;
			},
		},
		stderr: {
			write(chunk) {
				stderrChunks.push(normalizeChunk(chunk));
				return true;
			},
		},
		stdin: {
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

function createBootstrapExecution(payload, stdoutChunks, stderrChunks) {
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
	const requestedBindings = new Set();
	const publicBuiltinFallbacks = new Set();
	const vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
		payload.vendoredPublicBuiltins,
	);
	const vendoredPublicBuiltinsLoaded = new Set();
	const optionInfo = internalBinding("options").getCLIOptionsInfo();
	const fsBindingProvider =
		vendoredPublicBuiltins.has("fs")
			? createUpstreamFsBinding({ internalBinding })
			: null;
	const optionsValues = {
		"--eval": payload.code ?? "",
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

		let parameters;
		if (id === "internal/bootstrap/realm") {
			parameters = [
				"process",
				"getLinkedBinding",
				"getInternalBinding",
				"primordials",
			];
		} else if (
			id.startsWith("internal/bootstrap/") ||
			id.startsWith("internal/main/")
		) {
			parameters = ["process", "require", "internalBinding", "primordials"];
		} else if (id.startsWith("internal/per_context/")) {
			parameters = [
				"exports",
				"primordials",
				"privateSymbols",
				"perIsolateSymbols",
			];
		} else {
			parameters = [
				"exports",
				"require",
				"module",
				"process",
				"internalBinding",
				"primordials",
			];
		}

		const compiled = compileVendoredBuiltin(id, parameters, context);
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

		if (name === "async_wrap") {
			return {
				...internalBinding("async_wrap"),
				setupHooks() {},
			};
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

		if (name === "fs" && fsBindingProvider) {
			return fsBindingProvider.binding;
		}

		return internalBinding(name);
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
		return mod.exports;
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

	bootstrapPhases.push("internal/main/eval_string");
	requireBuiltin("internal/main/eval_string");

	return {
		awaitCompletionSignal: payload.awaitCompletionSignal === true,
		bootstrapPhases,
		completionSignalPromise,
		requestedBindings: uniqueSorted(requestedBindings),
		publicBuiltinFallbacks: uniqueSorted(publicBuiltinFallbacks),
		vendoredPublicBuiltinsLoaded: uniqueSorted(vendoredPublicBuiltinsLoaded),
		describeFsBackendUsage: () => fsBindingProvider?.describeUsage(),
	};
}

if (internalBinding) {
	const stdoutChunks = [];
	const stderrChunks = [];
	const payload = await readPayload();
	const restoreProcess = createProcessCapture(payload, stdoutChunks, stderrChunks);
	let exitCode = 0;
	let execution;

	try {
		if (typeof payload.code !== "string") {
			throw new Error("bootstrap runner payload requires a string `code` field");
		}

		execution = createBootstrapExecution(payload, stdoutChunks, stderrChunks);
		if (execution.awaitCompletionSignal) {
			await Promise.race([
				execution.completionSignalPromise,
				new Promise((_, reject) => {
					setTimeout(() => {
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
		process.stdout.write(
			`${JSON.stringify(
				{
					status: "pass",
					summary:
						"vendored internal/per_context/*, internal/bootstrap/realm, internal/bootstrap/node, and internal/main/eval_string completed in snapshot-free mode with explicit host shims",
					entrypoint: "internal/main/eval_string",
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
				},
				null,
				2,
			)}\n`,
		);
	} catch (error) {
		if (error instanceof ProcessExitSignal) {
			exitCode = error.code;
			restoreProcess();
			process.stdout.write(
				`${JSON.stringify(
					{
						status: "pass",
						summary:
							"vendored bootstrap reached internal/main/eval_string and user code exited explicitly",
						entrypoint: "internal/main/eval_string",
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
					},
					null,
					2,
				)}\n`,
			);
		} else {
			restoreProcess();
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
}
