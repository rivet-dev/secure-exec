import { isObjectLike } from "../common/global-access";
import { getRuntimeExposeCustomGlobal } from "../common/global-exposure";

const __runtimeExposeCustomGlobal = getRuntimeExposeCustomGlobal();

const __dynamicImportConfig = globalThis.__runtimeDynamicImportConfig ?? {};

const __fallbackReferrer =
	typeof __dynamicImportConfig.referrerPath === "string" &&
	__dynamicImportConfig.referrerPath.length > 0
		? __dynamicImportConfig.referrerPath
		: "/";

const __dynamicImportHandler = async function (
	specifier: unknown,
	fromPath: unknown,
): Promise<Record<string, unknown>> {
	const request = String(specifier);
	const referrer =
		typeof fromPath === "string" && fromPath.length > 0
			? fromPath
			: __fallbackReferrer;
	const namespace = await globalThis._dynamicImport.apply(
		undefined,
		[request, referrer],
		{ result: { promise: true } },
	);

	if (namespace !== null) {
		return namespace;
	}

	// Always fall back to require() — handles both CJS packages and ESM
	// packages (the bridge converts ESM source to CJS at load time).
	const runtimeRequire = globalThis.require;
	if (typeof runtimeRequire !== "function") {
		throw new Error("Cannot find module '" + request + "'");
	}

	const mod = runtimeRequire(request);
	const namespaceFallback: Record<string, unknown> = { default: mod };
	if (isObjectLike(mod)) {
		for (const key of Object.keys(mod)) {
			if (!(key in namespaceFallback)) {
				namespaceFallback[key] = mod[key];
			}
		}
	}
	return namespaceFallback;
};

__runtimeExposeCustomGlobal("__dynamicImport", __dynamicImportHandler);
