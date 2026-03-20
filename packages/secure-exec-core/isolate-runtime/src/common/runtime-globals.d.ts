export {};

import type {
	BatchResolveModulesBridgeRef,
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
	LoadFileBridgeRef,
	LoadPolyfillBridgeRef,
	ModuleCacheBridgeRecord,
	NetworkDnsLookupRawBridgeRef,
	NetworkFetchRawBridgeRef,
	NetworkHttpRequestRawBridgeRef,
	NetworkHttpServerCloseRawBridgeRef,
	NetworkHttpServerListenRawBridgeRef,
	ProcessErrorBridgeRef,
	ProcessLogBridgeRef,
	RegisterHandleBridgeFn,
	ResolveModuleBridgeRef,
	ScheduleTimerBridgeRef,
	UnregisterHandleBridgeFn,
	ChildProcessKillBridgeRef,
	ChildProcessSpawnStartBridgeRef,
	ChildProcessSpawnSyncBridgeRef,
	ChildProcessStdinCloseBridgeRef,
	ChildProcessStdinWriteBridgeRef,
} from "../../../src/shared/bridge-contract.js";

type RuntimeGlobalExposer = (name: string, value: unknown) => void;

type RuntimeBridgeSetupConfig = {
	initialCwd?: string;
	jsonPayloadLimitBytes?: number;
	payloadLimitErrorCode?: string;
};

type RuntimeCommonJsFileConfig = {
	filePath?: string;
	dirname?: string;
};

type RuntimeTimingMitigationConfig = {
	frozenTimeMs?: number;
};

type RuntimeCustomGlobalPolicy = {
	hardenedGlobals?: string[];
	mutableGlobals?: string[];
};

type RuntimeCurrentModule = Record<string, unknown> & {
	dirname?: string;
	filename?: string;
};

declare global {
	var __runtimeExposeCustomGlobal: RuntimeGlobalExposer | undefined;
	var __runtimeExposeMutableGlobal: RuntimeGlobalExposer | undefined;
	var __runtimeDynamicImportConfig: { referrerPath?: string } | undefined;
	var _dynamicImport: DynamicImportBridgeRef;
	var _loadPolyfill: LoadPolyfillBridgeRef;
	var _resolveModule: ResolveModuleBridgeRef;
	var _loadFile: LoadFileBridgeRef;
	var _scheduleTimer: ScheduleTimerBridgeRef;
	var _cryptoRandomFill: CryptoRandomFillBridgeRef;
	var _cryptoRandomUUID: CryptoRandomUuidBridgeRef;
	var _networkFetchRaw: NetworkFetchRawBridgeRef;
	var _networkDnsLookupRaw: NetworkDnsLookupRawBridgeRef;
	var _networkHttpRequestRaw: NetworkHttpRequestRawBridgeRef;
	var _networkHttpServerListenRaw: NetworkHttpServerListenRawBridgeRef;
	var _networkHttpServerCloseRaw: NetworkHttpServerCloseRawBridgeRef;
	var _childProcessSpawnStart: ChildProcessSpawnStartBridgeRef;
	var _childProcessStdinWrite: ChildProcessStdinWriteBridgeRef;
	var _childProcessStdinClose: ChildProcessStdinCloseBridgeRef;
	var _childProcessKill: ChildProcessKillBridgeRef;
	var _childProcessSpawnSync: ChildProcessSpawnSyncBridgeRef;
	var _batchResolveModules: BatchResolveModulesBridgeRef;
	var _log: ProcessLogBridgeRef;
	var _error: ProcessErrorBridgeRef;
	var _maxHandles: number | undefined;
	var _registerHandle: RegisterHandleBridgeFn;
	var _unregisterHandle: UnregisterHandleBridgeFn;
	var require: ((request: string) => unknown) | undefined;
	var bridge: unknown;
	var __runtimeBridgeSetupConfig: RuntimeBridgeSetupConfig | undefined;
	var __runtimeCommonJsFileConfig: RuntimeCommonJsFileConfig | undefined;
	var __runtimeTimingMitigationConfig: RuntimeTimingMitigationConfig | undefined;
	var __runtimeCustomGlobalPolicy: RuntimeCustomGlobalPolicy | undefined;
	var __runtimeJsonPayloadLimitBytes: number | undefined;
	var __runtimePayloadLimitErrorCode: string | undefined;
	var __runtimeApplyConfig:
		| ((config: {
				timingMitigation?: string;
				frozenTimeMs?: number;
				payloadLimitBytes?: number;
				payloadLimitErrorCode?: string;
		  }) => void)
		| undefined;
	var __runtimeResetProcessState: (() => void) | undefined;
	var __runtimeProcessCwdOverride: unknown;
	var __runtimeProcessEnvOverride: unknown;
	var __runtimeStdinData: unknown;
	var __runtimeExecCode: unknown;
	var __scriptResult__: unknown;

	var _stdinData: unknown;
	var _stdinPosition: number;
	var _stdinEnded: boolean;
	var _stdinFlowMode: boolean;

	var _fsReadFile: FsReadFileBridgeRef;
	var _fsWriteFile: FsWriteFileBridgeRef;
	var _fsReadFileBinary: FsReadFileBinaryBridgeRef;
	var _fsWriteFileBinary: FsWriteFileBinaryBridgeRef;
	var _fsReadDir: FsReadDirBridgeRef;
	var _fsMkdir: FsMkdirBridgeRef;
	var _fsRmdir: FsRmdirBridgeRef;
	var _fsExists: FsExistsBridgeRef;
	var _fsStat: FsStatBridgeRef;
	var _fsUnlink: FsUnlinkBridgeRef;
	var _fsRename: FsRenameBridgeRef;
	var _fsChmod: FsChmodBridgeRef;
	var _fsChown: FsChownBridgeRef;
	var _fsLink: FsLinkBridgeRef;
	var _fsSymlink: FsSymlinkBridgeRef;
	var _fsReadlink: FsReadlinkBridgeRef;
	var _fsLstat: FsLstatBridgeRef;
	var _fsTruncate: FsTruncateBridgeRef;
	var _fsUtimes: FsUtimesBridgeRef;
	var _fs: FsFacadeBridge | undefined;

	var _moduleCache: ModuleCacheBridgeRecord | undefined;
	var _pendingModules: Record<string, unknown> | undefined;
	var _currentModule: RuntimeCurrentModule | undefined;

	var module: { exports: unknown };
	var exports: unknown;
}
