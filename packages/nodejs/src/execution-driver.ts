import { createResolutionCache } from "./package-bundler.js";
import { getConsoleSetupCode } from "@secure-exec/core/internal/shared/console-formatter";
import { getRequireSetupCode } from "@secure-exec/core/internal/shared/require-setup";
import { getIsolateRuntimeSource, getInitialBridgeGlobalsSetupCode } from "@secure-exec/core";
import {
	createCommandExecutorStub,
	createFsStub,
	createNetworkStub,
	filterEnv,
	wrapCommandExecutor,
	wrapFileSystem,
	wrapNetworkAdapter,
} from "@secure-exec/core/internal/shared/permissions";
import type { NetworkAdapter, RuntimeDriver } from "@secure-exec/core";
import type {
	StdioHook,
	ExecOptions,
	ExecResult,
	RunResult,
	TimingMitigation,
} from "@secure-exec/core/internal/shared/api-types";
import type { V8Runtime, V8Session, V8SessionOptions } from "@secure-exec/v8";
import { createV8Runtime } from "@secure-exec/v8";
import { getRawBridgeCode, getBridgeAttachCode } from "./bridge-loader.js";
import {
	type NodeExecutionDriverOptions,
	createBudgetState,
	clearActiveHostTimers,
	killActiveChildProcesses,
	normalizePayloadLimit,
	getExecutionTimeoutMs,
	getTimingMitigation,
	PAYLOAD_LIMIT_ERROR_CODE,
	DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES,
	DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES,
	DEFAULT_MAX_TIMERS,
	DEFAULT_MAX_HANDLES,
	DEFAULT_SANDBOX_CWD,
	DEFAULT_SANDBOX_HOME,
	DEFAULT_SANDBOX_TMPDIR,
} from "./isolate-bootstrap.js";
import {
	TIMEOUT_ERROR_MESSAGE,
	TIMEOUT_EXIT_CODE,
} from "@secure-exec/core";
import {
	type BridgeHandlers,
	buildCryptoBridgeHandlers,
	buildConsoleBridgeHandlers,
	buildModuleLoadingBridgeHandlers,
	buildTimerBridgeHandlers,
	buildFsBridgeHandlers,
	buildChildProcessBridgeHandlers,
	buildNetworkBridgeHandlers,
	buildNetworkSocketBridgeHandlers,
	buildUpgradeSocketBridgeHandlers,
	buildModuleResolutionBridgeHandlers,
	buildPtyBridgeHandlers,
	createProcessConfigForExecution,
	resolveHttpServerResponse,
} from "./bridge-handlers.js";
import type {
	Permissions,
	VirtualFileSystem,
} from "@secure-exec/core";
import type {
	CommandExecutor,
	SpawnedProcess,
} from "@secure-exec/core";
import type { ResolutionCache } from "./package-bundler.js";
import type {
	OSConfig,
	ProcessConfig,
} from "@secure-exec/core/internal/shared/api-types";
import type { BudgetState } from "./isolate-bootstrap.js";
import { type FlattenedBinding, flattenBindingTree, BINDING_PREFIX } from "./bindings.js";

export { NodeExecutionDriverOptions };

const MAX_ERROR_MESSAGE_CHARS = 8192;

function boundErrorMessage(message: string): string {
	if (message.length <= MAX_ERROR_MESSAGE_CHARS) return message;
	return `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}...[Truncated]`;
}

/** Internal state for the execution driver. */
interface DriverState {
	filesystem: VirtualFileSystem;
	commandExecutor: CommandExecutor;
	networkAdapter: NetworkAdapter;
	permissions?: Permissions;
	processConfig: ProcessConfig;
	osConfig: OSConfig;
	onStdio?: StdioHook;
	cpuTimeLimitMs?: number;
	timingMitigation: TimingMitigation;
	bridgeBase64TransferLimitBytes: number;
	isolateJsonPayloadLimitBytes: number;
	maxOutputBytes?: number;
	maxBridgeCalls?: number;
	maxTimers?: number;
	maxChildProcesses?: number;
	maxHandles?: number;
	budgetState: BudgetState;
	activeHttpServerIds: Set<number>;
	activeChildProcesses: Map<number, SpawnedProcess>;
	activeHostTimers: Set<ReturnType<typeof setTimeout>>;
	resolutionCache: ResolutionCache;
	onPtySetRawMode?: (mode: boolean) => void;
}

// Shared V8 runtime process — one per Node.js process, lazy-initialized
let sharedV8Runtime: V8Runtime | null = null;
let sharedV8RuntimePromise: Promise<V8Runtime> | null = null;

