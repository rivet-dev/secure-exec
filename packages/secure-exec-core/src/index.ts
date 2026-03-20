// Core types.
export type {
	ChildProcessAccessRequest,
	CommandExecutor,
	EnvAccessRequest,
	FsAccessRequest,
	NetworkAccessRequest,
	NetworkAdapter,
	NetworkServerAddress,
	NetworkServerListenOptions,
	NetworkServerRequest,
	NetworkServerResponse,
	PermissionCheck,
	PermissionDecision,
	Permissions,
	SpawnedProcess,
	VirtualDirEntry,
	VirtualFileSystem,
	VirtualStat,
} from "./types.js";

// Runtime driver types.
export type {
	DriverRuntimeConfig,
	NodeRuntimeDriver,
	NodeRuntimeDriverFactory,
	PythonRuntimeDriver,
	PythonRuntimeDriverFactory,
	ResourceBudgets,
	RuntimeDriver,
	RuntimeDriverFactory,
	RuntimeDriverOptions,
	SharedRuntimeDriver,
	SystemDriver,
} from "./runtime-driver.js";

// API types.
export type {
	ExecOptions,
	ExecResult,
	ExecutionStatus,
	OSConfig,
	ProcessConfig,
	PythonRunOptions,
	PythonRunResult,
	RunResult,
	StdioChannel,
	StdioEvent,
	StdioHook,
	TimingMitigation,
} from "./shared/api-types.js";

// Shared constants.
export {
	TIMEOUT_EXIT_CODE,
	TIMEOUT_ERROR_MESSAGE,
} from "./shared/constants.js";

// Shared utilities.
export {
	createInMemoryFileSystem,
	InMemoryFileSystem,
} from "./shared/in-memory-fs.js";

export {
	allowAll,
	allowAllChildProcess,
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
	createCommandExecutorStub,
	createFsStub,
	createNetworkStub,
	envAccessAllowed,
	filterEnv,
	wrapCommandExecutor,
	wrapFileSystem,
	wrapNetworkAdapter,
} from "./shared/permissions.js";

export type { SystemError } from "./shared/errors.js";
export {
	createEaccesError,
	createEnosysError,
	createSystemError,
} from "./shared/errors.js";

export {
	extractCjsNamedExports,
	extractDynamicImportSpecifiers,
	isESM,
	transformDynamicImport,
	wrapCJSForESM,
	wrapCJSForESMWithModulePath,
} from "./shared/esm-utils.js";

export { getRequireSetupCode } from "./shared/require-setup.js";

// Console formatter.
export type { ConsoleSerializationBudget } from "./shared/console-formatter.js";
export {
	DEFAULT_CONSOLE_SERIALIZATION_BUDGET,
	formatConsoleArgs,
	getConsoleSetupCode,
	safeStringifyConsoleValue,
} from "./shared/console-formatter.js";

// Bridge contract.
export type {
	BridgeGlobalKey,
	ChildProcessKillBridgeRef,
	ChildProcessSpawnStartBridgeRef,
	ChildProcessSpawnSyncBridgeRef,
	ChildProcessStdinCloseBridgeRef,
	ChildProcessStdinWriteBridgeRef,
	CryptoRandomFillBridgeRef,
	CryptoRandomUuidBridgeRef,
	DynamicImportBridgeRef,
	FsChmodBridgeRef,
	FsChownBridgeRef,
	FsExistsBridgeRef,
	FsFacadeBridge,
	FsLinkBridgeRef,
	FsLstatBridgeRef,
	FsMkdirBridgeRef,
	FsReadDirBridgeRef,
	FsReadFileBinaryBridgeRef,
	FsReadFileBridgeRef,
	FsReadlinkBridgeRef,
	FsRenameBridgeRef,
	FsRmdirBridgeRef,
	FsStatBridgeRef,
	FsSymlinkBridgeRef,
	FsTruncateBridgeRef,
	FsUnlinkBridgeRef,
	FsUtimesBridgeRef,
	FsWriteFileBinaryBridgeRef,
	FsWriteFileBridgeRef,
	HostBridgeGlobalKey,
	LoadFileBridgeRef,
	LoadPolyfillBridgeRef,
	ModuleCacheBridgeRecord,
	NetworkDnsLookupRawBridgeRef,
	NetworkFetchRawBridgeRef,
	NetworkHttpRequestRawBridgeRef,
	NetworkHttpServerCloseRawBridgeRef,
	NetworkHttpServerListenRawBridgeRef,
	UpgradeSocketWriteRawBridgeRef,
	UpgradeSocketEndRawBridgeRef,
	UpgradeSocketDestroyRawBridgeRef,
	ProcessErrorBridgeRef,
	ProcessLogBridgeRef,
	RegisterHandleBridgeFn,
	RequireFromBridgeFn,
	ResolveModuleBridgeRef,
	RuntimeBridgeGlobalKey,
	ScheduleTimerBridgeRef,
	UnregisterHandleBridgeFn,
	ValueOf,
} from "./shared/bridge-contract.js";
export {
	BRIDGE_GLOBAL_KEY_LIST,
	HOST_BRIDGE_GLOBAL_KEY_LIST,
	HOST_BRIDGE_GLOBAL_KEYS,
	RUNTIME_BRIDGE_GLOBAL_KEY_LIST,
	RUNTIME_BRIDGE_GLOBAL_KEYS,
} from "./shared/bridge-contract.js";

// Global exposure.
export type {
	CustomGlobalClassification,
	CustomGlobalInventoryEntry,
} from "./shared/global-exposure.js";
export {
	exposeCustomGlobal,
	exposeGlobalBinding,
	exposeMutableRuntimeStateGlobal,
	HARDENED_NODE_CUSTOM_GLOBALS,
	ISOLATE_GLOBAL_EXPOSURE_HELPER_SOURCE,
	MUTABLE_NODE_CUSTOM_GLOBALS,
	NODE_CUSTOM_GLOBAL_INVENTORY,
} from "./shared/global-exposure.js";

// Generated isolate runtime.
export type { IsolateRuntimeSourceId } from "./generated/isolate-runtime.js";
export {
	getIsolateRuntimeSource,
	ISOLATE_RUNTIME_SOURCES,
} from "./generated/isolate-runtime.js";

// Generated polyfills.
export { POLYFILL_CODE_MAP } from "./generated/polyfills.js";

// Runtime facades.
export { NodeRuntime } from "./runtime.js";
export type { NodeRuntimeOptions } from "./runtime.js";
export { PythonRuntime } from "./python-runtime.js";
export type { PythonRuntimeOptions } from "./python-runtime.js";

// Filesystem helpers.
export type { DirEntry, StatInfo } from "./fs-helpers.js";
export { exists, stat, rename, readDirWithTypes, mkdir } from "./fs-helpers.js";

// Module resolution.
export {
	BUILTIN_NAMED_EXPORTS,
	normalizeBuiltinSpecifier,
	getPathDir,
} from "./module-resolver.js";

// ESM compiler.
export {
	getStaticBuiltinWrapperSource,
	createBuiltinESMWrapper,
	getEmptyBuiltinESMWrapper,
} from "./esm-compiler.js";

// Package bundler (VFS module resolution).
export type { ResolutionCache } from "./package-bundler.js";
export {
	createResolutionCache,
	resolveModule,
	loadFile,
	bundlePackage,
} from "./package-bundler.js";

// Bridge setup.
export { getInitialBridgeGlobalsSetupCode } from "./bridge-setup.js";
