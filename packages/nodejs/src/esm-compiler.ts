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
	"stream/promises": buildWrapperSource(
		"(function(){var s=require('stream');if(s.promises)return s.promises;" +
		"function promisePipeline(){var args=[].slice.call(arguments);return new Promise(function(ok,fail){args.push(function(e){e?fail(e):ok()});s.pipeline.apply(null,args)})}" +
		"function promiseFinished(stream,opts){return new Promise(function(ok,fail){s.finished(stream,opts||{},function(e){e?fail(e):ok()})})}" +
		"return{pipeline:promisePipeline,finished:promiseFinished}})()",
		BUILTIN_NAMED_EXPORTS["stream/promises"],
	),
	url: (() => {
		// Custom url wrapper with Node.js-compatible fileURLToPath/pathToFileURL.
		// The node-stdlib-browser url polyfill's fileURLToPath rejects valid file:// URLs,
		// so we provide correct implementations alongside the standard URL/URLSearchParams.
		const binding = "(function(){" +
			"var u=globalThis.URL?{URL:globalThis.URL,URLSearchParams:globalThis.URLSearchParams}:{};" +
			"u.fileURLToPath=function(input){" +
			"var s=typeof input==='string'?input:input&&input.href||String(input);" +
			"if(s.startsWith('file:///'))return decodeURIComponent(s.slice(7));" +
			"if(s.startsWith('file://'))return decodeURIComponent(s.slice(7));" +
			"if(s.startsWith('/'))return s;" +
			"throw new TypeError('The URL must be of scheme file');};" +
			"u.pathToFileURL=function(p){return new URL('file://'+encodeURI(p));};" +
			"u.format=function(u,o){if(typeof u==='string')return u;if(u instanceof URL)return u.toString();return '';};" +
			"u.parse=function(s){try{var p=new URL(s);return{protocol:p.protocol,hostname:p.hostname,port:p.port,pathname:p.pathname,search:p.search,hash:p.hash,href:p.href};}catch{return null;}};" +
			"u.resolve=function(from,to){return new URL(to,from).toString();};" +
			"u.domainToASCII=function(d){return d;};" +
			"u.domainToUnicode=function(d){return d;};" +
			"u.Url=function(){};" +
			"u.resolveObject=function(){return{};};" +
			"return u;})()";
		return buildWrapperSource(binding, BUILTIN_NAMED_EXPORTS.url);
	})(),
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
