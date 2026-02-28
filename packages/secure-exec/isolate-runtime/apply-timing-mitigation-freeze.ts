const __timingConfig =
	((globalThis as Record<string, unknown>).__runtimeTimingMitigationConfig as {
		frozenTimeMs?: number;
	}) ?? {};

const __frozenTimeMs =
	typeof __timingConfig.frozenTimeMs === "number" &&
	Number.isFinite(__timingConfig.frozenTimeMs)
		? __timingConfig.frozenTimeMs
		: Date.now();
const __frozenDateNow = () => __frozenTimeMs;

try {
	Object.defineProperty(Date, "now", {
		value: __frozenDateNow,
		configurable: true,
		writable: true,
	});
} catch {
	Date.now = __frozenDateNow;
}

const __frozenPerformanceNow = () => 0;
if (
	typeof (globalThis as Record<string, unknown>).performance !== "undefined" &&
	(globalThis as Record<string, unknown>).performance !== null
) {
	try {
		Object.defineProperty(
			(globalThis as Record<string, unknown>).performance as object,
			"now",
			{
				value: __frozenPerformanceNow,
				configurable: true,
				writable: true,
			},
		);
	} catch {
		try {
			(
				(globalThis as Record<string, unknown>).performance as {
					now?: () => number;
				}
			).now = __frozenPerformanceNow;
		} catch {}
	}
} else {
	(globalThis as Record<string, unknown>).performance = {
		now: __frozenPerformanceNow,
	};
}

try {
	delete (globalThis as Record<string, unknown>).SharedArrayBuffer;
} catch {
	(globalThis as Record<string, unknown>).SharedArrayBuffer = undefined;
}
