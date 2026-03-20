import { getRuntimeExposeMutableGlobal } from "../common/global-exposure";
import { setGlobalValue } from "../common/global-access";

const __runtimeExposeMutableGlobal = getRuntimeExposeMutableGlobal();

const __bridgeSetupConfig = globalThis.__runtimeBridgeSetupConfig ?? {};

const __initialCwd =
	typeof __bridgeSetupConfig.initialCwd === "string"
		? __bridgeSetupConfig.initialCwd
		: "/";

// Set payload limit defaults on globalThis — read at call time by v8.deserialize,
// overridable via __runtimeApplyConfig for context snapshot restore
globalThis.__runtimeJsonPayloadLimitBytes =
	typeof __bridgeSetupConfig.jsonPayloadLimitBytes === "number" &&
	Number.isFinite(__bridgeSetupConfig.jsonPayloadLimitBytes)
		? Math.max(0, Math.floor(__bridgeSetupConfig.jsonPayloadLimitBytes))
		: 4 * 1024 * 1024;
globalThis.__runtimePayloadLimitErrorCode =
	typeof __bridgeSetupConfig.payloadLimitErrorCode === "string" &&
	__bridgeSetupConfig.payloadLimitErrorCode.length > 0
		? __bridgeSetupConfig.payloadLimitErrorCode
		: "ERR_SANDBOX_PAYLOAD_TOO_LARGE";

// Structured clone encode: converts any value to a JSON-safe tagged representation.
// All non-primitive values are tagged with { t: "type", ... } to avoid ambiguity.
// Circular references tracked via `seen` map → emitted as { t: "ref", i: N }.
function __scEncode(
	value: unknown,
	seen: Map<object, number>,
): unknown {
	if (value === null) return null;
	if (value === undefined) return { t: "undef" };
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return value;
	if (typeof value === "bigint") return { t: "bigint", v: String(value) };
	if (typeof value === "number") {
		if (Object.is(value, -0)) return { t: "-0" };
		if (Number.isNaN(value)) return { t: "nan" };
		if (value === Infinity) return { t: "inf" };
		if (value === -Infinity) return { t: "-inf" };
		return value;
	}

	const obj = value as object;
	if (seen.has(obj)) return { t: "ref", i: seen.get(obj) };
	const idx = seen.size;
	seen.set(obj, idx);

	if (value instanceof Date)
		return { t: "date", v: value.getTime() };
	if (value instanceof RegExp)
		return { t: "regexp", p: value.source, f: value.flags };
	if (value instanceof Map) {
		const entries: unknown[][] = [];
		value.forEach((v, k) => {
			entries.push([__scEncode(k, seen), __scEncode(v, seen)]);
		});
		return { t: "map", v: entries };
	}
	if (value instanceof Set) {
		const elems: unknown[] = [];
		value.forEach((v) => {
			elems.push(__scEncode(v, seen));
		});
		return { t: "set", v: elems };
	}
	if (value instanceof ArrayBuffer) {
		return { t: "ab", v: Array.from(new Uint8Array(value)) };
	}
	if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
		return {
			t: "ta",
			k: value.constructor.name,
			v: Array.from(
				new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
			),
		};
	}
	if (Array.isArray(value)) {
		return {
			t: "arr",
			v: value.map((v) => __scEncode(v, seen)),
		};
	}

	// Plain object
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(value as Record<string, unknown>)) {
		result[key] = __scEncode(
			(value as Record<string, unknown>)[key],
			seen,
		);
	}
	return { t: "obj", v: result };
}

