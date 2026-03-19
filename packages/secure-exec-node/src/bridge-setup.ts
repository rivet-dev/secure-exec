import { randomFillSync, randomUUID } from "node:crypto";
import {
	getInitialBridgeGlobalsSetupCode,
	getIsolateRuntimeSource,
	loadFile,
	resolveModule,
	normalizeBuiltinSpecifier,
	mkdir,
} from "@secure-exec/core";
import { getBridgeAttachCode, getRawBridgeCode } from "./bridge-loader.js";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import {
	transformDynamicImport,
} from "@secure-exec/core/internal/shared/esm-utils";
import { getConsoleSetupCode } from "@secure-exec/core/internal/shared/console-formatter";
import { getRequireSetupCode } from "@secure-exec/core/internal/shared/require-setup";
import {
	HOST_BRIDGE_GLOBAL_KEYS,
	RUNTIME_BRIDGE_GLOBAL_KEYS,
} from "@secure-exec/core/internal/shared/bridge-contract";
import {
	createCommandExecutorStub,
	createNetworkStub,
} from "@secure-exec/core/internal/shared/permissions";
import type {
	NetworkAdapter,
	SpawnedProcess,
} from "@secure-exec/core";
import type {
	StdioEvent,
	StdioHook,
	ProcessConfig,
	TimingMitigation,
} from "@secure-exec/core/internal/shared/api-types";
import {
	checkBridgeBudget,
	assertPayloadByteLength,
	assertTextPayloadSize,
	parseJsonWithLimit,
	polyfillCodeCache,
	PAYLOAD_LIMIT_ERROR_CODE,
	RESOURCE_BUDGET_ERROR_CODE,
} from "./isolate-bootstrap.js";
import type { DriverDeps } from "./isolate-bootstrap.js";

// Legacy ivm-compatible context/reference types for backward compatibility.
// These functions are no longer used by the V8-based execution driver but
// are kept to avoid breaking re-export signatures.
/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyContext = any;
type LegacyReference<_T = unknown> = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// Env vars that could hijack child processes (library injection, node flags)
const DANGEROUS_ENV_KEYS = new Set([
	"LD_PRELOAD",
	"LD_LIBRARY_PATH",
	"NODE_OPTIONS",
	"DYLD_INSERT_LIBRARIES",
]);

/** Strip env vars that allow library injection or node flag smuggling. */
function stripDangerousEnv(
	env: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!env) return env;
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (!DANGEROUS_ENV_KEYS.has(key)) {
			result[key] = value;
		}
	}
	return result;
}

type BridgeDeps = Pick<
	DriverDeps,
	| "filesystem"
	| "commandExecutor"
	| "networkAdapter"
	| "processConfig"
	| "osConfig"
	| "budgetState"
	| "maxBridgeCalls"
	| "maxOutputBytes"
	| "maxTimers"
	| "maxChildProcesses"
	| "maxHandles"
	| "bridgeBase64TransferLimitBytes"
	| "isolateJsonPayloadLimitBytes"
	| "activeHttpServerIds"
	| "activeChildProcesses"
	| "activeHostTimers"
	| "resolutionCache"
	| "onPtySetRawMode"
>;

export function emitConsoleEvent(
	onStdio: StdioHook | undefined,
	event: StdioEvent,
): void {
	if (!onStdio) {
		return;
	}
	try {
		onStdio(event);
	} catch {
		// Keep runtime execution deterministic even when host hooks fail.
	}
}

/**
 * Set up console with optional streaming log hook.
 *
 * @deprecated Legacy function for isolated-vm contexts. Use bridge-handlers.ts for V8 runtime.
 */
export async function setupConsole(
	deps: BridgeDeps,
	context: LegacyContext,
	jail: LegacyReference,
	onStdio?: StdioHook,
): Promise<void> {
	const logRef = { applySync: (_ctx: unknown, args: unknown[]) => {
		const str = String(args[0]);
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(onStdio, { channel: "stdout", message: str });
	}};
	const errorRef = { applySync: (_ctx: unknown, args: unknown[]) => {
		const str = String(args[0]);
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(onStdio, { channel: "stderr", message: str });
	}};

	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.log, logRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.error, errorRef);

	await context.eval(getConsoleSetupCode());
}

/**
 * Set up the require() system in a context.
 *
 * @deprecated Legacy function for isolated-vm contexts. Use bridge-handlers.ts for V8 runtime.
 */
