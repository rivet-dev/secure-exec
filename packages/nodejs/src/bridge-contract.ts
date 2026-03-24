/**
 * Bridge contract: typed declarations for the globals shared between the
 * host (Node.js) and the isolate (sandbox V8 context).
 *
 * Two categories:
 * - Host bridge globals: set by the host before bridge code runs (fs refs, timers, etc.)
 * - Runtime bridge globals: installed by the bridge bundle itself (active handles, modules, etc.)
 *
 * The typed `Ref` aliases describe the bridge calling convention for each global.
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
	cryptoHashDigest: "_cryptoHashDigest",
	cryptoHmacDigest: "_cryptoHmacDigest",
	cryptoPbkdf2: "_cryptoPbkdf2",
	cryptoScrypt: "_cryptoScrypt",
	cryptoCipheriv: "_cryptoCipheriv",
	cryptoDecipheriv: "_cryptoDecipheriv",
	cryptoCipherivCreate: "_cryptoCipherivCreate",
	cryptoCipherivUpdate: "_cryptoCipherivUpdate",
	cryptoCipherivFinal: "_cryptoCipherivFinal",
	cryptoSign: "_cryptoSign",
	cryptoVerify: "_cryptoVerify",
	cryptoGenerateKeyPairSync: "_cryptoGenerateKeyPairSync",
	cryptoSubtle: "_cryptoSubtle",
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
	upgradeSocketWriteRaw: "_upgradeSocketWriteRaw",
	upgradeSocketEndRaw: "_upgradeSocketEndRaw",
	upgradeSocketDestroyRaw: "_upgradeSocketDestroyRaw",
	netSocketConnectRaw: "_netSocketConnectRaw",
	netSocketWriteRaw: "_netSocketWriteRaw",
	netSocketEndRaw: "_netSocketEndRaw",
	netSocketDestroyRaw: "_netSocketDestroyRaw",
	netSocketUpgradeTlsRaw: "_netSocketUpgradeTlsRaw",
	resolveModuleSync: "_resolveModuleSync",
	loadFileSync: "_loadFileSync",
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
	httpServerUpgradeDispatch: "_httpServerUpgradeDispatch",
	upgradeSocketData: "_upgradeSocketData",
	upgradeSocketEnd: "_upgradeSocketEnd",
	netSocketDispatch: "_netSocketDispatch",
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

/** A bridge Reference that resolves async via `{ result: { promise: true } }`. */
export interface BridgeApplyRef<TArgs extends unknown[], TResult> {
	apply(
		ctx: undefined,
		args: TArgs,
		options: { result: { promise: true } },
	): Promise<TResult>;
}

/** A bridge Reference called synchronously (blocks the isolate). */
export interface BridgeApplySyncRef<TArgs extends unknown[], TResult> {
	applySync(ctx: undefined, args: TArgs): TResult;
}

/**
 * A bridge Reference that blocks the isolate while the host resolves
 * a Promise. Used for sync-looking APIs (require, readFileSync) that need
 * async host operations.
 */
export interface BridgeApplySyncPromiseRef<TArgs extends unknown[], TResult> {
	applySyncPromise(ctx: undefined, args: TArgs): TResult;
}

// Module loading boundary contracts.
export type DynamicImportBridgeRef = BridgeApplyRef<
	[string, string],
	Record<string, unknown> | null
>;
export type LoadPolyfillBridgeRef = BridgeApplyRef<[string], string | null>;
export type ResolveModuleBridgeRef = BridgeApplySyncPromiseRef<
	[string, string],
	string | null
>;
export type LoadFileBridgeRef = BridgeApplySyncPromiseRef<[string], string | null>;
export type RequireFromBridgeFn = (request: string, dirname: string) => unknown;
export type ModuleCacheBridgeRecord = Record<string, unknown>;

// Process/console/entropy boundary contracts.
export type ProcessLogBridgeRef = BridgeApplySyncRef<[string], void>;
export type ProcessErrorBridgeRef = BridgeApplySyncRef<[string], void>;
export type ScheduleTimerBridgeRef = BridgeApplyRef<[number], void>;
export type CryptoRandomFillBridgeRef = BridgeApplySyncRef<[number], string>;
export type CryptoRandomUuidBridgeRef = BridgeApplySyncRef<[], string>;
export type CryptoHashDigestBridgeRef = BridgeApplySyncRef<[string, string], string>;
export type CryptoHmacDigestBridgeRef = BridgeApplySyncRef<[string, string, string], string>;
export type CryptoPbkdf2BridgeRef = BridgeApplySyncRef<
	[string, string, number, number, string],
	string
>;
export type CryptoScryptBridgeRef = BridgeApplySyncRef<
	[string, string, number, string],
	string
>;
export type CryptoCipherivBridgeRef = BridgeApplySyncRef<
	[string, string, string, string],
	string
>;
export type CryptoDecipherivBridgeRef = BridgeApplySyncRef<
	[string, string, string, string, string],
	string
>;
export type CryptoCipherivCreateBridgeRef = BridgeApplySyncRef<
	[string, string, string, string, string],
	number
>;
export type CryptoCipherivUpdateBridgeRef = BridgeApplySyncRef<
	[number, string],
	string
