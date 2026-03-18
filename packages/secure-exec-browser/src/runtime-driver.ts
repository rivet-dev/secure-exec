import { createNetworkStub } from "@secure-exec/core";
import type {
	NetworkAdapter,
	NodeRuntimeDriver,
	NodeRuntimeDriverFactory,
	RuntimeDriverOptions,
} from "@secure-exec/core";
import type {
	ExecOptions,
	ExecResult,
	RunResult,
	StdioHook,
} from "@secure-exec/core";
import {
	getBrowserSystemDriverOptions,
} from "./driver.js";
import type {
	SerializedPermissions,
	BrowserWorkerExecOptions,
	BrowserWorkerInitPayload,
	BrowserWorkerOutboundMessage,
	BrowserWorkerRequestMessage,
} from "./worker-protocol.js";

export interface BrowserRuntimeDriverFactoryOptions {
	workerUrl?: URL | string;
}

type PendingRequest = {
	resolve(value: unknown): void;
	reject(reason: unknown): void;
	hook?: StdioHook;
};

const BROWSER_OPTION_VALIDATORS = [
	{
		label: "memoryLimit",
		hasValue: (options: RuntimeDriverOptions) => options.memoryLimit !== undefined,
	},
	{
		label: "cpuTimeLimitMs",
		hasValue: (options: RuntimeDriverOptions) =>
			options.cpuTimeLimitMs !== undefined,
	},
	{
		label: "timingMitigation",
		hasValue: (options: RuntimeDriverOptions) =>
			options.timingMitigation !== undefined,
	},
];

function serializePermissions(
	permissions?: RuntimeDriverOptions["system"]["permissions"],
): SerializedPermissions | undefined {
	if (!permissions) {
		return undefined;
	}
	const serialize = (fn?: unknown) =>
		typeof fn === "function" ? fn.toString() : undefined;
	return {
		fs: serialize(permissions.fs),
		network: serialize(permissions.network),
		childProcess: serialize(permissions.childProcess),
		env: serialize(permissions.env),
	};
}

function resolveWorkerUrl(workerUrl?: URL | string): URL {
	if (workerUrl instanceof URL) {
		return workerUrl;
	}
	if (workerUrl) {
		return new URL(workerUrl, import.meta.url);
	}
	return new URL("./worker.js", import.meta.url);
}

function toBrowserWorkerExecOptions(
	options?: ExecOptions,
): BrowserWorkerExecOptions | undefined {
	if (!options) {
		return undefined;
	}
	return {
		filePath: options.filePath,
		env: options.env,
		cwd: options.cwd,
		stdin: options.stdin,
	};
}

function validateBrowserRuntimeOptions(options: RuntimeDriverOptions): void {
	const unsupported = BROWSER_OPTION_VALIDATORS
		.filter((validator) => validator.hasValue(options))
		.map((validator) => validator.label);
	if (unsupported.length === 0) {
		return;
	}
	throw new Error(
		`Browser runtime does not support Node-only options: ${unsupported.join(", ")}`,
	);
}

function validateBrowserExecOptions(options?: ExecOptions): void {
	const unsupported: string[] = [];
	if (options?.cpuTimeLimitMs !== undefined) {
		unsupported.push("cpuTimeLimitMs");
	}
	if (options?.timingMitigation !== undefined) {
		unsupported.push("timingMitigation");
	}
	if (unsupported.length === 0) {
		return;
	}
	throw new Error(
		`Browser runtime does not support Node-only exec options: ${unsupported.join(", ")}`,
	);
}

export class BrowserRuntimeDriver implements NodeRuntimeDriver {
	private readonly worker: Worker;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly defaultOnStdio?: StdioHook;
	private readonly networkAdapter: NetworkAdapter;
	private readonly ready: Promise<void>;
	private nextId = 1;
	private disposed = false;

