import { createV8Runtime } from "@secure-exec/v8";
import type { V8Runtime, V8Session, V8ExecutionResult } from "@secure-exec/v8";

// Shared V8 runtime — spawns one Rust child process, reused across all drivers.
// Sessions are isolated (separate V8 isolates in separate threads on the Rust side).
let sharedV8Runtime: V8Runtime | null = null;
let sharedV8RuntimePromise: Promise<V8Runtime> | null = null;

async function getSharedV8Runtime(): Promise<V8Runtime> {
	if (sharedV8Runtime) return sharedV8Runtime;
	if (!sharedV8RuntimePromise) {
		sharedV8RuntimePromise = createV8Runtime().then((r) => {
			sharedV8Runtime = r;
			return r;
		});
	}
	return sharedV8RuntimePromise;
}
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

	// Cached bridge code (same across executions)
	private bridgeCodeCache: string | null = null;

	constructor(options: NodeExecutionDriverOptions) {
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
			this.v8InitPromise = this.initV8();
		}
		await this.v8InitPromise;
		return this.v8Session!;
	}

	private async initV8(): Promise<void> {
		const runtime = await getSharedV8Runtime();
		this.v8Session = await runtime.createSession({
			heapLimitMb: this.memoryLimit,
			cpuTimeLimitMs: this.deps.cpuTimeLimitMs,
		});
	}

	/** Compose the full bridge code string sent to the Rust V8 runtime. */
	private composeBridgeCode(
		timingMitigation: TimingMitigation,
		frozenTimeMs: number,
	): string {
		if (this.bridgeCodeCache) return this.bridgeCodeCache;

		const parts: string[] = [];

		// 1. ivm-compat shim (wraps bridge functions with .applySync/.applySyncPromise)
		parts.push(getIvmCompatShimSource());

		// 2. Config value injections
		if (this.deps.maxTimers !== undefined) {
			parts.push(`globalThis._maxTimers = ${this.deps.maxTimers};`);
		}
		if (this.deps.maxHandles !== undefined) {
			parts.push(`globalThis._maxHandles = ${this.deps.maxHandles};`);
		}
		parts.push(`globalThis.__runtimeBridgeSetupConfig = ${JSON.stringify({
			initialCwd: this.deps.processConfig.cwd ?? "/",
			jsonPayloadLimitBytes: this.deps.isolateJsonPayloadLimitBytes,
			payloadLimitErrorCode: PAYLOAD_LIMIT_ERROR_CODE,
		})};`);

		// 3. Global exposure helpers
		parts.push(getIsolateRuntimeSource("globalExposureHelpers"));

		// 4. Initial bridge globals setup
		parts.push(getInitialBridgeGlobalsSetupCode());

		// 5. Console setup (hooks into _log/_error)
		parts.push(getConsoleSetupCode());

		// 5b. Filesystem facade (_fs object wrapping individual _fs* bridge functions)
		parts.push(getIsolateRuntimeSource("setupFsFacade"));

		// 6. Bridge bundle IIFE
		parts.push(getRawBridgeCode());

		// 7. Bridge attach
		parts.push(getBridgeAttachCode());

		// 8. Timing mitigation
		if (timingMitigation === "freeze") {
			parts.push(`globalThis.__runtimeTimingMitigationConfig = ${JSON.stringify({ frozenTimeMs })};`);
			parts.push(getIsolateRuntimeSource("applyTimingMitigationFreeze"));
		} else {
			parts.push(getIsolateRuntimeSource("applyTimingMitigationOff"));
		}

		// 9. Require setup
		parts.push(getRequireSetupCode());

		// 10. CJS module/exports globals (for run() and exec() with filePath)
		parts.push(getIsolateRuntimeSource("initCommonjsModuleGlobals"));

		// 11. Harden custom globals (non-writable/configurable for hardened, mutable for mutable)
		parts.push(`globalThis.__runtimeCustomGlobalPolicy = ${JSON.stringify({
			hardenedGlobals: HARDENED_NODE_CUSTOM_GLOBALS,
			mutableGlobals: MUTABLE_NODE_CUSTOM_GLOBALS,
		})};`);
		parts.push(getIsolateRuntimeSource("applyCustomGlobalPolicy"));

		// Note: bridge code depends on timing (frozenTimeMs) so we don't cache
		// when timing mitigation is 'freeze' since frozenTimeMs changes per execution.
		const code = parts.join("\n");
		if (timingMitigation !== "freeze") {
			this.bridgeCodeCache = code;
		}
		return code;
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

		// Compose bridge code
		const bridgeCode = this.composeBridgeCode(timingMitigation, frozenTimeMs);

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
