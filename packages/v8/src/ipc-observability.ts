import http from "node:http";
import { mkdirSync, createWriteStream, type WriteStream } from "node:fs";
import { dirname } from "node:path";
import type { AddressInfo } from "node:net";
import v8 from "node:v8";
import type { BinaryFrame } from "./ipc-binary.js";

export interface V8IpcObservabilityOptions {
	logFile?: string;
	metrics?: {
		host?: string;
		port: number;
		path?: string;
	};
}

type LabelValues = Record<string, string>;

const DEFAULT_METRICS_HOST = "127.0.0.1";
const DEFAULT_METRICS_PATH = "/metrics";
const HISTOGRAM_BUCKETS_SECONDS = [
	0.0005,
	0.001,
	0.0025,
	0.005,
	0.01,
	0.025,
	0.05,
	0.1,
	0.25,
	0.5,
	1,
	2.5,
	5,
	10,
];

function nowIso(): string {
	return new Date().toISOString();
}

function hrtimeSeconds(start: bigint, end = process.hrtime.bigint()): number {
	return Number(end - start) / 1_000_000_000;
}

function escapeLabelValue(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("\n", "\\n")
		.replaceAll('"', '\\"');
}

function formatLabels(labels: LabelValues): string {
	const entries = Object.entries(labels);
	if (entries.length === 0) return "";
	return `{${entries
		.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
		.join(",")}}`;
}

function metricKey(labelNames: string[], labels: LabelValues): string {
	return labelNames.map((name) => `${name}=${labels[name] ?? ""}`).join("\u0000");
}

function normalizeLabels(
	labelNames: string[],
	input: Record<string, string | number | boolean | undefined>,
): LabelValues {
	const labels: LabelValues = {};
	for (const name of labelNames) {
		const value = input[name];
		labels[name] = value === undefined ? "" : String(value);
	}
	return labels;
}

class CounterMetric {
	private readonly samples = new Map<string, { labels: LabelValues; value: number }>();

	constructor(
		readonly name: string,
		readonly help: string,
		private readonly labelNames: string[] = [],
	) {}

	inc(
		inputLabels: Record<string, string | number | boolean | undefined> = {},
		value = 1,
	): void {
		const labels = normalizeLabels(this.labelNames, inputLabels);
		const key = metricKey(this.labelNames, labels);
		const sample = this.samples.get(key) ?? { labels, value: 0 };
		sample.value += value;
		this.samples.set(key, sample);
	}

	render(): string[] {
		const lines = [
			`# HELP ${this.name} ${this.help}`,
			`# TYPE ${this.name} counter`,
		];
		for (const sample of this.samples.values()) {
			lines.push(`${this.name}${formatLabels(sample.labels)} ${sample.value}`);
		}
		return lines;
	}
}

class GaugeMetric {
	private readonly samples = new Map<string, { labels: LabelValues; value: number }>();

	constructor(
		readonly name: string,
		readonly help: string,
		private readonly labelNames: string[] = [],
	) {}

	inc(
		inputLabels: Record<string, string | number | boolean | undefined> = {},
		value = 1,
	): void {
		const labels = normalizeLabels(this.labelNames, inputLabels);
		const key = metricKey(this.labelNames, labels);
		const sample = this.samples.get(key) ?? { labels, value: 0 };
		sample.value += value;
		this.samples.set(key, sample);
	}

	dec(
		inputLabels: Record<string, string | number | boolean | undefined> = {},
		value = 1,
	): void {
		this.inc(inputLabels, -value);
	}

	render(): string[] {
		const lines = [
			`# HELP ${this.name} ${this.help}`,
			`# TYPE ${this.name} gauge`,
		];
		for (const sample of this.samples.values()) {
			lines.push(`${this.name}${formatLabels(sample.labels)} ${sample.value}`);
		}
		return lines;
	}
}

class HistogramMetric {
	private readonly samples = new Map<
		string,
		{
			labels: LabelValues;
			buckets: number[];
			count: number;
			sum: number;
		}
	>();

	constructor(
		readonly name: string,
		readonly help: string,
		private readonly bucketBounds: number[],
		private readonly labelNames: string[] = [],
	) {}

