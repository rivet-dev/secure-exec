if (
	typeof (globalThis as Record<string, unknown>).performance === "undefined" ||
	(globalThis as Record<string, unknown>).performance === null
) {
	(globalThis as Record<string, unknown>).performance = {
		now: () => Date.now(),
	};
}
