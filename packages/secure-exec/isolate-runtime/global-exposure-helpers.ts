const __runtimeExposeGlobalBinding = (
	name: string,
	value: unknown,
	mutable: boolean,
): void => {
	Object.defineProperty(globalThis, name, {
		value,
		writable: mutable,
		configurable: mutable,
		enumerable: true,
	});
};

const __runtimeExposeCustomGlobal = (name: string, value: unknown): void => {
	__runtimeExposeGlobalBinding(name, value, false);
};

const __runtimeExposeMutableGlobal = (name: string, value: unknown): void => {
	__runtimeExposeGlobalBinding(name, value, true);
};

if (typeof (globalThis as Record<string, unknown>).__runtimeExposeCustomGlobal !== "function") {
	__runtimeExposeGlobalBinding(
		"__runtimeExposeCustomGlobal",
		__runtimeExposeCustomGlobal,
		false,
	);
}

if (
	typeof (globalThis as Record<string, unknown>).__runtimeExposeMutableGlobal !==
	"function"
) {
	__runtimeExposeGlobalBinding(
		"__runtimeExposeMutableGlobal",
		__runtimeExposeMutableGlobal,
		false,
	);
}
