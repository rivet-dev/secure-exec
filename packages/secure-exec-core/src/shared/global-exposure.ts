/**
 * Classification for globals the runtime installs on the isolate's `globalThis`.
 *
 * - `hardened`: non-writable, non-configurable. Prevents sandbox code from
 *   replacing bridge callbacks or lifecycle hooks.
 * - `mutable-runtime-state`: writable per-execution state (module cache,
 *   stdin data, CJS module/exports wrappers) that must be reset between runs.
 */
export type CustomGlobalClassification =
	| "hardened"
	| "mutable-runtime-state";

export interface CustomGlobalInventoryEntry {
	name: string;
	classification: CustomGlobalClassification;
	rationale: string;
}

// Canonical Node runtime + bridge custom-global inventory.
export const NODE_CUSTOM_GLOBAL_INVENTORY: readonly CustomGlobalInventoryEntry[] = [
	{
		name: "_processConfig",
		classification: "hardened",
		rationale: "Bridge bootstrap configuration must not be replaced by sandbox code.",
	},
	{
		name: "_osConfig",
		classification: "hardened",
		rationale: "Bridge bootstrap configuration must not be replaced by sandbox code.",
	},
	{
		name: "bridge",
		classification: "hardened",
		rationale: "Bridge export object is runtime-owned control-plane state.",
	},
	{
		name: "_registerHandle",
		classification: "hardened",
		rationale: "Active-handle lifecycle hook controls runtime completion semantics.",
	},
	{
		name: "_unregisterHandle",
		classification: "hardened",
		rationale: "Active-handle lifecycle hook controls runtime completion semantics.",
	},
	{
		name: "_waitForActiveHandles",
		classification: "hardened",
		rationale: "Active-handle lifecycle hook controls runtime completion semantics.",
	},
	{
		name: "_getActiveHandles",
		classification: "hardened",
		rationale: "Bridge debug hook should not be replaced by sandbox code.",
	},
	{
		name: "_childProcessDispatch",
		classification: "hardened",
		rationale: "Host-to-sandbox child-process callback dispatch entrypoint.",
	},
	{
		name: "_childProcessModule",
		classification: "hardened",
		rationale: "Bridge-owned child_process module handle for require resolution.",
	},
	{
		name: "_osModule",
		classification: "hardened",
		rationale: "Bridge-owned os module handle for require resolution.",
	},
	{
		name: "_moduleModule",
		classification: "hardened",
		rationale: "Bridge-owned module module handle for require resolution.",
	},
	{
		name: "_httpModule",
		classification: "hardened",
		rationale: "Bridge-owned http module handle for require resolution.",
	},
	{
		name: "_httpsModule",
		classification: "hardened",
		rationale: "Bridge-owned https module handle for require resolution.",
	},
	{
		name: "_http2Module",
		classification: "hardened",
		rationale: "Bridge-owned http2 module handle for require resolution.",
	},
	{
		name: "_dnsModule",
		classification: "hardened",
		rationale: "Bridge-owned dns module handle for require resolution.",
	},
	{
		name: "_httpServerDispatch",
		classification: "hardened",
		rationale: "Host-to-sandbox HTTP server dispatch entrypoint.",
	},
	{
		name: "ProcessExitError",
		classification: "hardened",
		rationale: "Runtime-owned process-exit control-path error class.",
	},
	{
		name: "_log",
		classification: "hardened",
		rationale: "Host console capture reference consumed by sandbox console shim.",
	},
	{
		name: "_error",
		classification: "hardened",
		rationale: "Host console capture reference consumed by sandbox console shim.",
	},
	{
		name: "_loadPolyfill",
		classification: "hardened",
		rationale: "Host module-loading bridge reference.",
	},
	{
		name: "_resolveModule",
		classification: "hardened",
		rationale: "Host module-resolution bridge reference.",
	},
	{
		name: "_loadFile",
		classification: "hardened",
		rationale: "Host file-loading bridge reference.",
	},
	{
		name: "_scheduleTimer",
		classification: "hardened",
		rationale: "Host timer bridge reference used by process timers.",
	},
	{
		name: "_cryptoRandomFill",
		classification: "hardened",
		rationale: "Host entropy bridge reference for crypto.getRandomValues.",
	},
	{
		name: "_cryptoRandomUUID",
		classification: "hardened",
		rationale: "Host entropy bridge reference for crypto.randomUUID.",
	},
	{
		name: "_fsReadFile",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsWriteFile",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsReadFileBinary",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsWriteFileBinary",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsReadDir",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsMkdir",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsRmdir",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsExists",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsStat",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsUnlink",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsRename",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsChmod",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsChown",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsLink",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsSymlink",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsReadlink",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsLstat",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsTruncate",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fsUtimes",
		classification: "hardened",
		rationale: "Host filesystem bridge reference.",
	},
	{
		name: "_fs",
		classification: "hardened",
		rationale: "Bridge filesystem facade consumed by fs polyfill.",
	},
	{
		name: "_childProcessSpawnStart",
		classification: "hardened",
		rationale: "Host child_process bridge reference.",
	},
	{
		name: "_childProcessStdinWrite",
		classification: "hardened",
		rationale: "Host child_process bridge reference.",
	},
	{
		name: "_childProcessStdinClose",
		classification: "hardened",
		rationale: "Host child_process bridge reference.",
	},
	{
		name: "_childProcessKill",
		classification: "hardened",
		rationale: "Host child_process bridge reference.",
	},
	{
		name: "_childProcessSpawnSync",
		classification: "hardened",
		rationale: "Host child_process bridge reference.",
	},
	{
		name: "_networkFetchRaw",
		classification: "hardened",
		rationale: "Host network bridge reference.",
	},
	{
		name: "_networkDnsLookupRaw",
		classification: "hardened",
		rationale: "Host network bridge reference.",
	},
	{
		name: "_networkHttpRequestRaw",
		classification: "hardened",
		rationale: "Host network bridge reference.",
	},
	{
		name: "_networkHttpServerListenRaw",
		classification: "hardened",
		rationale: "Host network bridge reference.",
	},
	{
		name: "_networkHttpServerCloseRaw",
		classification: "hardened",
		rationale: "Host network bridge reference.",
	},
	{
		name: "_batchResolveModules",
		classification: "hardened",
		rationale: "Host bridge for batched module resolution to reduce IPC round-trips.",
	},
	{
		name: "_ptySetRawMode",
		classification: "hardened",
		rationale: "Host PTY bridge reference for stdin.setRawMode().",
	},
	{
		name: "require",
		classification: "hardened",
		rationale: "Runtime-owned global require shim entrypoint.",
	},
	{
		name: "_requireFrom",
		classification: "hardened",
		rationale: "Runtime-owned internal require shim used by module polyfill.",
	},
	{
		name: "_dynamicImport",
		classification: "hardened",
		rationale: "Runtime-owned host callback reference for dynamic import resolution.",
	},
	{
		name: "__dynamicImport",
		classification: "hardened",
		rationale: "Runtime-owned dynamic-import shim entrypoint.",
	},
	{
		name: "_moduleCache",
		classification: "hardened",
		rationale: "Per-execution CommonJS/require cache — hardened via read-only Proxy to prevent cache poisoning.",
	},
	{
		name: "_pendingModules",
		classification: "mutable-runtime-state",
		rationale: "Per-execution circular-load tracking state.",
	},
	{
		name: "_currentModule",
		classification: "mutable-runtime-state",
		rationale: "Per-execution module resolution context.",
	},
	{
		name: "_stdinData",
		classification: "mutable-runtime-state",
		rationale: "Per-execution stdin payload state.",
	},
	{
		name: "_stdinPosition",
		classification: "mutable-runtime-state",
		rationale: "Per-execution stdin stream cursor state.",
	},
	{
		name: "_stdinEnded",
		classification: "mutable-runtime-state",
		rationale: "Per-execution stdin completion state.",
	},
	{
		name: "_stdinFlowMode",
		classification: "mutable-runtime-state",
		rationale: "Per-execution stdin flow-control state.",
	},
	{
		name: "module",
		classification: "mutable-runtime-state",
		rationale: "Per-execution CommonJS module wrapper state.",
	},
	{
		name: "exports",
		classification: "mutable-runtime-state",
		rationale: "Per-execution CommonJS module wrapper state.",
	},
	{
		name: "__filename",
		classification: "mutable-runtime-state",
		rationale: "Per-execution CommonJS file context state.",
	},
	{
		name: "__dirname",
		classification: "mutable-runtime-state",
		rationale: "Per-execution CommonJS file context state.",
	},
	{
		name: "fetch",
		classification: "hardened",
		rationale: "Network fetch API global — must not be replaceable by sandbox code.",
	},
	{
		name: "Headers",
		classification: "hardened",
		rationale: "Network Headers API global — must not be replaceable by sandbox code.",
	},
	{
		name: "Request",
		classification: "hardened",
		rationale: "Network Request API global — must not be replaceable by sandbox code.",
	},
	{
		name: "Response",
		classification: "hardened",
		rationale: "Network Response API global — must not be replaceable by sandbox code.",
	},
	{
		name: "Blob",
		classification: "hardened",
		rationale: "Blob API global stub — must not be replaceable by sandbox code.",
	},
];

