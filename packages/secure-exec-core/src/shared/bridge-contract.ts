/**
 * Bridge contract: typed declarations for the globals shared between the
 * host (Node.js) and the isolate (sandbox V8 context).
 *
 * Two categories:
 * - Host bridge globals: set by the host before bridge code runs (fs fns, timers, etc.)
 * - Runtime bridge globals: installed by the bridge bundle itself (active handles, modules, etc.)
 *
 * Each type alias is a plain function signature. The Rust V8 runtime registers
 * these as real JS functions on the global; bridge code calls them directly.
 */

export type ValueOf<T> = T[keyof T];

function valuesOf<T extends Record<string, string>>(object: T): Array<ValueOf<T>> {
	return Object.values(object) as Array<ValueOf<T>>;
}

/** Globals injected by the host before the bridge bundle executes. */
export const HOST_BRIDGE_GLOBAL_KEYS = {
	dynamicImport: "_dynamicImport",
	loadPolyfill: "_loadPolyfill",
	resolveModule: "_resolveModule",
	loadFile: "_loadFile",
	scheduleTimer: "_scheduleTimer",
	cryptoRandomFill: "_cryptoRandomFill",
	cryptoRandomUuid: "_cryptoRandomUUID",
	fsReadFile: "_fsReadFile",
	fsWriteFile: "_fsWriteFile",
	fsReadFileBinary: "_fsReadFileBinary",
	fsWriteFileBinary: "_fsWriteFileBinary",
	fsReadDir: "_fsReadDir",
	fsMkdir: "_fsMkdir",
	fsRmdir: "_fsRmdir",
	fsExists: "_fsExists",
	fsStat: "_fsStat",
	fsUnlink: "_fsUnlink",
	fsRename: "_fsRename",
	fsChmod: "_fsChmod",
	fsChown: "_fsChown",
	fsLink: "_fsLink",
	fsSymlink: "_fsSymlink",
	fsReadlink: "_fsReadlink",
	fsLstat: "_fsLstat",
	fsTruncate: "_fsTruncate",
	fsUtimes: "_fsUtimes",
	childProcessSpawnStart: "_childProcessSpawnStart",
	childProcessStdinWrite: "_childProcessStdinWrite",
	childProcessStdinClose: "_childProcessStdinClose",
	childProcessKill: "_childProcessKill",
	childProcessSpawnSync: "_childProcessSpawnSync",
	networkFetchRaw: "_networkFetchRaw",
	networkDnsLookupRaw: "_networkDnsLookupRaw",
	networkHttpRequestRaw: "_networkHttpRequestRaw",
	networkHttpServerListenRaw: "_networkHttpServerListenRaw",
	networkHttpServerCloseRaw: "_networkHttpServerCloseRaw",
	batchResolveModules: "_batchResolveModules",
	ptySetRawMode: "_ptySetRawMode",
	processConfig: "_processConfig",
	osConfig: "_osConfig",
	log: "_log",
	error: "_error",
} as const;

/** Globals exposed by the bridge bundle and runtime scripts inside the isolate. */
export const RUNTIME_BRIDGE_GLOBAL_KEYS = {
	registerHandle: "_registerHandle",
	unregisterHandle: "_unregisterHandle",
	waitForActiveHandles: "_waitForActiveHandles",
	getActiveHandles: "_getActiveHandles",
	childProcessDispatch: "_childProcessDispatch",
	childProcessModule: "_childProcessModule",
	moduleModule: "_moduleModule",
	osModule: "_osModule",
	httpModule: "_httpModule",
	httpsModule: "_httpsModule",
	http2Module: "_http2Module",
	dnsModule: "_dnsModule",
	httpServerDispatch: "_httpServerDispatch",
	fsFacade: "_fs",
	requireFrom: "_requireFrom",
	moduleCache: "_moduleCache",
	processExitError: "ProcessExitError",
} as const;

export type HostBridgeGlobalKey = ValueOf<typeof HOST_BRIDGE_GLOBAL_KEYS>;
export type RuntimeBridgeGlobalKey = ValueOf<typeof RUNTIME_BRIDGE_GLOBAL_KEYS>;
export type BridgeGlobalKey = HostBridgeGlobalKey | RuntimeBridgeGlobalKey;

export const HOST_BRIDGE_GLOBAL_KEY_LIST = valuesOf(HOST_BRIDGE_GLOBAL_KEYS);
export const RUNTIME_BRIDGE_GLOBAL_KEY_LIST = valuesOf(RUNTIME_BRIDGE_GLOBAL_KEYS);
export const BRIDGE_GLOBAL_KEY_LIST = [
	...HOST_BRIDGE_GLOBAL_KEY_LIST,
	...RUNTIME_BRIDGE_GLOBAL_KEY_LIST,
] as const;

// Module loading boundary contracts.
export type DynamicImportBridgeRef = (specifier: string, fromPath: string) => Promise<string | null>;
export type LoadPolyfillBridgeRef = (moduleName: string) => string | null;
export type ResolveModuleBridgeRef = (request: string, fromDir: string) => string | null;
export type LoadFileBridgeRef = (path: string) => string | null;
export type BatchResolveModulesRequest = [specifier: string, referrer: string];
export type BatchResolveModulesResult = { resolved: string; source: string } | null;
export type BatchResolveModulesBridgeRef = (requests: BatchResolveModulesRequest[]) => Promise<BatchResolveModulesResult[]>;
export type RequireFromBridgeFn = (request: string, dirname: string) => unknown;
export type ModuleCacheBridgeRecord = Record<string, unknown>;

