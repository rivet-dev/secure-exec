import type {
	StdioHook,
	ExecOptions,
	ExecResult,
	OSConfig,
	ProcessConfig,
	RunResult,
	TimingMitigation,
} from "./shared/api-types.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	VirtualFileSystem,
} from "./types.js";

export interface DriverRuntimeConfig {
	process: ProcessConfig;
	os: OSConfig;
}

export interface RuntimeExecutionDriverOptions {
	driver: RuntimeDriver;
	runtime: DriverRuntimeConfig;
	memoryLimit?: number;
	cpuTimeLimitMs?: number;
	timingMitigation?: TimingMitigation;
	onStdio?: StdioHook;
	payloadLimits?: {
		base64TransferBytes?: number;
		jsonPayloadBytes?: number;
	};
}

export interface RuntimeExecutionDriver {
	run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>>;
	exec(code: string, options?: ExecOptions): Promise<ExecResult>;
	dispose(): void;
	terminate?(): Promise<void>;
	readonly network?: Pick<NetworkAdapter, "fetch" | "dnsLookup" | "httpRequest">;
	unsafeIsolate?: unknown;
	createUnsafeContext?(options?: {
		env?: Record<string, string>;
		cwd?: string;
		filePath?: string;
	}): Promise<unknown>;
}

export interface RuntimeExecutionDriverFactory {
	createExecutionDriver(
		options: RuntimeExecutionDriverOptions,
	): RuntimeExecutionDriver;
}

export interface RuntimeDriver {
	filesystem?: VirtualFileSystem;
	network?: NetworkAdapter;
	commandExecutor?: CommandExecutor;
	permissions?: Permissions;
	runtime: DriverRuntimeConfig;
}
