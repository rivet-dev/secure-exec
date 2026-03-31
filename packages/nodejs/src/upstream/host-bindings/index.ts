import { Buffer, constants as bufferConstants } from "node:buffer";
import { constants as cryptoConstants } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import { constants as zlibConstants } from "node:zlib";
import type {
	UpstreamBindingPhase,
	UpstreamHostResponsibility,
	UpstreamInternalBindingRegistration,
	UpstreamInternalBindingResolverContext,
} from "../types.js";
import { createScaffoldProcessMethodsBinding } from "./process-methods.js";

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const nested of Object.values(value as Record<string, unknown>)) {
			deepFreeze(nested);
		}
	}
	return value;
}

function createNoopFunction<T extends (...args: never[]) => void>(): T {
	return (() => {}) as T;
}

function is64BitArchitecture(): boolean {
	return process.arch.includes("64");
}

function phases(
	...values: readonly UpstreamBindingPhase[]
): readonly UpstreamBindingPhase[] {
	return Object.freeze([...values]);
}

function responsibilities(
	...values: readonly UpstreamHostResponsibility[]
): readonly UpstreamHostResponsibility[] {
	return Object.freeze([...values]);
}

const HOST_BUFFER_BINDING = deepFreeze({
	compare: Buffer.compare.bind(Buffer),
	kMaxLength: bufferConstants.MAX_LENGTH,
	kStringMaxLength: bufferConstants.MAX_STRING_LENGTH,
	setBufferPrototype: createNoopFunction<() => void>(),
});

const HOST_CONFIG_BINDING = deepFreeze({
	bits: is64BitArchitecture() ? 64 : 32,
	fipsMode: 0,
	hasInspector: Boolean(
		(process.features as unknown as Record<string, unknown>).inspector,
	),
	hasIntl: typeof Intl !== "undefined",
	hasNodeOptions: true,
	hasOpenSSL: Boolean(process.versions.openssl),
	hasSmallICU: Boolean(
		(process.config.variables as Record<string, unknown> | undefined)?.icu_small,
	),
	isDebugBuild: false,
	noBrowserGlobals: false,
});

const HOST_CONSTANTS_BINDING = deepFreeze({
	crypto: { ...cryptoConstants },
	fs: { ...fsConstants },
	internal: {},
	os: {
		...os.constants,
	},
	zlib: { ...zlibConstants },
});

const HOST_CREDENTIALS_BINDING = deepFreeze({
	getTempDir: () => os.tmpdir(),
	implementsPosixCredentials: false,
	safeGetenv: (name: string) => process.env[name],
});

const HOST_ERRORS_BINDING = deepFreeze({
	exitCodes: {
		kGenericUserError: 1,
		kInvalidCommandLineArgument: 9,
		kNoFailure: 0,
	},
	setEnhanceStackForFatalException: createNoopFunction<
		(beforeInspector: unknown, afterInspector: unknown) => void
	>(),
	setGetSourceMapErrorSource: createNoopFunction<(callback: unknown) => void>(),
	setMaybeCacheGeneratedSourceMap: createNoopFunction<(callback: unknown) => void>(),
	setPrepareStackTraceCallback: createNoopFunction<(callback: unknown) => void>(),
	triggerUncaughtException(error: unknown): never {
		throw error instanceof Error ? error : new Error(String(error));
	},
});

const HOST_SYMBOLS_BINDING = deepFreeze({
	async_id_symbol: Symbol("async_id_symbol"),
	contextify_context_private_symbol: Symbol("contextify_context_private_symbol"),
	imported_cjs_symbol: Symbol("imported_cjs_symbol"),
	owner_symbol: Symbol("owner_symbol"),
	resource_symbol: Symbol("resource_symbol"),
	trigger_async_id_symbol: Symbol("trigger_async_id_symbol"),
});

const HOST_TIMERS_BINDING = deepFreeze({
	setupTimers: createNoopFunction<
		(processImmediate: unknown, processTimers: unknown) => void
	>(),
});

const HOST_TRACE_EVENTS_BINDING = deepFreeze({
	CategorySet: class CategorySet {
		disable(): void {}
		enable(): void {}
	},
	getCategoryEnabledBuffer: () => new Uint8Array(0),
	getEnabledCategories: () => "",
	isTraceCategoryEnabled: () => false,
	setTraceCategoryStateUpdateHandler: createNoopFunction<
		(callback: unknown) => void
	>(),
	trace: createNoopFunction<(...args: unknown[]) => void>(),
});

