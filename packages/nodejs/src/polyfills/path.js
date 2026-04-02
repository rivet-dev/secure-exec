// Custom path polyfill wrapper — adds Node.js ERR_* error codes to path-browserify errors
// Fixes https://github.com/rivet-dev/secure-exec/issues/28
//
// path-browserify throws plain TypeError for invalid arguments.
// Real Node.js attaches a `.code` property (e.g., ERR_INVALID_ARG_TYPE).
// This wrapper catches those errors and adds the missing code before re-throwing.

import pathBrowserify from "__secure_exec_path_browserify__";

function wrapPathFn(fn) {
	return function () {
		try {
			return fn.apply(this, arguments);
		} catch (err) {
			if (err instanceof TypeError && !err.code) {
				err.code = "ERR_INVALID_ARG_TYPE";
			}
			throw err;
		}
	};
}

// Build wrapped module that mirrors path-browserify's exports
const wrapped = {};
const keys = Object.keys(pathBrowserify);
for (let i = 0; i < keys.length; i++) {
	const key = keys[i];
	if (typeof pathBrowserify[key] === "function") {
		wrapped[key] = wrapPathFn(pathBrowserify[key]);
	} else {
		wrapped[key] = pathBrowserify[key];
	}
}

// Wrap posix sub-object functions too (path.posix.join, etc.)
if (pathBrowserify.posix && typeof pathBrowserify.posix === "object") {
	const wrappedPosix = {};
	const posixKeys = Object.keys(pathBrowserify.posix);
	for (let j = 0; j < posixKeys.length; j++) {
		const pk = posixKeys[j];
		if (typeof pathBrowserify.posix[pk] === "function") {
			wrappedPosix[pk] = wrapPathFn(pathBrowserify.posix[pk]);
		} else {
			wrappedPosix[pk] = pathBrowserify.posix[pk];
		}
	}
	wrappedPosix.posix = wrappedPosix;
	wrapped.posix = wrappedPosix;
} else {
	// path-browserify sets posix = module.exports (self-reference)
	wrapped.posix = wrapped;
}

// Preserve standard path properties
wrapped.sep = pathBrowserify.sep || "/";
wrapped.delimiter = pathBrowserify.delimiter || ":";

// Named exports for common path functions
export const join = wrapped.join;
export const resolve = wrapped.resolve;
export const normalize = wrapped.normalize;
export const isAbsolute = wrapped.isAbsolute;
export const relative = wrapped.relative;
export const dirname = wrapped.dirname;
export const basename = wrapped.basename;
export const extname = wrapped.extname;
export const parse = wrapped.parse;
export const format = wrapped.format;
export const toNamespacedPath = wrapped.toNamespacedPath;
export const sep = wrapped.sep;
export const delimiter = wrapped.delimiter;
export const posix = wrapped.posix;

export default wrapped;