export async function setupRequire(
	deps: BridgeDeps,
	context: LegacyContext,
	jail: LegacyReference,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	// Create stubs matching the legacy isolated-vm Reference interface
	const loadPolyfillRef = {
		applySyncPromise: async (_ctx: unknown, args: unknown[]) => {
			const moduleName = args[0] as string;
			const name = moduleName.replace(/^node:/, "");
			if (name === "fs" || name === "child_process") return null;
			if (name === "http" || name === "https" || name === "http2" || name === "dns") return null;
			if (name === "os" || name === "module") return null;
			if (!hasPolyfill(name)) return null;
			let code = polyfillCodeCache.get(name);
			if (!code) {
				code = await bundlePolyfill(name);
				polyfillCodeCache.set(name, code);
			}
			return code;
		},
	};

	const resolveModuleRef = {
		applySyncPromise: async (_ctx: unknown, args: unknown[]) => {
			const request = args[0] as string;
			const fromDir = args[1] as string;
			const builtinSpecifier = normalizeBuiltinSpecifier(request);
			if (builtinSpecifier) return builtinSpecifier;
			return resolveModule(request, fromDir, deps.filesystem, "require", deps.resolutionCache);
		},
	};

	const loadFileRef = {
		applySyncPromise: async (_ctx: unknown, args: unknown[]) => {
			const path = args[0] as string;
			const source = await loadFile(path, deps.filesystem);
			if (source === null) return null;
			return transformDynamicImport(source);
		},
	};

	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.loadPolyfill, loadPolyfillRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.resolveModule, resolveModuleRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.loadFile, loadFileRef);

	const scheduleTimerRef = {
		applySyncPromise: (_ctx: unknown, args: unknown[]) => {
			checkBridgeBudget(deps);
			const delayMs = args[0] as number;
			return new Promise<void>((resolve) => {
				const id = globalThis.setTimeout(() => {
					deps.activeHostTimers.delete(id);
					resolve();
				}, delayMs);
				deps.activeHostTimers.add(id);
			});
		},
	};
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.scheduleTimer, scheduleTimerRef);

	if (deps.maxTimers !== undefined) {
		await jail.set("_maxTimers", deps.maxTimers, { copy: true });
	}
	if (deps.maxHandles !== undefined) {
		await jail.set("_maxHandles", deps.maxHandles, { copy: true });
	}

	const cryptoRandomFillRef = {
		applySync: (_ctx: unknown, args: unknown[]) => {
			const byteLength = args[0] as number;
			if (byteLength > 65536) {
				throw new RangeError(
					`The ArrayBufferView's byte length (${byteLength}) exceeds the number of bytes of entropy available via this API (65536)`,
				);
			}
			const buffer = Buffer.allocUnsafe(byteLength);
			randomFillSync(buffer);
			return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		},
	};
	const cryptoRandomUuidRef = { applySync: () => randomUUID() };
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoRandomFill, cryptoRandomFillRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoRandomUuid, cryptoRandomUuidRef);

	// Fs, child_process, network, PTY stubs omitted — legacy code path is unused.
	// The V8-based driver uses bridge-handlers.ts instead.

	await jail.set(
		"__runtimeBridgeSetupConfig",
		{
			initialCwd: deps.processConfig.cwd ?? "/",
			jsonPayloadLimitBytes: deps.isolateJsonPayloadLimitBytes,
			payloadLimitErrorCode: PAYLOAD_LIMIT_ERROR_CODE,
		},
		{ copy: true },
	);
	await context.eval(getInitialBridgeGlobalsSetupCode());

	await jail.set(
		HOST_BRIDGE_GLOBAL_KEYS.processConfig,
		createProcessConfigForExecution(deps.processConfig, timingMitigation, frozenTimeMs),
		{ copy: true },
	);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.osConfig, deps.osConfig, {
		copy: true,
	});
	await context.eval(getRawBridgeCode());
	await context.eval(getBridgeAttachCode());
	await applyTimingMitigation(context, timingMitigation, frozenTimeMs);

	await context.eval(getRequireSetupCode());
}

/**
 * Set up ESM-compatible globals (process, Buffer, etc.)
 *
 * @deprecated Legacy function for isolated-vm contexts. Use bridge-handlers.ts for V8 runtime.
 */
export async function setupESMGlobals(
	deps: BridgeDeps,
	context: LegacyContext,
	jail: LegacyReference,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	await setupRequire(deps, context, jail, timingMitigation, frozenTimeMs);
}

export function createProcessConfigForExecution(
	processConfig: ProcessConfig,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): ProcessConfig {
	return {
		...processConfig,
		timingMitigation,
		frozenTimeMs: timingMitigation === "freeze" ? frozenTimeMs : undefined,
	};
}

async function applyTimingMitigation(
	context: LegacyContext,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	if (timingMitigation !== "freeze") {
		await context.eval(getIsolateRuntimeSource("applyTimingMitigationOff"));
		return;
	}

	await context.global.set(
		"__runtimeTimingMitigationConfig",
		{ frozenTimeMs },
		{ copy: true },
	);
	await context.eval(getIsolateRuntimeSource("applyTimingMitigationFreeze"));
}
