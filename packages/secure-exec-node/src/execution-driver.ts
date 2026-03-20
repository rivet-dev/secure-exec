import { createV8Runtime } from "@secure-exec/v8";
import type { V8Runtime, V8Session, V8ExecutionResult } from "@secure-exec/v8";

// Shared V8 runtime — spawns one Rust child process, reused across all drivers.
// Sessions are isolated (separate V8 isolates in separate threads on the Rust side).
let sharedV8Runtime: V8Runtime | null = null;
let sharedV8RuntimePromise: Promise<V8Runtime> | null = null;

async function getSharedV8Runtime(): Promise<V8Runtime> {
	// If the cached runtime's process has died (e.g. OOM crash), recycle it
	if (sharedV8Runtime && !sharedV8Runtime.isAlive) {
		sharedV8Runtime = null;
		sharedV8RuntimePromise = null;
	}
	if (sharedV8Runtime) return sharedV8Runtime;
	if (!sharedV8RuntimePromise) {
		sharedV8RuntimePromise = createV8Runtime({
			warmupBridgeCode: composeBridgeCodeForWarmup(),
		}).then((r) => {
			sharedV8Runtime = r;
			return r;
		}).catch((err) => {
			// Reset on failure so next call retries instead of returning cached rejection
			sharedV8RuntimePromise = null;
			sharedV8Runtime = null;
			throw err;
		});
	}
	return sharedV8RuntimePromise;
}

/** Dispose the shared V8 runtime singleton, killing the Rust child process.
 *  Next call to getSharedV8Runtime() will spawn a fresh process. */
export async function disposeSharedV8Runtime(): Promise<void> {
	const runtime = sharedV8Runtime;
	const promise = sharedV8RuntimePromise;
	sharedV8Runtime = null;
	sharedV8RuntimePromise = null;
	if (runtime) {
		await runtime.dispose();
	} else if (promise) {
		// Runtime creation in progress — wait for it then dispose
		try {
			const rt = await promise;
			await rt.dispose();
		} catch {
			// Creation already failed — nothing to dispose
		}
	}
}

// Clean up shared V8 runtime on process exit to prevent orphan Rust child
process.on("beforeExit", () => {
	void disposeSharedV8Runtime();
});
import { createResolutionCache, getIsolateRuntimeSource, TIMEOUT_ERROR_MESSAGE, TIMEOUT_EXIT_CODE } from "@secure-exec/core";
import { getInitialBridgeGlobalsSetupCode } from "@secure-exec/core";
import { getConsoleSetupCode } from "@secure-exec/core/internal/shared/console-formatter";
import { getRequireSetupCode } from "@secure-exec/core/internal/shared/require-setup";
import { createCommandExecutorStub, createFsStub, createNetworkStub, filterEnv, wrapCommandExecutor, wrapFileSystem, wrapNetworkAdapter } from "@secure-exec/core/internal/shared/permissions";
import { transformDynamicImport } from "@secure-exec/core/internal/shared/esm-utils";
import { HARDENED_NODE_CUSTOM_GLOBALS, MUTABLE_NODE_CUSTOM_GLOBALS } from "@secure-exec/core/internal/shared/global-exposure";
import type { NetworkAdapter, RuntimeDriver } from "@secure-exec/core";
import type { StdioHook, ExecOptions, ExecResult, RunResult, TimingMitigation } from "@secure-exec/core/internal/shared/api-types";
import { type DriverDeps, type NodeExecutionDriverOptions, createBudgetState, clearActiveHostTimers, killActiveChildProcesses, normalizePayloadLimit, getExecutionTimeoutMs, getTimingMitigation, DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES, DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES, DEFAULT_MAX_TIMERS, DEFAULT_MAX_HANDLES, DEFAULT_SANDBOX_CWD, DEFAULT_SANDBOX_HOME, DEFAULT_SANDBOX_TMPDIR, PAYLOAD_LIMIT_ERROR_CODE } from "./isolate-bootstrap.js";
import { DEFAULT_TIMING_MITIGATION } from "./isolate.js";
import { buildBridgeHandlers } from "./bridge-handlers.js";
import { getIvmCompatShimSource } from "./ivm-compat.js";
import { getRawBridgeCode, getBridgeAttachCode } from "./bridge-loader.js";
import { createProcessConfigForExecution } from "./bridge-setup.js";

export { NodeExecutionDriverOptions };

