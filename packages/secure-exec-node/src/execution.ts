import { getIsolateRuntimeSource } from "@secure-exec/core";
import type { ResolutionCache } from "@secure-exec/core/internal/package-bundler";
import { transformDynamicImport } from "@secure-exec/core/internal/shared/esm-utils";
import type {
	StdioHook,
	RunResult,
	TimingMitigation,
} from "@secure-exec/core/internal/shared/api-types";

const MAX_ERROR_MESSAGE_CHARS = 8192;

/** Truncate long error messages to prevent unbounded output. */
function boundErrorMessage(message: string): string {
	if (message.length <= MAX_ERROR_MESSAGE_CHARS) {
		return message;
	}
	return `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}...[Truncated]`;
}

/**
 * Options for a single execution within an isolate.
 *
 * - `run`: evaluate code and return `module.exports` (library mode)
 * - `exec`: evaluate code as a script with process globals (CLI mode)
 */
type ExecuteOptions = {
	mode: "run" | "exec";
	code: string;
	filePath?: string;
	env?: Record<string, string>;
	cwd?: string;
	stdin?: string;
	cpuTimeLimitMs?: number;
	timingMitigation?: TimingMitigation;
	onStdio?: StdioHook;
};

// Legacy context/reference types — isolated-vm has been removed.
/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyIsolate = any;
type LegacyContext = any;
type LegacyReference<_T = unknown> = any;
type LegacyModule = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Abstraction over the runtime environment that `executeWithRuntime` depends on.
 *
 * @deprecated This interface used isolated-vm types. The V8-based driver in
 * execution-driver.ts replaces this execution loop entirely.
 */
type ExecutionRuntime = {
	isolate: LegacyIsolate;
	esmModuleCache: Map<string, LegacyModule>;
	esmModuleReverseCache: Map<LegacyModule, string>;
	dynamicImportCache: Map<string, LegacyReference>;
	dynamicImportPending: Map<string, Promise<LegacyReference | null>>;
	resolutionCache: ResolutionCache;
	moduleFormatCache: Map<string, "esm" | "cjs" | "json">;
	packageTypeCache: Map<string, "module" | "commonjs" | null>;
	getTimingMitigation(mode?: TimingMitigation): TimingMitigation;
	getExecutionTimeoutMs(override?: number): number | undefined;
	getExecutionDeadlineMs(timeoutMs?: number): number | undefined;
	setupConsole(
		context: LegacyContext,
		jail: LegacyReference,
		onStdio?: StdioHook,
	): Promise<void>;
	shouldRunAsESM(code: string, filePath?: string): Promise<boolean>;
	setupESMGlobals(
		context: LegacyContext,
		jail: LegacyReference,
		timingMitigation: TimingMitigation,
		frozenTimeMs: number,
	): Promise<void>;
	applyExecutionOverrides(
		context: LegacyContext,
		env?: Record<string, string>,
		cwd?: string,
		stdin?: string,
	): Promise<void>;
	precompileDynamicImports(
		transformedCode: string,
		context: LegacyContext,
		referrerPath?: string,
	): Promise<void>;
	setupDynamicImport(
		context: LegacyContext,
		jail: LegacyReference,
		referrerPath?: string,
		executionDeadlineMs?: number,
	): Promise<void>;
	runESM(
		code: string,
		context: LegacyContext,
		filePath?: string,
		executionDeadlineMs?: number,
	): Promise<unknown>;
	setupRequire(
		context: LegacyContext,
		jail: LegacyReference,
		timingMitigation: TimingMitigation,
		frozenTimeMs: number,
	): Promise<void>;
	initCommonJsModuleGlobals(context: LegacyContext): Promise<void>;
	applyCustomGlobalExposurePolicy(context: LegacyContext): Promise<void>;
	setCommonJsFileGlobals(context: LegacyContext, filePath: string): Promise<void>;
	awaitScriptResult(
		context: LegacyContext,
		executionDeadlineMs?: number,
	): Promise<void>;
	getExecutionRunOptions(
		executionDeadlineMs?: number,
	): { timeout?: number };
	runWithExecutionDeadline<T>(
		operation: Promise<T>,
		executionDeadlineMs?: number,
	): Promise<T>;
	isExecutionTimeoutError(error: unknown): boolean;
	recycleIsolate(): void;
	timeoutErrorMessage: string;
	timeoutExitCode: number;
};

/**
 * Core execution loop shared between `run()` and `exec()` modes.
 *
 * @deprecated This function used isolated-vm internals. The V8-based driver
 * in execution-driver.ts replaces this execution loop entirely.
 */
