// Kernel — VFS, process table, FD table, device layer, pipes, PTY, command registry, permissions.
export { createKernel } from "./kernel/kernel.js";
export type {
	Kernel,
	KernelOptions,
	KernelInterface,
	KernelLogger,
	ExecOptions as KernelExecOptions,
	ExecResult as KernelExecResult,
	SpawnOptions as KernelSpawnOptions,
	ManagedProcess,
	RuntimeDriver as KernelRuntimeDriver,
	ProcessContext,
	DriverProcess,
	ProcessEntry,
	ProcessInfo,
	FDStat,
	FileDescription,
	FDEntry,
	Pipe,
	PermissionDecision,
	PermissionCheck,
	FsAccessRequest,
	NetworkAccessRequest,
	ChildProcessAccessRequest,
	EnvAccessRequest,
	KernelErrorCode,
	Termios,
	TermiosCC,
	OpenShellOptions,
	ShellHandle,
	ConnectTerminalOptions,
	Permissions,
} from "./kernel/types.js";
export { KernelError, defaultTermios, noopKernelLogger } from "./kernel/types.js";
export type {
	VirtualFileSystem,
	VirtualDirEntry,
	VirtualStat,
} from "./kernel/vfs.js";

// Kernel components.
export { FDTableManager, ProcessFDTable } from "./kernel/fd-table.js";
export { ProcessTable } from "./kernel/process-table.js";
export { TimerTable } from "./kernel/timer-table.js";
export type { KernelTimer, TimerTableOptions } from "./kernel/timer-table.js";
export { createDeviceLayer } from "./kernel/device-layer.js";
export {
	createProcLayer,
	createProcessScopedFileSystem,
	resolveProcSelfPath,
} from "./kernel/proc-layer.js";
export { PipeManager } from "./kernel/pipe-manager.js";
export { PtyManager } from "./kernel/pty.js";
export type { LineDisciplineConfig } from "./kernel/pty.js";
export { CommandRegistry } from "./kernel/command-registry.js";
export { FileLockManager, LOCK_SH, LOCK_EX, LOCK_UN, LOCK_NB } from "./kernel/file-lock.js";
export { UserManager } from "./kernel/user.js";
export type { UserConfig } from "./kernel/user.js";

// Socket table (kernel TCP/UDP/Unix socket management).
export { SocketTable } from "./kernel/socket-table.js";
export {
	AF_INET, AF_INET6, AF_UNIX,
	SOCK_STREAM, SOCK_DGRAM,
} from "./kernel/socket-table.js";

// Host adapter interfaces (kernel network delegation).
export type {
	HostNetworkAdapter,
	HostSocket,
	HostListener,
	HostUdpSocket,
	DnsResult,
} from "./kernel/host-adapter.js";

// Kernel permission helpers (kernel-level, different from SDK-level shared/permissions).
export { checkChildProcess } from "./kernel/permissions.js";

// Kernel constants.
export {
	O_RDONLY, O_WRONLY, O_RDWR, O_CREAT, O_EXCL, O_TRUNC, O_APPEND, O_CLOEXEC,
	F_DUPFD, F_GETFD, F_SETFD, F_GETFL, F_DUPFD_CLOEXEC, FD_CLOEXEC,
	SEEK_SET, SEEK_CUR, SEEK_END,
	FILETYPE_UNKNOWN, FILETYPE_CHARACTER_DEVICE, FILETYPE_DIRECTORY,
	FILETYPE_REGULAR_FILE, FILETYPE_SYMBOLIC_LINK, FILETYPE_PIPE,
	SIGHUP, SIGINT, SIGQUIT, SIGKILL, SIGPIPE, SIGALRM, SIGTERM, SIGCHLD, SIGCONT, SIGSTOP, SIGTSTP, SIGWINCH,
	WNOHANG,
} from "./kernel/types.js";

// POSIX wstatus encoding/decoding.
export {
	encodeExitStatus, encodeSignalStatus,
	WIFEXITED, WEXITSTATUS, WIFSIGNALED, WTERMSIG,
} from "./kernel/wstatus.js";

// Core-only types (not duplicated in kernel).
export type {
	CommandExecutor,
	NetworkAdapter,
	NetworkServerAddress,
	NetworkServerListenOptions,
	NetworkServerRequest,
	NetworkServerResponse,
	SpawnedProcess,
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
	BridgeApplyRef,
	BridgeApplySyncPromiseRef,
	BridgeApplySyncRef,
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
