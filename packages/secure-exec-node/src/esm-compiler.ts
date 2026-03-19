import {
	createBuiltinESMWrapper,
	getStaticBuiltinWrapperSource,
	BUILTIN_NAMED_EXPORTS,
	normalizeBuiltinSpecifier,
	loadFile,
	getIsolateRuntimeSource,
} from "@secure-exec/core";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import {
	extractCjsNamedExports,
	extractDynamicImportSpecifiers,
	wrapCJSForESMWithModulePath,
} from "@secure-exec/core/internal/shared/esm-utils";
import {
	HOST_BRIDGE_GLOBAL_KEYS,
} from "@secure-exec/core/internal/shared/bridge-contract";
import {
	getExecutionRunOptions,
	runWithExecutionDeadline,
} from "./isolate.js";
import {
	getHostBuiltinNamedExports,
	polyfillCodeCache,
	polyfillNamedExportsCache,
} from "./isolate-bootstrap.js";
import type { DriverDeps } from "./isolate-bootstrap.js";
import { getModuleFormat, resolveESMPath } from "./module-resolver.js";

// Legacy types — isolated-vm has been removed.
/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyContext = any;
type LegacyModule = any;
type LegacyReference<_T = unknown> = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type CompilerDeps = Pick<
	DriverDeps,
	| "isolate"
	| "filesystem"
	| "esmModuleCache"
	| "esmModuleReverseCache"
	| "moduleFormatCache"
	| "packageTypeCache"
	| "isolateJsonPayloadLimitBytes"
	| "dynamicImportCache"
	| "dynamicImportPending"
	| "resolutionCache"
>;

/**
 * Load and compile an ESM module, handling both ESM and CJS sources.
 *
 * @deprecated Legacy function for isolated-vm. V8-based driver handles ESM natively.
 */
export async function compileESMModule(
	deps: CompilerDeps,
	filePath: string,
	_context: LegacyContext,
): Promise<LegacyModule> {
	// Check cache first
	const cached = deps.esmModuleCache.get(filePath);
	if (cached) {
		return cached;
	}

	let code: string;

	// Handle built-in modules (node: prefix or known polyfills)
	const builtinSpecifier = normalizeBuiltinSpecifier(filePath);
	const moduleName = (builtinSpecifier ?? filePath).replace(/^node:/, "");

	if (builtinSpecifier) {
		const hostBuiltinNamedExports = getHostBuiltinNamedExports(moduleName);
		const declaredBuiltinNamedExports = BUILTIN_NAMED_EXPORTS[moduleName] ?? [];
		const mergedBuiltinNamedExports = Array.from(
			new Set([...hostBuiltinNamedExports, ...declaredBuiltinNamedExports]),
		);
		const runtimeBuiltinBinding = `globalThis._requireFrom(${JSON.stringify(moduleName)}, "/")`;
		const staticWrapperCode = getStaticBuiltinWrapperSource(moduleName);
		if (staticWrapperCode !== null) {
			code = staticWrapperCode;
		} else if (hostBuiltinNamedExports.length > 0) {
			code = createBuiltinESMWrapper(
				runtimeBuiltinBinding,
				mergedBuiltinNamedExports,
			);
		} else if (hasPolyfill(moduleName)) {
			let polyfillCode = polyfillCodeCache.get(moduleName);
			if (!polyfillCode) {
				polyfillCode = await bundlePolyfill(moduleName);
				polyfillCodeCache.set(moduleName, polyfillCode);
			}

			let inferredNamedExports = polyfillNamedExportsCache.get(moduleName);
			if (!inferredNamedExports) {
				inferredNamedExports = extractCjsNamedExports(polyfillCode);
				polyfillNamedExportsCache.set(moduleName, inferredNamedExports);
			}

			code = createBuiltinESMWrapper(
				String(polyfillCode),
				Array.from(
					new Set([
						...inferredNamedExports,
						...mergedBuiltinNamedExports,
					]),
				),
			);
		} else {
			code = createBuiltinESMWrapper(
				runtimeBuiltinBinding,
				mergedBuiltinNamedExports,
			);
		}
	} else {
		const source = await loadFile(filePath, deps.filesystem);
		if (source === null) {
			throw new Error(`Cannot load module: ${filePath}`);
		}

		const moduleFormat = await getModuleFormat(deps, filePath, source);
		if (moduleFormat === "json") {
			code = "export default " + source + ";";
		} else if (moduleFormat === "cjs") {
			code = wrapCJSForESMWithModulePath(source, filePath);
		} else {
			code = source;
		}
	}

	// Compile the module
	const module = await deps.isolate.compileModule(code, {
		filename: filePath,
	});

	// Cache it (forward and reverse)
	deps.esmModuleCache.set(filePath, module);
	deps.esmModuleReverseCache.set(module, filePath);

	return module;
}

/**
 * Create the ESM resolver callback for module.instantiate().
 *
 * @deprecated Legacy function for isolated-vm. V8-based driver handles ESM natively.
 */
export function createESMResolver(
	deps: CompilerDeps,
	context: LegacyContext,
): (specifier: string, referrer: LegacyModule) => Promise<LegacyModule> {
	return async (specifier: string, referrer: LegacyModule) => {
		const referrerPath = deps.esmModuleReverseCache.get(referrer) ?? "/";

		const resolved = await resolveESMPath(deps, specifier, referrerPath);
		if (!resolved) {
			throw new Error(
				`Cannot resolve module '${specifier}' from '${referrerPath}'`,
			);
		}

		return compileESMModule(deps, resolved, context);
	};
}