// Per-timingMitigation cache for the bridge IIFE. Currently all timing
// modes produce the same config-independent code (timing is applied via
// post-restore script), but keying on the mode prevents serving stale code
// if the IIFE ever becomes timing-dependent again.
const staticBridgeCodeCache = new Map<string, string>();

/**
 * Compose the config-independent bridge IIFE. Output is byte-for-byte
 * identical regardless of session options — uses DEFAULT values for all
 * config that gets overridden by the post-restore script.
 * Used for snapshot creation and as the base of every session's bridge code.
 *
 * @param timingMitigation Cache key — currently all modes produce the same
 *   IIFE, but keying prevents stale results if the code ever varies by mode.
 */
export function composeStaticBridgeCode(timingMitigation: string = "off"): string {
	const cached = staticBridgeCodeCache.get(timingMitigation);
	if (cached) return cached;

	const parts: string[] = [];

	parts.push(getIvmCompatShimSource());

	// Default budget values — overridden per-session by post-restore script
	parts.push(`globalThis._maxTimers = ${DEFAULT_MAX_TIMERS};`);
	parts.push(`globalThis._maxHandles = ${DEFAULT_MAX_HANDLES};`);
	parts.push(`globalThis.__runtimeBridgeSetupConfig = ${JSON.stringify({
		initialCwd: DEFAULT_SANDBOX_CWD,
		jsonPayloadLimitBytes: DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES,
		payloadLimitErrorCode: PAYLOAD_LIMIT_ERROR_CODE,
	})};`);

	parts.push(getIsolateRuntimeSource("globalExposureHelpers"));
	parts.push(getInitialBridgeGlobalsSetupCode());
	parts.push(getConsoleSetupCode());
	parts.push(getIsolateRuntimeSource("setupFsFacade"));
	parts.push(getRawBridgeCode());
	parts.push(getBridgeAttachCode());

	// Default: no timing mitigation (freeze applied via post-restore script)
	parts.push(getIsolateRuntimeSource("applyTimingMitigationOff"));

	parts.push(getRequireSetupCode());
	parts.push(getIsolateRuntimeSource("initCommonjsModuleGlobals"));

	parts.push(`globalThis.__runtimeCustomGlobalPolicy = ${JSON.stringify({
		hardenedGlobals: HARDENED_NODE_CUSTOM_GLOBALS,
		mutableGlobals: MUTABLE_NODE_CUSTOM_GLOBALS,
	})};`);
	parts.push(getIsolateRuntimeSource("applyCustomGlobalPolicy"));

	const result = parts.join("\n");
	staticBridgeCodeCache.set(timingMitigation, result);
	return result;
}

/**
 * Compose the per-session post-restore script. Overrides default config
 * values from the static IIFE with session-specific values, applies timing
 * mitigation, and handles polyfill loading.
 */
export function composePostRestoreScript(config: {
	timingMitigation: TimingMitigation;
	frozenTimeMs: number;
	maxTimers?: number;
	maxHandles?: number;
	initialCwd?: string;
	payloadLimitBytes?: number;
	payloadLimitErrorCode?: string;
}): string {
	const parts: string[] = [];

	// Override per-session budget values if they differ from defaults
	if (config.maxTimers !== undefined) {
		parts.push(`globalThis._maxTimers = ${config.maxTimers};`);
	}
	if (config.maxHandles !== undefined) {
		parts.push(`globalThis._maxHandles = ${config.maxHandles};`);
	}

	// Override initial cwd for module resolution
	if (config.initialCwd && config.initialCwd !== DEFAULT_SANDBOX_CWD) {
		parts.push(`if (globalThis._currentModule) globalThis._currentModule.dirname = ${JSON.stringify(config.initialCwd)};`);
	}

	// Apply config (timing mitigation, payload limits) via __runtimeApplyConfig
	parts.push(`globalThis.__runtimeApplyConfig(${JSON.stringify({
		timingMitigation: config.timingMitigation,
		frozenTimeMs: config.timingMitigation === "freeze" ? config.frozenTimeMs : undefined,
		payloadLimitBytes: config.payloadLimitBytes,
		payloadLimitErrorCode: config.payloadLimitErrorCode,
	})});`);

	// Reset mutable state from snapshot (no-op on fresh context, resets stale
	// values on snapshot-restored context)
	parts.push(`if (typeof globalThis.__runtimeResetProcessState === "function") globalThis.__runtimeResetProcessState();`);

	return parts.join("\n");
}

/**
 * Compose the bridge code for snapshot warm-up.
 * Returns only the static IIFE — the post-restore script is sent
 * separately per-execution so the snapshot is config-independent.
 */
