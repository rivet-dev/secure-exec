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

if (typeof (globalThis as Record<string, unknown>).bridge !== "undefined") {
	__runtimeExposeCustomGlobal(
		"bridge",
		(globalThis as Record<string, unknown>).bridge,
	);
}
