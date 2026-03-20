// V8 execution loop
export { executeWithRuntime } from "./execution.js";

// V8 isolate utilities
export {
	DEFAULT_TIMING_MITIGATION,
	TIMEOUT_EXIT_CODE,
	TIMEOUT_ERROR_MESSAGE,
	ExecutionTimeoutError,
	createIsolate,
	getExecutionDeadlineMs,
	getExecutionRunOptions,
	runWithExecutionDeadline,
	isExecutionTimeoutError,
} from "./isolate.js";

// Bridge compilation
export { getRawBridgeCode, getBridgeAttachCode } from "./bridge-loader.js";

// Stdlib polyfill bundling
export {
	bundlePolyfill,
	getAvailableStdlib,
	hasPolyfill,
	prebundleAllPolyfills,
} from "./polyfills.js";

// Node execution driver
export { NodeExecutionDriver, composeStaticBridgeCode, composePostRestoreScript, composeBridgeCodeForWarmup, disposeSharedV8Runtime } from "./execution-driver.js";
export type { NodeExecutionDriverOptions } from "./isolate-bootstrap.js";

// Node system driver
export {
	createDefaultNetworkAdapter,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
	NodeFileSystem,
	filterEnv,
	isPrivateIp,
} from "./driver.js";
export type {
	NodeDriverOptions,
	NodeRuntimeDriverFactoryOptions,
} from "./driver.js";

// Module access filesystem
export { ModuleAccessFileSystem } from "./module-access.js";
export type { ModuleAccessOptions } from "./module-access.js";
