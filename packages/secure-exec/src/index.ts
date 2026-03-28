// Re-export core runtime surface.
export { NodeRuntime } from "./runtime.js";
export type { NodeRuntimeOptions } from "./runtime.js";
export type { ResourceBudgets } from "./runtime-driver.js";

// Re-export public types.
export type {
	NodeRuntimeDriver,
	NodeRuntimeDriverFactory,
	NetworkAdapter,
	Permissions,
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
	ProcessConfig,
	RunResult,
	TimingMitigation,
} from "./shared/api-types.js";

// Re-export Node driver factories.
export {
	createDefaultNetworkAdapter,
	createNodeDriver,
	createNodeHostCommandExecutor,
	createNodeRuntimeDriverFactory,
	NodeExecutionDriver,
	NodeFileSystem,
} from "@secure-exec/nodejs";
export type {
	DefaultNetworkAdapterOptions,
	ModuleAccessOptions,
	NodeRuntimeDriverFactoryOptions,
} from "@secure-exec/nodejs";

// Re-export kernel API.
export { createKernel } from "@secure-exec/core";
export type { Kernel, KernelInterface } from "@secure-exec/core";

// Re-export kernel Node runtime factory.
export { createNodeRuntime } from "@secure-exec/nodejs";
export type { BindingTree, BindingFunction } from "@secure-exec/nodejs";

export { createInMemoryFileSystem } from "./shared/in-memory-fs.js";
export {
	allowAll,
	allowAllChildProcess,
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
} from "./shared/permissions.js";
