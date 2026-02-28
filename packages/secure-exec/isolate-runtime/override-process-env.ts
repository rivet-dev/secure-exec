const __envPatch = (globalThis as Record<string, unknown>).__runtimeProcessEnvOverride;
if (__envPatch && typeof __envPatch === "object") {
	Object.assign(process.env, __envPatch as Record<string, string>);
}