	observe(
		inputLabels: Record<string, string | number | boolean | undefined> = {},
		value: number,
	): void {
		const labels = normalizeLabels(this.labelNames, inputLabels);
		const key = metricKey(this.labelNames, labels);
		const sample =
			this.samples.get(key) ??
			{
				labels,
				buckets: this.bucketBounds.map(() => 0),
				count: 0,
				sum: 0,
			};
		for (let index = 0; index < this.bucketBounds.length; index += 1) {
			if (value <= this.bucketBounds[index]) {
				sample.buckets[index] += 1;
			}
		}
		sample.count += 1;
		sample.sum += value;
		this.samples.set(key, sample);
	}

	render(): string[] {
		const lines = [
			`# HELP ${this.name} ${this.help}`,
			`# TYPE ${this.name} histogram`,
		];
		for (const sample of this.samples.values()) {
			for (let index = 0; index < this.bucketBounds.length; index += 1) {
				const bucketLabels = {
					...sample.labels,
					le: String(this.bucketBounds[index]),
				};
				lines.push(
					`${this.name}_bucket${formatLabels(bucketLabels)} ${sample.buckets[index]}`,
				);
			}
			lines.push(
				`${this.name}_bucket${formatLabels({ ...sample.labels, le: "+Inf" })} ${sample.count}`,
			);
			lines.push(`${this.name}_sum${formatLabels(sample.labels)} ${sample.sum}`);
			lines.push(`${this.name}_count${formatLabels(sample.labels)} ${sample.count}`);
		}
		return lines;
	}
}

class PrometheusRegistry {
	private readonly counters: CounterMetric[] = [];
	private readonly gauges: GaugeMetric[] = [];
	private readonly histograms: HistogramMetric[] = [];

	counter(name: string, help: string, labelNames: string[] = []): CounterMetric {
		const metric = new CounterMetric(name, help, labelNames);
		this.counters.push(metric);
		return metric;
	}

	gauge(name: string, help: string, labelNames: string[] = []): GaugeMetric {
		const metric = new GaugeMetric(name, help, labelNames);
		this.gauges.push(metric);
		return metric;
	}

	histogram(
		name: string,
		help: string,
		buckets: number[],
		labelNames: string[] = [],
	): HistogramMetric {
		const metric = new HistogramMetric(name, help, buckets, labelNames);
		this.histograms.push(metric);
		return metric;
	}

	render(): string {
		return [
			...this.counters.flatMap((metric) => metric.render()),
			...this.gauges.flatMap((metric) => metric.render()),
			...this.histograms.flatMap((metric) => metric.render()),
			"",
		].join("\n");
	}
}

interface PendingExecution {
	startedAt: bigint;
	mode: string;
}

interface PendingBridgeCall {
	startedAt: bigint;
	method: string;
}

export interface IpcObservability {
	recordRuntimeEvent(
		event: string,
		fields?: Record<string, string | number | boolean | undefined>,
	): void;
	recordConnectionEvent(
		event: string,
		fields?: Record<string, string | number | boolean | undefined>,
	): void;
	recordFrame(direction: "send" | "recv", frame: BinaryFrame, encodedBytes: number): void;
	recordFrameError(
		reason: "decode" | "oversize",
		fields?: Record<string, string | number | boolean | undefined>,
	): void;
	markExecuteStart(
		sessionId: string,
		fields: { mode: "exec" | "run"; filePath?: string },
	): void;
	markExecuteFinish(
		sessionId: string,
		fields: { exitCode: number; errorCode?: string },
	): void;
	markBridgeCallStart(
		sessionId: string,
		callId: number,
		method: string,
		payloadBytes: number,
	): void;
	markBridgeCallFinish(
		sessionId: string,
		callId: number,
		fields: { status: number; payloadBytes: number },
	): void;
	readonly metricsEndpointUrl?: string;
	close(): Promise<void>;
}

export async function createIpcObservability(
	options?: V8IpcObservabilityOptions,
): Promise<IpcObservability | null> {
	if (!options?.logFile && !options?.metrics) {
		return null;
	}
	const observability = new FileAndMetricsObservability(options);
	await observability.start();
	return observability;
}

