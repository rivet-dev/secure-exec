import ivm from "isolated-vm";
import { DEFAULT_TIMING_MITIGATION, TIMEOUT_ERROR_MESSAGE, TIMEOUT_EXIT_CODE, createIsolate as createDefaultIsolate, getExecutionDeadlineMs, getExecutionRunOptions, isExecutionTimeoutError, runWithExecutionDeadline } from "./isolate.js";
import { getPathDir, createResolutionCache } from "@secure-exec/core";
import { createCommandExecutorStub, createFsStub, createNetworkStub, filterEnv, wrapCommandExecutor, wrapFileSystem, wrapNetworkAdapter } from "@secure-exec/core/internal/shared/permissions";
import { executeWithRuntime } from "./execution.js";
import type { NetworkAdapter, RuntimeDriver } from "@secure-exec/core";
import type { StdioHook, ExecOptions, ExecResult, RunResult, TimingMitigation } from "@secure-exec/core/internal/shared/api-types";
import { type DriverDeps, type NodeExecutionDriverOptions, createBudgetState, clearActiveHostTimers, killActiveChildProcesses, normalizePayloadLimit, getExecutionTimeoutMs, getTimingMitigation, DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES, DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES, DEFAULT_MAX_TIMERS, DEFAULT_MAX_HANDLES, DEFAULT_SANDBOX_CWD, DEFAULT_SANDBOX_HOME, DEFAULT_SANDBOX_TMPDIR } from "./isolate-bootstrap.js";
import { shouldRunAsESM } from "./module-resolver.js";
import { precompileDynamicImports, runESM, setupDynamicImport } from "./esm-compiler.js";
import { setupConsole, setupRequire, setupESMGlobals } from "./bridge-setup.js";
import { applyExecutionOverrides, initCommonJsModuleGlobals, setCommonJsFileGlobals, applyCustomGlobalExposurePolicy, awaitScriptResult } from "./execution-lifecycle.js";

export { NodeExecutionDriverOptions };

export class NodeExecutionDriver implements RuntimeDriver {
	private deps: DriverDeps;
	private memoryLimit: number;
	private disposed: boolean = false;
	private runtimeCreateIsolate: (memoryLimit: number) => ivm.Isolate;

