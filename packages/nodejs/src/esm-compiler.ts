/**
 * ESM wrapper generator for built-in modules inside the isolate.
 *
 * The V8 isolate's ESM `import` can only resolve modules we explicitly provide.
 * For Node built-ins (fs, path, etc.) we generate thin ESM wrappers that
 * re-export the bridge-provided globalThis objects as proper ESM modules
 * with both default and named exports.
 */

import { BUILTIN_NAMED_EXPORTS } from "./builtin-modules.js";

function isValidIdentifier(value: string): boolean {
	return /^[$A-Z_][0-9A-Z_$]*$/i.test(value);
}

/** Generate `export const X = _builtin.X;` lines for each known named export. */
function buildNamedExportLines(namedExports: string[]): string[] {
	return Array.from(new Set(namedExports))
		.filter(isValidIdentifier)
		.map(
			(name) =>
				"export const " +
				name +
				" = _builtin == null ? undefined : _builtin[" +
				JSON.stringify(name) +
				"];",
		);
}

/**
 * Build a complete ESM wrapper that reads a bridge global via `bindingExpression`
 * and re-exports it as `default` plus individual named exports.
 */
function buildWrapperSource(bindingExpression: string, namedExports: string[]): string {
	const lines = [
		"const _builtin = " + bindingExpression + ";",
		"export default _builtin;",
		...buildNamedExportLines(namedExports),
	];
	return lines.join("\n");
}

const MODULE_FALLBACK_BINDING =
	"globalThis.bridge?.module || {" +
	"createRequire: globalThis._createRequire || function(f) {" +
	"const dir = f.replace(/\\\\[^\\\\]*$/, '') || '/';" +
	"return function(m) { return globalThis._requireFrom(m, dir); };" +
	"}," +
	"Module: { builtinModules: [] }," +
	"isBuiltin: () => false," +
	"builtinModules: []" +
	"}";

const STATIC_BUILTIN_WRAPPER_SOURCES: Readonly<Record<string, string>> = {
	fs: buildWrapperSource(
		"globalThis.bridge?.fs || globalThis.bridge?.default || {}",
		BUILTIN_NAMED_EXPORTS.fs,
	),
	"fs/promises": buildWrapperSource(
		"(globalThis.bridge?.fs || globalThis.bridge?.default || {}).promises || {}",
		BUILTIN_NAMED_EXPORTS["fs/promises"],
	),
	module: buildWrapperSource(MODULE_FALLBACK_BINDING, BUILTIN_NAMED_EXPORTS.module),
	os: buildWrapperSource("globalThis.bridge?.os || {}", BUILTIN_NAMED_EXPORTS.os),
	http: buildWrapperSource(
		"globalThis._httpModule || globalThis.bridge?.network?.http || {}",
		BUILTIN_NAMED_EXPORTS.http,
	),
	https: buildWrapperSource(
		"globalThis._httpsModule || globalThis.bridge?.network?.https || {}",
		BUILTIN_NAMED_EXPORTS.https,
	),
	http2: buildWrapperSource("globalThis._http2Module || {}", []),
	dns: buildWrapperSource(
		"globalThis._dnsModule || globalThis.bridge?.network?.dns || {}",
		BUILTIN_NAMED_EXPORTS.dns,
	),
	child_process: buildWrapperSource(
		"globalThis._childProcessModule || globalThis.bridge?.childProcess || {}",
		BUILTIN_NAMED_EXPORTS.child_process,
	),
	process: buildWrapperSource(
		"globalThis.process || {}",
		BUILTIN_NAMED_EXPORTS.process,
	),
	v8: buildWrapperSource("globalThis._moduleCache?.v8 || {}", []),
};

/** Get a pre-built ESM wrapper for a bridge-backed built-in, or null if not bridge-handled. */
export function getStaticBuiltinWrapperSource(moduleName: string): string | null {
	return STATIC_BUILTIN_WRAPPER_SOURCES[moduleName] ?? null;
}

/** Build a custom ESM wrapper for a dynamically-resolved module (e.g. polyfills). */
export function createBuiltinESMWrapper(
	bindingExpression: string,
	namedExports: string[],
): string {
	return buildWrapperSource(bindingExpression, namedExports);
}

/** Wrapper for unsupported built-ins: exports an empty object as default. */
export function getEmptyBuiltinESMWrapper(): string {
	return buildWrapperSource("{}", []);
}