	constructor(
		private readonly options: RuntimeDriverOptions,
		factoryOptions: BrowserRuntimeDriverFactoryOptions = {},
	) {
		if (typeof Worker === "undefined") {
			throw new Error("Browser runtime requires a global Worker implementation");
		}

		this.defaultOnStdio = options.onStdio;
		this.networkAdapter = options.system.network ?? createNetworkStub();
		this.worker = new Worker(resolveWorkerUrl(factoryOptions.workerUrl), {
			type: "module",
		});
		this.worker.onmessage = this.handleWorkerMessage;
		this.worker.onerror = this.handleWorkerError;

		const browserSystemOptions = getBrowserSystemDriverOptions(options.system);
		const initPayload: BrowserWorkerInitPayload = {
			processConfig: options.runtime.process,
			osConfig: options.runtime.os,
			permissions: serializePermissions(options.system.permissions),
			filesystem: browserSystemOptions.filesystem,
			networkEnabled: browserSystemOptions.networkEnabled,
			payloadLimits: options.payloadLimits,
		};

		this.ready = this.callWorker("init", initPayload).then(() => undefined);
		this.ready.catch(() => undefined);
	}

	get network(): Pick<NetworkAdapter, "fetch" | "dnsLookup" | "httpRequest"> {
		const adapter = this.networkAdapter;
		return {
			fetch: (url, options) => adapter.fetch(url, options),
			dnsLookup: (hostname) => adapter.dnsLookup(hostname),
			httpRequest: (url, options) => adapter.httpRequest(url, options),
		};
	}

	private handleWorkerError = (event: ErrorEvent): void => {
		const error = event.error instanceof Error
			? event.error
			: new Error(
					event.message
						? `Browser runtime worker error: ${event.message} (${event.filename}:${event.lineno}:${event.colno})`
						: "Browser runtime worker error",
				);
		this.rejectAllPending(error);
	};

	private handleWorkerMessage = (
		event: MessageEvent<BrowserWorkerOutboundMessage>,
	): void => {
		const message = event.data;

		if (message.type === "stdio") {
			const pending = this.pending.get(message.requestId);
			const hook = pending?.hook ?? this.defaultOnStdio;
			if (!hook) {
				return;
			}
			try {
				hook({ channel: message.channel, message: message.message });
			} catch {
				// Ignore host hook errors so sandbox execution can continue.
			}
			return;
		}

		const pending = this.pending.get(message.id);
		if (!pending) {
			return;
		}
		this.pending.delete(message.id);

		if (message.ok) {
			pending.resolve(message.result);
			return;
		}

		const error = new Error(message.error.message);
		if (message.error.stack) {
			error.stack = message.error.stack;
		}
		(error as { code?: string }).code = message.error.code;
		pending.reject(error);
	};

	private rejectAllPending(error: Error): void {
		const entries = Array.from(this.pending.values());
		this.pending.clear();
		for (const pending of entries) {
			pending.reject(error);
		}
	}

	private callWorker<T>(
		type: BrowserWorkerRequestMessage["type"],
		payload?: unknown,
		hook?: StdioHook,
	): Promise<T> {
		if (this.disposed) {
			return Promise.reject(new Error("Browser runtime has been disposed"));
		}
		const id = this.nextId++;
		const message: BrowserWorkerRequestMessage = payload === undefined
			? { id, type } as BrowserWorkerRequestMessage
			: { id, type, payload } as BrowserWorkerRequestMessage;

		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, { resolve, reject, hook });
			this.worker.postMessage(message);
		});
	}

	async run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>> {
		await this.ready;
		const hook = this.defaultOnStdio;
		return this.callWorker<RunResult<T>>(
			"run",
			{
				code,
				filePath,
				captureStdio: Boolean(hook),
			},
			hook,
		);
	}

	async exec(code: string, options?: ExecOptions): Promise<ExecResult> {
		validateBrowserExecOptions(options);
		await this.ready;
		const hook = options?.onStdio ?? this.defaultOnStdio;
		return this.callWorker<ExecResult>(
			"exec",
			{
				code,
				options: toBrowserWorkerExecOptions(options),
				captureStdio: Boolean(hook),
			},
			hook,
		);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.worker.terminate();
		this.rejectAllPending(new Error("Browser runtime has been disposed"));
	}

	async terminate(): Promise<void> {
		this.dispose();
	}
}

export function createBrowserRuntimeDriverFactory(
	factoryOptions: BrowserRuntimeDriverFactoryOptions = {},
): NodeRuntimeDriverFactory {
	return {
		createRuntimeDriver(options) {
			validateBrowserRuntimeOptions(options);
			return new BrowserRuntimeDriver(options, factoryOptions);
		},
	};
}