const HOST_ASYNC_WRAP_BINDING = deepFreeze({
	setPromiseHooks: createNoopFunction<
		(
			initHook: unknown,
			beforeHook: unknown,
			afterHook: unknown,
			settledHook: unknown,
		) => void
	>(),
	setupHooks: createNoopFunction<(nativeHooks: unknown) => void>(),
});

const HOST_UTIL_BINDING = deepFreeze({
	constants: {
		kExitCode: 0,
		kExiting: 1,
		kHasExitCode: 2,
	},
	privateSymbols: {
		exit_info_private_symbol: Symbol("exit_info_private_symbol"),
	},
});

const HOST_UV_CODES = Object.fromEntries(
	Object.entries(os.constants.errno).filter(([name]) => name.startsWith("UV_")),
);

const HOST_UV_BINDING = deepFreeze({
	...HOST_UV_CODES,
	errname(code: number): string {
		for (const [name, value] of Object.entries(HOST_UV_CODES)) {
			if (value === code) {
				return name;
			}
		}
		return `UNKNOWN_UV_ERROR_${code}`;
	},
});

function createBuiltinsBinding(
	context: UpstreamInternalBindingResolverContext,
): unknown {
	return context.builtinsBinding;
}

export const upstreamHostBindingCatalog: readonly UpstreamInternalBindingRegistration[] =
	Object.freeze([
		{
			descriptor: {
				name: "builtins",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities(),
				notes:
					"US-005 wires builtinIds, compileFunction, setInternalLoaders, and cached builtin require() access through the host runtime scaffold.",
			},
			createBinding: createBuiltinsBinding,
		},
		{
			descriptor: {
				name: "module_wrap",
				status: "planned",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities("js-wrapper-identity"),
				notes:
					"US-001 proved the host-side module_wrap path is bounded, but the upstream scaffold still needs a real ModuleWrap provider before ESM/user-module bring-up.",
			},
		},
		{
			descriptor: {
				name: "contextify",
				status: "planned",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities("js-wrapper-identity"),
				notes:
					"US-001 proved vm/contextify is viable on the host, but the scaffold still needs a dedicated binding provider instead of the current probe-only path.",
			},
		},
		{
			descriptor: {
				name: "config",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities(),
				notes:
					"Host runtime configuration stays explicit so bootstrap and fs-first modules can read stable feature flags without falling back to the legacy loader.",
			},
			createBinding: () => HOST_CONFIG_BINDING,
		},
		{
			descriptor: {
				name: "util",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities("js-wrapper-identity"),
				notes:
					"The scoped bootstrap only needs the util binding constants/privateSymbols that back process exit bookkeeping; broader util binding parity stays deferred to later stories.",
			},
			createBinding: () => HOST_UTIL_BINDING,
		},
		{
			descriptor: {
				name: "process_methods",
				status: "implemented",
				executionModel: "host-lifecycle-plus-backend",
				requiredFor: phases("bootstrap"),
				hostResponsibilities: responsibilities(
					"callback-delivery",
					"close-semantics",
					"js-wrapper-identity",
					"ref-unref-state",
				),
				notes:
					"US-027 promotes process_methods to an explicit host-owned provider: bootstrap patching, hrtime/cpu/memory/resource metrics, warning-hook registration, stdio cache reset hooks, and process-state helpers stay deliberate, while dlopen/execve/debugger control remain deterministic unsupported paths instead of implicit host fallthrough.",
			},
			createBinding: () => createScaffoldProcessMethodsBinding(),
		},
		{
			descriptor: {
				name: "uv",
				status: "implemented",
				executionModel: "host-lifecycle-plus-backend",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities(
					"callback-delivery",
					"close-semantics",
					"js-wrapper-identity",
					"ref-unref-state",
				),
				notes:
					"US-001 proved the host-side uv probe path. The binding inventory keeps handle identity, callback delivery, ref/unref state, and close semantics on the host side while backend I/O stays below that seam.",
			},
			createBinding: () => HOST_UV_BINDING,
		},
		{
			descriptor: {
				name: "cares_wrap",
				status: "planned",
				executionModel: "host-lifecycle-plus-backend",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities(
					"callback-delivery",
					"close-semantics",
					"js-wrapper-identity",
					"ref-unref-state",
				),
				notes:
					"US-001 proved minimal DNS viability, but the scaffold still needs a real cares_wrap provider that keeps request-wrapper lifecycle on the host side.",
			},
		},
		{
			descriptor: {
				name: "credentials",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities(),
				notes:
					"Credential and tempdir lookups stay host-owned; the scoped provider intentionally exposes only safe getenv/tempdir reads until real POSIX credentials are wired.",
			},
			createBinding: () => HOST_CREDENTIALS_BINDING,
		},
		{
			descriptor: {
				name: "async_wrap",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap"),
				hostResponsibilities: responsibilities(
					"callback-delivery",
					"js-wrapper-identity",
				),
				notes:
					"US-006 proved the scoped no-op setupHooks path. Async hook lifecycle stays host-owned even before real hook delivery is wired.",
			},
			createBinding: () => HOST_ASYNC_WRAP_BINDING,
		},
		{
			descriptor: {
				name: "trace_events",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap"),
				hostResponsibilities: responsibilities("callback-delivery"),
				notes:
					"Trace state callbacks remain host-owned; the current bring-up only needs a stable no-op trace-events surface for eval_string.",
			},
			createBinding: () => HOST_TRACE_EVENTS_BINDING,
		},
		{
			descriptor: {
				name: "timers",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities(
					"callback-delivery",
					"ref-unref-state",
				),
				notes:
					"Timer queue ownership remains on the host runtime so later backend work cannot accidentally move ref/unref behavior out of the event-loop boundary.",
			},
			createBinding: () => HOST_TIMERS_BINDING,
		},
		{
			descriptor: {
				name: "errors",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities("callback-delivery"),
				notes:
					"PrepareStackTrace hooks, uncaught-exception routing, and exit-code constants stay on the host side for the scoped bootstrap and fs-first phases.",
			},
			createBinding: () => HOST_ERRORS_BINDING,
		},
		{
			descriptor: {
				name: "buffer",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities("js-wrapper-identity"),
				notes:
					"The current scoped bootstrap only needs host buffer constants plus the `setBufferPrototype()` no-op that unblocks `internal/bootstrap/node` bring-up.",
			},
			createBinding: () => HOST_BUFFER_BINDING,
		},
		{
			descriptor: {
				name: "constants",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities(),
				notes:
					"Constants stay explicit and release-pinned so bootstrap/fs-first code can consume stable fs/os/crypto/zlib values without reaching into legacy runtime globals.",
			},
			createBinding: () => HOST_CONSTANTS_BINDING,
		},
		{
			descriptor: {
				name: "symbols",
				status: "implemented",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities("js-wrapper-identity"),
				notes:
					"Bootstrap and loader-private symbols remain host-owned so wrapper identity does not drift across later backend extraction work.",
			},
			createBinding: () => HOST_SYMBOLS_BINDING,
		},
		{
			descriptor: {
				name: "modules",
				status: "planned",
				executionModel: "host-only",
				requiredFor: phases("bootstrap", "fs-first"),
				hostResponsibilities: responsibilities("js-wrapper-identity"),
				notes:
					"Module-format and package-json helpers are now explicit inventory entries, but real module binding behavior stays for the fs-first and loader stories.",
			},
		},
		{
			descriptor: {
				name: "fs",
				status: "deferred",
				executionModel: "host-lifecycle-plus-backend",
				requiredFor: phases("fs-first"),
				hostResponsibilities: responsibilities(
					"callback-delivery",
					"close-semantics",
					"js-wrapper-identity",
				),
				notes:
					"US-008 owns the first real fs binding/provider. Keep JS-visible FileHandle/FSReqCallback state on the host side while only bottom-half fs operations move later.",
			},
		},
		{
			descriptor: {
				name: "fs_dir",
				status: "deferred",
				executionModel: "host-lifecycle-plus-backend",
				requiredFor: phases("fs-first"),
				hostResponsibilities: responsibilities(
					"callback-delivery",
					"close-semantics",
					"js-wrapper-identity",
				),
				notes:
					"`internal/fs/dir.js` depends on a host-owned directory wrapper. Leave it explicitly deferred to the fs-first story instead of pretending the registry already provides it.",
			},
		},
		{
			descriptor: {
				name: "fs_event_wrap",
				status: "deferred",
				executionModel: "host-lifecycle-plus-backend",
				requiredFor: phases("fs-first"),
				hostResponsibilities: responsibilities(
					"callback-delivery",
					"close-semantics",
					"js-wrapper-identity",
					"ref-unref-state",
				),
				notes:
					"File-watcher wrapper lifecycle must stay host-owned; fs watch support remains deferred until the real fs binding layer exists.",
			},
		},
	]);

export const upstreamHostBindingModules: readonly string[] = Object.freeze(
	upstreamHostBindingCatalog.map(({ descriptor }) => descriptor.name),
);