export function composeBridgeCodeForWarmup(): string {
	return composeStaticBridgeCode();
}

const MAX_ERROR_MESSAGE_CHARS = 8192;

function boundErrorMessage(message: string): string {
	if (message.length <= MAX_ERROR_MESSAGE_CHARS) return message;
	return `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}...[Truncated]`;
}

export class NodeExecutionDriver implements RuntimeDriver {
	private deps: DriverDeps;
	private memoryLimit: number;
	private disposed: boolean = false;

	// V8 session state (lazy-initialized; runtime is shared across all drivers)
	private v8Session: V8Session | null = null;
	private v8InitPromise: Promise<void> | null = null;
	private v8RuntimeOverride: V8Runtime | null;

	constructor(options: NodeExecutionDriverOptions) {
		this.v8RuntimeOverride = options.v8Runtime ?? null;
		this.memoryLimit = options.memoryLimit ?? 128;
		const system = options.system;
		const permissions = system.permissions;
		const filesystem = system.filesystem
			? wrapFileSystem(system.filesystem, permissions)
			: createFsStub();
		const commandExecutor = system.commandExecutor
			? wrapCommandExecutor(system.commandExecutor, permissions)
			: createCommandExecutorStub();
		const networkAdapter = system.network
			? wrapNetworkAdapter(system.network, permissions)
			: createNetworkStub();

		const processConfig = { ...(options.runtime.process ?? {}) };
		processConfig.cwd ??= DEFAULT_SANDBOX_CWD;
		processConfig.env = filterEnv(processConfig.env, permissions);

		const osConfig = { ...(options.runtime.os ?? {}) };
		osConfig.homedir ??= DEFAULT_SANDBOX_HOME;
		osConfig.tmpdir ??= DEFAULT_SANDBOX_TMPDIR;

		const bridgeBase64TransferLimitBytes = normalizePayloadLimit(
			options.payloadLimits?.base64TransferBytes,
			DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES,
			"payloadLimits.base64TransferBytes",
		);
		const isolateJsonPayloadLimitBytes = normalizePayloadLimit(
			options.payloadLimits?.jsonPayloadBytes,
			DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES,
			"payloadLimits.jsonPayloadBytes",
		);

		const budgets = options.resourceBudgets;

		this.deps = {
			filesystem,
			commandExecutor,
			networkAdapter,
			permissions,
			processConfig,
			osConfig,
			onStdio: options.onStdio,
			cpuTimeLimitMs: options.cpuTimeLimitMs,
			timingMitigation: options.timingMitigation ?? DEFAULT_TIMING_MITIGATION,
			bridgeBase64TransferLimitBytes,
			isolateJsonPayloadLimitBytes,
			maxOutputBytes: budgets?.maxOutputBytes,
			maxBridgeCalls: budgets?.maxBridgeCalls,
			maxTimers: budgets?.maxTimers ?? DEFAULT_MAX_TIMERS,
			maxChildProcesses: budgets?.maxChildProcesses,
			maxHandles: budgets?.maxHandles ?? DEFAULT_MAX_HANDLES,
			budgetState: createBudgetState(),
			activeHttpServerIds: new Set(),
			activeChildProcesses: new Map(),
			activeHostTimers: new Set(),
			resolutionCache: createResolutionCache(),
			// Legacy fields — unused by V8-based driver, provided for DriverDeps compatibility
			isolate: null,
			esmModuleCache: new Map(),
			esmModuleReverseCache: new Map(),
			moduleFormatCache: new Map(),
			packageTypeCache: new Map(),
			dynamicImportCache: new Map(),
			dynamicImportPending: new Map(),
		};
	}

	get network(): Pick<NetworkAdapter, "fetch" | "dnsLookup" | "httpRequest"> {
		const adapter = this.deps.networkAdapter ?? createNetworkStub();
		return {
			fetch: (url, options) => adapter.fetch(url, options),
			dnsLookup: (hostname) => adapter.dnsLookup(hostname),
			httpRequest: (url, options) => adapter.httpRequest(url, options),
		};
	}

	async run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>> {
		return this.executeInternal<T>({ mode: "run", code, filePath });
	}

	async exec(code: string, options?: ExecOptions): Promise<ExecResult> {
		const result = await this.executeInternal({
			mode: "exec",
			code,
			filePath: options?.filePath,
			env: options?.env,
			cwd: options?.cwd,
			stdin: options?.stdin,
			cpuTimeLimitMs: options?.cpuTimeLimitMs,
			timingMitigation: options?.timingMitigation,
			onStdio: options?.onStdio,
		});
		return { code: result.code, errorMessage: result.errorMessage };
	}