export async function executeWithRuntime<T = unknown>(
	runtime: ExecutionRuntime,
	options: ExecuteOptions,
): Promise<RunResult<T>> {
	runtime.esmModuleCache.clear();
	runtime.esmModuleReverseCache.clear();
	runtime.dynamicImportCache.clear();
	runtime.dynamicImportPending.clear();
	runtime.resolutionCache.resolveResults.clear();
	runtime.resolutionCache.packageJsonResults.clear();
	runtime.resolutionCache.existsResults.clear();
	runtime.resolutionCache.statResults.clear();
	runtime.moduleFormatCache.clear();
	runtime.packageTypeCache.clear();

	const context = await runtime.isolate.createContext();
	const timingMitigation = runtime.getTimingMitigation(options.timingMitigation);
	const frozenTimeMs = Date.now();
	const cpuTimeLimitMs = runtime.getExecutionTimeoutMs(options.cpuTimeLimitMs);
	const executionDeadlineMs = runtime.getExecutionDeadlineMs(cpuTimeLimitMs);
	let recycleIsolateAfterTimeout = false;

	try {
		const jail = context.global;
		await jail.set("global", jail.derefInto());

		await runtime.setupConsole(context, jail, options.onStdio);

		let exports: T | undefined;
		const transformedCode = transformDynamicImport(options.code);
		const entryReferrerPath = options.filePath ?? "/";

		if (await runtime.shouldRunAsESM(options.code, options.filePath)) {
			await runtime.setupESMGlobals(
				context,
				jail,
				timingMitigation,
				frozenTimeMs,
			);

			if (options.mode === "exec") {
				await runtime.applyExecutionOverrides(
					context,
					options.env,
					options.cwd,
					options.stdin,
				);
			}

			await runtime.precompileDynamicImports(
				transformedCode,
				context,
				entryReferrerPath,
			);
			await runtime.setupDynamicImport(
				context,
				jail,
				entryReferrerPath,
				executionDeadlineMs,
			);
			await runtime.applyCustomGlobalExposurePolicy(context);

			const esmResult = await runtime.runESM(
				transformedCode,
				context,
				options.filePath,
				executionDeadlineMs,
			);
			if (options.mode === "run") {
				exports = esmResult as T;
			}
		} else {
			await runtime.setupRequire(context, jail, timingMitigation, frozenTimeMs);
			await runtime.initCommonJsModuleGlobals(context);

			if (options.mode === "exec") {
				await runtime.applyExecutionOverrides(
					context,
					options.env,
					options.cwd,
					options.stdin,
				);

				if (options.filePath) {
					await runtime.setCommonJsFileGlobals(context, options.filePath);
				}
			}

			await runtime.precompileDynamicImports(
				transformedCode,
				context,
				entryReferrerPath,
			);
			await runtime.setupDynamicImport(
				context,
				jail,
				entryReferrerPath,
				executionDeadlineMs,
			);
			await runtime.applyCustomGlobalExposurePolicy(context);

				if (options.mode === "exec") {
					await jail.set("__runtimeExecCode", transformedCode, { copy: true });
					const script = await runtime.isolate.compileScript(
						getIsolateRuntimeSource("evalScriptResult"),
					);
					await script.run(
						context,
						runtime.getExecutionRunOptions(executionDeadlineMs),
					);
				await runtime.awaitScriptResult(context, executionDeadlineMs);
			} else {
				const script = await runtime.isolate.compileScript(transformedCode);
				await script.run(
					context,
					runtime.getExecutionRunOptions(executionDeadlineMs),
				);
				exports = (await context.eval("module.exports", {
					copy: true,
					...runtime.getExecutionRunOptions(executionDeadlineMs),
				})) as T;
			}
		}

		await runtime.runWithExecutionDeadline(
			context.eval(
				'typeof _waitForActiveHandles === "function" ? _waitForActiveHandles() : Promise.resolve()',
				{
					promise: true,
					...runtime.getExecutionRunOptions(executionDeadlineMs),
				},
			),
			executionDeadlineMs,
		);

		const exitCode = (await context.eval("process.exitCode || 0", {
			copy: true,
			...runtime.getExecutionRunOptions(executionDeadlineMs),
		})) as number;

		return {
			code: exitCode,
			exports,
		};
	} catch (err) {
		if (runtime.isExecutionTimeoutError(err)) {
			recycleIsolateAfterTimeout = true;
			return {
				code: runtime.timeoutExitCode,
				errorMessage: runtime.timeoutErrorMessage,
				exports: undefined as T,
			};
		}

		// Include error class name (e.g. "SyntaxError: ...") to match Node.js output
		const errMessage = err instanceof Error
			? (err.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message)
			: String(err);
		const exitMatch = errMessage.match(/process\.exit\((\d+)\)/);

		if (exitMatch) {
			const exitCode = parseInt(exitMatch[1], 10);
			return {
				code: exitCode,
				exports: undefined as T,
			};
		}

		return {
			code: 1,
			errorMessage: boundErrorMessage(errMessage),
			exports: undefined as T,
		};
	} finally {
		context.release();
		if (recycleIsolateAfterTimeout) {
			runtime.recycleIsolate();
		}
	}
}
