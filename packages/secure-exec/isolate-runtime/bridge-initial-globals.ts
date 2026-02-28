const __runtimeExposeMutableGlobal =
	typeof (globalThis as Record<string, unknown>).__runtimeExposeMutableGlobal ===
	"function"
		? ((globalThis as Record<string, unknown>).__runtimeExposeMutableGlobal as (
				name: string,
				value: unknown,
		  ) => void)
		: (name: string, value: unknown) => {
				Object.defineProperty(globalThis, name, {
					value,
					writable: true,
					configurable: true,
					enumerable: true,
				});
		  };

const __bridgeSetupConfig =
	((globalThis as Record<string, unknown>).__runtimeBridgeSetupConfig as {
		initialCwd?: string;
		jsonPayloadLimitBytes?: number;
		payloadLimitErrorCode?: string;
	}) ?? {};

const __initialCwd =
	typeof __bridgeSetupConfig.initialCwd === "string"
		? __bridgeSetupConfig.initialCwd
		: "/";
const __jsonPayloadLimitBytes =
	typeof __bridgeSetupConfig.jsonPayloadLimitBytes === "number" &&
	Number.isFinite(__bridgeSetupConfig.jsonPayloadLimitBytes)
		? Math.max(0, Math.floor(__bridgeSetupConfig.jsonPayloadLimitBytes))
		: 4 * 1024 * 1024;
const __payloadLimitErrorCode =
	typeof __bridgeSetupConfig.payloadLimitErrorCode === "string" &&
	__bridgeSetupConfig.payloadLimitErrorCode.length > 0
		? __bridgeSetupConfig.payloadLimitErrorCode
		: "ERR_SANDBOX_PAYLOAD_TOO_LARGE";

__runtimeExposeMutableGlobal("_moduleCache", {});

(globalThis as Record<string, unknown>)._moduleCache =
	(globalThis as Record<string, unknown>)._moduleCache ?? {};

((globalThis as Record<string, unknown>)._moduleCache as Record<string, unknown>)["v8"] = {
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
		return Buffer.from(JSON.stringify(value));
	},
	deserialize: function (buffer: Buffer) {
		const text = buffer.toString();
		if (Buffer.byteLength(text, "utf8") > __jsonPayloadLimitBytes) {
			throw new Error(
				__payloadLimitErrorCode +
					": v8.deserialize exceeds " +
					String(__jsonPayloadLimitBytes) +
					" bytes",
			);
		}
		return JSON.parse(text);
	},
	cachedDataVersionTag: function () {
		return 0;
	},
};

__runtimeExposeMutableGlobal("_pendingModules", {});
__runtimeExposeMutableGlobal("_currentModule", { dirname: __initialCwd });