	/** Ensure V8 session is initialized (runtime is shared). */
	private async ensureV8(): Promise<V8Session> {
		if (this.v8Session) return this.v8Session;
		if (!this.v8InitPromise) {
			this.v8InitPromise = this.initV8().catch((err) => {
				// Reset so next call retries (e.g. after process crash)
				this.v8InitPromise = null;
				this.v8Session = null;
				throw err;
			});
		}
		await this.v8InitPromise;
		return this.v8Session!;
	}

	/** Reset cached session state so next ensureV8() re-initializes. */
	private resetV8Session(): void {
		this.v8Session = null;
		this.v8InitPromise = null;
	}

	private async getV8Runtime(): Promise<V8Runtime> {
		return this.v8RuntimeOverride ?? getSharedV8Runtime();
	}

	private async initV8(): Promise<void> {
		const runtime = await this.getV8Runtime();
		this.v8Session = await runtime.createSession({
			heapLimitMb: this.memoryLimit,
			cpuTimeLimitMs: this.deps.cpuTimeLimitMs,
		});
	}

	/** Compose the static bridge IIFE, keyed on timingMitigation for cache safety. */
	private composeBridgeCode(timingMitigation: TimingMitigation): string {
		return composeStaticBridgeCode(timingMitigation);
	}

	/** Compose the per-execution post-restore script. */
	private composePostRestore(
		timingMitigation: TimingMitigation,
		frozenTimeMs: number,
	): string {
		return composePostRestoreScript({
			timingMitigation,
			frozenTimeMs,
			maxTimers: this.deps.maxTimers,
			maxHandles: this.deps.maxHandles,
			initialCwd: this.deps.processConfig.cwd ?? DEFAULT_SANDBOX_CWD,
			payloadLimitBytes: this.deps.isolateJsonPayloadLimitBytes,
			payloadLimitErrorCode: PAYLOAD_LIMIT_ERROR_CODE,
		});
	}