async function getSharedV8Runtime(): Promise<V8Runtime> {
	if (sharedV8Runtime?.isAlive) return sharedV8Runtime;
	if (sharedV8RuntimePromise) return sharedV8RuntimePromise;

	// Build bridge code for snapshot warmup
	const bridgeCode = buildFullBridgeCode();

	sharedV8RuntimePromise = createV8Runtime({
		warmupBridgeCode: bridgeCode,
	}).then((rt) => {
		sharedV8Runtime = rt;
		sharedV8RuntimePromise = null;
		return rt;
	});
	return sharedV8RuntimePromise;
}

// Minimal polyfills for APIs the bridge IIFE expects but the Rust V8 runtime doesn't provide.
const V8_POLYFILLS = `
if (typeof SharedArrayBuffer === 'undefined') {
  globalThis.SharedArrayBuffer = class SharedArrayBuffer extends ArrayBuffer {};
  var _abBL = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength');
  if (_abBL) Object.defineProperty(SharedArrayBuffer.prototype, 'byteLength', _abBL);
  Object.defineProperty(SharedArrayBuffer.prototype, 'growable', { get() { return false; } });
}
if (!Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')) {
  Object.defineProperty(ArrayBuffer.prototype, 'resizable', { get() { return false; } });
}
if (typeof queueMicrotask === 'undefined') globalThis.queueMicrotask = (fn) => Promise.resolve().then(fn);
if (typeof atob === 'undefined') {
  globalThis.atob = (s) => {
    const b = typeof Buffer !== 'undefined' ? Buffer : null;
    if (b) return b.from(s, 'base64').toString('binary');
    // Fallback: manual base64 decode
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let out = ''; for (let i = 0; i < s.length;) {
      const a = chars.indexOf(s[i++]), b2 = chars.indexOf(s[i++]), c = chars.indexOf(s[i++]), d = chars.indexOf(s[i++]);
      out += String.fromCharCode((a<<2)|(b2>>4)); if (c!==64) out += String.fromCharCode(((b2&15)<<4)|(c>>2)); if (d!==64) out += String.fromCharCode(((c&3)<<6)|d);
    } return out;
  };
  globalThis.btoa = (s) => {
    const b = typeof Buffer !== 'undefined' ? Buffer : null;
    if (b) return b.from(s, 'binary').toString('base64');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = ''; for (let i = 0; i < s.length;) {
      const a = s.charCodeAt(i++), b2 = s.charCodeAt(i++), c = s.charCodeAt(i++);
      out += chars[a>>2] + chars[((a&3)<<4)|(b2>>4)] + (isNaN(b2) ? '=' : chars[((b2&15)<<2)|(c>>4)]) + (isNaN(c) ? '=' : chars[c&63]);
    } return out;
  };
}
if (typeof TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    encode(str) { const a = []; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); if (c < 128) a.push(c); else if (c < 2048) { a.push(192|(c>>6), 128|(c&63)); } else { a.push(224|(c>>12), 128|((c>>6)&63), 128|(c&63)); } } return new Uint8Array(a); }
    get encoding() { return 'utf-8'; }
  };
}
if (typeof TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    constructor() {}
    decode(buf) { if (!buf) return ''; const u8 = new Uint8Array(buf.buffer || buf); let s = ''; for (let i = 0; i < u8.length;) { const b = u8[i++]; if (b < 128) s += String.fromCharCode(b); else if (b < 224) s += String.fromCharCode(((b&31)<<6)|(u8[i++]&63)); else if (b < 240) { const b2 = u8[i++]; s += String.fromCharCode(((b&15)<<12)|((b2&63)<<6)|(u8[i++]&63)); } else { const b2 = u8[i++], b3 = u8[i++], cp = ((b&7)<<18)|((b2&63)<<12)|((b3&63)<<6)|(u8[i++]&63); if (cp>0xFFFF) { const s2 = cp-0x10000; s += String.fromCharCode(0xD800+(s2>>10), 0xDC00+(s2&0x3FF)); } else s += String.fromCharCode(cp); } } return s; }
    get encoding() { return 'utf-8'; }
  };
}
if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(url, base) { const m = String(base ? new URL(base).href : ''); const full = url.startsWith('http') ? url : m.replace(/\\/[^\\/]*$/, '/') + url; const pm = full.match(/^(\\w+:)\\/\\/([^/:]+)(:\\d+)?(.*)$/); this.protocol = pm?.[1]||''; this.hostname = pm?.[2]||''; this.port = (pm?.[3]||'').slice(1); this.pathname = (pm?.[4]||'/').split('?')[0].split('#')[0]; this.search = full.includes('?') ? '?'+full.split('?')[1].split('#')[0] : ''; this.hash = full.includes('#') ? '#'+full.split('#')[1] : ''; this.host = this.hostname + (this.port ? ':'+this.port : ''); this.href = this.protocol+'//'+this.host+this.pathname+this.search+this.hash; this.origin = this.protocol+'//'+this.host; this.searchParams = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(this.search) : { get:()=>null }; }
    toString() { return this.href; }
  };
}
if (typeof URLSearchParams === 'undefined') {
  globalThis.URLSearchParams = class URLSearchParams {
    constructor(init) { this._map = new Map(); if (typeof init === 'string') { for (const p of init.replace(/^\\?/,'').split('&')) { const [k,...v] = p.split('='); if (k) this._map.set(decodeURIComponent(k), decodeURIComponent(v.join('='))); } } }
    get(k) { return this._map.get(k) ?? null; }
    has(k) { return this._map.has(k); }
    toString() { return [...this._map].map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&'); }
  };
}
if (typeof structuredClone === 'undefined') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}
if (typeof performance === 'undefined') {
  globalThis.performance = { now: () => Date.now(), timeOrigin: Date.now() };
}
if (typeof AbortController === 'undefined') {
  class AbortSignal { constructor() { this.aborted = false; this.reason = undefined; } }
  globalThis.AbortSignal = AbortSignal;
  globalThis.AbortController = class AbortController { constructor() { this.signal = new AbortSignal(); } abort(reason) { this.signal.aborted = true; this.signal.reason = reason; } };
}
if (typeof navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'secure-exec-v8' };
}
`;

