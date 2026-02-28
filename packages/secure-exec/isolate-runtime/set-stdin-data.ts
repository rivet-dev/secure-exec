if (typeof (globalThis as Record<string, unknown>)._stdinData !== "undefined") {
	(globalThis as Record<string, unknown>)._stdinData = (
		globalThis as Record<string, unknown>
	).__runtimeStdinData;
	(globalThis as Record<string, unknown>)._stdinPosition = 0;
	(globalThis as Record<string, unknown>)._stdinEnded = false;
	(globalThis as Record<string, unknown>)._stdinFlowMode = false;
}