export function resolveIpcObservabilityOptions(
	options?: V8IpcObservabilityOptions,
	env: NodeJS.ProcessEnv = process.env,
): V8IpcObservabilityOptions | undefined {
	const explicitMetrics = options?.metrics;
	const envPort = env.SECURE_EXEC_V8_METRICS_PORT;
	const resolvedPort = explicitMetrics?.port ?? parseOptionalPort(envPort);
	const resolvedOptions: V8IpcObservabilityOptions = {};
	const logFile = options?.logFile ?? normalizeOptionalString(env.SECURE_EXEC_V8_IPC_LOG_FILE);

	if (logFile) {
		resolvedOptions.logFile = logFile;
	}
	if (resolvedPort !== undefined) {
		resolvedOptions.metrics = {
			host:
				explicitMetrics?.host ??
				normalizeOptionalString(env.SECURE_EXEC_V8_METRICS_HOST) ??
				DEFAULT_METRICS_HOST,
			port: resolvedPort,
			path:
				explicitMetrics?.path ??
				normalizeOptionalString(env.SECURE_EXEC_V8_METRICS_PATH) ??
				DEFAULT_METRICS_PATH,
		};
	}
	return resolvedOptions.logFile || resolvedOptions.metrics
		? resolvedOptions
		: undefined;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseOptionalPort(value: string | undefined): number | undefined {
	const normalized = normalizeOptionalString(value);
	if (!normalized) return undefined;
	const parsed = Number(normalized);
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
		throw new Error(`Invalid SECURE_EXEC_V8_METRICS_PORT: ${normalized}`);
	}
	return parsed;
}

function summarizeBridgeCallPayload(
	method: string,
	payload: Buffer,
): Record<string, string | undefined> {
	if (method !== "_loadPolyfill") {
		return {};
	}
	try {
		const decodedArgs = v8.deserialize(payload) as unknown;
		const [bridgeTarget] = Array.isArray(decodedArgs) ? decodedArgs : [decodedArgs];
		if (typeof bridgeTarget !== "string") {
			return {};
		}
		return {
			bridgeTarget,
			bridgeTargetKind: bridgeTarget.startsWith("__bd:")
				? "bridge_dispatch"
				: "polyfill_body",
		};
	} catch {
		return {};
	}
}

function summarizeFrame(
	frame: BinaryFrame,
	encodedBytes: number,
): Record<string, string | number | boolean | undefined> {
	const base = {
		frameType: frame.type,
		encodedBytes,
		sessionId: "sessionId" in frame ? frame.sessionId : undefined,
	};
	switch (frame.type) {
		case "Authenticate":
			return {
				...base,
				tokenBytes: Buffer.byteLength(frame.token, "utf8"),
			};
		case "CreateSession":
			return {
				...base,
				heapLimitMb: frame.heapLimitMb,
				cpuTimeLimitMs: frame.cpuTimeLimitMs,
			};
		case "InjectGlobals":
			return {
				...base,
				payloadBytes: frame.payload.length,
			};
		case "Execute":
			return {
				...base,
				mode: frame.mode === 0 ? "exec" : "run",
				filePath: frame.filePath || undefined,
				bridgeCodeBytes: Buffer.byteLength(frame.bridgeCode, "utf8"),
				postRestoreScriptBytes: Buffer.byteLength(frame.postRestoreScript, "utf8"),
				userCodeBytes: Buffer.byteLength(frame.userCode, "utf8"),
			};
		case "BridgeResponse":
			return {
				...base,
				callId: frame.callId,
				status: frame.status,
				payloadBytes: frame.payload.length,
			};
		case "StreamEvent":
			return {
				...base,
				eventType: frame.eventType,
				payloadBytes: frame.payload.length,
			};
		case "WarmSnapshot":
			return {
				...base,
				bridgeCodeBytes: Buffer.byteLength(frame.bridgeCode, "utf8"),
			};
		case "Ping":
		case "Pong":
			return {
				...base,
				payloadBytes: frame.payload.length,
			};
		case "BridgeCall":
			return {
				...base,
				callId: frame.callId,
				method: frame.method,
				payloadBytes: frame.payload.length,
				...summarizeBridgeCallPayload(frame.method, frame.payload),
			};
		case "ExecutionResult":
			return {
				...base,
				exitCode: frame.exitCode,
				exportsBytes: frame.exports?.length ?? 0,
				errorCode: frame.error?.code || undefined,
				errorType: frame.error?.errorType || undefined,
			};
		case "Log":
			return {
				...base,
				channel: frame.channel === 1 ? "stderr" : "stdout",
				messageBytes: Buffer.byteLength(frame.message, "utf8"),
			};
		case "StreamCallback":
			return {
				...base,
				callbackType: frame.callbackType,
				payloadBytes: frame.payload.length,
			};
		case "DestroySession":
		case "TerminateExecution":
			return base;
	}
}