// Shim for ivm.Reference methods used by bridge code.
// Bridge globals in the V8 runtime are plain functions, but the bridge code
// (compiled from @secure-exec/core) calls them via .applySync(), .apply(), and
// .applySyncPromise() which are ivm Reference calling patterns.
// Shim for native bridge functions (runs early in postRestoreScript)
const BRIDGE_NATIVE_SHIM = `
(function() {
  var _origApply = Function.prototype.apply;
  function shimBridgeGlobal(name) {
    var fn = globalThis[name];
    if (typeof fn !== 'function' || fn.applySync) return;
    fn.applySync = function(_, args) { return _origApply.call(fn, null, args || []); };
    fn.applySyncPromise = function(_, args) { return _origApply.call(fn, null, args || []); };
    fn.derefInto = function() { return fn; };
  }
  var keys = Object.getOwnPropertyNames(globalThis).filter(function(k) { return k.startsWith('_') && typeof globalThis[k] === 'function'; });
  keys.forEach(shimBridgeGlobal);
})();
`;

// Dispatch shim for bridge globals not natively supported by the V8 binary.
// Installs dispatch wrappers for ALL known bridge globals that aren't already
// functions. This runs BEFORE require-setup so the crypto/net module code
// detects the dispatch-wrapped globals and installs the corresponding APIs.
function buildBridgeDispatchShim(): string {
	const K = HOST_BRIDGE_GLOBAL_KEYS;
	// Collect all bridge global names from the contract
	const allGlobals = Object.values(K).filter(v => typeof v === "string") as string[];
	return `
(function() {
  var _origApply = Function.prototype.apply;
  var names = ${JSON.stringify(allGlobals)};
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (typeof globalThis[name] === 'function') continue;
    (function(n) {
      var fn = function() {
        var args = Array.prototype.slice.call(arguments);
        var encoded = "__bd:" + n + ":" + JSON.stringify(args);
        var resultJson = _loadPolyfill.applySyncPromise(undefined, [encoded]);
        if (resultJson === null) return undefined;
        try {
          var parsed = JSON.parse(resultJson);
          if (parsed.__bd_error) throw new Error(parsed.__bd_error);
          return parsed.__bd_result;
        } catch (e) {
          if (e.message && e.message.startsWith('No handler:')) return undefined;
          throw e;
        }
      };
      fn.applySync = function(_, args) { return _origApply.call(fn, null, args || []); };
      fn.applySyncPromise = function(_, args) { return _origApply.call(fn, null, args || []); };
      fn.derefInto = function() { return fn; };
      globalThis[n] = fn;
    })(name);
  }
})();
`;
}
const BRIDGE_DISPATCH_SHIM = buildBridgeDispatchShim();

// Cache assembled bridge code (same across all executions)
let bridgeCodeCache: string | null = null;

function buildFullBridgeCode(): string {
	if (bridgeCodeCache) return bridgeCodeCache;

	// Assemble the full bridge code IIFE from component scripts.
	// Only include code that can run without bridge calls (snapshot phase).
	// Console/require/fsFacade setup goes in postRestoreScript where bridge calls work.
	const parts = [
		// Polyfill missing Web APIs for the Rust V8 runtime
		V8_POLYFILLS,
		getIsolateRuntimeSource("globalExposureHelpers"),
		getInitialBridgeGlobalsSetupCode(),
		getRawBridgeCode(),
		getBridgeAttachCode(),
	];

	bridgeCodeCache = parts.join("\n");
	return bridgeCodeCache;
}

