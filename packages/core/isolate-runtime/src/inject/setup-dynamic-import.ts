import { isObjectLike } from "../common/global-access";
import { getRuntimeExposeCustomGlobal } from "../common/global-exposure";

const __runtimeExposeCustomGlobal = getRuntimeExposeCustomGlobal();

const __dynamicImportConfig = globalThis.__runtimeDynamicImportConfig ?? {};

const __fallbackReferrer =
	typeof __dynamicImportConfig.referrerPath === "string" &&
	__dynamicImportConfig.referrerPath.length > 0
		? __dynamicImportConfig.referrerPath
		: "/";

const __dynamicImportCache = new Map<string, Record<string, unknown>>();
const __pathToFileURL:
	| ((path: string) => URL)
	| null =
	typeof globalThis.require === "function"
		? ((globalThis.require("node:url") as { pathToFileURL?: (path: string) => URL })
				.pathToFileURL ?? null)
		: null;

const __getModuleResolutionCache = function (): Record<string, string | null> {
	const globals = globalThis as Record<string, unknown>;
	const existing = globals.__runtimeModuleResolutionCache;
	if (existing && typeof existing === "object") {
		return existing as Record<string, string | null>;
	}
	const cache = Object.create(null) as Record<string, string | null>;
	globals.__runtimeModuleResolutionCache = cache;
	return cache;
};

const __canMemoizeResolution = function (
	request: string,
	referrer: string,
): boolean {
	return (
		typeof referrer === "string" &&
		referrer.includes("/node_modules/") &&
		typeof request === "string" &&
		request.length > 0
	);
};

const __getCachedResolution = function (
	request: string,
	referrer: string,
	mode: "require" | "import",
): string | null | undefined {
	if (!__canMemoizeResolution(request, referrer)) {
		return undefined;
	}
	const cache = __getModuleResolutionCache();
	const cacheKey = `${mode}\0${referrer}\0${request}`;
	if (!Object.prototype.hasOwnProperty.call(cache, cacheKey)) {
		return undefined;
	}
	return cache[cacheKey];
};

const __setCachedResolution = function (
	request: string,
	referrer: string,
	mode: "require" | "import",
	resolved: string | null,
): void {
	if (!__canMemoizeResolution(request, referrer)) {
		return;
	}
	const cache = __getModuleResolutionCache();
	cache[`${mode}\0${referrer}\0${request}`] = resolved;
};

const __resolveDynamicImportPath = function (
	request: string,
	referrer: string,
): string {
	if (!request.startsWith("./") && !request.startsWith("../") && !request.startsWith("/")) {
		return request;
	}

	const baseDir =
		referrer.endsWith("/")
			? referrer
			: referrer.slice(0, referrer.lastIndexOf("/")) || "/";
	const segments = baseDir.split("/").filter(Boolean);
	for (const part of request.split("/")) {
		if (part === "." || part.length === 0) continue;
		if (part === "..") {
			segments.pop();
			continue;
		}
		segments.push(part);
	}
	return `/${segments.join("/")}`;
};

const __dynamicImportHandler = function (
	specifier: unknown,
	fromPath: unknown,
): Promise<Record<string, unknown>> {
	const request = String(specifier);
	const referrer =
		typeof fromPath === "string" && fromPath.length > 0
			? fromPath
			: __fallbackReferrer;
	const requestCacheKey = `${referrer}\0${request}`;
	const cachedByRequest = __dynamicImportCache.get(requestCacheKey);
	if (cachedByRequest) return Promise.resolve(cachedByRequest);

	const cachedResolution = __getCachedResolution(request, referrer, "import");
	let resolved = cachedResolution;
	if (
		cachedResolution === undefined &&
		typeof globalThis._resolveModuleSync !== "undefined"
	) {
		resolved = globalThis._resolveModuleSync.applySync(
			undefined,
			[request, referrer, "import"],
		);
		__setCachedResolution(request, referrer, "import", resolved ?? null);
	}
	const resolvedPath =
		typeof resolved === "string" && resolved.length > 0
			? resolved
			: __resolveDynamicImportPath(request, referrer);
	const cacheKey =
		typeof resolved === "string" && resolved.length > 0
			? resolved
			: requestCacheKey;
	const cached = __dynamicImportCache.get(cacheKey);
	if (cached) return Promise.resolve(cached);

	if (typeof globalThis._requireFrom !== "function") {
		throw new Error("Cannot load module: " + resolvedPath);
	}

	let mod: unknown;
	try {
		mod = globalThis._requireFrom(resolved ?? request, referrer);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error);
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "MODULE_NOT_FOUND"
		) {
			throw new Error("Cannot load module: " + resolvedPath);
		}
		if (message.startsWith("Cannot find module ")) {
			throw new Error("Cannot load module: " + resolvedPath);
		}
		throw error;
	}

	const namespaceFallback: Record<string, unknown> = { default: mod };
	if (isObjectLike(mod)) {
		for (const key of Object.keys(mod)) {
			if (!(key in namespaceFallback)) {
				namespaceFallback[key] = mod[key];
			}
		}
	}
	__dynamicImportCache.set(requestCacheKey, namespaceFallback);
	__dynamicImportCache.set(cacheKey, namespaceFallback);
	return Promise.resolve(namespaceFallback);
};

const __importMetaResolveHandler = function (
	specifier: unknown,
	fromPath: unknown,
): string {
	const request = String(specifier);
	const referrer =
		typeof fromPath === "string" && fromPath.length > 0
			? fromPath
			: __fallbackReferrer;

	const cachedResolution = __getCachedResolution(request, referrer, "import");
	let resolved = cachedResolution;
	if (
		cachedResolution === undefined &&
		typeof globalThis._resolveModuleSync !== "undefined"
	) {
		resolved = globalThis._resolveModuleSync.applySync(
			undefined,
			[request, referrer, "import"],
		);
		__setCachedResolution(request, referrer, "import", resolved ?? null);
	}
	if (resolved === null || resolved === undefined) {
		resolved = globalThis._resolveModule.applySyncPromise(
			undefined,
			[request, referrer, "import"],
		);
		__setCachedResolution(request, referrer, "import", resolved ?? null);
	}
	if (resolved === null) {
		const err = new Error("Cannot find module '" + request + "'");
		(err as Error & { code?: string }).code = "MODULE_NOT_FOUND";
		throw err;
	}
	if (resolved.startsWith("node:")) {
		return resolved;
	}
	if (__pathToFileURL && resolved.startsWith("/")) {
		return __pathToFileURL(resolved).href;
	}
	return resolved;
};

__runtimeExposeCustomGlobal("__dynamicImport", __dynamicImportHandler);
__runtimeExposeCustomGlobal("__importMetaResolve", __importMetaResolveHandler);
