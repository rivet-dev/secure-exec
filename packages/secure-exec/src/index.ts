// Re-export core runtime surface.
export { NodeRuntime } from "./runtime.js";
export type { NodeRuntimeOptions } from "./runtime.js";
export type { ResourceBudgets } from "./runtime-driver.js";
// TODO: Re-enable once node-stdlib-browser ESM entry is fixed (mock/empty.js missing from published package).
// export { PythonRuntime } from "./python-runtime.js";
// export type { PythonRuntimeOptions } from "./python-runtime.js";

// Re-export public types.
export type {
	CommandExecutor,
	NodeRuntimeDriver,
	NodeRuntimeDriverFactory,
	NetworkAdapter,
	Permissions,
	// TODO: Re-enable once node-stdlib-browser ESM entry is fixed.
	// PythonRuntimeDriver,
	// PythonRuntimeDriverFactory,
	RuntimeDriver,
	RuntimeDriverFactory,
	SharedRuntimeDriver,
	SystemDriver,
	VirtualFileSystem,
} from "./types.js";
export type { DirEntry, StatInfo } from "./fs-helpers.js";
export type {
	StdioChannel,
	StdioEvent,
	StdioHook,
	ExecOptions,
	ExecResult,
	OSConfig,
	// TODO: Re-enable once node-stdlib-browser ESM entry is fixed.
	// PythonRunOptions,
	// PythonRunResult,
	ProcessConfig,
	RunResult,
	TimingMitigation,
} from "./shared/api-types.js";

// Re-export Node driver factories.
export {
	createDefaultNetworkAdapter,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
	NodeExecutionDriver,
	NodeFileSystem,
} from "@secure-exec/node";
export type {
	ModuleAccessOptions,
	NodeRuntimeDriverFactoryOptions,
} from "@secure-exec/node";

// TODO: Re-enable once node-stdlib-browser ESM entry is fixed (mock/empty.js missing from published package).
// Eagerly importing @secure-exec/python and @secure-exec/browser pulls in node-stdlib-browser,
// which crashes on Node.js. Use "secure-exec/python" or "secure-exec/browser" subpath imports instead.
// export {
// 	createPyodideRuntimeDriverFactory,
// 	PyodideRuntimeDriver,
// } from "@secure-exec/python";
//
// export {
// 	createBrowserDriver,
// 	createBrowserNetworkAdapter,
// 	createBrowserRuntimeDriverFactory,
// 	createOpfsFileSystem,
// } from "@secure-exec/browser";
// export type {
// 	BrowserDriverOptions,
// 	BrowserRuntimeDriverFactoryOptions,
// 	BrowserRuntimeSystemOptions,
// } from "@secure-exec/browser";

export { createInMemoryFileSystem } from "./shared/in-memory-fs.js";
export {
	allowAll,
	allowAllChildProcess,
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
} from "./shared/permissions.js";