	constructor(options: NodeExecutionDriverOptions) {
		this.memoryLimit = options.memoryLimit ?? 128;
		const system = options.system;
		this.runtimeCreateIsolate =
			(options.createIsolate as
				| ((memoryLimit: number) => ivm.Isolate)
				| undefined) ??
			((memoryLimit) => createDefaultIsolate(memoryLimit));

		const isolate = this.runtimeCreateIsolate(this.memoryLimit);
		const permissions = system.permissions;
		// Extract sandboxToHostPath before wrapping (wrapFileSystem strips custom methods)
		const unwrappedFs = system.filesystem as unknown as Record<string, unknown>;
		const sandboxToHostPath = typeof unwrappedFs?.toHostPath === "function"
			? (unwrappedFs.toHostPath as (p: string) => string | null).bind(system.filesystem)
			: undefined;
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
			isolate,
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
			esmModuleCache: new Map(),
			esmModuleReverseCache: new Map(),
			moduleFormatCache: new Map(),
			packageTypeCache: new Map(),
			dynamicImportCache: new Map(),
			dynamicImportPending: new Map(),
			resolutionCache: createResolutionCache(),
			sandboxToHostPath,
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

	get unsafeIsolate(): unknown { return this.__unsafeIsoalte; }
	get __unsafeIsoalte(): ivm.Isolate {
		if (this.disposed) throw new Error("NodeRuntime has been disposed");
		return this.deps.isolate;
	}

	async createUnsafeContext(options: { env?: Record<string, string>; cwd?: string; filePath?: string } = {}): Promise<unknown> {
		return this.__unsafeCreateContext(options);
	}

	async __unsafeCreateContext(options: { env?: Record<string, string>; cwd?: string; filePath?: string } = {}): Promise<ivm.Context> {
		if (this.disposed) throw new Error("NodeRuntime has been disposed");
		this.deps.budgetState = createBudgetState();
		// Clear module caches to prevent cache poisoning across contexts
		this.deps.esmModuleCache.clear();
		this.deps.esmModuleReverseCache.clear();
		this.deps.dynamicImportCache.clear();
		this.deps.dynamicImportPending.clear();
		this.deps.resolutionCache.resolveResults.clear();
		this.deps.resolutionCache.packageJsonResults.clear();
		this.deps.resolutionCache.existsResults.clear();
		this.deps.resolutionCache.statResults.clear();
		this.deps.moduleFormatCache.clear();
		this.deps.packageTypeCache.clear();
		const context = await this.deps.isolate.createContext();
		const jail = context.global;
		await jail.set("global", jail.derefInto());
		const tm = getTimingMitigation(undefined, this.deps.timingMitigation);
		const frozenTimeMs = Date.now();
		await setupConsole(this.deps, context, jail, this.deps.onStdio);
		await setupRequire(this.deps, context, jail, tm, frozenTimeMs);
		const referrer = options.filePath ? getPathDir(options.filePath) : (options.cwd ?? this.deps.processConfig.cwd ?? "/");
		await setupDynamicImport(this.deps, context, jail, referrer, undefined);
		await initCommonJsModuleGlobals(context);
		await applyExecutionOverrides(context, this.deps.permissions, options.env, options.cwd, undefined);
		if (options.filePath) await setCommonJsFileGlobals(context, options.filePath);
		await applyCustomGlobalExposurePolicy(context);
		return context;
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
		this.deps.budgetState = createBudgetState();
		const d = this.deps;
		return executeWithRuntime<T>(
			{
				isolate: d.isolate,
				esmModuleCache: d.esmModuleCache,
				esmModuleReverseCache: d.esmModuleReverseCache,
				dynamicImportCache: d.dynamicImportCache,
				dynamicImportPending: d.dynamicImportPending,
				resolutionCache: d.resolutionCache,
				moduleFormatCache: d.moduleFormatCache,
				packageTypeCache: d.packageTypeCache,
				getTimingMitigation: (mode) => getTimingMitigation(mode, d.timingMitigation),
				getExecutionTimeoutMs: (override) => getExecutionTimeoutMs(override, d.cpuTimeLimitMs),
				getExecutionDeadlineMs: (timeoutMs) => getExecutionDeadlineMs(timeoutMs),
				setupConsole: (context, jail, onStdio) =>
					setupConsole(d, context, jail, onStdio ?? d.onStdio),
				shouldRunAsESM: (code, filePath) => shouldRunAsESM(d, code, filePath),
				setupESMGlobals: (context, jail, tm, frozenTimeMs) =>
					setupESMGlobals(d, context, jail, tm, frozenTimeMs),
				applyExecutionOverrides: (context, env, cwd, stdin) =>
					applyExecutionOverrides(context, d.permissions, env, cwd, stdin),
				precompileDynamicImports: (transformedCode, context, referrerPath) =>
					precompileDynamicImports(d, transformedCode, context, referrerPath),
				setupDynamicImport: (context, jail, referrerPath, executionDeadlineMs) =>
					setupDynamicImport(d, context, jail, referrerPath, executionDeadlineMs),
				runESM: (code, context, filePath, executionDeadlineMs) =>
					runESM(d, code, context, filePath, executionDeadlineMs),
				setupRequire: (context, jail, tm, frozenTimeMs) =>
					setupRequire(d, context, jail, tm, frozenTimeMs),
				initCommonJsModuleGlobals: (context) => initCommonJsModuleGlobals(context),
				applyCustomGlobalExposurePolicy: (context) =>
					applyCustomGlobalExposurePolicy(context),
				setCommonJsFileGlobals: (context, filePath) =>
					setCommonJsFileGlobals(context, filePath),
				awaitScriptResult: (context, executionDeadlineMs) =>
					awaitScriptResult(context, executionDeadlineMs),
				getExecutionRunOptions: (executionDeadlineMs) =>
					getExecutionRunOptions(executionDeadlineMs),
				runWithExecutionDeadline: (operation, executionDeadlineMs) =>
					runWithExecutionDeadline(operation, executionDeadlineMs),
				isExecutionTimeoutError: (error) => isExecutionTimeoutError(error),
				recycleIsolate: () => this.recycleIsolate(),
				timeoutErrorMessage: TIMEOUT_ERROR_MESSAGE,
				timeoutExitCode: TIMEOUT_EXIT_CODE,
			},
			options,
		);
	}

	private recycleIsolate(): void {
		if (this.disposed) {
			return;
		}
		killActiveChildProcesses(this.deps);
		this.closeActiveHttpServers();
		clearActiveHostTimers(this.deps);
		this.deps.isolate.dispose();
		this.deps.isolate = this.runtimeCreateIsolate(this.memoryLimit);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		killActiveChildProcesses(this.deps);
		this.closeActiveHttpServers();
		clearActiveHostTimers(this.deps);
		this.deps.isolate.dispose();
	}

	async terminate(): Promise<void> {
		if (this.disposed) {
			return;
		}
		killActiveChildProcesses(this.deps);
		const adapter = this.deps.networkAdapter;
		if (adapter?.httpServerClose) {
			const ids = Array.from(this.deps.activeHttpServerIds);
			await Promise.allSettled(ids.map((id) => adapter.httpServerClose!(id)));
		}
		this.deps.activeHttpServerIds.clear();
		clearActiveHostTimers(this.deps);
		this.disposed = true;
		this.deps.isolate.dispose();
	}

	/** Close all tracked HTTP servers without awaiting. */
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