export class NodeExecutionDriver implements RuntimeDriver {
	private state: DriverState;
	private memoryLimit: number;
	private disposed: boolean = false;
	private flattenedBindings: FlattenedBinding[] | null = null;
	// Unwrapped filesystem for path translation (toHostPath/toSandboxPath)
	private rawFilesystem: VirtualFileSystem | undefined;

	constructor(options: NodeExecutionDriverOptions) {
		this.memoryLimit = options.memoryLimit ?? 128;
		const system = options.system;
		const permissions = system.permissions;
		// Keep unwrapped filesystem for path translation (toHostPath/toSandboxPath)
		this.rawFilesystem = system.filesystem;
		const filesystem = this.rawFilesystem
			? wrapFileSystem(this.rawFilesystem, permissions)
			: createFsStub();
		const commandExecutor = system.commandExecutor
			? wrapCommandExecutor(system.commandExecutor, permissions)
			: createCommandExecutorStub();
		const networkAdapter = system.network
			? wrapNetworkAdapter(system.network, permissions)
			: createNetworkStub();

		const processConfig = { ...(options.runtime.process ?? {}) };
		processConfig.cwd ??= DEFAULT_SANDBOX_CWD;
		processConfig.env = filterEnv(processConfig.env, permissions);

		const osConfig = { ...(options.runtime.os ?? {}) };
		osConfig.homedir ??= DEFAULT_SANDBOX_HOME;
		osConfig.tmpdir ??= DEFAULT_SANDBOX_TMPDIR;

		const bridgeBase64TransferLimitBytes = normalizePayloadLimit(
			options.payloadLimits?.base64TransferBytes,
			DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES,
			"payloadLimits.base64TransferBytes",
		);
		const isolateJsonPayloadLimitBytes = normalizePayloadLimit(
			options.payloadLimits?.jsonPayloadBytes,
			DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES,
			"payloadLimits.jsonPayloadBytes",
		);

		const budgets = options.resourceBudgets;

		this.state = {
			filesystem,
			commandExecutor,
			networkAdapter,
			permissions,
			processConfig,
			osConfig,
			onStdio: options.onStdio,
			cpuTimeLimitMs: options.cpuTimeLimitMs,
			timingMitigation: options.timingMitigation ?? "freeze",
			bridgeBase64TransferLimitBytes,
			isolateJsonPayloadLimitBytes,
			maxOutputBytes: budgets?.maxOutputBytes,
			maxBridgeCalls: budgets?.maxBridgeCalls,
			maxTimers: budgets?.maxTimers ?? DEFAULT_MAX_TIMERS,
			maxChildProcesses: budgets?.maxChildProcesses,
			maxHandles: budgets?.maxHandles ?? DEFAULT_MAX_HANDLES,
			budgetState: createBudgetState(),
			activeHttpServerIds: new Set(),
			activeChildProcesses: new Map(),
			activeHostTimers: new Set(),
			resolutionCache: createResolutionCache(),
			onPtySetRawMode: options.onPtySetRawMode,
		};

		// Validate and flatten bindings once at construction time
		if (options.bindings) {
			this.flattenedBindings = flattenBindingTree(options.bindings);
		}
	}

	get network(): Pick<NetworkAdapter, "fetch" | "dnsLookup" | "httpRequest"> {
		const adapter = this.state.networkAdapter ?? createNetworkStub();
		return {
			fetch: (url, options) => adapter.fetch(url, options),
			dnsLookup: (hostname) => adapter.dnsLookup(hostname),
			httpRequest: (url, options) => adapter.httpRequest(url, options),
		};
	}

	get unsafeIsolate(): unknown { return null; }

	async createUnsafeContext(_options: { env?: Record<string, string>; cwd?: string; filePath?: string } = {}): Promise<unknown> {
		return null;
	}

	async run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>> {
		return this.executeInternal<T>({ mode: "run", code, filePath });
	}

	async exec(code: string, options?: ExecOptions): Promise<ExecResult> {
		const result = await this.executeInternal({
			mode: "exec",
			code,
			filePath: options?.filePath,
			env: options?.env,
			cwd: options?.cwd,
			stdin: options?.stdin,
			cpuTimeLimitMs: options?.cpuTimeLimitMs,
			timingMitigation: options?.timingMitigation,
			onStdio: options?.onStdio,
		});
		return { code: result.code, errorMessage: result.errorMessage };
	}

