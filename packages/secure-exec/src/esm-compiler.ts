import { BUILTIN_NAMED_EXPORTS } from "./module-resolver.js";

function isValidIdentifier(value: string): boolean {
	return /^[$A-Z_][0-9A-Z_$]*$/i.test(value);
}

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

export function getStaticBuiltinWrapperSource(moduleName: string): string | null {
	return STATIC_BUILTIN_WRAPPER_SOURCES[moduleName] ?? null;
}

export function createBuiltinESMWrapper(
	bindingExpression: string,
	namedExports: string[],
): string {
	return buildWrapperSource(bindingExpression, namedExports);
}

export function getEmptyBuiltinESMWrapper(): string {
	return buildWrapperSource("{}", []);
}