export const HARDENED_NODE_CUSTOM_GLOBALS = NODE_CUSTOM_GLOBAL_INVENTORY
	.filter((entry) => entry.classification === "hardened")
	.map((entry) => entry.name);

export const MUTABLE_NODE_CUSTOM_GLOBALS = NODE_CUSTOM_GLOBAL_INVENTORY
	.filter((entry) => entry.classification === "mutable-runtime-state")
	.map((entry) => entry.name);

interface ExposeGlobalOptions {
	mutable?: boolean;
	enumerable?: boolean;
}

/**
 * Define a property on `target` using `Object.defineProperty`.
 * By default the property is non-writable/non-configurable (hardened).
 */
export function exposeGlobalBinding(
	target: Record<string, unknown>,
	name: string,
	value: unknown,
	options: ExposeGlobalOptions = {},
): void {
	const mutable = options.mutable === true;
	const enumerable = options.enumerable !== false;
	Object.defineProperty(target, name, {
		value,
		writable: mutable,
		configurable: mutable,
		enumerable,
	});
}

/** Install a hardened (non-writable) global on `globalThis`. */
export function exposeCustomGlobal(name: string, value: unknown): void {
	exposeGlobalBinding(globalThis as Record<string, unknown>, name, value);
}

/** Install a writable global on `globalThis` for per-execution state. */
export function exposeMutableRuntimeStateGlobal(
	name: string,
	value: unknown,
): void {
	exposeGlobalBinding(globalThis as Record<string, unknown>, name, value, {
		mutable: true,
	});
}

/**
 * Inline JavaScript source that provides `exposeCustomGlobal` and
 * `exposeMutableRuntimeStateGlobal` inside the isolate's V8 context.
 * Evaluated by the host after context creation so that bridge/runtime
 * scripts can harden their own globals.
 */
export const ISOLATE_GLOBAL_EXPOSURE_HELPER_SOURCE = `(() => {
  const exposeGlobalBinding = (name, value, mutable = false) => {
    Object.defineProperty(globalThis, name, {
      value,
      writable: mutable,
      configurable: mutable,
      enumerable: true,
    });
  };
  const exposeCustomGlobal = (name, value) => exposeGlobalBinding(name, value, false);
  const exposeMutableRuntimeStateGlobal = (name, value) =>
    exposeGlobalBinding(name, value, true);
  return {
    exposeCustomGlobal,
    exposeMutableRuntimeStateGlobal,
  };
})()`;
