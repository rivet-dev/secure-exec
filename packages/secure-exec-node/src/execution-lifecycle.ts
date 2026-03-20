import { getIsolateRuntimeSource } from "@secure-exec/core";
import {
	HARDENED_NODE_CUSTOM_GLOBALS,
	MUTABLE_NODE_CUSTOM_GLOBALS,
} from "@secure-exec/core/internal/shared/global-exposure";
import { filterEnv } from "@secure-exec/core/internal/shared/permissions";
import {
	getExecutionRunOptions,
	runWithExecutionDeadline,
} from "./isolate.js";
import type { Permissions } from "@secure-exec/core";
import type { TimingMitigation } from "@secure-exec/core/internal/shared/api-types";

// Legacy context type — isolated-vm has been removed.
/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyContext = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Apply runtime overrides used by script-style execution.
 *
 * @deprecated Legacy function for isolated-vm contexts. V8-based driver handles this.
 */
export async function applyExecutionOverrides(
	context: LegacyContext,
	permissions: Permissions | undefined,
	env?: Record<string, string>,
	cwd?: string,
	stdin?: string,
): Promise<void> {
	if (env || cwd) {
		await overrideProcessConfig(context, permissions, env, cwd);
	}
	if (stdin !== undefined) {
		await setStdinData(context, stdin);
	}
}

/**
 * Initialize mutable CommonJS globals before script execution.
 *
 * @deprecated Legacy function for isolated-vm contexts.
 */
export async function initCommonJsModuleGlobals(context: LegacyContext): Promise<void> {
	await context.eval(getIsolateRuntimeSource("initCommonjsModuleGlobals"));
}

/**
 * Set CommonJS file globals for accurate relative require() behavior.
 *
 * @deprecated Legacy function for isolated-vm contexts.
 */
export async function setCommonJsFileGlobals(
	context: LegacyContext,
	filePath: string,
): Promise<void> {
	const dirname = filePath.includes("/")
		? filePath.substring(0, filePath.lastIndexOf("/")) || "/"
		: "/";
	await context.global.set(
		"__runtimeCommonJsFileConfig",
		{ filePath, dirname },
		{ copy: true },
	);
	await context.eval(getIsolateRuntimeSource("setCommonjsFileGlobals"));
}

/**
 * Apply descriptor policy to custom globals before user code executes.
 *
 * @deprecated Legacy function for isolated-vm contexts.
 */
export async function applyCustomGlobalExposurePolicy(context: LegacyContext): Promise<void> {
	await context.global.set(
		"__runtimeCustomGlobalPolicy",
		{
			hardenedGlobals: HARDENED_NODE_CUSTOM_GLOBALS,
			mutableGlobals: MUTABLE_NODE_CUSTOM_GLOBALS,
		},
		{ copy: true },
	);
	await context.eval(getIsolateRuntimeSource("applyCustomGlobalPolicy"));
}

/**
 * Await script result when eval() returns a Promise.
 *
 * @deprecated Legacy function for isolated-vm contexts.
 */
export async function awaitScriptResult(
	context: LegacyContext,
	executionDeadlineMs?: number,
): Promise<void> {
	const hasPromise = await context.eval(
		"globalThis.__scriptResult__ && typeof globalThis.__scriptResult__.then === 'function'",
		{
			copy: true,
			...getExecutionRunOptions(executionDeadlineMs),
		},
	);
	if (hasPromise) {
		await runWithExecutionDeadline(
			context.eval("globalThis.__scriptResult__", {
				promise: true,
				...getExecutionRunOptions(executionDeadlineMs),
			}),
			executionDeadlineMs,
		);
	}
}

/**
 * Override process.env and process.cwd for a specific execution context.
 *
 * @deprecated Legacy function for isolated-vm contexts.
 */
export async function overrideProcessConfig(
	context: LegacyContext,
	permissions: Permissions | undefined,
	env?: Record<string, string>,
	cwd?: string,
): Promise<void> {
	if (env) {
		const filtered = filterEnv(env, permissions);
		await context.global.set("__runtimeProcessEnvOverride", filtered, {
			copy: true,
		});
		await context.eval(getIsolateRuntimeSource("overrideProcessEnv"));
	}
	if (cwd) {
		await context.global.set("__runtimeProcessCwdOverride", cwd, {
			copy: true,
		});
		await context.eval(getIsolateRuntimeSource("overrideProcessCwd"));
	}
}

/**
 * Set stdin data for a specific execution context.
 *
 * @deprecated Legacy function for isolated-vm contexts.
 */
export async function setStdinData(
	context: LegacyContext,
	stdin: string,
): Promise<void> {
	await context.global.set("__runtimeStdinData", stdin, { copy: true });
	await context.eval(getIsolateRuntimeSource("setStdinData"));
}