// Process/console/entropy boundary contracts.
export type ProcessLogBridgeRef = (msg: string) => void;
export type ProcessErrorBridgeRef = (msg: string) => void;
export type ScheduleTimerBridgeRef = (delayMs: number) => Promise<void>;
export type CryptoRandomFillBridgeRef = (byteLength: number) => Uint8Array;
export type CryptoRandomUuidBridgeRef = () => string;

// Filesystem boundary contracts.
export type FsReadFileBridgeRef = (path: string) => string;
export type FsWriteFileBridgeRef = (path: string, content: string) => void;
export type FsReadFileBinaryBridgeRef = (path: string) => Uint8Array;
export type FsWriteFileBinaryBridgeRef = (path: string, content: Uint8Array) => void;
export type FsReadDirEntry = { name: string; isDirectory: boolean };
export type FsReadDirBridgeRef = (path: string) => FsReadDirEntry[];
export type FsMkdirBridgeRef = (path: string, recursive: boolean) => void;
export type FsRmdirBridgeRef = (path: string) => void;
export type FsExistsBridgeRef = (path: string) => boolean;
export type FsStatResult = { mode: number; size: number; isDirectory: boolean; atimeMs: number; mtimeMs: number; ctimeMs: number; birthtimeMs: number };
export type FsStatBridgeRef = (path: string) => FsStatResult;
export type FsUnlinkBridgeRef = (path: string) => void;
export type FsRenameBridgeRef = (oldPath: string, newPath: string) => void;
export type FsChmodBridgeRef = (path: string, mode: number) => void;
export type FsChownBridgeRef = (path: string, uid: number, gid: number) => void;
export type FsLinkBridgeRef = (existingPath: string, newPath: string) => void;
export type FsSymlinkBridgeRef = (target: string, path: string) => void;
export type FsReadlinkBridgeRef = (path: string) => string;
export type FsLstatResult = FsStatResult & { isSymbolicLink: boolean };
export type FsLstatBridgeRef = (path: string) => FsLstatResult;
export type FsTruncateBridgeRef = (path: string, length: number) => void;
export type FsUtimesBridgeRef = (path: string, atime: number, mtime: number) => void;

/** Combined filesystem bridge facade installed as `globalThis._fs` in the isolate. */
export interface FsFacadeBridge {
	readFile: FsReadFileBridgeRef;
	writeFile: FsWriteFileBridgeRef;
	readFileBinary: FsReadFileBinaryBridgeRef;
	writeFileBinary: FsWriteFileBinaryBridgeRef;
	readDir: FsReadDirBridgeRef;
	mkdir: FsMkdirBridgeRef;
	rmdir: FsRmdirBridgeRef;
	exists: FsExistsBridgeRef;
	stat: FsStatBridgeRef;
	unlink: FsUnlinkBridgeRef;
	rename: FsRenameBridgeRef;
	chmod: FsChmodBridgeRef;
	chown: FsChownBridgeRef;
	link: FsLinkBridgeRef;
	symlink: FsSymlinkBridgeRef;
	readlink: FsReadlinkBridgeRef;
	lstat: FsLstatBridgeRef;
	truncate: FsTruncateBridgeRef;
	utimes: FsUtimesBridgeRef;
}

// Child process boundary contracts.
export type ChildProcessSpawnStartBridgeRef = (command: string, argsJson: string, optionsJson: string) => number;
export type ChildProcessStdinWriteBridgeRef = (sessionId: number, data: Uint8Array) => void;
export type ChildProcessStdinCloseBridgeRef = (sessionId: number) => void;
export type ChildProcessKillBridgeRef = (sessionId: number, signal: number) => void;
export type SpawnSyncBridgeResult = { stdout: string; stderr: string; code: number; maxBufferExceeded?: boolean };
export type ChildProcessSpawnSyncBridgeRef = (command: string, argsJson: string, optionsJson: string) => SpawnSyncBridgeResult;

// Network boundary contracts.
export type NetworkFetchResult = { ok: boolean; status: number; statusText: string; headers?: Record<string, string>; url?: string; redirected?: boolean; body?: string };
export type NetworkFetchRawBridgeRef = (url: string, optionsJson: string) => Promise<NetworkFetchResult>;
export type NetworkDnsLookupResult = { error?: string; code?: string; address?: string; family?: number };
export type NetworkDnsLookupRawBridgeRef = (hostname: string) => Promise<NetworkDnsLookupResult>;
export type NetworkHttpRequestResult = { headers?: Record<string, string>; url?: string; status?: number; statusText?: string; body?: string; trailers?: Record<string, string> };
export type NetworkHttpRequestRawBridgeRef = (url: string, optionsJson: string) => Promise<NetworkHttpRequestResult>;
export type NetworkHttpServerListenResult = { address: { address: string; family: string; port: number } | null };
export type NetworkHttpServerListenRawBridgeRef = (optionsJson: string) => Promise<NetworkHttpServerListenResult>;
export type NetworkHttpServerCloseRawBridgeRef = (serverId: number) => Promise<void>;

// PTY boundary contracts.
export type PtySetRawModeBridgeRef = (mode: boolean) => void;

// Active-handle lifecycle globals exposed by the bridge.
export type RegisterHandleBridgeFn = (id: string, description: string) => void;
export type UnregisterHandleBridgeFn = (id: string) => void;
