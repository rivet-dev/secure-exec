(globalThis as Record<string, unknown>).__scriptResult__ = eval(
	String((globalThis as Record<string, unknown>).__runtimeExecCode),
);