class FileAndMetricsObservability implements IpcObservability {
	private readonly registry = new PrometheusRegistry();
	private readonly frameCount = this.registry.counter(
		"secure_exec_v8_ipc_frames_total",
		"Total IPC frames sent and received by the V8 host runtime.",
		["direction", "frame_type"],
	);
	private readonly frameBytes = this.registry.counter(
		"secure_exec_v8_ipc_frame_bytes_total",
		"Total encoded IPC frame bytes sent and received by the V8 host runtime.",
		["direction", "frame_type"],
	);
	private readonly connectionEvents = this.registry.counter(
		"secure_exec_v8_ipc_connection_events_total",
		"Connection lifecycle events observed on the V8 IPC channel.",
		["event"],
	);
	private readonly frameErrors = this.registry.counter(
		"secure_exec_v8_ipc_frame_errors_total",
		"Frame decode and oversize errors observed on the V8 IPC channel.",
		["reason"],
	);
	private readonly inFlightExecutions = this.registry.gauge(
		"secure_exec_v8_ipc_inflight_executions",
		"Number of execute requests currently awaiting ExecutionResult.",
	);
	private readonly inFlightBridgeCalls = this.registry.gauge(
		"secure_exec_v8_ipc_inflight_bridge_calls",
		"Number of bridge calls currently awaiting BridgeResponse.",
	);
	private readonly executionDuration = this.registry.histogram(
		"secure_exec_v8_ipc_execute_duration_seconds",
		"Wall-clock duration from Execute send to ExecutionResult receive.",
		HISTOGRAM_BUCKETS_SECONDS,
		["mode"],
	);
	private readonly bridgeCallDuration = this.registry.histogram(
		"secure_exec_v8_ipc_bridge_call_duration_seconds",
		"Wall-clock duration from BridgeCall receive to BridgeResponse send.",
		HISTOGRAM_BUCKETS_SECONDS,
		["method", "status"],
	);
	private readonly pendingExecutions = new Map<string, PendingExecution>();
	private readonly pendingBridgeCalls = new Map<string, PendingBridgeCall>();
	private readonly options: V8IpcObservabilityOptions;
	private logStream: WriteStream | null = null;
	private logStreamErrored = false;
	private metricsServer: http.Server | null = null;
	private sequence = 0;
	metricsEndpointUrl?: string;

	constructor(options: V8IpcObservabilityOptions) {
		this.options = options;
	}

	async start(): Promise<void> {
		if (this.options.logFile) {
			mkdirSync(dirname(this.options.logFile), { recursive: true });
			this.logStream = createWriteStream(this.options.logFile, {
				flags: "a",
				encoding: "utf8",
			});
			this.logStream.on("error", () => {
				this.logStreamErrored = true;
			});
			this.writeLog("ipc_observability", {
				event: "enabled",
				logFile: this.options.logFile,
			});
		}
		if (this.options.metrics) {
			await this.startMetricsServer(this.options.metrics);
			this.writeLog("ipc_observability", {
				event: "metrics_enabled",
				metricsEndpointUrl: this.metricsEndpointUrl,
			});
		}
	}

	recordRuntimeEvent(
		event: string,
		fields: Record<string, string | number | boolean | undefined> = {},
	): void {
		this.writeLog("runtime_event", { event, ...fields });
	}

	recordConnectionEvent(
		event: string,
		fields: Record<string, string | number | boolean | undefined> = {},
	): void {
		this.connectionEvents.inc({ event });
		this.writeLog("ipc_connection", { event, ...fields });
	}

	recordFrame(direction: "send" | "recv", frame: BinaryFrame, encodedBytes: number): void {
		const frameType = frame.type;
		this.frameCount.inc({ direction, frame_type: frameType });
		this.frameBytes.inc({ direction, frame_type: frameType }, encodedBytes);
		this.writeLog("ipc_frame", {
			direction,
			...summarizeFrame(frame, encodedBytes),
		});
	}

	recordFrameError(
		reason: "decode" | "oversize",
		fields: Record<string, string | number | boolean | undefined> = {},
	): void {
		this.frameErrors.inc({ reason });
		this.writeLog("ipc_frame_error", { reason, ...fields });
	}

	markExecuteStart(
		sessionId: string,
		fields: { mode: "exec" | "run"; filePath?: string },
	): void {
		this.pendingExecutions.set(sessionId, {
			startedAt: process.hrtime.bigint(),
			mode: fields.mode,
		});
		this.inFlightExecutions.inc();
		this.writeLog("ipc_execute", {
			event: "start",
			sessionId,
			mode: fields.mode,
			filePath: fields.filePath,
		});
	}

