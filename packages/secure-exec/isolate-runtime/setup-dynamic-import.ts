const __runtimeExposeCustomGlobal =
	typeof (globalThis as Record<string, unknown>).__runtimeExposeCustomGlobal ===
	"function"
		? ((globalThis as Record<string, unknown>).__runtimeExposeCustomGlobal as (
				name: string,
				value: unknown,
		  ) => void)
		: (name: string, value: unknown) => {
				Object.defineProperty(globalThis, name, {
					value,
					writable: false,
					configurable: false,
					enumerable: true,
				});
		  };

const __dynamicImportConfig =
	((globalThis as Record<string, unknown>).__runtimeDynamicImportConfig as {
		referrerPath?: string;
	}) ?? {};

const __fallbackReferrer =
	typeof __dynamicImportConfig.referrerPath === "string" &&
	__dynamicImportConfig.referrerPath.length > 0
		? __dynamicImportConfig.referrerPath
		: "/";

const __dynamicImportHandler = async function (
	specifier: unknown,
	fromPath: unknown,
): Promise<unknown> {
	const request = String(specifier);
	const referrer =
		typeof fromPath === "string" && fromPath.length > 0
			? fromPath
			: __fallbackReferrer;
	const allowRequireFallback =
		request.endsWith(".cjs") || request.endsWith(".json");

	const namespace = await (
		(globalThis as Record<string, unknown>)._dynamicImport as {
			apply(
				ignored: undefined,
				args: [string, string],
				options: { result: { promise: true } },
			): Promise<unknown>;
		}
	).apply(undefined, [request, referrer], { result: { promise: true } });

	if (namespace !== null) {
		return namespace;
	}

	if (!allowRequireFallback) {
		throw new Error("Cannot find module '" + request + "'");
	}

	const mod = (globalThis as Record<string, unknown>).require(request) as
		| Record<string, unknown>
		| unknown;
	const namespaceFallback: Record<string, unknown> = { default: mod };
	if (mod !== null && (typeof mod === "object" || typeof mod === "function")) {
		for (const key of Object.keys(mod as Record<string, unknown>)) {
			if (!(key in namespaceFallback)) {
				namespaceFallback[key] = (mod as Record<string, unknown>)[key];
			}
		}
	}
	return namespaceFallback;
};

__runtimeExposeCustomGlobal("__dynamicImport", __dynamicImportHandler);
