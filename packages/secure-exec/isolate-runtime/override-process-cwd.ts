const __cwd = (globalThis as Record<string, unknown>).__runtimeProcessCwdOverride;
if (typeof __cwd === "string") {
	process.cwd = () => __cwd;
}
