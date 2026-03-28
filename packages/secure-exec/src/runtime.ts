import { createNetworkStub, filterEnv } from "@secure-exec/core";
import type {
	NetworkAdapter,
	NodeRuntimeDriver,
	NodeRuntimeDriverFactory,
	SystemDriver,
} from "@secure-exec/core";
import type {
	StdioHook,
	ExecOptions,
	ExecResult,
	RunResult,
	TimingMitigation,
} from "@secure-exec/core";
import type { ResourceBudgets } from "@secure-exec/core";
import { createSandboxCommandExecutor } from "@secure-exec/nodejs";

const DEFAULT_SANDBOX_CWD = "/root";
const DEFAULT_SANDBOX_HOME = "/root";
const DEFAULT_SANDBOX_TMPDIR = "/tmp";

export interface NodeRuntimeOptions {
	systemDriver: SystemDriver;
	runtimeDriverFactory: NodeRuntimeDriverFactory;
	memoryLimit?: number;
	cpuTimeLimitMs?: number;
	timingMitigation?: TimingMitigation;
	onStdio?: StdioHook;
	payloadLimits?: {
		base64TransferBytes?: number;
		jsonPayloadBytes?: number;
	};
	resourceBudgets?: ResourceBudgets;
}

type UnsafeRuntimeDriver = NodeRuntimeDriver & {
	unsafeIsolate?: unknown;
	createUnsafeContext?(options?: {
		env?: Record<string, string>;
		cwd?: string;
		filePath?: string;
	}): Promise<unknown>;
};

export class NodeRuntime {
	private readonly runtimeDriver: UnsafeRuntimeDriver;

	constructor(options: NodeRuntimeOptions) {
		const { runtimeDriverFactory } = options;

		// Auto-inject sandbox command executor when none is configured
		const systemDriver: SystemDriver = options.systemDriver.commandExecutor
			? options.systemDriver
			: {
					...options.systemDriver,
					commandExecutor: createSandboxCommandExecutor(
						runtimeDriverFactory,
						options.systemDriver,
					),
				};

		const processConfig = {
			...(systemDriver.runtime.process ?? {}),
		};
		processConfig.cwd ??= DEFAULT_SANDBOX_CWD;
		processConfig.env = filterEnv(processConfig.env, systemDriver.permissions);

		const osConfig = {
			...(systemDriver.runtime.os ?? {}),
		};
		osConfig.homedir ??= DEFAULT_SANDBOX_HOME;
		osConfig.tmpdir ??= DEFAULT_SANDBOX_TMPDIR;

		this.runtimeDriver = runtimeDriverFactory.createRuntimeDriver({
			system: systemDriver,
			runtime: {
				process: processConfig,
				os: osConfig,
			},
			memoryLimit: options.memoryLimit,
			cpuTimeLimitMs: options.cpuTimeLimitMs,
			timingMitigation: options.timingMitigation,
			onStdio: options.onStdio,
			payloadLimits: options.payloadLimits,
			resourceBudgets: options.resourceBudgets,
		}) as UnsafeRuntimeDriver;
	}

	get network(): Pick<NetworkAdapter, "fetch" | "dnsLookup" | "httpRequest"> {
		const adapter = this.runtimeDriver.network ?? createNetworkStub();
		return {
			fetch: (url, options) => adapter.fetch(url, options),
			dnsLookup: (hostname) => adapter.dnsLookup(hostname),
			httpRequest: (url, options) => adapter.httpRequest(url, options),
		};
	}

	get __unsafeIsoalte(): unknown {
		if (this.runtimeDriver.unsafeIsolate === undefined) {
			throw new Error("Driver runtime does not expose unsafe isolate access");
		}
		return this.runtimeDriver.unsafeIsolate;
	}

	async __unsafeCreateContext(options: {
		env?: Record<string, string>;
		cwd?: string;
		filePath?: string;
	} = {}): Promise<unknown> {
		if (!this.runtimeDriver.createUnsafeContext) {
			throw new Error("Driver runtime does not expose unsafe context creation");
		}
		return this.runtimeDriver.createUnsafeContext(options);
	}

	async run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>> {
		return this.runtimeDriver.run<T>(code, filePath);
	}

	async exec(code: string, options?: ExecOptions): Promise<ExecResult> {
		return this.runtimeDriver.exec(code, options);
	}

	dispose(): void {
		this.runtimeDriver.dispose();
	}

	async terminate(): Promise<void> {
		if (this.runtimeDriver.terminate) {
			await this.runtimeDriver.terminate();
			return;
		}
		this.runtimeDriver.dispose();
	}
}
