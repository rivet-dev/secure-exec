import { createNetworkStub, filterEnv } from "./shared/permissions.js";
import type {
	NetworkAdapter,
	RuntimeExecutionDriver,
	RuntimeExecutionDriverFactory,
	RuntimeDriver,
} from "./types.js";
import type {
	StdioHook,
	ExecOptions,
	ExecResult,
	RunResult,
	TimingMitigation,
} from "./shared/api-types.js";

// Re-export types
export type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	RuntimeExecutionDriverFactory,
	RuntimeDriver,
	VirtualFileSystem,
} from "./types.js";
export type { DirEntry, StatInfo } from "./fs-helpers.js";
export type {
	StdioChannel,
	StdioEvent,
	StdioHook,
	ExecOptions,
	ExecResult,
	OSConfig,
	ProcessConfig,
	RunResult,
	TimingMitigation,
} from "./shared/api-types.js";
export {
	createDefaultNetworkAdapter,
	createNodeDriver,
	createNodeExecutionFactory,
	NodeExecutionDriver,
	NodeFileSystem,
} from "./node/driver.js";
export type { ModuleAccessOptions, NodeExecutionFactoryOptions } from "./node/driver.js";
export { createInMemoryFileSystem } from "./shared/in-memory-fs.js";
export {
	allowAll,
	allowAllChildProcess,
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
} from "./shared/permissions.js";

const DEFAULT_SANDBOX_CWD = "/root";
const DEFAULT_SANDBOX_HOME = "/root";
const DEFAULT_SANDBOX_TMPDIR = "/tmp";

export interface NodeRuntimeOptions {
	driver: RuntimeDriver;
	executionFactory: RuntimeExecutionDriverFactory;
	memoryLimit?: number;
	cpuTimeLimitMs?: number;
	timingMitigation?: TimingMitigation;
	onStdio?: StdioHook;
	payloadLimits?: {
		base64TransferBytes?: number;
		jsonPayloadBytes?: number;
	};
}

type UnsafeRuntimeExecutionDriver = RuntimeExecutionDriver & {
	unsafeIsolate?: unknown;
	createUnsafeContext?(options?: {
		env?: Record<string, string>;
		cwd?: string;
		filePath?: string;
	}): Promise<unknown>;
};

export class NodeRuntime {
	private readonly executionDriver: UnsafeRuntimeExecutionDriver;

	constructor(options: NodeRuntimeOptions) {
		const { driver, executionFactory } = options;

		const processConfig = {
			...(driver.runtime.process ?? {}),
		};
		processConfig.cwd ??= DEFAULT_SANDBOX_CWD;
		processConfig.env = filterEnv(processConfig.env, driver.permissions);

		const osConfig = {
			...(driver.runtime.os ?? {}),
		};
		osConfig.homedir ??= DEFAULT_SANDBOX_HOME;
		osConfig.tmpdir ??= DEFAULT_SANDBOX_TMPDIR;

		this.executionDriver = executionFactory.createExecutionDriver({
			driver,
			runtime: {
				process: processConfig,
				os: osConfig,
			},
			memoryLimit: options.memoryLimit,
			cpuTimeLimitMs: options.cpuTimeLimitMs,
			timingMitigation: options.timingMitigation,
			onStdio: options.onStdio,
			payloadLimits: options.payloadLimits,
		}) as UnsafeRuntimeExecutionDriver;
	}

	get network(): Pick<NetworkAdapter, "fetch" | "dnsLookup" | "httpRequest"> {
		const adapter = this.executionDriver.network ?? createNetworkStub();
		return {
			fetch: (url, options) => adapter.fetch(url, options),
			dnsLookup: (hostname) => adapter.dnsLookup(hostname),
			httpRequest: (url, options) => adapter.httpRequest(url, options),
		};
	}

	get __unsafeIsoalte(): unknown {
		if (this.executionDriver.unsafeIsolate === undefined) {
			throw new Error("Driver runtime does not expose unsafe isolate access");
		}
		return this.executionDriver.unsafeIsolate;
	}

	async __unsafeCreateContext(options: {
		env?: Record<string, string>;
		cwd?: string;
		filePath?: string;
	} = {}): Promise<unknown> {
		if (!this.executionDriver.createUnsafeContext) {
			throw new Error("Driver runtime does not expose unsafe context creation");
		}
		return this.executionDriver.createUnsafeContext(options);
	}

	async run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>> {
		return this.executionDriver.run<T>(code, filePath);
	}

	async exec(code: string, options?: ExecOptions): Promise<ExecResult> {
		return this.executionDriver.exec(code, options);
	}

	dispose(): void {
		this.executionDriver.dispose();
	}

	async terminate(): Promise<void> {
		if (this.executionDriver.terminate) {
			await this.executionDriver.terminate();
			return;
		}
		this.executionDriver.dispose();
	}
}
