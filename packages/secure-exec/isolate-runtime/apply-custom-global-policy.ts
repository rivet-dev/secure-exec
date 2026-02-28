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

const __runtimeExposeMutableGlobal =
	typeof (globalThis as Record<string, unknown>).__runtimeExposeMutableGlobal ===
	"function"
		? ((globalThis as Record<string, unknown>).__runtimeExposeMutableGlobal as (
				name: string,
				value: unknown,
		  ) => void)
		: (name: string, value: unknown) => {
				Object.defineProperty(globalThis, name, {
					value,
					writable: true,
					configurable: true,
					enumerable: true,
				});
		  };

const __globalPolicy =
	((globalThis as Record<string, unknown>).__runtimeCustomGlobalPolicy as {
		hardenedGlobals?: string[];
		mutableGlobals?: string[];
	}) ?? {};

const __hardenedGlobals = Array.isArray(__globalPolicy.hardenedGlobals)
	? __globalPolicy.hardenedGlobals
	: [];
const __mutableGlobals = Array.isArray(__globalPolicy.mutableGlobals)
	? __globalPolicy.mutableGlobals
	: [];

for (const globalName of __hardenedGlobals) {
	if (Object.prototype.hasOwnProperty.call(globalThis, globalName)) {
		__runtimeExposeCustomGlobal(
			globalName,
			(globalThis as Record<string, unknown>)[globalName],
		);
	}
}

for (const globalName of __mutableGlobals) {
	if (Object.prototype.hasOwnProperty.call(globalThis, globalName)) {
		__runtimeExposeMutableGlobal(
			globalName,
			(globalThis as Record<string, unknown>)[globalName],
		);
	}
}