	private async executeInternal<T = unknown>(options: {
		mode: "run" | "exec";
		code: string;
		filePath?: string;
		env?: Record<string, string>;
		cwd?: string;
		stdin?: string;
		cpuTimeLimitMs?: number;
		timingMitigation?: TimingMitigation;
		onStdio?: StdioHook;
	}): Promise<RunResult<T>> {
		// Reset budget state for this execution
		this.deps.budgetState = createBudgetState();

		// Clear resolution caches between executions
		this.deps.resolutionCache.resolveResults.clear();
		this.deps.resolutionCache.packageJsonResults.clear();
		this.deps.resolutionCache.existsResults.clear();
		this.deps.resolutionCache.statResults.clear();

		const session = await this.ensureV8();

		// Determine timing and build configs
		const timingMitigation = getTimingMitigation(options.timingMitigation, this.deps.timingMitigation);
		const frozenTimeMs = Date.now();

		// Build bridge handlers
		const bridgeHandlers = buildBridgeHandlers({
			deps: this.deps,
			onStdio: options.onStdio ?? this.deps.onStdio,
			sendStreamEvent: (eventType, payload) => {
				session.sendStreamEvent(eventType, payload);
			},
		});

		// Compose bridge code and post-restore script (sent separately over IPC)
		const bridgeCode = this.composeBridgeCode(timingMitigation);
		const postRestoreScript = this.composePostRestore(timingMitigation, frozenTimeMs);

		// Transform user code (dynamic import → __dynamicImport)
		const userCode = transformDynamicImport(options.code);

		// Build per-execution preamble for stdin, env/cwd overrides, and CJS file globals
		const execPreamble: string[] = [];
		if (options.filePath) {
			const dirname = options.filePath.includes("/")
				? options.filePath.substring(0, options.filePath.lastIndexOf("/")) || "/"
				: "/";
			execPreamble.push(`globalThis.__runtimeCommonJsFileConfig = ${JSON.stringify({ filePath: options.filePath, dirname })};`);
			execPreamble.push(getIsolateRuntimeSource("setCommonjsFileGlobals"));
		}
		if (options.stdin !== undefined) {
			execPreamble.push(`globalThis.__runtimeStdinData = ${JSON.stringify(options.stdin)};`);
			execPreamble.push(getIsolateRuntimeSource("setStdinData"));
		}

		// Build process/OS config for this execution
		const processConfig = createProcessConfigForExecution(
			this.deps.processConfig,
			timingMitigation,
			frozenTimeMs,
		);
		// Apply per-execution env/cwd overrides
		if (options.env) {
			processConfig.env = { ...processConfig.env, ...filterEnv(options.env, this.deps.permissions) };
		}
		if (options.cwd) {
			processConfig.cwd = options.cwd;
		}

		const osConfig = this.deps.osConfig;

		// Prepend per-execution preamble to user code
		const fullUserCode = execPreamble.length > 0
			? execPreamble.join("\n") + "\n" + userCode
			: userCode;

		try {
			// Execute via V8 session
			const result: V8ExecutionResult = await session.execute({
				bridgeCode,
				postRestoreScript,
				userCode: fullUserCode,
				mode: options.mode,
				filePath: options.filePath,
				processConfig: {
					cwd: processConfig.cwd ?? "/",
					env: processConfig.env ?? {},
					timing_mitigation: String(processConfig.timingMitigation ?? timingMitigation),
					frozen_time_ms: processConfig.frozenTimeMs ?? null,
				},
				osConfig: {
					homedir: osConfig.homedir ?? DEFAULT_SANDBOX_HOME,
					tmpdir: osConfig.tmpdir ?? DEFAULT_SANDBOX_TMPDIR,
					platform: osConfig.platform ?? process.platform,
					arch: osConfig.arch ?? process.arch,
				},
				bridgeHandlers,
				onStreamCallback: (_callbackType, _payload) => {
					// Handle stream callbacks from V8 (e.g., HTTP server responses)
				},
			});

			// Map V8ExecutionResult to RunResult
			if (result.error) {
				// V8 process crash — reset session so next call re-initializes
				if (result.error.code === "ERR_V8_PROCESS_CRASH") {
					this.resetV8Session();
				}

				// Check for timeout
				if (result.error.message && /timed out|time limit exceeded/i.test(result.error.message)) {
					return {
						code: TIMEOUT_EXIT_CODE,
						errorMessage: TIMEOUT_ERROR_MESSAGE,
						exports: undefined as T,
					};
				}

				// Check for process.exit()
				const exitMatch = result.error.message?.match(/process\.exit\((\d+)\)/);
				if (exitMatch) {
					return {
						code: parseInt(exitMatch[1], 10),
						exports: undefined as T,
					};
				}

				// Check for ProcessExitError (sentinel-based detection)
				if (result.error.type === "ProcessExitError" && result.error.code) {
					return {
						code: parseInt(result.error.code, 10) || 1,
						exports: undefined as T,
					};
				}

				return {
					code: result.code || 1,
					errorMessage: boundErrorMessage(result.error.message || result.error.type),
					exports: undefined as T,
				};
			}

			// Deserialize module exports from V8 serialized binary
			let exports: T | undefined;
			if (result.exports && result.exports.byteLength > 0) {
				const nodeV8 = await import("node:v8");
				exports = nodeV8.deserialize(Buffer.from(result.exports)) as T;
			}
			return {
				code: result.code,
				exports,
			};
		} catch (err) {
			// Reset session on fatal errors so next call re-initializes
			this.resetV8Session();
			const errMessage = err instanceof Error ? err.message : String(err);
			return {
				code: 1,
				errorMessage: boundErrorMessage(errMessage),
				exports: undefined as T,
			};
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		killActiveChildProcesses(this.deps);
		this.closeActiveHttpServers();
		clearActiveHostTimers(this.deps);
		// Destroy this driver's V8 session (shared runtime stays alive)
		if (this.v8Session) {
			void this.v8Session.destroy();
			this.v8Session = null;
		}
	}

	async terminate(): Promise<void> {
		if (this.disposed) return;
		killActiveChildProcesses(this.deps);
		const adapter = this.deps.networkAdapter;
		if (adapter?.httpServerClose) {
			const ids = Array.from(this.deps.activeHttpServerIds);
			await Promise.allSettled(ids.map((id) => adapter.httpServerClose!(id)));
		}
		this.deps.activeHttpServerIds.clear();
		clearActiveHostTimers(this.deps);
		this.disposed = true;
		if (this.v8Session) {
			await this.v8Session.destroy();
			this.v8Session = null;
		}
	}

	private closeActiveHttpServers(): void {
		const adapter = this.deps.networkAdapter;
		if (adapter?.httpServerClose) {
			for (const id of this.deps.activeHttpServerIds) {
				try {
					adapter.httpServerClose(id);
				} catch {
					// Server may already be closed
				}
			}
		}
		this.deps.activeHttpServerIds.clear();
	}
}
