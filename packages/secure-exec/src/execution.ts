import ivm from "isolated-vm";
import { getIsolateRuntimeSource } from "./generated/isolate-runtime.js";
import { transformDynamicImport } from "./shared/esm-utils.js";
import type {
	ConsoleLogHook,
	RunResult,
	TimingMitigation,
} from "./shared/api-types.js";

export function formatCapturedOutput(lines: string[]): string {
	return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

type ExecuteOptions = {
	mode: "run" | "exec";
	code: string;
	filePath?: string;
	env?: Record<string, string>;
	cwd?: string;
	stdin?: string;
	cpuTimeLimitMs?: number;
	timingMitigation?: TimingMitigation;
	onConsoleLog?: ConsoleLogHook;
};

type ExecutionRuntime = {
	isolate: ivm.Isolate;
	esmModuleCache: Map<string, ivm.Module>;
	dynamicImportCache: Map<string, ivm.Reference<unknown>>;
	dynamicImportPending: Map<string, Promise<ivm.Reference<unknown> | null>>;
	moduleFormatCache: Map<string, "esm" | "cjs" | "json">;
	packageTypeCache: Map<string, "module" | "commonjs" | null>;
	activeHttpServerIds: Set<number>;
	getTimingMitigation(mode?: TimingMitigation): TimingMitigation;
	getExecutionTimeoutMs(override?: number): number | undefined;
	getExecutionDeadlineMs(timeoutMs?: number): number | undefined;
	setupConsole(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
		onConsoleLog?: ConsoleLogHook,
	): Promise<void>;
	shouldRunAsESM(code: string, filePath?: string): Promise<boolean>;
	setupESMGlobals(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
		timingMitigation: TimingMitigation,
		frozenTimeMs: number,
	): Promise<void>;
	applyExecutionOverrides(
		context: ivm.Context,
		env?: Record<string, string>,
		cwd?: string,
		stdin?: string,
	): Promise<void>;
	precompileDynamicImports(
		transformedCode: string,
		context: ivm.Context,
		referrerPath?: string,
	): Promise<void>;
	setupDynamicImport(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
		referrerPath?: string,
		executionDeadlineMs?: number,
	): Promise<void>;
	runESM(
		code: string,
		context: ivm.Context,
		filePath?: string,
		executionDeadlineMs?: number,
	): Promise<unknown>;
	setupRequire(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
		timingMitigation: TimingMitigation,
		frozenTimeMs: number,
	): Promise<void>;
	initCommonJsModuleGlobals(context: ivm.Context): Promise<void>;
	applyCustomGlobalExposurePolicy(context: ivm.Context): Promise<void>;
	setCommonJsFileGlobals(context: ivm.Context, filePath: string): Promise<void>;
	awaitScriptResult(
		context: ivm.Context,
		executionDeadlineMs?: number,
	): Promise<void>;
	getExecutionRunOptions(
		executionDeadlineMs?: number,
	): Pick<ivm.ScriptRunOptions, "timeout">;
	runWithExecutionDeadline<T>(
		operation: Promise<T>,
		executionDeadlineMs?: number,
	): Promise<T>;
	isExecutionTimeoutError(error: unknown): boolean;
	recycleIsolate(): void;
	timeoutErrorMessage: string;
	timeoutExitCode: number;
};

export async function executeWithRuntime<T = unknown>(
	runtime: ExecutionRuntime,
	options: ExecuteOptions,
): Promise<RunResult<T>> {
	runtime.esmModuleCache.clear();
	runtime.dynamicImportCache.clear();
	runtime.dynamicImportPending.clear();
	runtime.moduleFormatCache.clear();
	runtime.packageTypeCache.clear();
	runtime.activeHttpServerIds.clear();

	const context = await runtime.isolate.createContext();
	const stderr: string[] = [];
	const timingMitigation = runtime.getTimingMitigation(options.timingMitigation);
	const frozenTimeMs = Date.now();
	const cpuTimeLimitMs = runtime.getExecutionTimeoutMs(options.cpuTimeLimitMs);
	const executionDeadlineMs = runtime.getExecutionDeadlineMs(cpuTimeLimitMs);
	let recycleIsolateAfterTimeout = false;

	try {
		const jail = context.global;
		await jail.set("global", jail.derefInto());

		await runtime.setupConsole(context, jail, options.onConsoleLog);

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
			stdout: "",
			stderr: formatCapturedOutput(stderr),
			code: exitCode,
			exports,
		};
	} catch (err) {
		if (runtime.isExecutionTimeoutError(err)) {
			recycleIsolateAfterTimeout = true;
			stderr.push(runtime.timeoutErrorMessage);
			return {
				stdout: "",
				stderr: formatCapturedOutput(stderr),
				code: runtime.timeoutExitCode,
				exports: undefined as T,
			};
		}

		const errMessage = err instanceof Error ? err.message : String(err);
		const exitMatch = errMessage.match(/process\\.exit\\((\\d+)\\)/);

		if (exitMatch) {
			const exitCode = parseInt(exitMatch[1], 10);
			return {
				stdout: "",
				stderr: formatCapturedOutput(stderr),
				code: exitCode,
				exports: undefined as T,
			};
		}

		stderr.push(errMessage);
		return {
			stdout: "",
			stderr: formatCapturedOutput(stderr),
			code: 1,
			exports: undefined as T,
		};
	} finally {
		context.release();
		if (recycleIsolateAfterTimeout) {
			runtime.recycleIsolate();
		}
	}
}