// Structured clone decode: reconstructs values from tagged representation.
// Container objects are pushed to `refs` before recursing so circular refs resolve.
function __scDecode(tagged: unknown, refs: unknown[]): unknown {
	if (tagged === null) return null;
	if (
		typeof tagged === "boolean" ||
		typeof tagged === "string" ||
		typeof tagged === "number"
	)
		return tagged;

	const tag = (tagged as { t?: string }).t;
	if (tag === undefined) return tagged;

	switch (tag) {
		case "undef":
			return undefined;
		case "nan":
			return NaN;
		case "inf":
			return Infinity;
		case "-inf":
			return -Infinity;
		case "-0":
			return -0;
		case "bigint":
			return BigInt((tagged as { v: string }).v);
		case "ref":
			return refs[(tagged as { i: number }).i];
		case "date": {
			const d = new Date((tagged as { v: number }).v);
			refs.push(d);
			return d;
		}
		case "regexp": {
			const r = new RegExp(
				(tagged as { p: string }).p,
				(tagged as { f: string }).f,
			);
			refs.push(r);
			return r;
		}
		case "map": {
			const m = new Map();
			refs.push(m);
			for (const [k, v] of (tagged as { v: unknown[][] }).v) {
				m.set(__scDecode(k, refs), __scDecode(v, refs));
			}
			return m;
		}
		case "set": {
			const s = new Set();
			refs.push(s);
			for (const v of (tagged as { v: unknown[] }).v) {
				s.add(__scDecode(v, refs));
			}
			return s;
		}
		case "ab": {
			const bytes = (tagged as { v: number[] }).v;
			const ab = new ArrayBuffer(bytes.length);
			const u8 = new Uint8Array(ab);
			for (let i = 0; i < bytes.length; i++) u8[i] = bytes[i]!;
			refs.push(ab);
			return ab;
		}
		case "ta": {
			const { k, v: bytes } = tagged as { k: string; v: number[] };
			const ctors: Record<string, new (buf: ArrayBuffer) => ArrayBufferView> =
				{
					Int8Array: Int8Array,
					Uint8Array: Uint8Array,
					Uint8ClampedArray: Uint8ClampedArray,
					Int16Array: Int16Array,
					Uint16Array: Uint16Array,
					Int32Array: Int32Array,
					Uint32Array: Uint32Array,
					Float32Array: Float32Array,
					Float64Array: Float64Array,
				};
			const Ctor = ctors[k] ?? Uint8Array;
			const ab = new ArrayBuffer(bytes.length);
			const u8 = new Uint8Array(ab);
			for (let i = 0; i < bytes.length; i++) u8[i] = bytes[i]!;
			const ta = new Ctor(ab);
			refs.push(ta);
			return ta;
		}
		case "arr": {
			const arr: unknown[] = [];
			refs.push(arr);
			for (const v of (tagged as { v: unknown[] }).v) {
				arr.push(__scDecode(v, refs));
			}
			return arr;
		}
		case "obj": {
			const obj: Record<string, unknown> = {};
			refs.push(obj);
			const entries = (tagged as { v: Record<string, unknown> }).v;
			for (const key of Object.keys(entries)) {
				obj[key] = __scDecode(entries[key], refs);
			}
			return obj;
		}
		default:
			return tagged;
	}
}

__runtimeExposeMutableGlobal("_moduleCache", {});
globalThis._moduleCache = globalThis._moduleCache ?? {};

const __moduleCache = globalThis._moduleCache;
if (__moduleCache) {
	__moduleCache["v8"] = {
		getHeapStatistics: function () {
			return {
				total_heap_size: 67108864,
				total_heap_size_executable: 1048576,
				total_physical_size: 67108864,
				total_available_size: 67108864,
				used_heap_size: 52428800,
				heap_size_limit: 134217728,
				malloced_memory: 8192,
				peak_malloced_memory: 16384,
				does_zap_garbage: 0,
				number_of_native_contexts: 1,
				number_of_detached_contexts: 0,
				external_memory: 0,
			};
		},
		getHeapSpaceStatistics: function () {
			return [];
		},
		getHeapCodeStatistics: function () {
			return {};
		},
		setFlagsFromString: function () {},
		serialize: function (value: unknown) {
			return Buffer.from(
				JSON.stringify({ $v8sc: 1, d: __scEncode(value, new Map()) }),
			);
		},
		deserialize: function (buffer: Buffer) {
			// Read limits from globals at call time (not captured at setup) for snapshot compatibility
			const limit = globalThis.__runtimeJsonPayloadLimitBytes ?? 4 * 1024 * 1024;
			const errorCode = globalThis.__runtimePayloadLimitErrorCode ?? "ERR_SANDBOX_PAYLOAD_TOO_LARGE";
			// Check raw buffer size BEFORE allocating the decoded string
			if (buffer.length > limit) {
				throw new Error(
					errorCode +
						": v8.deserialize exceeds " +
						String(limit) +
						" bytes",
				);
			}
			const text = buffer.toString();
			const envelope = JSON.parse(text) as {
				$v8sc?: number;
				d?: unknown;
			};
			if (
				envelope !== null &&
				typeof envelope === "object" &&
				envelope.$v8sc === 1
			) {
				return __scDecode(envelope.d, []);
			}
			// Legacy JSON format fallback
			return envelope;
		},
		cachedDataVersionTag: function () {
			return 0;
		},
	};
}

__runtimeExposeMutableGlobal("_pendingModules", {});
__runtimeExposeMutableGlobal("_currentModule", { dirname: __initialCwd });

