import { createRequire } from "node:module";
import type {
	CommandExecutor,
	NetworkAdapter,
	RuntimeDriverOptions,
	SpawnedProcess,
	VirtualFileSystem,
	Permissions,
} from "@secure-exec/core";
import type {
	StdioHook,
	OSConfig,
	ProcessConfig,
	TimingMitigation,
} from "@secure-exec/core/internal/shared/api-types";
import type { ResolutionCache } from "@secure-exec/core";

export interface NodeExecutionDriverOptions extends RuntimeDriverOptions {
	createIsolate?(memoryLimit: number): unknown;
	/** V8 runtime process override. If omitted, uses the global shared process. */
	v8Runtime?: import("@secure-exec/v8").V8Runtime;
}

export interface BudgetState {
	outputBytes: number;
	bridgeCalls: number;
	activeTimers: number;
	childProcesses: number;
}

/** Shared mutable state owned by NodeExecutionDriver, passed to extracted modules. */
export interface DriverDeps {
	filesystem: VirtualFileSystem;
	commandExecutor: CommandExecutor;
	networkAdapter: NetworkAdapter;
	permissions?: Permissions;
	processConfig: ProcessConfig;
	osConfig: OSConfig;
	onStdio?: StdioHook;
	cpuTimeLimitMs?: number;
	timingMitigation: TimingMitigation;
	bridgeBase64TransferLimitBytes: number;
	isolateJsonPayloadLimitBytes: number;
	maxOutputBytes?: number;
	maxBridgeCalls?: number;
	maxTimers?: number;
	maxChildProcesses?: number;
	maxHandles?: number;
	budgetState: BudgetState;
	activeHttpServerIds: Set<number>;
	activeChildProcesses: Map<number, SpawnedProcess>;
	activeHostTimers: Set<ReturnType<typeof setTimeout>>;
	resolutionCache: ResolutionCache;
	/** Optional callback for PTY setRawMode — wired by kernel when PTY is attached. */
	onPtySetRawMode?: (mode: boolean) => void;

	// Legacy fields for backward compatibility with esm-compiler.ts and module-resolver.ts.
	/* eslint-disable @typescript-eslint/no-explicit-any */
	isolate: any;
	esmModuleCache: Map<string, any>;
	esmModuleReverseCache: Map<any, string>;
	moduleFormatCache: Map<string, "esm" | "cjs" | "json">;
	packageTypeCache: Map<string, "module" | "commonjs" | null>;
	dynamicImportCache: Map<string, any>;
	dynamicImportPending: Map<string, Promise<any>>;
	/* eslint-enable @typescript-eslint/no-explicit-any */
}

// Constants
export const DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES = 16 * 1024 * 1024;
export const DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES = 4 * 1024 * 1024;
export const MIN_CONFIGURED_PAYLOAD_BYTES = 1024;
export const MAX_CONFIGURED_PAYLOAD_BYTES = 64 * 1024 * 1024;
export const PAYLOAD_LIMIT_ERROR_CODE = "ERR_SANDBOX_PAYLOAD_TOO_LARGE";
export const RESOURCE_BUDGET_ERROR_CODE = "ERR_RESOURCE_BUDGET_EXCEEDED";
export const DEFAULT_MAX_TIMERS = 10_000;
export const DEFAULT_MAX_HANDLES = 10_000;
export const DEFAULT_SANDBOX_CWD = "/root";
export const DEFAULT_SANDBOX_HOME = "/root";
export const DEFAULT_SANDBOX_TMPDIR = "/tmp";

export class PayloadLimitError extends Error {
	constructor(payloadLabel: string, maxBytes: number, actualBytes: number) {
		super(
			`${PAYLOAD_LIMIT_ERROR_CODE}: ${payloadLabel} exceeds ${maxBytes} bytes (got ${actualBytes})`,
		);
		this.name = "PayloadLimitError";
	}
}

