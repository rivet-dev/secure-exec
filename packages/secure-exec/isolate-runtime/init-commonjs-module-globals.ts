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

__runtimeExposeMutableGlobal("module", { exports: {} });
__runtimeExposeMutableGlobal(
	"exports",
	((globalThis as Record<string, unknown>).module as { exports: unknown }).exports,
);