>;
export type CryptoCipherivFinalBridgeRef = BridgeApplySyncRef<
	[number],
	string
>;
export type CryptoSignBridgeRef = BridgeApplySyncRef<
	[string, string, string],
	string
>;
export type CryptoVerifyBridgeRef = BridgeApplySyncRef<
	[string, string, string, string],
	boolean
>;
export type CryptoGenerateKeyPairSyncBridgeRef = BridgeApplySyncRef<
	[string, string],
	string
>;
export type CryptoSubtleBridgeRef = BridgeApplySyncRef<[string], string>;

// Filesystem boundary contracts.
export type FsReadFileBridgeRef = BridgeApplySyncPromiseRef<[string], string>;
export type FsWriteFileBridgeRef = BridgeApplySyncPromiseRef<[string, string], void>;
export type FsReadFileBinaryBridgeRef = BridgeApplySyncPromiseRef<[string], string>;
export type FsWriteFileBinaryBridgeRef = BridgeApplySyncPromiseRef<
	[string, string],
	void
>;
export type FsReadDirBridgeRef = BridgeApplySyncPromiseRef<[string], string>;
export type FsMkdirBridgeRef = BridgeApplySyncPromiseRef<[string, boolean], void>;
export type FsRmdirBridgeRef = BridgeApplySyncPromiseRef<[string], void>;
export type FsExistsBridgeRef = BridgeApplySyncPromiseRef<[string], boolean>;
export type FsStatBridgeRef = BridgeApplySyncPromiseRef<[string], string>;
export type FsUnlinkBridgeRef = BridgeApplySyncPromiseRef<[string], void>;
export type FsRenameBridgeRef = BridgeApplySyncPromiseRef<[string, string], void>;
export type FsChmodBridgeRef = BridgeApplySyncPromiseRef<[string, number], void>;
export type FsChownBridgeRef = BridgeApplySyncPromiseRef<[string, number, number], void>;
export type FsLinkBridgeRef = BridgeApplySyncPromiseRef<[string, string], void>;
export type FsSymlinkBridgeRef = BridgeApplySyncPromiseRef<[string, string], void>;
export type FsReadlinkBridgeRef = BridgeApplySyncPromiseRef<[string], string>;
export type FsLstatBridgeRef = BridgeApplySyncPromiseRef<[string], string>;
export type FsTruncateBridgeRef = BridgeApplySyncPromiseRef<[string, number], void>;
export type FsUtimesBridgeRef = BridgeApplySyncPromiseRef<[string, number, number], void>;

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
export type ChildProcessSpawnStartBridgeRef = BridgeApplySyncRef<
	[string, string, string],
	number
>;
export type ChildProcessStdinWriteBridgeRef = BridgeApplySyncRef<
	[number, Uint8Array],
	void
>;
export type ChildProcessStdinCloseBridgeRef = BridgeApplySyncRef<[number], void>;
export type ChildProcessKillBridgeRef = BridgeApplySyncRef<[number, number], void>;
export type ChildProcessSpawnSyncBridgeRef = BridgeApplySyncPromiseRef<
	[string, string, string],
	string
>;

// Network boundary contracts.
export type NetworkFetchRawBridgeRef = BridgeApplyRef<[string, string], string>;
export type NetworkDnsLookupRawBridgeRef = BridgeApplyRef<[string], string>;
export type NetworkHttpRequestRawBridgeRef = BridgeApplyRef<[string, string], string>;
export type NetworkHttpServerListenRawBridgeRef = BridgeApplyRef<[string], string>;
export type NetworkHttpServerCloseRawBridgeRef = BridgeApplyRef<[number], void>;
export type UpgradeSocketWriteRawBridgeRef = BridgeApplySyncRef<[number, string], void>;
export type UpgradeSocketEndRawBridgeRef = BridgeApplySyncRef<[number], void>;
export type UpgradeSocketDestroyRawBridgeRef = BridgeApplySyncRef<[number], void>;
export type NetSocketConnectRawBridgeRef = BridgeApplySyncRef<[string, number], number>;
export type NetSocketWriteRawBridgeRef = BridgeApplySyncRef<[number, string], void>;
export type NetSocketEndRawBridgeRef = BridgeApplySyncRef<[number], void>;
export type NetSocketDestroyRawBridgeRef = BridgeApplySyncRef<[number], void>;
export type NetSocketUpgradeTlsRawBridgeRef = BridgeApplySyncRef<[number, string], void>;
export type ResolveModuleSyncBridgeRef = BridgeApplySyncRef<
	[string, string],
	string | null
>;
export type LoadFileSyncBridgeRef = BridgeApplySyncRef<[string], string | null>;

// PTY boundary contracts.
export type PtySetRawModeBridgeRef = BridgeApplySyncRef<[boolean], void>;

// Active-handle lifecycle globals exposed by the bridge.
export type RegisterHandleBridgeFn = (id: string, description: string) => void;
export type UnregisterHandleBridgeFn = (id: string) => void;

// Batch module resolution.
export type BatchResolveModulesBridgeRef = BridgeApplySyncPromiseRef<
	[string],
	string
>;