/**
 * Run ESM code.
 *
 * @deprecated Legacy function for isolated-vm. V8-based driver handles ESM natively.
 */
export async function runESM(
	deps: CompilerDeps,
	code: string,
	context: LegacyContext,
	filePath: string = "/<entry>.mjs",
	executionDeadlineMs?: number,
): Promise<unknown> {
	const entryModule = await deps.isolate.compileModule(code, {
		filename: filePath,
	});
	deps.esmModuleCache.set(filePath, entryModule);
	deps.esmModuleReverseCache.set(entryModule, filePath);

	await entryModule.instantiate(context, createESMResolver(deps, context));

	await runWithExecutionDeadline(
		entryModule.evaluate({
			promise: true,
			...getExecutionRunOptions(executionDeadlineMs),
		}),
		executionDeadlineMs,
	);

	const jail = context.global;
	const namespaceGlobalKey = "__entryNamespace__";
	await jail.set(namespaceGlobalKey, entryModule.namespace.derefInto());

	try {
		return context.eval("Object.fromEntries(Object.entries(globalThis.__entryNamespace__))", {
			copy: true,
			...getExecutionRunOptions(executionDeadlineMs),
		});
	} finally {
		await jail.delete(namespaceGlobalKey);
	}
}

export function isAlreadyInstantiatedModuleError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return (
		message.includes("already instantiated") ||
		message.includes("already linked")
	);
}

/**
 * Get a cached namespace or evaluate the module on first dynamic import.
 *
 * @deprecated Legacy function for isolated-vm. V8-based driver handles dynamic imports natively.
 */
export async function resolveDynamicImportNamespace(
	deps: CompilerDeps,
	specifier: string,
	context: LegacyContext,
	referrerPath: string,
	executionDeadlineMs?: number,
): Promise<LegacyReference | null> {
	const cached = deps.dynamicImportCache.get(specifier);
	if (cached) {
		return cached;
	}

	const resolved = await resolveESMPath(deps, specifier, referrerPath);
	if (!resolved) {
		return null;
	}

	const resolvedCached = deps.dynamicImportCache.get(resolved);
	if (resolvedCached) {
		deps.dynamicImportCache.set(specifier, resolvedCached);
		return resolvedCached;
	}

	const pending = deps.dynamicImportPending.get(resolved);
	if (pending) {
		const namespace = await pending;
		deps.dynamicImportCache.set(specifier, namespace);
		return namespace;
	}

		const evaluateModule = (async (): Promise<LegacyReference> => {
			const module = await compileESMModule(deps, resolved, context);
			try {
				await module.instantiate(context, createESMResolver(deps, context));
			} catch (error) {
				if (!isAlreadyInstantiatedModuleError(error)) {
					throw error;
				}
			}
			await runWithExecutionDeadline(
				module.evaluate({
					promise: true,
					...getExecutionRunOptions(executionDeadlineMs),
			}),
			executionDeadlineMs,
		);
		return module.namespace;
	})();

	deps.dynamicImportPending.set(resolved, evaluateModule);

	try {
		const namespace = await evaluateModule;
		deps.dynamicImportCache.set(resolved, namespace);
		deps.dynamicImportCache.set(specifier, namespace);
		return namespace;
	} finally {
		deps.dynamicImportPending.delete(resolved);
	}
}

/**
 * Pre-compile all static dynamic import specifiers found in the code.
 *
 * @deprecated Legacy function for isolated-vm. V8-based driver handles this natively.
 */
export async function precompileDynamicImports(
	deps: CompilerDeps,
	transformedCode: string,
	context: LegacyContext,
	referrerPath: string = "/",
): Promise<void> {
	const specifiers = extractDynamicImportSpecifiers(transformedCode);

	for (const specifier of specifiers) {
		const resolved = await resolveESMPath(deps, specifier, referrerPath);
		if (!resolved) {
			continue;
		}

		try {
			await compileESMModule(deps, resolved, context);
		} catch {
			// Skip unresolved/invalid modules so runtime import() rejects on demand.
		}
	}
}

/**
 * Set up dynamic import() function for ESM.
 *
 * @deprecated Legacy function for isolated-vm. V8-based driver handles dynamic imports natively.
 */
export async function setupDynamicImport(
	deps: CompilerDeps,
	context: LegacyContext,
	jail: LegacyReference,
	referrerPath: string = "/",
	executionDeadlineMs?: number,
): Promise<void> {
	const dynamicImportRef = {
		apply: async (_ctx: unknown, args: unknown[]) => {
			const specifier = args[0] as string;
			const fromPath = args[1] as string | undefined;
			const effectiveReferrer =
				typeof fromPath === "string" && fromPath.length > 0
					? fromPath
					: referrerPath;
			const namespace = await resolveDynamicImportNamespace(
				deps,
				specifier,
				context,
				effectiveReferrer,
				executionDeadlineMs,
			);
			if (!namespace) {
				return null;
			}
			return namespace.derefInto();
		},
	};

	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.dynamicImport, dynamicImportRef);
	await jail.set(
		"__runtimeDynamicImportConfig",
		{ referrerPath },
		{ copy: true },
	);
	await context.eval(getIsolateRuntimeSource("setupDynamicImport"));
}