export function normalizePayloadLimit(
	configuredValue: number | undefined,
	defaultValue: number,
	optionName: string,
): number {
	if (configuredValue === undefined) {
		return defaultValue;
	}
	if (!Number.isFinite(configuredValue) || configuredValue <= 0) {
		throw new RangeError(`${optionName} must be a positive finite number`);
	}
	const normalizedValue = Math.floor(configuredValue);
	if (normalizedValue < MIN_CONFIGURED_PAYLOAD_BYTES) {
		throw new RangeError(
			`${optionName} must be at least ${MIN_CONFIGURED_PAYLOAD_BYTES} bytes`,
		);
	}
	if (normalizedValue > MAX_CONFIGURED_PAYLOAD_BYTES) {
		throw new RangeError(
			`${optionName} must be at most ${MAX_CONFIGURED_PAYLOAD_BYTES} bytes`,
		);
	}
	return normalizedValue;
}

export function getUtf8ByteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

export function getBase64EncodedByteLength(rawByteLength: number): number {
	return Math.ceil(rawByteLength / 3) * 4;
}

export function assertPayloadByteLength(
	payloadLabel: string,
	actualBytes: number,
	maxBytes: number,
): void {
	if (actualBytes <= maxBytes) {
		return;
	}
	throw new PayloadLimitError(payloadLabel, maxBytes, actualBytes);
}

export function assertTextPayloadSize(
	payloadLabel: string,
	text: string,
	maxBytes: number,
): void {
	assertPayloadByteLength(payloadLabel, getUtf8ByteLength(text), maxBytes);
}

export function createBudgetState(): BudgetState {
	return { outputBytes: 0, bridgeCalls: 0, activeTimers: 0, childProcesses: 0 };
}

export function clearActiveHostTimers(deps: Pick<DriverDeps, "activeHostTimers">): void {
	for (const id of deps.activeHostTimers) {
		clearTimeout(id);
	}
	deps.activeHostTimers.clear();
}

export function killActiveChildProcesses(deps: Pick<DriverDeps, "activeChildProcesses">): void {
	for (const proc of deps.activeChildProcesses.values()) {
		try {
			proc.kill(9); // SIGKILL
		} catch {
			// Process may already be dead
		}
	}
	deps.activeChildProcesses.clear();
}

export function checkBridgeBudget(deps: Pick<DriverDeps, "maxBridgeCalls" | "budgetState">): void {
	if (deps.maxBridgeCalls === undefined) return;
	deps.budgetState.bridgeCalls++;
	if (deps.budgetState.bridgeCalls > deps.maxBridgeCalls) {
		throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum bridge calls exceeded`);
	}
}

export function parseJsonWithLimit<T>(
	payloadLabel: string,
	jsonText: string,
	maxBytes: number,
): T {
	assertTextPayloadSize(payloadLabel, jsonText, maxBytes);
	return JSON.parse(jsonText) as T;
}

export function getExecutionTimeoutMs(
	override: number | undefined,
	cpuTimeLimitMs: number | undefined,
): number | undefined {
	const timeoutMs = override ?? cpuTimeLimitMs;
	if (timeoutMs === undefined) {
		return undefined;
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new RangeError("cpuTimeLimitMs must be a positive finite number");
	}
	return Math.floor(timeoutMs);
}

export function getTimingMitigation(
	override: TimingMitigation | undefined,
	defaultMitigation: TimingMitigation,
): TimingMitigation {
	return override ?? defaultMitigation;
}

// Module-level caches for polyfill and host builtin named exports
export const polyfillCodeCache: Map<string, string> = new Map();
export const polyfillNamedExportsCache: Map<string, string[]> = new Map();
export const hostBuiltinNamedExportsCache: Map<string, string[]> = new Map();
export const hostRequire = createRequire(import.meta.url);

export function isValidExportName(name: string): boolean {
	return /^[A-Za-z_$][\w$]*$/.test(name);
}

export function getHostBuiltinNamedExports(moduleName: string): string[] {
	const cached = hostBuiltinNamedExportsCache.get(moduleName);
	if (cached) {
		return cached;
	}

	try {
		const loaded = hostRequire(`node:${moduleName}`) as
			| Record<string, unknown>
			| null
			| undefined;
		const names = Array.from(
			new Set([
				...Object.keys(loaded ?? {}),
				...Object.getOwnPropertyNames(loaded ?? {}),
			]),
		)
			.filter((name) => name !== "default")
			.filter(isValidExportName)
			.sort();
		hostBuiltinNamedExportsCache.set(moduleName, names);
		return names;
	} catch {
		hostBuiltinNamedExportsCache.set(moduleName, []);
		return [];
	}
}
