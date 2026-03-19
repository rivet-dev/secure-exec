/**
 * wasmVM WasmCore host runtime.
 *
 * Exports the WASI polyfill and supporting types. The polyfill delegates
 * all OS-layer state (VFS, FD table, process table) to the kernel.
 *
 * @module @wasmvm/host
 */

export { WasiPolyfill, WasiProcExit } from './wasi-polyfill.ts';
export type { WasiOptions, WasiImports } from './wasi-polyfill.ts';
export type { WasiFileIO } from './wasi-file-io.ts';
export type { WasiProcessIO } from './wasi-process-io.ts';
export { UserManager } from './user.ts';
export type { UserManagerOptions, HostUserImports } from './user.ts';
export { createWasmVmRuntime, WASMVM_COMMANDS, DEFAULT_FIRST_PARTY_TIERS } from './driver.ts';
export type { WasmVmRuntimeOptions } from './driver.ts';
export type { PermissionTier } from './syscall-rpc.ts';
export { isSpawnBlocked, resolvePermissionTier } from './permission-check.ts';
export { ModuleCache } from './module-cache.ts';
export { isWasmBinary, isWasmBinarySync } from './wasm-magic.ts';
export {
  createBrowserWasmVmRuntime,
  CacheApiBinaryStorage,
  IndexedDbBinaryStorage,
  sha256Hex,
} from './browser-driver.ts';
export type {
  BrowserWasmVmRuntimeOptions,
  CommandManifest,
  CommandManifestEntry,
  BinaryStorage,
} from './browser-driver.ts';

// Re-export WASI constants and types for downstream consumers
export * from './wasi-constants.ts';
export {
  VfsError,
  FDEntry,
  FileDescription,
} from './wasi-types.ts';
export type {
  WasiFiletype,
  VfsErrorCode,
  WasiVFS,
  WasiFDTable,
  WasiInode,
  VfsStat,
  VfsSnapshotEntry,
  FDResource,
  StdioResource,
  VfsFileResource,
  PreopenResource,
  PipeBuffer,
  PipeResource,
  FDOpenOptions,
} from './wasi-types.ts';