	private async executeInternal<T = unknown>(options: {
		mode: "run" | "exec";
		code: string;
		filePath?: string;
		env?: Record<string, string>;
		cwd?: string;
		stdin?: string;
		cpuTimeLimitMs?: number;
		timingMitigation?: TimingMitigation;
		onStdio?: StdioHook;
	}): Promise<RunResult<T>> {
		if (this.disposed) throw new Error("NodeExecutionDriver has been disposed");

		// Reset per-execution state
		this.state.budgetState = createBudgetState();
		this.state.resolutionCache.resolveResults.clear();
		this.state.resolutionCache.packageJsonResults.clear();
		this.state.resolutionCache.existsResults.clear();
		this.state.resolutionCache.statResults.clear();

		const s = this.state;
		const timingMitigation = getTimingMitigation(options.timingMitigation, s.timingMitigation);
		const frozenTimeMs = Date.now();
		const onStdio = options.onStdio ?? s.onStdio;

		// Get or create V8 runtime
		const v8Runtime = await getSharedV8Runtime();
		const cpuTimeLimitMs = getExecutionTimeoutMs(options.cpuTimeLimitMs, s.cpuTimeLimitMs);

		const sessionOpts: V8SessionOptions = {
			heapLimitMb: this.memoryLimit,
			cpuTimeLimitMs,
		};
		const session = await v8Runtime.createSession(sessionOpts);

		try {
			// Build bridge handlers for this execution
			const cryptoResult = buildCryptoBridgeHandlers();
			const sendStreamEvent = (eventType: string, payload: Uint8Array) => {
				try {
					session.sendStreamEvent(eventType, payload);
				} catch {
					// Session may be destroyed
				}
			};

			const netSocketResult = buildNetworkSocketBridgeHandlers({
				dispatch: (socketId, event, data) => {
					const payload = JSON.stringify({ socketId, event, data });
					sendStreamEvent("netSocket", Buffer.from(payload));
				},
			});

			const bridgeHandlers: BridgeHandlers = {
				...cryptoResult.handlers,
				...buildConsoleBridgeHandlers({
					onStdio,
					budgetState: s.budgetState,
					maxOutputBytes: s.maxOutputBytes,
				}),
				...buildModuleLoadingBridgeHandlers({
					filesystem: s.filesystem,
					resolutionCache: s.resolutionCache,
					sandboxToHostPath: (p) => {
						const rfs = this.rawFilesystem as any;
						return typeof rfs?.toHostPath === "function" ? rfs.toHostPath(p) : null;
					},
				}, {
					// Dispatch handlers routed through _loadPolyfill for V8 runtime compat
					...cryptoResult.handlers,
					...netSocketResult.handlers,
					...buildUpgradeSocketBridgeHandlers({
						write: (socketId, dataBase64) => s.networkAdapter.upgradeSocketWrite?.(socketId, dataBase64),
						end: (socketId) => s.networkAdapter.upgradeSocketEnd?.(socketId),
						destroy: (socketId) => s.networkAdapter.upgradeSocketDestroy?.(socketId),
					}),
					...buildModuleResolutionBridgeHandlers({
						sandboxToHostPath: (p) => {
							const fs = s.filesystem as any;
							return typeof fs.toHostPath === "function" ? fs.toHostPath(p) : null;
						},
						hostToSandboxPath: (p) => {
							const fs = s.filesystem as any;
							return typeof fs.toSandboxPath === "function" ? fs.toSandboxPath(p) : p;
						},
					}),
					...buildPtyBridgeHandlers({
						onPtySetRawMode: s.onPtySetRawMode,
						stdinIsTTY: s.processConfig.stdinIsTTY,
					}),
					// Custom bindings dispatched through _loadPolyfill
					...(this.flattenedBindings ? Object.fromEntries(
						this.flattenedBindings.map(b => [b.key, b.handler])
					) : {}),
				}),
				...buildTimerBridgeHandlers({
					budgetState: s.budgetState,
					maxBridgeCalls: s.maxBridgeCalls,
					activeHostTimers: s.activeHostTimers,
				}),
				...buildFsBridgeHandlers({
					filesystem: s.filesystem,
					budgetState: s.budgetState,
					maxBridgeCalls: s.maxBridgeCalls,
					bridgeBase64TransferLimitBytes: s.bridgeBase64TransferLimitBytes,
					isolateJsonPayloadLimitBytes: s.isolateJsonPayloadLimitBytes,
				}),
				...buildChildProcessBridgeHandlers({
					commandExecutor: s.commandExecutor,
					processConfig: s.processConfig,
					budgetState: s.budgetState,
					maxBridgeCalls: s.maxBridgeCalls,
					maxChildProcesses: s.maxChildProcesses,
					isolateJsonPayloadLimitBytes: s.isolateJsonPayloadLimitBytes,
					activeChildProcesses: s.activeChildProcesses,
					sendStreamEvent,
				}),
				...buildNetworkBridgeHandlers({
					networkAdapter: s.networkAdapter,
					budgetState: s.budgetState,
					maxBridgeCalls: s.maxBridgeCalls,
					isolateJsonPayloadLimitBytes: s.isolateJsonPayloadLimitBytes,
					activeHttpServerIds: s.activeHttpServerIds,
					sendStreamEvent,
				}),
				...netSocketResult.handlers,
				...buildUpgradeSocketBridgeHandlers({
					write: (socketId, dataBase64) => s.networkAdapter.upgradeSocketWrite?.(socketId, dataBase64),
					end: (socketId) => s.networkAdapter.upgradeSocketEnd?.(socketId),
					destroy: (socketId) => s.networkAdapter.upgradeSocketDestroy?.(socketId),
				}),
				...buildModuleResolutionBridgeHandlers({
					sandboxToHostPath: (p) => {
						const rfs = this.rawFilesystem as any;
						return typeof rfs?.toHostPath === "function" ? rfs.toHostPath(p) : null;
					},
					hostToSandboxPath: (p) => {
						const rfs = this.rawFilesystem as any;
						return typeof rfs?.toSandboxPath === "function" ? rfs.toSandboxPath(p) : p;
					},
				}),
				...buildPtyBridgeHandlers({
					onPtySetRawMode: s.onPtySetRawMode,
					stdinIsTTY: s.processConfig.stdinIsTTY,
				}),
			};

			// Merge custom bindings into bridge handlers
			if (this.flattenedBindings) {
				for (const binding of this.flattenedBindings) {
					bridgeHandlers[binding.key] = binding.handler;
				}
			}

			// Build process/os config for V8 execution
			const execProcessConfig = createProcessConfigForExecution(
				options.env || options.cwd
					? {
							...s.processConfig,
							...(options.env ? { env: filterEnv(options.env, s.permissions) } : {}),
							...(options.cwd ? { cwd: options.cwd } : {}),
						}
					: s.processConfig,
				timingMitigation,
				frozenTimeMs,
			);

			// Build bridge code with embedded config
			const bridgeCode = buildFullBridgeCode();

			// Build post-restore script with per-execution config
			const bindingKeys = this.flattenedBindings
				? this.flattenedBindings.map((b) => b.key.slice(BINDING_PREFIX.length))
				: [];
			const postRestoreScript = buildPostRestoreScript(
				execProcessConfig,
				s.osConfig,
				{
					initialCwd: execProcessConfig.cwd ?? "/",
					jsonPayloadLimitBytes: s.isolateJsonPayloadLimitBytes,
					payloadLimitErrorCode: PAYLOAD_LIMIT_ERROR_CODE,
					maxTimers: s.maxTimers,
					maxHandles: s.maxHandles,
					stdin: options.stdin,
				},
				timingMitigation,
				frozenTimeMs,
				options.mode,
				options.filePath,
				bindingKeys,
			);

			// Execute in V8 session
			const result = await session.execute({
				bridgeCode,
				postRestoreScript,
				userCode: options.code,
				mode: options.mode,
				filePath: options.filePath,
				processConfig: {
					cwd: execProcessConfig.cwd ?? "/",
					env: execProcessConfig.env ?? {},
					timing_mitigation: timingMitigation,
					frozen_time_ms: timingMitigation === "freeze" ? frozenTimeMs : null,
				},
				osConfig: {
					homedir: s.osConfig.homedir ?? DEFAULT_SANDBOX_HOME,
					tmpdir: s.osConfig.tmpdir ?? DEFAULT_SANDBOX_TMPDIR,
					platform: s.osConfig.platform ?? "linux",
					arch: s.osConfig.arch ?? "x64",
				},
				bridgeHandlers,
				onStreamCallback: (callbackType, payload) => {
					// Handle stream callbacks from V8 isolate
					if (callbackType === "httpServerResponse") {
						try {
							const data = JSON.parse(Buffer.from(payload).toString());
							resolveHttpServerResponse(data.serverId, data.responseJson);
						} catch {
							// Invalid payload
						}
					}
				},
			});

			// Clean up per-execution resources
			cryptoResult.dispose();
			netSocketResult.dispose();

			// Map V8 execution result to RunResult
			if (result.error) {
				const errMessage = result.error.type && result.error.type !== "Error"
					? `${result.error.type}: ${result.error.message}`
					: result.error.message;

				// Check for timeout
				if (/timed out|time limit exceeded/i.test(errMessage)) {
					return {
						code: TIMEOUT_EXIT_CODE,
						errorMessage: TIMEOUT_ERROR_MESSAGE,
						exports: undefined as T,
					};
				}

				// Check for process.exit()
				const exitMatch = errMessage.match(/process\.exit\((\d+)\)/);
				if (exitMatch) {
					return {
						code: parseInt(exitMatch[1], 10),
						exports: undefined as T,
					};
				}

				return {
					code: result.code || 1,
					errorMessage: boundErrorMessage(errMessage),
					exports: undefined as T,
				};
			}

			// Parse exports for run() mode
			let exports: T | undefined;
			if (options.mode === "run" && result.exports) {
				try {
					const { deserialize } = await import("node:v8");
					exports = deserialize(result.exports) as T;
				} catch {
					exports = undefined;
				}
			}

			return {
				code: result.code,
				exports,
			};
		} catch (err) {
			const errMessage = err instanceof Error
				? (err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message)
				: String(err);

			if (/timed out|time limit exceeded/i.test(errMessage)) {
				return {
					code: TIMEOUT_EXIT_CODE,
					errorMessage: TIMEOUT_ERROR_MESSAGE,
					exports: undefined as T,
				};
			}

			const exitMatch = errMessage.match(/process\.exit\((\d+)\)/);
			if (exitMatch) {
				return {
					code: parseInt(exitMatch[1], 10),
					exports: undefined as T,
				};
			}

			return {
				code: 1,
				errorMessage: boundErrorMessage(errMessage),
				exports: undefined as T,
			};
		} finally {
			await session.destroy().catch(() => {});
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		killActiveChildProcesses(this.state);
		clearActiveHostTimers(this.state);
	}

	async terminate(): Promise<void> {
		if (this.disposed) return;
		killActiveChildProcesses(this.state);
		const adapter = this.state.networkAdapter;
		if (adapter?.httpServerClose) {
			const ids = Array.from(this.state.activeHttpServerIds);
			await Promise.allSettled(ids.map((id) => adapter.httpServerClose!(id)));
		}
		this.state.activeHttpServerIds.clear();
		clearActiveHostTimers(this.state);
		this.disposed = true;
	}
}

/** Build the post-restore script that configures the V8 session per-execution. */
function buildPostRestoreScript(
	processConfig: ProcessConfig,
	osConfig: OSConfig,
	bridgeConfig: {
		initialCwd: string;
		jsonPayloadLimitBytes: number;
		payloadLimitErrorCode: string;
		maxTimers?: number;
		maxHandles?: number;
		stdin?: string;
	},
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
	mode: "run" | "exec",
	filePath?: string,
	bindingKeys?: string[],
): string {
	const parts: string[] = [];

	// Shim existing native bridge functions for ivm.Reference compat,
	// then install dispatch wrappers for bridge globals not in the V8 binary
	parts.push(BRIDGE_NATIVE_SHIM);
	parts.push(BRIDGE_DISPATCH_SHIM);

	// Console and require setup (must run in postRestoreScript, not bridgeCode,
	// because bridge calls are muted during the bridgeCode snapshot phase)
	parts.push(getConsoleSetupCode());
	parts.push(getRequireSetupCode());
	parts.push(getIsolateRuntimeSource("setupFsFacade"));
	parts.push(getIsolateRuntimeSource("setupDynamicImport"));

	// Inject bridge setup config
	parts.push(`globalThis.__runtimeBridgeSetupConfig = ${JSON.stringify({
		initialCwd: bridgeConfig.initialCwd,
		jsonPayloadLimitBytes: bridgeConfig.jsonPayloadLimitBytes,
		payloadLimitErrorCode: bridgeConfig.payloadLimitErrorCode,
	})};`);

	// Inject process and OS config
	parts.push(`globalThis.${getProcessConfigGlobalKey()} = ${JSON.stringify(processConfig)};`);
	parts.push(`globalThis.${getOsConfigGlobalKey()} = ${JSON.stringify(osConfig)};`);

	// Inject TTY config separately — InjectGlobals overwrites _processConfig,
	// so TTY flags need their own global that persists
	if (processConfig.stdinIsTTY || processConfig.stdoutIsTTY || processConfig.stderrIsTTY) {
		parts.push(`globalThis.__runtimeTtyConfig = ${JSON.stringify({
			stdinIsTTY: processConfig.stdinIsTTY,
			stdoutIsTTY: processConfig.stdoutIsTTY,
			stderrIsTTY: processConfig.stderrIsTTY,
		})};`);
	}

	// Inject timer/handle limits
	if (bridgeConfig.maxTimers !== undefined) {
		parts.push(`globalThis._maxTimers = ${bridgeConfig.maxTimers};`);
	}
	if (bridgeConfig.maxHandles !== undefined) {
		parts.push(`globalThis._maxHandles = ${bridgeConfig.maxHandles};`);
	}

	// Apply timing mitigation
	if (timingMitigation === "freeze") {
		parts.push(`globalThis.__runtimeTimingMitigationConfig = ${JSON.stringify({ frozenTimeMs })};`);
		parts.push(getIsolateRuntimeSource("applyTimingMitigationFreeze"));
	} else {
		parts.push(getIsolateRuntimeSource("applyTimingMitigationOff"));
	}

	// Apply execution overrides (env, cwd, stdin) for exec mode
	if (mode === "exec") {
		if (processConfig.env) {
			parts.push(`globalThis.__runtimeProcessEnvOverride = ${JSON.stringify(processConfig.env)};`);
			parts.push(getIsolateRuntimeSource("overrideProcessEnv"));
		}
		if (processConfig.cwd) {
			parts.push(`globalThis.__runtimeProcessCwdOverride = ${JSON.stringify(processConfig.cwd)};`);
			parts.push(getIsolateRuntimeSource("overrideProcessCwd"));
		}
		if (bridgeConfig.stdin !== undefined) {
			parts.push(`globalThis.__runtimeStdinData = ${JSON.stringify(bridgeConfig.stdin)};`);
			parts.push(getIsolateRuntimeSource("setStdinData"));
		}
		// Set CommonJS globals
		parts.push(getIsolateRuntimeSource("initCommonjsModuleGlobals"));
		if (filePath) {
			const dirname = filePath.includes("/")
				? filePath.substring(0, filePath.lastIndexOf("/")) || "/"
				: "/";
			parts.push(`globalThis.__runtimeCommonJsFileConfig = ${JSON.stringify({ filePath, dirname })};`);
			parts.push(getIsolateRuntimeSource("setCommonjsFileGlobals"));
		}
	} else {
		// run mode — still need CommonJS module globals
		parts.push(getIsolateRuntimeSource("initCommonjsModuleGlobals"));
		if (filePath) {
			const dirname = filePath.includes("/")
				? filePath.substring(0, filePath.lastIndexOf("/")) || "/"
				: "/";
			parts.push(`globalThis.__runtimeCommonJsFileConfig = ${JSON.stringify({ filePath, dirname })};`);
			parts.push(getIsolateRuntimeSource("setCommonjsFileGlobals"));
		}
	}

	// Apply custom global exposure policy
	parts.push(`globalThis.__runtimeCustomGlobalPolicy = ${JSON.stringify({
		hardenedGlobals: getHardenedGlobals(),
		mutableGlobals: getMutableGlobals(),
	})};`);
	parts.push(getIsolateRuntimeSource("applyCustomGlobalPolicy"));

	// Inflate SecureExec.bindings from flattened __bind.* globals
	parts.push(buildBindingsInflationSnippet(bindingKeys ?? []));

	return parts.join("\n");
}

// Import global exposure policy constants
import {
	HARDENED_NODE_CUSTOM_GLOBALS,
	MUTABLE_NODE_CUSTOM_GLOBALS,
} from "@secure-exec/core/internal/shared/global-exposure";
import {
	HOST_BRIDGE_GLOBAL_KEYS,
} from "./bridge-contract.js";

function getHardenedGlobals(): string[] { return HARDENED_NODE_CUSTOM_GLOBALS; }
function getMutableGlobals(): string[] { return MUTABLE_NODE_CUSTOM_GLOBALS; }
function getProcessConfigGlobalKey(): string { return HOST_BRIDGE_GLOBAL_KEYS.processConfig; }
function getOsConfigGlobalKey(): string { return HOST_BRIDGE_GLOBAL_KEYS.osConfig; }

/** Build the JS snippet that inflates __bind.* globals into a frozen SecureExec.bindings tree. */
function buildBindingsInflationSnippet(bindingKeys: string[]): string {
	// Build dispatch wrappers for each binding key and assign directly to the
	// tree nodes. Uses _loadPolyfill as the dispatch multiplexer (same as the
	// static dispatch shim for internal bridge globals).
	return `(function(){
var __bindingKeys__=${JSON.stringify(bindingKeys)};
var tree={};
function makeBindFn(bk){
return function(){var args=Array.prototype.slice.call(arguments);var encoded="__bd:"+bk+":"+JSON.stringify(args);var r=_loadPolyfill.applySyncPromise(undefined,[encoded]);if(r===null)return undefined;try{var p=JSON.parse(r);if(p.__bd_error)throw new Error(p.__bd_error);return p.__bd_result;}catch(e){if(e.message&&e.message.startsWith("No handler:"))return undefined;throw e;}};
}
for(var i=0;i<__bindingKeys__.length;i++){
var parts=__bindingKeys__[i].split(".");
var node=tree;
for(var j=0;j<parts.length-1;j++){node[parts[j]]=node[parts[j]]||{};node=node[parts[j]];}
node[parts[parts.length-1]]=makeBindFn("__bind."+__bindingKeys__[i]);
}
function deepFreeze(obj){
var vals=Object.values(obj);
for(var k=0;k<vals.length;k++){if(typeof vals[k]==="object"&&vals[k]!==null)deepFreeze(vals[k]);}
return Object.freeze(obj);
}
Object.defineProperty(globalThis,"SecureExec",{value:Object.freeze({bindings:deepFreeze(tree)}),writable:false,enumerable:true,configurable:false});
})();`;
}