// Post-restore config application — called after bridge IIFE to apply
// per-session config (timing mitigation, payload limits). Enables context
// snapshot reuse: the IIFE runs once at snapshot creation, this function
// applies session-specific config after restore.
globalThis.__runtimeApplyConfig = function (config: {
	timingMitigation?: string;
	frozenTimeMs?: number;
	payloadLimitBytes?: number;
	payloadLimitErrorCode?: string;
}) {
	// Apply payload limits
	if (
		typeof config.payloadLimitBytes === "number" &&
		Number.isFinite(config.payloadLimitBytes)
	) {
		globalThis.__runtimeJsonPayloadLimitBytes = Math.max(
			0,
			Math.floor(config.payloadLimitBytes),
		);
	}
	if (
		typeof config.payloadLimitErrorCode === "string" &&
		config.payloadLimitErrorCode.length > 0
	) {
		globalThis.__runtimePayloadLimitErrorCode =
			config.payloadLimitErrorCode;
	}

	// Apply timing mitigation freeze
	if (config.timingMitigation === "freeze") {
		const frozenTimeMs =
			typeof config.frozenTimeMs === "number" &&
			Number.isFinite(config.frozenTimeMs)
				? config.frozenTimeMs
				: Date.now();
		const frozenDateNow = () => frozenTimeMs;

		// Freeze Date.now
		try {
			Object.defineProperty(Date, "now", {
				value: frozenDateNow,
				configurable: false,
				writable: false,
			});
		} catch {
			Date.now = frozenDateNow;
		}

		// Patch Date constructor so new Date().getTime() returns degraded time
		const OrigDate = Date;
		const FrozenDate = function Date(
			this: InstanceType<DateConstructor>,
			...args: unknown[]
		) {
			if (new.target) {
				if (args.length === 0) {
					return new OrigDate(frozenTimeMs);
				}
				// @ts-expect-error — spread forwarding to variadic Date constructor
				return new OrigDate(...args);
			}
			return OrigDate();
		} as unknown as DateConstructor;
		Object.defineProperty(FrozenDate, "prototype", {
			value: OrigDate.prototype,
			writable: false,
			configurable: false,
		});
		FrozenDate.now = frozenDateNow;
		FrozenDate.parse = OrigDate.parse;
		FrozenDate.UTC = OrigDate.UTC;
		Object.defineProperty(FrozenDate, "now", {
			value: frozenDateNow,
			configurable: false,
			writable: false,
		});
		try {
			Object.defineProperty(globalThis, "Date", {
				value: FrozenDate,
				configurable: false,
				writable: false,
			});
		} catch {
			(globalThis as Record<string, unknown>).Date = FrozenDate;
		}

		// Freeze performance.now
		const frozenPerformanceNow = () => 0;
		const origPerf = globalThis.performance;
		const frozenPerf = Object.create(null) as Record<string, unknown>;
		if (typeof origPerf !== "undefined" && origPerf !== null) {
			const src = origPerf as unknown as Record<string, unknown>;
			for (const key of Object.getOwnPropertyNames(
				Object.getPrototypeOf(origPerf) ?? origPerf,
			)) {
				if (key !== "now") {
					try {
						const val = src[key];
						if (typeof val === "function") {
							frozenPerf[key] = val.bind(origPerf);
						} else {
							frozenPerf[key] = val;
						}
					} catch {
						/* skip inaccessible properties */
					}
				}
			}
		}
		Object.defineProperty(frozenPerf, "now", {
			value: frozenPerformanceNow,
			configurable: false,
			writable: false,
		});
		Object.freeze(frozenPerf);
		try {
			Object.defineProperty(globalThis, "performance", {
				value: frozenPerf,
				configurable: false,
				writable: false,
			});
		} catch {
			(globalThis as Record<string, unknown>).performance = frozenPerf;
		}

		// Harden SharedArrayBuffer removal
		const OrigSAB = globalThis.SharedArrayBuffer;
		if (typeof OrigSAB === "function") {
			try {
				const proto = OrigSAB.prototype;
				if (proto) {
					for (const key of [
						"byteLength",
						"slice",
						"grow",
						"maxByteLength",
						"growable",
					]) {
						try {
							Object.defineProperty(proto, key, {
								get() {
									throw new TypeError(
										"SharedArrayBuffer is not available in sandbox",
									);
								},
								configurable: false,
							});
						} catch {
							/* property may not exist or be non-configurable */
						}
					}
				}
			} catch {
				/* best-effort prototype neutering */
			}
		}
		try {
			Object.defineProperty(globalThis, "SharedArrayBuffer", {
				value: undefined,
				configurable: false,
				writable: false,
				enumerable: false,
			});
		} catch {
			Reflect.deleteProperty(globalThis, "SharedArrayBuffer");
			setGlobalValue("SharedArrayBuffer", undefined);
		}
	}

	// Clean up — one-shot function
	delete globalThis.__runtimeApplyConfig;
};