	markExecuteFinish(
		sessionId: string,
		fields: { exitCode: number; errorCode?: string },
	): void {
		const pending = this.pendingExecutions.get(sessionId);
		if (pending) {
			this.pendingExecutions.delete(sessionId);
			this.inFlightExecutions.dec();
			const durationSeconds = hrtimeSeconds(pending.startedAt);
			this.executionDuration.observe({ mode: pending.mode }, durationSeconds);
			this.writeLog("ipc_execute", {
				event: "finish",
				sessionId,
				mode: pending.mode,
				exitCode: fields.exitCode,
				errorCode: fields.errorCode,
				durationMs: Number((durationSeconds * 1000).toFixed(3)),
			});
			return;
		}
		this.writeLog("ipc_execute", {
			event: "finish_without_start",
			sessionId,
			exitCode: fields.exitCode,
			errorCode: fields.errorCode,
		});
	}

	markBridgeCallStart(
		sessionId: string,
		callId: number,
		method: string,
		payloadBytes: number,
	): void {
		this.pendingBridgeCalls.set(this.bridgeCallKey(sessionId, callId), {
			startedAt: process.hrtime.bigint(),
			method,
		});
		this.inFlightBridgeCalls.inc();
		this.writeLog("ipc_bridge_call", {
			event: "start",
			sessionId,
			callId,
			method,
			payloadBytes,
		});
	}

	markBridgeCallFinish(
		sessionId: string,
		callId: number,
		fields: { status: number; payloadBytes: number },
	): void {
		const key = this.bridgeCallKey(sessionId, callId);
		const pending = this.pendingBridgeCalls.get(key);
		if (pending) {
			this.pendingBridgeCalls.delete(key);
			this.inFlightBridgeCalls.dec();
			const durationSeconds = hrtimeSeconds(pending.startedAt);
			this.bridgeCallDuration.observe(
				{ method: pending.method, status: String(fields.status) },
				durationSeconds,
			);
			this.writeLog("ipc_bridge_call", {
				event: "finish",
				sessionId,
				callId,
				method: pending.method,
				status: fields.status,
				payloadBytes: fields.payloadBytes,
				durationMs: Number((durationSeconds * 1000).toFixed(3)),
			});
			return;
		}
		this.writeLog("ipc_bridge_call", {
			event: "finish_without_start",
			sessionId,
			callId,
			status: fields.status,
			payloadBytes: fields.payloadBytes,
		});
	}

	async close(): Promise<void> {
		this.writeLog("ipc_observability", {
			event: "closing",
		});
		if (this.metricsServer) {
			await new Promise<void>((resolve, reject) => {
				this.metricsServer?.close((error) => (error ? reject(error) : resolve()));
			});
			this.metricsServer = null;
		}
		if (this.logStream) {
			await new Promise<void>((resolve) => {
				this.logStream?.end(resolve);
			});
			this.logStream = null;
		}
	}

	private bridgeCallKey(sessionId: string, callId: number): string {
		return `${sessionId}:${callId}`;
	}

	private async startMetricsServer(metrics: NonNullable<V8IpcObservabilityOptions["metrics"]>): Promise<void> {
		const host = metrics.host ?? DEFAULT_METRICS_HOST;
		const path = metrics.path ?? DEFAULT_METRICS_PATH;
		this.metricsServer = http.createServer((req, res) => {
			const requestPath = req.url ? new URL(req.url, "http://127.0.0.1").pathname : "/";
			if (req.method !== "GET") {
				res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
				res.end("method not allowed\n");
				return;
			}
			if (requestPath !== path) {
				res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
				res.end("not found\n");
				return;
			}
			res.writeHead(200, {
				"content-type": "text/plain; version=0.0.4; charset=utf-8",
				"cache-control": "no-store",
			});
			res.end(this.registry.render());
		});
		await new Promise<void>((resolve, reject) => {
			this.metricsServer?.once("error", reject);
			this.metricsServer?.listen(metrics.port, host, () => {
				this.metricsServer?.off("error", reject);
				resolve();
			});
		});
		this.metricsServer.unref();
		const address = this.metricsServer.address() as AddressInfo;
		this.metricsEndpointUrl = `http://${address.address}:${address.port}${path}`;
	}

	private writeLog(
		kind: string,
		fields: Record<string, string | number | boolean | undefined>,
	): void {
		if (!this.logStream || this.logStreamErrored) return;
		const payload = JSON.stringify({
			ts: nowIso(),
			seq: ++this.sequence,
			kind,
			...fields,
		});
		this.logStream.write(`${payload}\n`);
	}
}
