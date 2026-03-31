import { readFile } from "node:fs/promises";
import path from "node:path";
import v8 from "node:v8";
import {
	bundlePolyfill,
	getAvailableStdlib,
} from "../../../nodejs/src/polyfills.js";
import {
	MODULE_LOAD_SCENARIOS,
	type ModuleLoadScenarioDefinition,
} from "./scenario-catalog.js";

export type BenchmarkSample = {
	iteration: number;
	wallMs: number;
	code: number;
	errorMessage?: string;
	stdoutBytes: number;
	stderrBytes: number;
	sandboxMs?: number;
	mockRequests?: number;
	stdoutPreview: string;
	stderrPreview: string;
	checks: Record<string, string | number | boolean | undefined>;
};

export type ScenarioChecks = Record<
	string,
	string | number | boolean | undefined
>;

export type ScenarioTrueColdStartModeResult = {
	totalWallMs: number;
	runtimeCreateMs: number;
	firstPassWallMs: number;
	firstPassSandboxMs?: number;
	mockRequests?: number;
	checks: ScenarioChecks;
};

export type ScenarioNewSessionReplayModeResult = {
	coldWallMs: number;
	warmWallMsMean?: number;
	coldSandboxMs?: number;
	warmSandboxMsMean?: number;
	mockRequestsMean?: number;
};

export type ScenarioSameSessionReplayModeResult = {
	totalWallMs: number;
	firstPassMs: number;
	replayPassMs: number;
	mockRequests?: number;
	firstPassChecks: ScenarioChecks;
	replayPassChecks: ScenarioChecks;
};

export type ScenarioBenchmarkModes = {
	sandboxTrueColdStart?: {
		warmSnapshotEnabled: ScenarioTrueColdStartModeResult;
		warmSnapshotDisabled: ScenarioTrueColdStartModeResult;
	};
	sandboxNewSessionReplay?: {
		warmSnapshotEnabled: ScenarioNewSessionReplayModeResult;
		warmSnapshotDisabled: ScenarioNewSessionReplayModeResult;
	};
	sandboxSameSessionReplay?: ScenarioSameSessionReplayModeResult;
	hostSameSessionControl?: ScenarioSameSessionReplayModeResult;
};

export type ScenarioRunResult = {
	scenarioId: string;
	title: string;
	target: string;
	kind: string;
	description: string;
	createdAt: string;
	iterations: number;
	artifacts: {
		resultFile: string;
		metricsFile: string;
		logFile: string;
		runnerLogFile?: string;
	};
	samples: BenchmarkSample[];
	benchmarkModes?: ScenarioBenchmarkModes;
	summary: {
		coldWallMs: number;
		warmWallMsMean?: number;
		coldSandboxMs?: number;
		warmSandboxMsMean?: number;
	};
};

type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export type LoadPolyfillAttributionKind = "polyfill_body" | "bridge_dispatch";

export type LoadPolyfillAttributionClassifier = {
	knownPolyfillRequestResponsePairs: ReadonlySet<string>;
};

export type DeriveScenarioSummaryOptions = {
	loadPolyfillAttributionClassifier?: LoadPolyfillAttributionClassifier;
};

const LOAD_POLYFILL_ATTRIBUTION_LABELS: Record<
	LoadPolyfillAttributionKind,
	string
> = {
	polyfill_body: "real polyfill-body loads",
	bridge_dispatch: "__bd:* bridge-dispatch wrappers",
};

const LOAD_POLYFILL_ATTRIBUTION_ORDER: LoadPolyfillAttributionKind[] = [
	"polyfill_body",
	"bridge_dispatch",
];

const LOAD_POLYFILL_TARGET_LIMIT = 5;

const EXTRA_POLYFILL_MODULES = [
	"stream/web",
	"util/types",
	"internal/webstreams/util",
	"internal/webstreams/adapters",
	"internal/webstreams/readablestream",
	"internal/webstreams/writablestream",
	"internal/webstreams/transformstream",
	"internal/worker/js_transferable",
	"internal/test/binding",
	"internal/mime",
] as const;

let loadPolyfillAttributionClassifierPromise:
	| Promise<LoadPolyfillAttributionClassifier>
	| undefined;

type IpcEntry = {
	ts?: string;
	seq?: number;
	kind?: string;
	event?: string;
	direction?: string;
	frameType?: string;
	method?: string;
	sessionId?: string;
	callId?: number;
	status?: number;
	encodedBytes?: number;
	payloadBytes?: number;
	durationMs?: number;
	bridgeTarget?: string;
	bridgeTargetKind?: LoadPolyfillAttributionKind;
};

type MutableBridgeMethodStats = {
	method: string;
	callsTotal: number;
	totalDurationMs: number;
	requestEncodedBytesTotal: number;
	requestPayloadBytesTotal: number;
	responseEncodedBytesTotal: number;
	responsePayloadBytesTotal: number;
	statusCounts: Record<string, number>;
};

type MutableFrameStats = {
	direction: string;
	frameType: string;
	countTotal: number;
	encodedBytesTotal: number;
	payloadBytesTotal: number;
};

type PendingLoadPolyfillAttribution = {
	requestEncodedBytes: number;
	requestPayloadBytes: number;
	bridgeTarget?: string;
	bridgeTargetKind?: LoadPolyfillAttributionKind;
};

type MutableLoadPolyfillAttributionStats = {
	kind: LoadPolyfillAttributionKind;
	label: string;
	callsTotal: number;
	totalDurationMs: number;
	requestEncodedBytesTotal: number;
	requestPayloadBytesTotal: number;
	responseEncodedBytesTotal: number;
	responsePayloadBytesTotal: number;
	targets: Map<string, MutableLoadPolyfillTargetStats>;
	unattributedCallsTotal: number;
	unattributedDurationMs: number;
	unattributedResponseEncodedBytesTotal: number;
};

type MutableLoadPolyfillTargetStats = {
	target: string;
	callsTotal: number;
	totalDurationMs: number;
	responseEncodedBytesTotal: number;
};

type MutableSessionStats = {
	sessionId: string;
	createTs?: number;
	injectGlobalsTs?: number;
	executeSendTs?: number;
	executeFinishTs?: number;
	destroyTs?: number;
	executeDurationMs?: number;
	bridgeCalls: number;
	bridgeDurationMs: number;
	bridgeCallEncodedBytes: number;
	bridgeResponseEncodedBytes: number;
	bridgeCallPayloadBytes: number;
	bridgeResponsePayloadBytes: number;
	callMethods: Map<number, string>;
	loadPolyfillKinds: Map<number, LoadPolyfillAttributionKind>;
	pendingLoadPolyfillCalls: Map<number, PendingLoadPolyfillAttribution>;
};

export type ScenarioIterationSummary = {
	iteration: number;
	sessionId?: string;
	wallMs: number;
	sandboxMs?: number;
	executeDurationMs?: number;
	fixedSessionOverheadMs?: number;
	createToInjectGlobalsMs?: number;
	injectGlobalsToExecuteSendMs?: number;
	executeResultToDestroyMs?: number;
	residualFixedOverheadMs?: number;
	bridgeCalls: number;
	bridgeDurationMs: number;
	bridgeCallEncodedBytes: number;
	bridgeResponseEncodedBytes: number;
	bridgeCallPayloadBytes: number;
	bridgeResponsePayloadBytes: number;
	mockRequests?: number;
	stdoutBytes: number;
	stderrBytes: number;
	checks: Record<string, string | number | boolean | undefined>;
};

export type ScenarioBridgeMethodSummary = {
	method: string;
	callsTotal: number;
	callsPerIteration: number;
	totalDurationMs: number;
	durationMsPerIteration: number;
	meanDurationMsPerCall: number;
	requestEncodedBytesTotal: number;
	requestEncodedBytesPerIteration: number;
	requestPayloadBytesTotal: number;
	requestPayloadBytesPerIteration: number;
	responseEncodedBytesTotal: number;
	responseEncodedBytesPerIteration: number;
	responsePayloadBytesTotal: number;
	responsePayloadBytesPerIteration: number;
	statusCounts: Record<string, number>;
};

export type ScenarioFrameSummary = {
	direction: string;
	frameType: string;
	countTotal: number;
	countPerIteration: number;
	encodedBytesTotal: number;
	encodedBytesPerIteration: number;
	payloadBytesTotal: number;
	payloadBytesPerIteration: number;
};

export type ScenarioLoadPolyfillAttributionSummary = {
	kind: LoadPolyfillAttributionKind;
	label: string;
	callsTotal: number;
	callsPerIteration: number;
	totalDurationMs: number;
	durationMsPerIteration: number;
	requestEncodedBytesTotal: number;
	requestEncodedBytesPerIteration: number;
	responseEncodedBytesTotal: number;
	responseEncodedBytesPerIteration: number;
	targets: ScenarioLoadPolyfillTargetSummary[];
	topTargetsByCalls: ScenarioLoadPolyfillTargetSummary[];
	topTargetsByTime: ScenarioLoadPolyfillTargetSummary[];
	topTargetsByResponseBytes: ScenarioLoadPolyfillTargetSummary[];
	unattributedCallsTotal: number;
	unattributedCallsPerIteration: number;
	unattributedDurationMsTotal: number;
	unattributedDurationMsPerIteration: number;
	unattributedResponseEncodedBytesTotal: number;
	unattributedResponseEncodedBytesPerIteration: number;
	exampleTargets: string[];
};

export type ScenarioLoadPolyfillTargetSummary = {
	target: string;
	callsTotal: number;
	callsPerIteration: number;
	totalDurationMs: number;
	durationMsPerIteration: number;
	responseEncodedBytesTotal: number;
	responseEncodedBytesPerIteration: number;
};

export type NumericDelta = {
	before: number;
	after: number;
	delta: number;
	deltaPercent?: number;
};

export type ScenarioMetricComparison = {
	warmWallMsMean?: NumericDelta;
	bridgeCallsPerIteration?: NumericDelta;
	fixedSessionOverheadWarmMsMean?: NumericDelta;
	createToInjectGlobalsWarmMsMean?: NumericDelta;
	injectGlobalsToExecuteSendWarmMsMean?: NumericDelta;
	executeResultToDestroyWarmMsMean?: NumericDelta;
	residualFixedOverheadWarmMsMean?: NumericDelta;
	bridgeDurationPerIterationMs?: NumericDelta;
	bridgeResponseFrameBytesPerIteration?: NumericDelta;
	executeWarmMsMean?: NumericDelta;
};

export type ScenarioMethodDelta = {
	method: string;
	before: number;
	after: number;
	delta: number;
};

export type ScenarioFrameDelta = {
	direction: string;
	frameType: string;
	before: number;
	after: number;
	delta: number;
};

export type LoadPolyfillAttributionDelta = {
	kind: LoadPolyfillAttributionKind;
	label: string;
	callsPerIteration: NumericDelta;
	durationMsPerIteration: NumericDelta;
	responseEncodedBytesPerIteration: NumericDelta;
	unattributedCallsPerIteration: NumericDelta;
	unattributedDurationMsPerIteration: NumericDelta;
	unattributedResponseEncodedBytesPerIteration: NumericDelta;
	targetDeltasByCalls: ScenarioLoadPolyfillTargetDelta[];
	targetDeltasByTime: ScenarioLoadPolyfillTargetDelta[];
	targetDeltasByResponseBytes: ScenarioLoadPolyfillTargetDelta[];
};

export type ScenarioLoadPolyfillTargetDelta = {
	target: string;
	callsPerIteration: NumericDelta;
	durationMsPerIteration: NumericDelta;
	responseEncodedBytesPerIteration: NumericDelta;
};

export type ScenarioComparisonSummary = {
	baselineScenarioCreatedAt: string;
	metrics: ScenarioMetricComparison;
	bridgeMethodDurationDeltas: ScenarioMethodDelta[];
	bridgeMethodCountDeltas: ScenarioMethodDelta[];
	bridgeMethodResponseByteDeltas: ScenarioMethodDelta[];
	frameEncodedByteDeltas: ScenarioFrameDelta[];
	loadPolyfillAttributionDeltas: LoadPolyfillAttributionDelta[];
};

export type ScenarioDerivedSummary = {
	scenarioId: string;
	title: string;
	target: string;
	kind: string;
	description: string;
	createdAt: string;
	iterations: number;
	artifacts: {
		resultFile: string;
		metricsFile: string;
		logFile: string;
		runnerLogFile?: string;
		summaryFile: string;
		summaryMarkdownFile: string;
	};
	benchmarkModes?: ScenarioBenchmarkModes;
	timing: {
		connectRttMs?: number;
		coldWallMs: number;
		warmWallMsMean?: number;
		coldSandboxMs?: number;
		warmSandboxMsMean?: number;
		coldExecuteDurationMs?: number;
		warmExecuteDurationMsMean?: number;
		coldFixedSessionOverheadMs?: number;
		warmFixedSessionOverheadMsMean?: number;
		coldCreateToInjectGlobalsMs?: number;
		warmCreateToInjectGlobalsMsMean?: number;
		coldInjectGlobalsToExecuteSendMs?: number;
		warmInjectGlobalsToExecuteSendMsMean?: number;
		coldExecuteResultToDestroyMs?: number;
		warmExecuteResultToDestroyMsMean?: number;
		coldResidualFixedOverheadMs?: number;
		warmResidualFixedOverheadMsMean?: number;
	};
	iterationsDetail: ScenarioIterationSummary[];
	bridge: {
		totalCalls: number;
		callsPerIteration: number;
		totalDurationMs: number;
		durationMsPerIteration: number;
		methodsByCount: ScenarioBridgeMethodSummary[];
		methodsByTime: ScenarioBridgeMethodSummary[];
		methodsByResponseBytes: ScenarioBridgeMethodSummary[];
		loadPolyfillAttribution: ScenarioLoadPolyfillAttributionSummary[];
		framesByEncodedBytes: ScenarioFrameSummary[];
		frames: ScenarioFrameSummary[];
	};
	progressSignals: {
		warmWallMsMean?: number;
		bridgeCallsPerIteration: number;
		fixedSessionOverheadWarmMsMean?: number;
		dominantBridgeMethodByTime?: {
			method: string;
			durationMsPerIteration: number;
			callsPerIteration: number;
		};
		dominantBridgeMethodByCount?: {
			method: string;
			callsPerIteration: number;
			durationMsPerIteration: number;
		};
		dominantBridgeMethodByResponseBytes?: {
			method: string;
			responseEncodedBytesPerIteration: number;
		};
		loadPolyfillAttribution?: Partial<
			Record<
				LoadPolyfillAttributionKind,
				{
					callsPerIteration: number;
					durationMsPerIteration: number;
					responseEncodedBytesPerIteration: number;
				}
			>
		>;
		dominantFrameByEncodedBytes?: {
			direction: string;
			frameType: string;
			encodedBytesPerIteration: number;
		};
	};
	comparisonToPrevious?: ScenarioComparisonSummary;
};

export type TransportRttPayloadSummary = {
	label: string;
	payloadBytes: number;
	sampleCount: number;
	samplesMs: number[];
	minRttMs: number;
	meanRttMs: number;
	p95RttMs: number;
	maxRttMs: number;
};

export type TransportRttPayloadComparison = {
	label: string;
	payloadBytes: number;
	meanRttMs?: NumericDelta;
	p95RttMs?: NumericDelta;
};

export type TransportRttComparison = {
	baselineCreatedAt?: string;
	connectRttMs?: NumericDelta;
	payloads: TransportRttPayloadComparison[];
};

export type TransportRttReport = {
	createdAt: string;
	measurement: "ipc_ping_pong";
	warmupIterations: number;
	sampleIterations: number;
	connectRttMs: number;
	payloads: TransportRttPayloadSummary[];
	comparisonToPrevious?: TransportRttComparison;
};

export type BenchmarkBaselineMetadata = {
	createdAt?: string;
	gitCommit?: string;
	host?: Record<string, JsonValue>;
	v8BinaryPath?: string;
	iterations?: number;
};

export type BenchmarkBaseline = {
	metadata?: BenchmarkBaselineMetadata;
	scenarioSummaries: Map<string, ScenarioDerivedSummary>;
	transportRtt?: TransportRttReport;
};

export type BenchmarkScenarioOverview = {
	scenarioId: string;
	title: string;
	target: string;
	kind: string;
	status: "passed";
	warmWallMsMean?: number;
	bridgeCallsPerIteration: number;
	fixedSessionOverheadWarmMsMean?: number;
	dominantBridgeMethodByTime?: ScenarioDerivedSummary["progressSignals"]["dominantBridgeMethodByTime"];
	dominantFrameByEncodedBytes?: ScenarioDerivedSummary["progressSignals"]["dominantFrameByEncodedBytes"];
	comparisonToPrevious?: ScenarioComparisonSummary;
};

export type BenchmarkSummaryReport = {
	createdAt: string;
	gitCommit: string;
	host: Record<string, string | number>;
	v8BinaryPath: string;
	iterations: number;
	primaryComparisonMode: "sandbox_new_session_replay_warm_snapshot_enabled";
	baseline?: BenchmarkBaselineMetadata;
	transportRtt?: TransportRttReport;
	progressGuide: {
		copyTheseFields: string[];
		comparisonArtifact: string;
	};
	results: ScenarioRunResult[];
	scenarioSummaries: ScenarioDerivedSummary[];
	scenarioOverview: BenchmarkScenarioOverview[];
};

function round(value: number): number {
	return Number(value.toFixed(3));
}

function buildLoadPolyfillPairKey(
	requestPayloadBytes: number,
	responsePayloadBytes: number,
): string {
	return `${requestPayloadBytes}/${responsePayloadBytes}`;
}

function normalizePolyfillModuleName(moduleName: string): string {
	return moduleName.replace(/^node:/, "");
}

export async function buildLoadPolyfillAttributionClassifier(): Promise<LoadPolyfillAttributionClassifier> {
	if (loadPolyfillAttributionClassifierPromise) {
		return loadPolyfillAttributionClassifierPromise;
	}
	loadPolyfillAttributionClassifierPromise = (async () => {
		const knownPolyfillRequestResponsePairs = new Set<string>();
		const moduleNames = new Set(
			[...getAvailableStdlib(), ...EXTRA_POLYFILL_MODULES].map(
				normalizePolyfillModuleName,
			),
		);
		for (const moduleName of moduleNames) {
			try {
				const requestPayloadBytes = v8.serialize([moduleName]).length;
				const responsePayloadBytes = v8.serialize(
					await bundlePolyfill(moduleName),
				).length;
				knownPolyfillRequestResponsePairs.add(
					buildLoadPolyfillPairKey(requestPayloadBytes, responsePayloadBytes),
				);
			} catch {
				// Ignore modules that cannot be bundled in the current environment.
			}
		}
		return {
			knownPolyfillRequestResponsePairs,
		};
	})();
	return loadPolyfillAttributionClassifierPromise;
}

function mean(values: number[]): number | undefined {
	if (values.length === 0) return undefined;
	return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], ratio: number): number | undefined {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * ratio) - 1),
	);
	return round(sorted[index]);
}

function formatMetric(value: number | undefined, unit = "ms"): string {
	if (value === undefined) return "-";
	return `${value.toFixed(3)} ${unit}`;
}

function formatDelta(delta: NumericDelta | undefined, unit = "ms"): string {
	if (!delta) return "-";
	const sign = delta.delta > 0 ? "+" : "";
	const percent =
		delta.deltaPercent === undefined
			? ""
			: ` (${delta.deltaPercent > 0 ? "+" : ""}${delta.deltaPercent.toFixed(2)}%)`;
	return `${delta.before.toFixed(3)} -> ${delta.after.toFixed(3)} ${unit} (${sign}${delta.delta.toFixed(3)} ${unit}${percent})`;
}

function formatLoadPolyfillAttributionSummary(
	attribution: ScenarioLoadPolyfillAttributionSummary,
): string {
	return `${attribution.callsPerIteration.toFixed(3)} calls/iteration, ${attribution.durationMsPerIteration.toFixed(3)} ms/iteration, ${attribution.responseEncodedBytesPerIteration.toFixed(3)} bytes/iteration`;
}

function formatLoadPolyfillTargetSummary(
	target: ScenarioLoadPolyfillTargetSummary,
): string {
	return `${target.callsPerIteration.toFixed(3)} calls/iteration, ${target.durationMsPerIteration.toFixed(3)} ms/iteration, ${target.responseEncodedBytesPerIteration.toFixed(3)} bytes/iteration`;
}

function formatLoadPolyfillAttributionDelta(
	delta: LoadPolyfillAttributionDelta,
): string {
	return `calls ${formatDelta(delta.callsPerIteration, "calls")}; time ${formatDelta(delta.durationMsPerIteration)}; response bytes ${formatDelta(delta.responseEncodedBytesPerIteration, "bytes")}`;
}

function formatLoadPolyfillTargetDelta(
	target: ScenarioLoadPolyfillTargetDelta,
): string {
	return `calls ${formatDelta(target.callsPerIteration, "calls")}; time ${formatDelta(target.durationMsPerIteration)}; response bytes ${formatDelta(target.responseEncodedBytesPerIteration, "bytes")}`;
}

function formatBenchmarkModeChecks(checks: ScenarioChecks): string {
	const entries = Object.entries(checks).filter(([, value]) => value !== undefined);
	if (entries.length === 0) {
		return "-";
	}
	return entries
		.map(([key, value]) => `\`${key}\`=${String(value)}`)
		.join(", ");
}

function formatTrueColdStartMode(
	label: string,
	mode: ScenarioTrueColdStartModeResult,
): string {
	const parts = [
		`${label}: total ${formatMetric(mode.totalWallMs)}`,
		`runtime create ${formatMetric(mode.runtimeCreateMs)}`,
		`first pass ${formatMetric(mode.firstPassWallMs)}`,
	];
	if (mode.firstPassSandboxMs !== undefined) {
		parts.push(`sandbox ${formatMetric(mode.firstPassSandboxMs)}`);
	}
	if (mode.mockRequests !== undefined) {
		parts.push(`mock requests ${mode.mockRequests}`);
	}
	return `${parts.join("; ")}; checks ${formatBenchmarkModeChecks(mode.checks)}`;
}

function formatNewSessionReplayMode(
	label: string,
	mode: ScenarioNewSessionReplayModeResult,
): string {
	const parts = [
		`${label}: cold ${formatMetric(mode.coldWallMs)}`,
		`warm ${formatMetric(mode.warmWallMsMean)}`,
	];
	if (mode.coldSandboxMs !== undefined || mode.warmSandboxMsMean !== undefined) {
		parts.push(
			`sandbox cold ${formatMetric(mode.coldSandboxMs)}, warm ${formatMetric(mode.warmSandboxMsMean)}`,
		);
	}
	if (mode.mockRequestsMean !== undefined) {
		parts.push(`mock requests mean ${mode.mockRequestsMean.toFixed(3)}`);
	}
	return parts.join("; ");
}

function formatSameSessionReplayMode(
	label: string,
	mode: ScenarioSameSessionReplayModeResult,
): string {
	const parts = [`${label}: total ${formatMetric(mode.totalWallMs)}`];
	if (!(mode.firstPassMs === 0 && mode.replayPassMs === 0)) {
		parts.push(`first ${formatMetric(mode.firstPassMs)}`);
		parts.push(`replay ${formatMetric(mode.replayPassMs)}`);
	}
	if (mode.mockRequests !== undefined) {
		parts.push(`mock requests ${mode.mockRequests}`);
	}
	return `${parts.join("; ")}; first checks ${formatBenchmarkModeChecks(mode.firstPassChecks)}; replay checks ${formatBenchmarkModeChecks(mode.replayPassChecks)}`;
}

function buildBenchmarkModeRows(
	benchmarkModes: ScenarioBenchmarkModes | undefined,
): string[] {
	if (!benchmarkModes) {
		return [];
	}
	const lines: string[] = [];
	if (benchmarkModes.sandboxTrueColdStart) {
		lines.push(
			formatTrueColdStartMode(
				"Sandbox true cold start, warm snapshot enabled",
				benchmarkModes.sandboxTrueColdStart.warmSnapshotEnabled,
			),
		);
		lines.push(
			formatTrueColdStartMode(
				"Sandbox true cold start, warm snapshot disabled",
				benchmarkModes.sandboxTrueColdStart.warmSnapshotDisabled,
			),
		);
	}
	if (benchmarkModes.sandboxNewSessionReplay) {
		lines.push(
			formatNewSessionReplayMode(
				"Sandbox new-session replay, warm snapshot enabled",
				benchmarkModes.sandboxNewSessionReplay.warmSnapshotEnabled,
			),
		);
		lines.push(
			formatNewSessionReplayMode(
				"Sandbox new-session replay, warm snapshot disabled",
				benchmarkModes.sandboxNewSessionReplay.warmSnapshotDisabled,
			),
		);
	}
	if (benchmarkModes.sandboxSameSessionReplay) {
		lines.push(
			formatSameSessionReplayMode(
				"Sandbox same-session replay",
				benchmarkModes.sandboxSameSessionReplay,
			),
		);
	}
	if (benchmarkModes.hostSameSessionControl) {
		lines.push(
			formatSameSessionReplayMode(
				"Host same-session control",
				benchmarkModes.hostSameSessionControl,
			),
		);
	}
	return lines;
}

function pushLoadPolyfillTargetRankingRows(
	lines: string[],
	kindLabel: string,
	ranking: string,
	targets: ScenarioLoadPolyfillTargetSummary[],
): void {
	for (const target of targets) {
		lines.push(
			`| ${kindLabel} | ${ranking} | \`${target.target}\` | ${target.callsPerIteration.toFixed(3)} | ${formatMetric(target.durationMsPerIteration)} | ${target.responseEncodedBytesPerIteration.toFixed(3)} |`,
		);
	}
}

function pushLoadPolyfillTargetDeltaRows(
	lines: string[],
	kindLabel: string,
	ranking: string,
	targets: ScenarioLoadPolyfillTargetDelta[],
): void {
	for (const target of targets) {
		lines.push(
			`| ${kindLabel} | ${ranking} | \`${target.target}\` | ${formatDelta(target.callsPerIteration, "calls")} | ${formatDelta(target.durationMsPerIteration)} | ${formatDelta(target.responseEncodedBytesPerIteration, "bytes")} |`,
		);
	}
}

function compareNumeric(before: number | undefined, after: number | undefined): NumericDelta | undefined {
	if (before === undefined || after === undefined) return undefined;
	const delta = round(after - before);
	return {
		before: round(before),
		after: round(after),
		delta,
		deltaPercent: before === 0 ? undefined : round((delta / before) * 100),
	};
}

function toTimestamp(ts: string | undefined): number | undefined {
	if (!ts) return undefined;
	const parsed = Date.parse(ts);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function ensureMethodStats(
	methods: Map<string, MutableBridgeMethodStats>,
	method: string,
): MutableBridgeMethodStats {
	const existing = methods.get(method);
	if (existing) return existing;
	const created: MutableBridgeMethodStats = {
		method,
		callsTotal: 0,
		totalDurationMs: 0,
		requestEncodedBytesTotal: 0,
		requestPayloadBytesTotal: 0,
		responseEncodedBytesTotal: 0,
		responsePayloadBytesTotal: 0,
		statusCounts: {},
	};
	methods.set(method, created);
	return created;
}

function ensureFrameStats(
	frames: Map<string, MutableFrameStats>,
	direction: string,
	frameType: string,
): MutableFrameStats {
	const key = `${direction}:${frameType}`;
	const existing = frames.get(key);
	if (existing) return existing;
	const created: MutableFrameStats = {
		direction,
		frameType,
		countTotal: 0,
		encodedBytesTotal: 0,
		payloadBytesTotal: 0,
	};
	frames.set(key, created);
	return created;
}

function ensureLoadPolyfillAttributionStats(
	stats: Map<LoadPolyfillAttributionKind, MutableLoadPolyfillAttributionStats>,
	kind: LoadPolyfillAttributionKind,
): MutableLoadPolyfillAttributionStats {
	const existing = stats.get(kind);
	if (existing) return existing;
	const created: MutableLoadPolyfillAttributionStats = {
		kind,
		label: LOAD_POLYFILL_ATTRIBUTION_LABELS[kind],
		callsTotal: 0,
		totalDurationMs: 0,
		requestEncodedBytesTotal: 0,
		requestPayloadBytesTotal: 0,
		responseEncodedBytesTotal: 0,
		responsePayloadBytesTotal: 0,
		targets: new Map<string, MutableLoadPolyfillTargetStats>(),
		unattributedCallsTotal: 0,
		unattributedDurationMs: 0,
		unattributedResponseEncodedBytesTotal: 0,
	};
	stats.set(kind, created);
	return created;
}

function ensureLoadPolyfillTargetStats(
	stats: Map<string, MutableLoadPolyfillTargetStats>,
	target: string,
): MutableLoadPolyfillTargetStats {
	const existing = stats.get(target);
	if (existing) return existing;
	const created: MutableLoadPolyfillTargetStats = {
		target,
		callsTotal: 0,
		totalDurationMs: 0,
		responseEncodedBytesTotal: 0,
	};
	stats.set(target, created);
	return created;
}

function ensureSession(
	sessions: Map<string, MutableSessionStats>,
	sessionOrder: string[],
	sessionId: string,
): MutableSessionStats {
	const existing = sessions.get(sessionId);
	if (existing) return existing;
	const created: MutableSessionStats = {
		sessionId,
		bridgeCalls: 0,
		bridgeDurationMs: 0,
		bridgeCallEncodedBytes: 0,
		bridgeResponseEncodedBytes: 0,
		bridgeCallPayloadBytes: 0,
		bridgeResponsePayloadBytes: 0,
		callMethods: new Map<number, string>(),
		loadPolyfillKinds: new Map<number, LoadPolyfillAttributionKind>(),
		pendingLoadPolyfillCalls: new Map<number, PendingLoadPolyfillAttribution>(),
	};
	sessions.set(sessionId, created);
	sessionOrder.push(sessionId);
	return created;
}

function toLoadPolyfillTargetSummary(
	target: MutableLoadPolyfillTargetStats,
	iterations: number,
): ScenarioLoadPolyfillTargetSummary {
	return {
		target: target.target,
		callsTotal: target.callsTotal,
		callsPerIteration: round(target.callsTotal / iterations),
		totalDurationMs: round(target.totalDurationMs),
		durationMsPerIteration: round(target.totalDurationMs / iterations),
		responseEncodedBytesTotal: target.responseEncodedBytesTotal,
		responseEncodedBytesPerIteration: round(
			target.responseEncodedBytesTotal / iterations,
		),
	};
}

function compareLoadPolyfillTargetSummary(
	left: ScenarioLoadPolyfillTargetSummary,
	right: ScenarioLoadPolyfillTargetSummary,
	primary: (
		entry: ScenarioLoadPolyfillTargetSummary,
	) => number,
	secondary: (
		entry: ScenarioLoadPolyfillTargetSummary,
	) => number,
	tertiary: (
		entry: ScenarioLoadPolyfillTargetSummary,
	) => number,
): number {
	const primaryDelta = primary(right) - primary(left);
	if (primaryDelta !== 0) {
		return primaryDelta;
	}
	const secondaryDelta = secondary(right) - secondary(left);
	if (secondaryDelta !== 0) {
		return secondaryDelta;
	}
	const tertiaryDelta = tertiary(right) - tertiary(left);
	if (tertiaryDelta !== 0) {
		return tertiaryDelta;
	}
	return left.target.localeCompare(right.target);
}

function sortLoadPolyfillTargetSummaries(
	targets: ScenarioLoadPolyfillTargetSummary[],
	primary: (
		entry: ScenarioLoadPolyfillTargetSummary,
	) => number,
	secondary: (
		entry: ScenarioLoadPolyfillTargetSummary,
	) => number,
	tertiary: (
		entry: ScenarioLoadPolyfillTargetSummary,
	) => number,
): ScenarioLoadPolyfillTargetSummary[] {
	return [...targets].sort((left, right) =>
		compareLoadPolyfillTargetSummary(
			left,
			right,
			primary,
			secondary,
			tertiary,
		),
	);
}

function zeroNumericDelta(): NumericDelta {
	return {
		before: 0,
		after: 0,
		delta: 0,
	};
}

function classifyLoadPolyfillAttribution(
	requestPayloadBytes: number,
	responsePayloadBytes: number,
	bridgeTargetKind: LoadPolyfillAttributionKind | undefined,
	options: DeriveScenarioSummaryOptions | undefined,
): LoadPolyfillAttributionKind | undefined {
	if (bridgeTargetKind) {
		return bridgeTargetKind;
	}
	const classifier = options?.loadPolyfillAttributionClassifier;
	if (!classifier) {
		return undefined;
	}
	return classifier.knownPolyfillRequestResponsePairs.has(
		buildLoadPolyfillPairKey(requestPayloadBytes, responsePayloadBytes),
	)
		? "polyfill_body"
		: "bridge_dispatch";
}

export function parseIpcLog(logText: string): IpcEntry[] {
	return logText
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as IpcEntry);
}

export function deriveScenarioSummary(
	_scenario: ModuleLoadScenarioDefinition,
	result: ScenarioRunResult,
	entries: IpcEntry[],
	options?: DeriveScenarioSummaryOptions,
): ScenarioDerivedSummary {
	const sessionOrder: string[] = [];
	const sessions = new Map<string, MutableSessionStats>();
	const methods = new Map<string, MutableBridgeMethodStats>();
	const loadPolyfillAttribution = new Map<
		LoadPolyfillAttributionKind,
		MutableLoadPolyfillAttributionStats
	>();
	const frames = new Map<string, MutableFrameStats>();
	let connectStartTs: number | undefined;
	let connectOkTs: number | undefined;

	for (const entry of entries) {
		if (entry.kind === "ipc_connection") {
			const timestamp = toTimestamp(entry.ts);
			if (entry.event === "connect_start") {
				connectStartTs = timestamp;
			} else if (entry.event === "connect_ok") {
				connectOkTs = timestamp;
			}
			continue;
		}

		if (entry.kind === "ipc_frame") {
			const direction = entry.direction ?? "unknown";
			const frameType = entry.frameType ?? "unknown";
			const frame = ensureFrameStats(frames, direction, frameType);
			frame.countTotal += 1;
			frame.encodedBytesTotal += entry.encodedBytes ?? 0;
			frame.payloadBytesTotal += entry.payloadBytes ?? 0;

			const sessionId = entry.sessionId;
			if (!sessionId) {
				continue;
			}
			const session = ensureSession(sessions, sessionOrder, sessionId);
			const timestamp = toTimestamp(entry.ts);
			if (frameType === "CreateSession" && direction === "send") {
				session.createTs = timestamp;
			} else if (frameType === "InjectGlobals" && direction === "send") {
				session.injectGlobalsTs = timestamp;
			} else if (frameType === "Execute" && direction === "send") {
				session.executeSendTs = timestamp;
			} else if (frameType === "ExecutionResult" && direction === "recv") {
				session.executeFinishTs = timestamp;
			} else if (frameType === "DestroySession" && direction === "send") {
				session.destroyTs = timestamp;
			} else if (frameType === "BridgeCall" && direction === "recv") {
				const method = entry.method ?? "unknown";
				const callId = entry.callId ?? -1;
				session.bridgeCalls += 1;
				session.bridgeCallEncodedBytes += entry.encodedBytes ?? 0;
				session.bridgeCallPayloadBytes += entry.payloadBytes ?? 0;
				session.callMethods.set(callId, method);
				if (method === "_loadPolyfill") {
					session.pendingLoadPolyfillCalls.set(callId, {
						requestEncodedBytes: entry.encodedBytes ?? 0,
						requestPayloadBytes: entry.payloadBytes ?? 0,
						bridgeTarget: entry.bridgeTarget,
						bridgeTargetKind: entry.bridgeTargetKind,
					});
				}
				const methodStats = ensureMethodStats(methods, method);
				methodStats.callsTotal += 1;
				methodStats.requestEncodedBytesTotal += entry.encodedBytes ?? 0;
				methodStats.requestPayloadBytesTotal += entry.payloadBytes ?? 0;
			} else if (frameType === "BridgeResponse" && direction === "send") {
				const method =
					session.callMethods.get(entry.callId ?? -1) ?? entry.method ?? "unknown";
				session.bridgeResponseEncodedBytes += entry.encodedBytes ?? 0;
				session.bridgeResponsePayloadBytes += entry.payloadBytes ?? 0;
				const methodStats = ensureMethodStats(methods, method);
				methodStats.responseEncodedBytesTotal += entry.encodedBytes ?? 0;
				methodStats.responsePayloadBytesTotal += entry.payloadBytes ?? 0;
				if (method === "_loadPolyfill") {
					const kind = session.loadPolyfillKinds.get(entry.callId ?? -1);
					if (kind) {
						const attributionStats = ensureLoadPolyfillAttributionStats(
							loadPolyfillAttribution,
							kind,
						);
						attributionStats.responseEncodedBytesTotal += entry.encodedBytes ?? 0;
						attributionStats.responsePayloadBytesTotal += entry.payloadBytes ?? 0;
						const pendingLoadPolyfillCall = session.pendingLoadPolyfillCalls.get(
							entry.callId ?? -1,
						);
						if (pendingLoadPolyfillCall?.bridgeTarget) {
							const targetStats = ensureLoadPolyfillTargetStats(
								attributionStats.targets,
								pendingLoadPolyfillCall.bridgeTarget,
							);
							targetStats.responseEncodedBytesTotal += entry.encodedBytes ?? 0;
						} else {
							attributionStats.unattributedResponseEncodedBytesTotal +=
								entry.encodedBytes ?? 0;
						}
					}
				}
			}
			continue;
		}

		if (entry.kind === "ipc_bridge_call" && entry.event === "finish" && entry.sessionId) {
			const session = ensureSession(sessions, sessionOrder, entry.sessionId);
			const method = entry.method ?? session.callMethods.get(entry.callId ?? -1) ?? "unknown";
			const methodStats = ensureMethodStats(methods, method);
			const durationMs = entry.durationMs ?? 0;
			session.bridgeDurationMs += durationMs;
			methodStats.totalDurationMs += durationMs;
			const statusKey = String(entry.status ?? "unknown");
			methodStats.statusCounts[statusKey] = (methodStats.statusCounts[statusKey] ?? 0) + 1;
			if (method === "_loadPolyfill") {
				const pendingLoadPolyfillCall = session.pendingLoadPolyfillCalls.get(
					entry.callId ?? -1,
				);
				const kind = classifyLoadPolyfillAttribution(
					pendingLoadPolyfillCall?.requestPayloadBytes ?? 0,
					entry.payloadBytes ?? 0,
					pendingLoadPolyfillCall?.bridgeTargetKind,
					options,
				);
				if (kind) {
					const attributionStats = ensureLoadPolyfillAttributionStats(
						loadPolyfillAttribution,
						kind,
					);
					attributionStats.callsTotal += 1;
					attributionStats.totalDurationMs += durationMs;
					attributionStats.requestEncodedBytesTotal +=
						pendingLoadPolyfillCall?.requestEncodedBytes ?? 0;
					attributionStats.requestPayloadBytesTotal +=
						pendingLoadPolyfillCall?.requestPayloadBytes ?? 0;
					if (pendingLoadPolyfillCall?.bridgeTarget) {
						const targetStats = ensureLoadPolyfillTargetStats(
							attributionStats.targets,
							pendingLoadPolyfillCall.bridgeTarget,
						);
						targetStats.callsTotal += 1;
						targetStats.totalDurationMs += durationMs;
					} else {
						attributionStats.unattributedCallsTotal += 1;
						attributionStats.unattributedDurationMs += durationMs;
					}
					session.loadPolyfillKinds.set(entry.callId ?? -1, kind);
				}
			}
			continue;
		}

		if (entry.kind === "ipc_execute" && entry.event === "finish" && entry.sessionId) {
			const session = ensureSession(sessions, sessionOrder, entry.sessionId);
			session.executeDurationMs = entry.durationMs ?? 0;
		}
	}

	const iterationsDetail = result.samples.map((sample, index): ScenarioIterationSummary => {
		const sessionId = sessionOrder[index];
		const session = sessionId ? sessions.get(sessionId) : undefined;
		const executeDurationMs =
			session?.executeDurationMs === undefined ? undefined : round(session.executeDurationMs);
		const fixedSessionOverheadMs =
			executeDurationMs === undefined ? undefined : round(sample.wallMs - executeDurationMs);
		const createToInjectGlobalsMs =
			session?.createTs !== undefined && session.injectGlobalsTs !== undefined
				? round(session.injectGlobalsTs - session.createTs)
				: undefined;
		const injectGlobalsToExecuteSendMs =
			session?.injectGlobalsTs !== undefined && session.executeSendTs !== undefined
				? round(session.executeSendTs - session.injectGlobalsTs)
				: undefined;
		const executeResultToDestroyMs =
			session?.executeFinishTs !== undefined && session.destroyTs !== undefined
				? round(session.destroyTs - session.executeFinishTs)
				: undefined;
		const residualFixedOverheadMs =
			fixedSessionOverheadMs === undefined ||
			createToInjectGlobalsMs === undefined ||
			injectGlobalsToExecuteSendMs === undefined ||
			executeResultToDestroyMs === undefined
				? undefined
				: round(
						fixedSessionOverheadMs -
							createToInjectGlobalsMs -
							injectGlobalsToExecuteSendMs -
							executeResultToDestroyMs,
					);
		return {
			iteration: sample.iteration,
			sessionId,
			wallMs: sample.wallMs,
			sandboxMs: sample.sandboxMs,
			executeDurationMs,
			fixedSessionOverheadMs,
			createToInjectGlobalsMs,
			injectGlobalsToExecuteSendMs,
			executeResultToDestroyMs,
			residualFixedOverheadMs,
			bridgeCalls: session?.bridgeCalls ?? 0,
			bridgeDurationMs: round(session?.bridgeDurationMs ?? 0),
			bridgeCallEncodedBytes: session?.bridgeCallEncodedBytes ?? 0,
			bridgeResponseEncodedBytes: session?.bridgeResponseEncodedBytes ?? 0,
			bridgeCallPayloadBytes: session?.bridgeCallPayloadBytes ?? 0,
			bridgeResponsePayloadBytes: session?.bridgeResponsePayloadBytes ?? 0,
			mockRequests: sample.mockRequests,
			stdoutBytes: sample.stdoutBytes,
			stderrBytes: sample.stderrBytes,
			checks: sample.checks,
		};
	});

	const warmIterations = iterationsDetail.slice(1);
	const bridgeMethodSummaries = Array.from(methods.values()).map((method): ScenarioBridgeMethodSummary => ({
		method: method.method,
		callsTotal: method.callsTotal,
		callsPerIteration: round(method.callsTotal / result.iterations),
		totalDurationMs: round(method.totalDurationMs),
		durationMsPerIteration: round(method.totalDurationMs / result.iterations),
		meanDurationMsPerCall:
			method.callsTotal === 0 ? 0 : round(method.totalDurationMs / method.callsTotal),
		requestEncodedBytesTotal: method.requestEncodedBytesTotal,
		requestEncodedBytesPerIteration: round(method.requestEncodedBytesTotal / result.iterations),
		requestPayloadBytesTotal: method.requestPayloadBytesTotal,
		requestPayloadBytesPerIteration: round(method.requestPayloadBytesTotal / result.iterations),
		responseEncodedBytesTotal: method.responseEncodedBytesTotal,
		responseEncodedBytesPerIteration: round(method.responseEncodedBytesTotal / result.iterations),
		responsePayloadBytesTotal: method.responsePayloadBytesTotal,
		responsePayloadBytesPerIteration: round(method.responsePayloadBytesTotal / result.iterations),
		statusCounts: method.statusCounts,
	}));

	const hasLoadPolyfillTraffic = methods.has("_loadPolyfill");
	const loadPolyfillAttributionSummaries = LOAD_POLYFILL_ATTRIBUTION_ORDER.map(
		(kind): ScenarioLoadPolyfillAttributionSummary | null => {
			const attribution = loadPolyfillAttribution.get(kind);
			if (!attribution && !hasLoadPolyfillTraffic) {
				return null;
			}
			const targets = Array.from(attribution?.targets.values() ?? [])
				.map((target) => toLoadPolyfillTargetSummary(target, result.iterations));
			const targetsByName = [...targets].sort((left, right) =>
				left.target.localeCompare(right.target),
			);
			const topTargetsByCalls = sortLoadPolyfillTargetSummaries(
				targets,
				(entry) => entry.callsTotal,
				(entry) => entry.totalDurationMs,
				(entry) => entry.responseEncodedBytesTotal,
			).slice(0, LOAD_POLYFILL_TARGET_LIMIT);
			const topTargetsByTime = sortLoadPolyfillTargetSummaries(
				targets,
				(entry) => entry.totalDurationMs,
				(entry) => entry.responseEncodedBytesTotal,
				(entry) => entry.callsTotal,
			).slice(0, LOAD_POLYFILL_TARGET_LIMIT);
			const topTargetsByResponseBytes = sortLoadPolyfillTargetSummaries(
				targets,
				(entry) => entry.responseEncodedBytesTotal,
				(entry) => entry.totalDurationMs,
				(entry) => entry.callsTotal,
			).slice(0, LOAD_POLYFILL_TARGET_LIMIT);
			return {
				kind,
				label:
					attribution?.label ?? LOAD_POLYFILL_ATTRIBUTION_LABELS[kind],
				callsTotal: attribution?.callsTotal ?? 0,
				callsPerIteration: round(
					(attribution?.callsTotal ?? 0) / result.iterations,
				),
				totalDurationMs: round(attribution?.totalDurationMs ?? 0),
				durationMsPerIteration: round(
					(attribution?.totalDurationMs ?? 0) / result.iterations,
				),
				requestEncodedBytesTotal: attribution?.requestEncodedBytesTotal ?? 0,
				requestEncodedBytesPerIteration: round(
					(attribution?.requestEncodedBytesTotal ?? 0) / result.iterations,
				),
				responseEncodedBytesTotal: attribution?.responseEncodedBytesTotal ?? 0,
				responseEncodedBytesPerIteration: round(
					(attribution?.responseEncodedBytesTotal ?? 0) / result.iterations,
				),
				targets: targetsByName,
				topTargetsByCalls,
				topTargetsByTime,
				topTargetsByResponseBytes,
				unattributedCallsTotal: attribution?.unattributedCallsTotal ?? 0,
				unattributedCallsPerIteration: round(
					(attribution?.unattributedCallsTotal ?? 0) / result.iterations,
				),
				unattributedDurationMsTotal: round(
					attribution?.unattributedDurationMs ?? 0,
				),
				unattributedDurationMsPerIteration: round(
					(attribution?.unattributedDurationMs ?? 0) / result.iterations,
				),
				unattributedResponseEncodedBytesTotal:
					attribution?.unattributedResponseEncodedBytesTotal ?? 0,
				unattributedResponseEncodedBytesPerIteration: round(
					(attribution?.unattributedResponseEncodedBytesTotal ?? 0) /
						result.iterations,
				),
				exampleTargets: targetsByName
					.map((target) => target.target)
					.slice(0, LOAD_POLYFILL_TARGET_LIMIT),
			};
		},
	).filter(
		(
			attribution,
		): attribution is ScenarioLoadPolyfillAttributionSummary => attribution !== null,
	);

	const frameSummaries = Array.from(frames.values()).map((frame): ScenarioFrameSummary => ({
		direction: frame.direction,
		frameType: frame.frameType,
		countTotal: frame.countTotal,
		countPerIteration: round(frame.countTotal / result.iterations),
		encodedBytesTotal: frame.encodedBytesTotal,
		encodedBytesPerIteration: round(frame.encodedBytesTotal / result.iterations),
		payloadBytesTotal: frame.payloadBytesTotal,
		payloadBytesPerIteration: round(frame.payloadBytesTotal / result.iterations),
	}));

	const sortedMethodsByCount = [...bridgeMethodSummaries].sort((left, right) => {
		if (right.callsTotal !== left.callsTotal) return right.callsTotal - left.callsTotal;
		return right.totalDurationMs - left.totalDurationMs;
	});
	const sortedMethodsByTime = [...bridgeMethodSummaries].sort((left, right) => {
		if (right.totalDurationMs !== left.totalDurationMs) {
			return right.totalDurationMs - left.totalDurationMs;
		}
		return right.callsTotal - left.callsTotal;
	});
	const sortedMethodsByResponseBytes = [...bridgeMethodSummaries].sort((left, right) => {
		if (right.responseEncodedBytesTotal !== left.responseEncodedBytesTotal) {
			return right.responseEncodedBytesTotal - left.responseEncodedBytesTotal;
		}
		return right.callsTotal - left.callsTotal;
	});
	const sortedFramesByBytes = [...frameSummaries].sort((left, right) => {
		if (right.encodedBytesTotal !== left.encodedBytesTotal) {
			return right.encodedBytesTotal - left.encodedBytesTotal;
		}
		return right.countTotal - left.countTotal;
	});
	const loadPolyfillAttributionProgressSignals = loadPolyfillAttributionSummaries.reduce(
		(signals, attribution) => {
			signals[attribution.kind] = {
				callsPerIteration: attribution.callsPerIteration,
				durationMsPerIteration: attribution.durationMsPerIteration,
				responseEncodedBytesPerIteration:
					attribution.responseEncodedBytesPerIteration,
			};
			return signals;
		},
		{} as NonNullable<ScenarioDerivedSummary["progressSignals"]["loadPolyfillAttribution"]>,
	);

	return {
		scenarioId: result.scenarioId,
		title: result.title,
		target: result.target,
		kind: result.kind,
		description: result.description,
		createdAt: result.createdAt,
		iterations: result.iterations,
		artifacts: {
			...result.artifacts,
			summaryFile: path.posix.join(result.scenarioId, "summary.json"),
			summaryMarkdownFile: path.posix.join(result.scenarioId, "summary.md"),
		},
		benchmarkModes: result.benchmarkModes,
		timing: {
			connectRttMs:
				connectStartTs !== undefined && connectOkTs !== undefined
					? round(connectOkTs - connectStartTs)
					: undefined,
			coldWallMs: result.summary.coldWallMs,
			warmWallMsMean: result.summary.warmWallMsMean,
			coldSandboxMs: result.summary.coldSandboxMs,
			warmSandboxMsMean: result.summary.warmSandboxMsMean,
			coldExecuteDurationMs: iterationsDetail[0]?.executeDurationMs,
			warmExecuteDurationMsMean: mean(
				warmIterations
					.map((entry) => entry.executeDurationMs)
					.filter((value): value is number => typeof value === "number"),
			),
			coldFixedSessionOverheadMs: iterationsDetail[0]?.fixedSessionOverheadMs,
			warmFixedSessionOverheadMsMean: mean(
				warmIterations
					.map((entry) => entry.fixedSessionOverheadMs)
					.filter((value): value is number => typeof value === "number"),
			),
			coldCreateToInjectGlobalsMs: iterationsDetail[0]?.createToInjectGlobalsMs,
			warmCreateToInjectGlobalsMsMean: mean(
				warmIterations
					.map((entry) => entry.createToInjectGlobalsMs)
					.filter((value): value is number => typeof value === "number"),
			),
			coldInjectGlobalsToExecuteSendMs:
				iterationsDetail[0]?.injectGlobalsToExecuteSendMs,
			warmInjectGlobalsToExecuteSendMsMean: mean(
				warmIterations
					.map((entry) => entry.injectGlobalsToExecuteSendMs)
					.filter((value): value is number => typeof value === "number"),
			),
			coldExecuteResultToDestroyMs:
				iterationsDetail[0]?.executeResultToDestroyMs,
			warmExecuteResultToDestroyMsMean: mean(
				warmIterations
					.map((entry) => entry.executeResultToDestroyMs)
					.filter((value): value is number => typeof value === "number"),
			),
			coldResidualFixedOverheadMs: iterationsDetail[0]?.residualFixedOverheadMs,
			warmResidualFixedOverheadMsMean: mean(
				warmIterations
					.map((entry) => entry.residualFixedOverheadMs)
					.filter((value): value is number => typeof value === "number"),
			),
		},
		iterationsDetail,
		bridge: {
			totalCalls: iterationsDetail.reduce((sum, entry) => sum + entry.bridgeCalls, 0),
			callsPerIteration: round(
				iterationsDetail.reduce((sum, entry) => sum + entry.bridgeCalls, 0) /
					result.iterations,
			),
			totalDurationMs: round(
				iterationsDetail.reduce((sum, entry) => sum + entry.bridgeDurationMs, 0),
			),
			durationMsPerIteration: round(
				iterationsDetail.reduce((sum, entry) => sum + entry.bridgeDurationMs, 0) /
					result.iterations,
			),
			methodsByCount: sortedMethodsByCount,
			methodsByTime: sortedMethodsByTime,
			methodsByResponseBytes: sortedMethodsByResponseBytes,
			loadPolyfillAttribution: loadPolyfillAttributionSummaries,
			framesByEncodedBytes: sortedFramesByBytes,
			frames: frameSummaries.sort((left, right) => {
				if (left.direction !== right.direction) {
					return left.direction.localeCompare(right.direction);
				}
				return left.frameType.localeCompare(right.frameType);
			}),
		},
		progressSignals: {
			warmWallMsMean: result.summary.warmWallMsMean,
			bridgeCallsPerIteration: round(
				iterationsDetail.reduce((sum, entry) => sum + entry.bridgeCalls, 0) /
					result.iterations,
			),
			fixedSessionOverheadWarmMsMean: mean(
				warmIterations
					.map((entry) => entry.fixedSessionOverheadMs)
					.filter((value): value is number => typeof value === "number"),
			),
			dominantBridgeMethodByTime: sortedMethodsByTime[0]
				? {
						method: sortedMethodsByTime[0].method,
						durationMsPerIteration: sortedMethodsByTime[0].durationMsPerIteration,
						callsPerIteration: sortedMethodsByTime[0].callsPerIteration,
					}
				: undefined,
			dominantBridgeMethodByCount: sortedMethodsByCount[0]
				? {
						method: sortedMethodsByCount[0].method,
						callsPerIteration: sortedMethodsByCount[0].callsPerIteration,
						durationMsPerIteration: sortedMethodsByCount[0].durationMsPerIteration,
					}
				: undefined,
			dominantBridgeMethodByResponseBytes: sortedMethodsByResponseBytes[0]
				? {
						method: sortedMethodsByResponseBytes[0].method,
						responseEncodedBytesPerIteration:
							sortedMethodsByResponseBytes[0].responseEncodedBytesPerIteration,
					}
				: undefined,
			loadPolyfillAttribution:
				loadPolyfillAttributionSummaries.length > 0
					? loadPolyfillAttributionProgressSignals
					: undefined,
			dominantFrameByEncodedBytes: sortedFramesByBytes[0]
				? {
						direction: sortedFramesByBytes[0].direction,
						frameType: sortedFramesByBytes[0].frameType,
						encodedBytesPerIteration: sortedFramesByBytes[0].encodedBytesPerIteration,
					}
				: undefined,
		},
	};
}

function compareMethodSeries(
	current: ScenarioBridgeMethodSummary[],
	baseline: ScenarioBridgeMethodSummary[],
	selector: (value: ScenarioBridgeMethodSummary) => number,
): ScenarioMethodDelta[] {
	const baselineMap = new Map(baseline.map((entry) => [entry.method, selector(entry)]));
	const currentMap = new Map(current.map((entry) => [entry.method, selector(entry)]));
	const methods = new Set([...baselineMap.keys(), ...currentMap.keys()]);
	return Array.from(methods)
		.map((method) => {
			const before = baselineMap.get(method) ?? 0;
			const after = currentMap.get(method) ?? 0;
			return {
				method,
				before: round(before),
				after: round(after),
				delta: round(after - before),
			};
		})
		.filter((entry) => entry.delta !== 0)
		.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
		.slice(0, 5);
}

function compareFrameSeries(
	current: ScenarioFrameSummary[],
	baseline: ScenarioFrameSummary[],
): ScenarioFrameDelta[] {
	const baselineMap = new Map(
		baseline.map((entry) => [`${entry.direction}:${entry.frameType}`, entry]),
	);
	const currentMap = new Map(
		current.map((entry) => [`${entry.direction}:${entry.frameType}`, entry]),
	);
	const frameKeys = new Set([...baselineMap.keys(), ...currentMap.keys()]);
	return Array.from(frameKeys)
		.map((key) => {
			const beforeEntry = baselineMap.get(key);
			const afterEntry = currentMap.get(key);
			return {
				direction: afterEntry?.direction ?? beforeEntry?.direction ?? "unknown",
				frameType: afterEntry?.frameType ?? beforeEntry?.frameType ?? "unknown",
				before: round(beforeEntry?.encodedBytesPerIteration ?? 0),
				after: round(afterEntry?.encodedBytesPerIteration ?? 0),
				delta: round((afterEntry?.encodedBytesPerIteration ?? 0) - (beforeEntry?.encodedBytesPerIteration ?? 0)),
			};
		})
		.filter((entry) => entry.delta !== 0)
		.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
		.slice(0, 5);
}

function compareLoadPolyfillTargetSeries(
	current: ScenarioLoadPolyfillTargetSummary[],
	baseline: ScenarioLoadPolyfillTargetSummary[],
	selector: (
		delta: ScenarioLoadPolyfillTargetDelta,
	) => NumericDelta,
): ScenarioLoadPolyfillTargetDelta[] {
	const baselineMap = new Map(baseline.map((entry) => [entry.target, entry]));
	const currentMap = new Map(current.map((entry) => [entry.target, entry]));
	const targets = new Set([...baselineMap.keys(), ...currentMap.keys()]);
	return Array.from(targets)
		.map((target) => {
			const baselineEntry = baselineMap.get(target);
			const currentEntry = currentMap.get(target);
			return {
				target,
				callsPerIteration:
					compareNumeric(
						baselineEntry?.callsPerIteration ?? 0,
						currentEntry?.callsPerIteration ?? 0,
					) ?? zeroNumericDelta(),
				durationMsPerIteration:
					compareNumeric(
						baselineEntry?.durationMsPerIteration ?? 0,
						currentEntry?.durationMsPerIteration ?? 0,
					) ?? zeroNumericDelta(),
				responseEncodedBytesPerIteration:
					compareNumeric(
						baselineEntry?.responseEncodedBytesPerIteration ?? 0,
						currentEntry?.responseEncodedBytesPerIteration ?? 0,
					) ?? zeroNumericDelta(),
			};
		})
		.filter(
			(entry) =>
				entry.callsPerIteration.before !== 0 ||
				entry.callsPerIteration.after !== 0 ||
				entry.durationMsPerIteration.before !== 0 ||
				entry.durationMsPerIteration.after !== 0 ||
				entry.responseEncodedBytesPerIteration.before !== 0 ||
				entry.responseEncodedBytesPerIteration.after !== 0,
		)
		.sort((left, right) => {
			const leftMetric = selector(left);
			const rightMetric = selector(right);
			const selectorDelta =
				Math.abs(rightMetric.delta) - Math.abs(leftMetric.delta);
			if (selectorDelta !== 0) {
				return selectorDelta;
			}
			const selectorAfterDelta = rightMetric.after - leftMetric.after;
			if (selectorAfterDelta !== 0) {
				return selectorAfterDelta;
			}
			const responseBytesDelta =
				Math.abs(right.responseEncodedBytesPerIteration.delta) -
				Math.abs(left.responseEncodedBytesPerIteration.delta);
			if (responseBytesDelta !== 0) {
				return responseBytesDelta;
			}
			const responseBytesAfterDelta =
				right.responseEncodedBytesPerIteration.after -
				left.responseEncodedBytesPerIteration.after;
			if (responseBytesAfterDelta !== 0) {
				return responseBytesAfterDelta;
			}
			const durationDelta =
				Math.abs(right.durationMsPerIteration.delta) -
				Math.abs(left.durationMsPerIteration.delta);
			if (durationDelta !== 0) {
				return durationDelta;
			}
			const durationAfterDelta =
				right.durationMsPerIteration.after - left.durationMsPerIteration.after;
			if (durationAfterDelta !== 0) {
				return durationAfterDelta;
			}
			return left.target.localeCompare(right.target);
		})
		.slice(0, LOAD_POLYFILL_TARGET_LIMIT);
}

function compareLoadPolyfillAttribution(
	current: ScenarioLoadPolyfillAttributionSummary[],
	baseline: ScenarioLoadPolyfillAttributionSummary[],
): LoadPolyfillAttributionDelta[] {
	if (current.length === 0 && baseline.length === 0) {
		return [];
	}
	const currentMap = new Map(current.map((entry) => [entry.kind, entry]));
	const baselineMap = new Map(baseline.map((entry) => [entry.kind, entry]));
	return LOAD_POLYFILL_ATTRIBUTION_ORDER.map((kind) => {
		const currentEntry = currentMap.get(kind);
		const baselineEntry = baselineMap.get(kind);
		const label =
			currentEntry?.label ??
			baselineEntry?.label ??
			LOAD_POLYFILL_ATTRIBUTION_LABELS[kind];
		return {
			kind,
			label,
			callsPerIteration: compareNumeric(
				baselineEntry?.callsPerIteration ?? 0,
				currentEntry?.callsPerIteration ?? 0,
			) ?? {
				before: 0,
				after: 0,
				delta: 0,
			},
			durationMsPerIteration: compareNumeric(
				baselineEntry?.durationMsPerIteration ?? 0,
				currentEntry?.durationMsPerIteration ?? 0,
			) ?? {
				before: 0,
				after: 0,
				delta: 0,
			},
			responseEncodedBytesPerIteration: compareNumeric(
				baselineEntry?.responseEncodedBytesPerIteration ?? 0,
				currentEntry?.responseEncodedBytesPerIteration ?? 0,
			) ?? zeroNumericDelta(),
			unattributedCallsPerIteration:
				compareNumeric(
					baselineEntry?.unattributedCallsPerIteration ?? 0,
					currentEntry?.unattributedCallsPerIteration ?? 0,
				) ?? zeroNumericDelta(),
			unattributedDurationMsPerIteration:
				compareNumeric(
					baselineEntry?.unattributedDurationMsPerIteration ?? 0,
					currentEntry?.unattributedDurationMsPerIteration ?? 0,
				) ?? zeroNumericDelta(),
			unattributedResponseEncodedBytesPerIteration:
				compareNumeric(
					baselineEntry?.unattributedResponseEncodedBytesPerIteration ?? 0,
					currentEntry?.unattributedResponseEncodedBytesPerIteration ?? 0,
				) ?? zeroNumericDelta(),
			targetDeltasByCalls: compareLoadPolyfillTargetSeries(
				currentEntry?.targets ?? [],
				baselineEntry?.targets ?? [],
				(entry) => entry.callsPerIteration,
			),
			targetDeltasByTime: compareLoadPolyfillTargetSeries(
				currentEntry?.targets ?? [],
				baselineEntry?.targets ?? [],
				(entry) => entry.durationMsPerIteration,
			),
			targetDeltasByResponseBytes: compareLoadPolyfillTargetSeries(
				currentEntry?.targets ?? [],
				baselineEntry?.targets ?? [],
				(entry) => entry.responseEncodedBytesPerIteration,
			),
		};
	});
}

function getFrameEncodedBytesPerIteration(
	summary: ScenarioDerivedSummary,
	direction: string,
	frameType: string,
): number | undefined {
	return summary.bridge.frames.find(
		(entry) => entry.direction === direction && entry.frameType === frameType,
	)?.encodedBytesPerIteration;
}

export function compareScenarioSummaries(
	current: ScenarioDerivedSummary,
	baseline: ScenarioDerivedSummary,
): ScenarioComparisonSummary {
	return {
		baselineScenarioCreatedAt: baseline.createdAt,
		metrics: {
			warmWallMsMean: compareNumeric(
				baseline.timing.warmWallMsMean,
				current.timing.warmWallMsMean,
			),
			bridgeCallsPerIteration: compareNumeric(
				baseline.bridge.callsPerIteration,
				current.bridge.callsPerIteration,
			),
			fixedSessionOverheadWarmMsMean: compareNumeric(
				baseline.timing.warmFixedSessionOverheadMsMean,
				current.timing.warmFixedSessionOverheadMsMean,
			),
			createToInjectGlobalsWarmMsMean: compareNumeric(
				baseline.timing.warmCreateToInjectGlobalsMsMean,
				current.timing.warmCreateToInjectGlobalsMsMean,
			),
			injectGlobalsToExecuteSendWarmMsMean: compareNumeric(
				baseline.timing.warmInjectGlobalsToExecuteSendMsMean,
				current.timing.warmInjectGlobalsToExecuteSendMsMean,
			),
			executeResultToDestroyWarmMsMean: compareNumeric(
				baseline.timing.warmExecuteResultToDestroyMsMean,
				current.timing.warmExecuteResultToDestroyMsMean,
			),
			residualFixedOverheadWarmMsMean: compareNumeric(
				baseline.timing.warmResidualFixedOverheadMsMean,
				current.timing.warmResidualFixedOverheadMsMean,
			),
			bridgeDurationPerIterationMs: compareNumeric(
				baseline.bridge.durationMsPerIteration,
				current.bridge.durationMsPerIteration,
			),
			bridgeResponseFrameBytesPerIteration: compareNumeric(
				getFrameEncodedBytesPerIteration(baseline, "send", "BridgeResponse"),
				getFrameEncodedBytesPerIteration(current, "send", "BridgeResponse"),
			),
			executeWarmMsMean: compareNumeric(
				baseline.timing.warmExecuteDurationMsMean,
				current.timing.warmExecuteDurationMsMean,
			),
		},
		bridgeMethodDurationDeltas: compareMethodSeries(
			current.bridge.methodsByTime,
			baseline.bridge.methodsByTime,
			(entry) => entry.durationMsPerIteration,
		),
		bridgeMethodCountDeltas: compareMethodSeries(
			current.bridge.methodsByCount,
			baseline.bridge.methodsByCount,
			(entry) => entry.callsPerIteration,
		),
		bridgeMethodResponseByteDeltas: compareMethodSeries(
			current.bridge.methodsByResponseBytes,
			baseline.bridge.methodsByResponseBytes,
			(entry) => entry.responseEncodedBytesPerIteration,
		),
		frameEncodedByteDeltas: compareFrameSeries(
			current.bridge.framesByEncodedBytes,
			baseline.bridge.framesByEncodedBytes,
		),
		loadPolyfillAttributionDeltas: compareLoadPolyfillAttribution(
			current.bridge.loadPolyfillAttribution,
			baseline.bridge.loadPolyfillAttribution,
		),
	};
}

export async function readScenarioRunResult(resultFile: string): Promise<ScenarioRunResult | null> {
	try {
		const content = await readFile(resultFile, "utf8");
		return JSON.parse(content) as ScenarioRunResult;
	} catch {
		return null;
	}
}

export async function loadScenarioDerivedSummary(
	resultsRoot: string,
	scenario: ModuleLoadScenarioDefinition,
	options?: DeriveScenarioSummaryOptions,
): Promise<ScenarioDerivedSummary | null> {
	const resultFile = path.join(resultsRoot, scenario.id, "result.json");
	const logFile = path.join(resultsRoot, scenario.id, "ipc.ndjson");
	const result = await readScenarioRunResult(resultFile);
	if (!result) {
		return null;
	}
	try {
		const logText = await readFile(logFile, "utf8");
		return deriveScenarioSummary(scenario, result, parseIpcLog(logText), options);
	} catch {
		return null;
	}
}

export async function loadBenchmarkBaseline(
	resultsRoot: string,
	options?: DeriveScenarioSummaryOptions,
): Promise<BenchmarkBaseline | null> {
	const scenarioSummaries = new Map<string, ScenarioDerivedSummary>();
	for (const scenario of MODULE_LOAD_SCENARIOS) {
		const summary = await loadScenarioDerivedSummary(resultsRoot, scenario, options);
		if (summary) {
			scenarioSummaries.set(scenario.id, summary);
		}
	}
	if (scenarioSummaries.size === 0) {
		return null;
	}

	let metadata: BenchmarkBaselineMetadata | undefined;
	let transportRtt: TransportRttReport | undefined;
	try {
		const rawSummary = JSON.parse(
			await readFile(path.join(resultsRoot, "summary.json"), "utf8"),
		) as Record<string, JsonValue>;
		metadata = {
			createdAt:
				typeof rawSummary.createdAt === "string" ? rawSummary.createdAt : undefined,
			gitCommit:
				typeof rawSummary.gitCommit === "string" ? rawSummary.gitCommit : undefined,
			host:
				rawSummary.host && typeof rawSummary.host === "object" && !Array.isArray(rawSummary.host)
					? (rawSummary.host as Record<string, JsonValue>)
					: undefined,
			v8BinaryPath:
				typeof rawSummary.v8BinaryPath === "string"
					? rawSummary.v8BinaryPath
					: undefined,
			iterations:
				typeof rawSummary.iterations === "number" ? rawSummary.iterations : undefined,
		};
		if (
			rawSummary.transportRtt &&
			typeof rawSummary.transportRtt === "object" &&
			!Array.isArray(rawSummary.transportRtt)
		) {
			transportRtt = rawSummary.transportRtt as unknown as TransportRttReport;
		}
	} catch {
		metadata = undefined;
		transportRtt = undefined;
	}

	return { metadata, scenarioSummaries, transportRtt };
}

export function compareTransportRtt(
	current: TransportRttReport,
	baseline: TransportRttReport,
): TransportRttComparison {
	const baselinePayloads = new Map(
		baseline.payloads.map((entry) => [entry.payloadBytes, entry]),
	);
	const currentPayloads = new Map(
		current.payloads.map((entry) => [entry.payloadBytes, entry]),
	);
	const payloadBytes = new Set([
		...baselinePayloads.keys(),
		...currentPayloads.keys(),
	]);

	return {
		baselineCreatedAt: baseline.createdAt,
		connectRttMs: compareNumeric(baseline.connectRttMs, current.connectRttMs),
		payloads: Array.from(payloadBytes)
			.map((bytes) => {
				const before = baselinePayloads.get(bytes);
				const after = currentPayloads.get(bytes);
				return {
					label: after?.label ?? before?.label ?? `${bytes} B`,
					payloadBytes: bytes,
					meanRttMs: compareNumeric(before?.meanRttMs, after?.meanRttMs),
					p95RttMs: compareNumeric(before?.p95RttMs, after?.p95RttMs),
				};
			})
			.sort((left, right) => left.payloadBytes - right.payloadBytes),
	};
}

export function buildTransportRttMarkdown(report: TransportRttReport): string {
	const lines = [
		"# Transport RTT",
		"",
		`Generated: ${report.createdAt}`,
		"Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.",
		`Connect RTT: ${formatMetric(report.connectRttMs)}`,
		`Warmup iterations/payload: ${report.warmupIterations}`,
		`Measured iterations/payload: ${report.sampleIterations}`,
		"",
		"| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |",
		"| --- | ---: | ---: | ---: | ---: | ---: |",
	];

	for (const payload of report.payloads) {
		lines.push(
			`| ${payload.label} | ${payload.sampleCount} | ${formatMetric(payload.minRttMs)} | ${formatMetric(payload.meanRttMs)} | ${formatMetric(payload.p95RttMs)} | ${formatMetric(payload.maxRttMs)} |`,
		);
	}

	if (report.comparisonToPrevious) {
		lines.push("");
		lines.push("## Comparison To Previous Baseline");
		lines.push("");
		lines.push(
			`Baseline transport timestamp: ${report.comparisonToPrevious.baselineCreatedAt ?? "unknown"}`,
		);
		lines.push(
			`- Connect RTT: ${formatDelta(report.comparisonToPrevious.connectRttMs)}`,
		);
		for (const payload of report.comparisonToPrevious.payloads) {
			lines.push(
				`- ${payload.label} mean RTT: ${formatDelta(payload.meanRttMs)}`,
			);
			lines.push(
				`- ${payload.label} P95 RTT: ${formatDelta(payload.p95RttMs)}`,
			);
		}
	}

	lines.push("");
	return `${lines.join("\n")}\n`;
}

export function buildScenarioSummaryMarkdown(summary: ScenarioDerivedSummary): string {
	const lines = [
		`# ${summary.title}`,
		"",
		`Scenario: \`${summary.scenarioId}\``,
		`Generated: ${summary.createdAt}`,
		`Description: ${summary.description}`,
		"Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`",
		"",
		"## Progress Copy Fields",
		"",
		`- Warm wall mean: ${formatMetric(summary.progressSignals.warmWallMsMean)}`,
		`- Bridge calls/iteration: ${summary.progressSignals.bridgeCallsPerIteration.toFixed(3)}`,
		`- Warm fixed session overhead: ${formatMetric(summary.progressSignals.fixedSessionOverheadWarmMsMean)}`,
	];
	if (summary.timing.connectRttMs !== undefined) {
		lines.push(`- Scenario IPC connect RTT: ${formatMetric(summary.timing.connectRttMs)}`);
	}
	lines.push(
		`- Warm phase attribution: Create->InjectGlobals ${formatMetric(summary.timing.warmCreateToInjectGlobalsMsMean)}, InjectGlobals->Execute ${formatMetric(summary.timing.warmInjectGlobalsToExecuteSendMsMean)}, ExecutionResult->Destroy ${formatMetric(summary.timing.warmExecuteResultToDestroyMsMean)}, residual ${formatMetric(summary.timing.warmResidualFixedOverheadMsMean)}`,
	);

	if (summary.progressSignals.dominantBridgeMethodByTime) {
		lines.push(
			`- Dominant bridge time: \`${summary.progressSignals.dominantBridgeMethodByTime.method}\` ${summary.progressSignals.dominantBridgeMethodByTime.durationMsPerIteration.toFixed(3)} ms/iteration across ${summary.progressSignals.dominantBridgeMethodByTime.callsPerIteration.toFixed(3)} calls/iteration`,
		);
	}
	if (summary.progressSignals.dominantBridgeMethodByResponseBytes) {
		lines.push(
			`- Dominant bridge response bytes: \`${summary.progressSignals.dominantBridgeMethodByResponseBytes.method}\` ${summary.progressSignals.dominantBridgeMethodByResponseBytes.responseEncodedBytesPerIteration.toFixed(3)} bytes/iteration`,
		);
	}
	for (const attribution of summary.bridge.loadPolyfillAttribution) {
		lines.push(
			`- _loadPolyfill ${attribution.label}: ${formatLoadPolyfillAttributionSummary(attribution)}`,
		);
		if (attribution.topTargetsByTime[0]) {
			lines.push(
				`- _loadPolyfill ${attribution.label} top target by time: \`${attribution.topTargetsByTime[0].target}\` ${formatLoadPolyfillTargetSummary(attribution.topTargetsByTime[0])}`,
			);
		}
		if (attribution.topTargetsByResponseBytes[0]) {
			lines.push(
				`- _loadPolyfill ${attribution.label} top target by response bytes: \`${attribution.topTargetsByResponseBytes[0].target}\` ${formatLoadPolyfillTargetSummary(attribution.topTargetsByResponseBytes[0])}`,
			);
		}
	}
	if (summary.progressSignals.dominantFrameByEncodedBytes) {
		lines.push(
			`- Dominant frame bytes: \`${summary.progressSignals.dominantFrameByEncodedBytes.direction}:${summary.progressSignals.dominantFrameByEncodedBytes.frameType}\` ${summary.progressSignals.dominantFrameByEncodedBytes.encodedBytesPerIteration.toFixed(3)} bytes/iteration`,
		);
	}

	const benchmarkModeRows = buildBenchmarkModeRows(summary.benchmarkModes);
	if (benchmarkModeRows.length > 0) {
		lines.push("");
		lines.push("## Benchmark Modes");
		lines.push("");
		lines.push(
			"These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.",
		);
		lines.push("");
		for (const row of benchmarkModeRows) {
			lines.push(`- ${row}`);
		}
	}

	lines.push("");
	lines.push("## Iteration Timing");
	lines.push("");
	lines.push("| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |");
	lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
	for (const iteration of summary.iterationsDetail) {
		lines.push(
			`| ${iteration.iteration} | ${formatMetric(iteration.wallMs)} | ${formatMetric(iteration.executeDurationMs)} | ${formatMetric(iteration.fixedSessionOverheadMs)} | ${iteration.bridgeCalls} | ${formatMetric(iteration.bridgeDurationMs)} |`,
		);
	}

	lines.push("");
	lines.push("## Session Phase Attribution");
	lines.push("");
	lines.push(
		"Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.",
	);
	lines.push("");
	lines.push(
		"| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |",
	);
	lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
	for (const iteration of summary.iterationsDetail) {
		lines.push(
			`| ${iteration.iteration} | ${formatMetric(iteration.createToInjectGlobalsMs)} | ${formatMetric(iteration.injectGlobalsToExecuteSendMs)} | ${formatMetric(iteration.executeDurationMs)} | ${formatMetric(iteration.executeResultToDestroyMs)} | ${formatMetric(iteration.residualFixedOverheadMs)} |`,
		);
	}

	lines.push("");
	lines.push("## Bridge Methods By Time");
	lines.push("");
	lines.push("| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |");
	lines.push("| --- | ---: | ---: | ---: | ---: |");
	for (const method of summary.bridge.methodsByTime.slice(0, 10)) {
		lines.push(
			`| \`${method.method}\` | ${method.callsPerIteration.toFixed(3)} | ${formatMetric(method.durationMsPerIteration)} | ${formatMetric(method.meanDurationMsPerCall)} | ${method.responseEncodedBytesPerIteration.toFixed(3)} |`,
		);
	}

	if (summary.bridge.loadPolyfillAttribution.length > 0) {
		lines.push("");
		lines.push("## _loadPolyfill Attribution");
		lines.push("");
		lines.push(
			"| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |",
		);
		lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
		for (const attribution of summary.bridge.loadPolyfillAttribution) {
			lines.push(
				`| ${attribution.label} | ${attribution.callsPerIteration.toFixed(3)} | ${formatMetric(attribution.durationMsPerIteration)} | ${attribution.responseEncodedBytesPerIteration.toFixed(3)} | ${attribution.targets.length} | ${attribution.unattributedCallsPerIteration.toFixed(3)} |`,
			);
		}

		lines.push("");
		lines.push("## _loadPolyfill Target Hotspots");
		lines.push("");
		lines.push("| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |");
		lines.push("| --- | --- | --- | ---: | ---: | ---: |");
		for (const attribution of summary.bridge.loadPolyfillAttribution) {
			pushLoadPolyfillTargetRankingRows(
				lines,
				attribution.label,
				"by calls",
				attribution.topTargetsByCalls,
			);
			pushLoadPolyfillTargetRankingRows(
				lines,
				attribution.label,
				"by time",
				attribution.topTargetsByTime,
			);
			pushLoadPolyfillTargetRankingRows(
				lines,
				attribution.label,
				"by response bytes",
				attribution.topTargetsByResponseBytes,
			);
			if (
				attribution.topTargetsByCalls.length === 0 &&
				attribution.topTargetsByTime.length === 0 &&
				attribution.topTargetsByResponseBytes.length === 0
			) {
				lines.push(
					`| ${attribution.label} | - | - | - | - | - |`,
				);
			}
			if (
				attribution.unattributedCallsTotal > 0 ||
				attribution.unattributedDurationMsTotal > 0 ||
				attribution.unattributedResponseEncodedBytesTotal > 0
			) {
				lines.push(
					`| ${attribution.label} | unattributed remainder | (no bridgeTarget in log) | ${attribution.unattributedCallsPerIteration.toFixed(3)} | ${formatMetric(attribution.unattributedDurationMsPerIteration)} | ${attribution.unattributedResponseEncodedBytesPerIteration.toFixed(3)} |`,
				);
			}
		}
	}

	lines.push("");
	lines.push("## Frame Bytes");
	lines.push("");
	lines.push("| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |");
	lines.push("| --- | ---: | ---: | ---: |");
	for (const frame of summary.bridge.framesByEncodedBytes.slice(0, 10)) {
		lines.push(
			`| \`${frame.direction}:${frame.frameType}\` | ${frame.countPerIteration.toFixed(3)} | ${frame.encodedBytesPerIteration.toFixed(3)} | ${frame.payloadBytesPerIteration.toFixed(3)} |`,
		);
	}

	if (summary.comparisonToPrevious) {
		lines.push("");
		lines.push("## Comparison To Previous Baseline");
		lines.push("");
		lines.push(
			`Baseline scenario timestamp: ${summary.comparisonToPrevious.baselineScenarioCreatedAt}`,
		);
		lines.push("");
		lines.push(`- Warm wall: ${formatDelta(summary.comparisonToPrevious.metrics.warmWallMsMean)}`);
		lines.push(
			`- Bridge calls/iteration: ${formatDelta(summary.comparisonToPrevious.metrics.bridgeCallsPerIteration, "calls")}`,
		);
		lines.push(
			`- Warm fixed overhead: ${formatDelta(summary.comparisonToPrevious.metrics.fixedSessionOverheadWarmMsMean)}`,
		);
		lines.push(
			`- Warm Create->InjectGlobals: ${formatDelta(summary.comparisonToPrevious.metrics.createToInjectGlobalsWarmMsMean)}`,
		);
		lines.push(
			`- Warm InjectGlobals->Execute: ${formatDelta(summary.comparisonToPrevious.metrics.injectGlobalsToExecuteSendWarmMsMean)}`,
		);
		lines.push(
			`- Warm ExecutionResult->Destroy: ${formatDelta(summary.comparisonToPrevious.metrics.executeResultToDestroyWarmMsMean)}`,
		);
		lines.push(
			`- Warm residual overhead: ${formatDelta(summary.comparisonToPrevious.metrics.residualFixedOverheadWarmMsMean)}`,
		);
		lines.push(
			`- Bridge time/iteration: ${formatDelta(summary.comparisonToPrevious.metrics.bridgeDurationPerIterationMs)}`,
		);
		lines.push(
			`- BridgeResponse encoded bytes/iteration: ${formatDelta(summary.comparisonToPrevious.metrics.bridgeResponseFrameBytesPerIteration, "bytes")}`,
		);
		for (const attributionDelta of summary.comparisonToPrevious.loadPolyfillAttributionDeltas) {
			lines.push(
				`- _loadPolyfill ${attributionDelta.label}: ${formatLoadPolyfillAttributionDelta(attributionDelta)}`,
			);
			if (
				attributionDelta.unattributedCallsPerIteration.delta !== 0 ||
				attributionDelta.unattributedDurationMsPerIteration.delta !== 0 ||
				attributionDelta.unattributedResponseEncodedBytesPerIteration.delta !== 0
			) {
				lines.push(
					`- _loadPolyfill ${attributionDelta.label} unattributed remainder: calls ${formatDelta(attributionDelta.unattributedCallsPerIteration, "calls")}; time ${formatDelta(attributionDelta.unattributedDurationMsPerIteration)}; response bytes ${formatDelta(attributionDelta.unattributedResponseEncodedBytesPerIteration, "bytes")}`,
				);
			}
		}
		const hasLoadPolyfillTargetDeltas =
			summary.comparisonToPrevious.loadPolyfillAttributionDeltas.some(
				(attributionDelta) =>
					attributionDelta.targetDeltasByCalls.length > 0 ||
					attributionDelta.targetDeltasByTime.length > 0 ||
					attributionDelta.targetDeltasByResponseBytes.length > 0,
			);
		if (hasLoadPolyfillTargetDeltas) {
			lines.push("");
			lines.push("### _loadPolyfill Target Deltas");
			lines.push("");
			lines.push(
				"| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |",
			);
			lines.push("| --- | --- | --- | --- | --- | --- |");
			for (const attributionDelta of summary.comparisonToPrevious.loadPolyfillAttributionDeltas) {
				pushLoadPolyfillTargetDeltaRows(
					lines,
					attributionDelta.label,
					"by calls",
					attributionDelta.targetDeltasByCalls,
				);
				pushLoadPolyfillTargetDeltaRows(
					lines,
					attributionDelta.label,
					"by time",
					attributionDelta.targetDeltasByTime,
				);
				pushLoadPolyfillTargetDeltaRows(
					lines,
					attributionDelta.label,
					"by response bytes",
					attributionDelta.targetDeltasByResponseBytes,
				);
			}
		}
		lines.push("");
		lines.push("| Delta Type | Name | Before | After | Delta |");
		lines.push("| --- | --- | ---: | ---: | ---: |");
		for (const delta of summary.comparisonToPrevious.bridgeMethodDurationDeltas.slice(0, 3)) {
			lines.push(
				`| Method time | \`${delta.method}\` | ${delta.before.toFixed(3)} | ${delta.after.toFixed(3)} | ${delta.delta > 0 ? "+" : ""}${delta.delta.toFixed(3)} |`,
			);
		}
		for (const delta of summary.comparisonToPrevious.bridgeMethodResponseByteDeltas.slice(0, 3)) {
			lines.push(
				`| Method bytes | \`${delta.method}\` | ${delta.before.toFixed(3)} | ${delta.after.toFixed(3)} | ${delta.delta > 0 ? "+" : ""}${delta.delta.toFixed(3)} |`,
			);
		}
		for (const delta of summary.comparisonToPrevious.frameEncodedByteDeltas.slice(0, 3)) {
			lines.push(
				`| Frame bytes | \`${delta.direction}:${delta.frameType}\` | ${delta.before.toFixed(3)} | ${delta.after.toFixed(3)} | ${delta.delta > 0 ? "+" : ""}${delta.delta.toFixed(3)} |`,
			);
		}
	}

	lines.push("");
	return `${lines.join("\n")}\n`;
}

export function buildBenchmarkSummaryMarkdown(report: BenchmarkSummaryReport): string {
	const lines = [
		"# Module Load Benchmark",
		"",
		`Generated: ${report.createdAt}`,
		`Git commit: ${report.gitCommit}`,
		`Host: ${JSON.stringify(report.host)}`,
		`V8 binary: ${report.v8BinaryPath}`,
		`Baseline summary: ${report.baseline?.createdAt ?? "none"}`,
		"Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`",
		"",
		"Use `comparison.md` for before/after deltas on the primary sandbox new-session replay mode, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers plus ranked target-level deltas. Use the per-scenario `summary.md` files for copy-ready control-mode numbers such as true cold start, same-session replay, snapshot-off replay, host controls, and current target hotspots.",
		"",
		"| Scenario | Sandbox New-Session Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |",
		"| --- | ---: | ---: | ---: | --- | --- |",
	];

	for (const scenario of report.scenarioOverview) {
		lines.push(
			`| ${scenario.title} | ${formatMetric(scenario.warmWallMsMean)} | ${scenario.bridgeCallsPerIteration.toFixed(3)} | ${formatMetric(scenario.fixedSessionOverheadWarmMsMean)} | ${scenario.dominantBridgeMethodByTime ? `\`${scenario.dominantBridgeMethodByTime.method}\` ${scenario.dominantBridgeMethodByTime.durationMsPerIteration.toFixed(3)} ms/iter` : "-"} | ${scenario.dominantFrameByEncodedBytes ? `\`${scenario.dominantFrameByEncodedBytes.direction}:${scenario.dominantFrameByEncodedBytes.frameType}\` ${scenario.dominantFrameByEncodedBytes.encodedBytesPerIteration.toFixed(3)} B/iter` : "-"} |`,
		);
	}

	lines.push("");
	lines.push("## Warm Session Phase Means");
	lines.push("");
	lines.push(
		"| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |",
	);
	lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
	for (const scenario of report.scenarioSummaries) {
		lines.push(
			`| ${scenario.title} | ${formatMetric(scenario.timing.connectRttMs)} | ${formatMetric(scenario.timing.warmCreateToInjectGlobalsMsMean)} | ${formatMetric(scenario.timing.warmInjectGlobalsToExecuteSendMsMean)} | ${formatMetric(scenario.timing.warmExecuteDurationMsMean)} | ${formatMetric(scenario.timing.warmExecuteResultToDestroyMsMean)} | ${formatMetric(scenario.timing.warmResidualFixedOverheadMsMean)} |`,
		);
	}

	lines.push("");
	lines.push("## Benchmark Mode Controls");
	lines.push("");
	lines.push(
		"| Scenario | Cold Start Snapshot On/Off | Same-Session Replay | New-Session Replay Snapshot On/Off | Host Same-Session Control |",
	);
	lines.push("| --- | --- | --- | --- | --- |");
	for (const scenario of report.scenarioSummaries) {
		const benchmarkModes = scenario.benchmarkModes;
		const coldStart = benchmarkModes?.sandboxTrueColdStart
			? `on ${formatMetric(benchmarkModes.sandboxTrueColdStart.warmSnapshotEnabled.totalWallMs)} / off ${formatMetric(benchmarkModes.sandboxTrueColdStart.warmSnapshotDisabled.totalWallMs)}`
			: "-";
		const sameSession = benchmarkModes?.sandboxSameSessionReplay
			? benchmarkModes.sandboxSameSessionReplay.firstPassMs === 0 &&
				benchmarkModes.sandboxSameSessionReplay.replayPassMs === 0
				? `total ${formatMetric(benchmarkModes.sandboxSameSessionReplay.totalWallMs)}`
				: `first ${formatMetric(benchmarkModes.sandboxSameSessionReplay.firstPassMs)}, replay ${formatMetric(benchmarkModes.sandboxSameSessionReplay.replayPassMs)}`
			: "-";
		const newSession = benchmarkModes?.sandboxNewSessionReplay
			? `on ${formatMetric(benchmarkModes.sandboxNewSessionReplay.warmSnapshotEnabled.warmWallMsMean)} / off ${formatMetric(benchmarkModes.sandboxNewSessionReplay.warmSnapshotDisabled.warmWallMsMean)}`
			: "-";
		const hostControl = benchmarkModes?.hostSameSessionControl
			? `first ${formatMetric(benchmarkModes.hostSameSessionControl.firstPassMs)}, replay ${formatMetric(benchmarkModes.hostSameSessionControl.replayPassMs)}`
			: "-";
		lines.push(
			`| ${scenario.title} | ${coldStart} | ${sameSession} | ${newSession} | ${hostControl} |`,
		);
	}

	if (report.transportRtt) {
		lines.push("");
		lines.push("## Transport RTT");
		lines.push("");
		lines.push(
			`Dedicated IPC connect RTT: ${formatMetric(report.transportRtt.connectRttMs)}`,
		);
		lines.push("");
		lines.push("| Payload | Mean RTT | P95 RTT | Max RTT |");
		lines.push("| --- | ---: | ---: | ---: |");
		for (const payload of report.transportRtt.payloads) {
			lines.push(
				`| ${payload.label} | ${formatMetric(payload.meanRttMs)} | ${formatMetric(payload.p95RttMs)} | ${formatMetric(payload.maxRttMs)} |`,
			);
		}
	}

	lines.push("");
	lines.push("## Progress Guide");
	lines.push("");
	for (const field of report.progressGuide.copyTheseFields) {
		lines.push(`- ${field}`);
	}

	lines.push("");
	lines.push("## Per-Scenario Summaries");
	lines.push("");
	for (const scenario of report.scenarioSummaries) {
		lines.push(
			`- \`${scenario.scenarioId}\`: \`${scenario.artifacts.summaryFile}\`, \`${scenario.artifacts.summaryMarkdownFile}\``,
		);
	}
	if (report.transportRtt) {
		lines.push("- `transport-rtt`: `transport-rtt.json`, `transport-rtt.md`");
	}
	lines.push("");
	return `${lines.join("\n")}\n`;
}

export function buildBenchmarkComparisonMarkdown(report: BenchmarkSummaryReport): string {
	const lines = [
		"# Module Load Benchmark Comparison",
		"",
		`Current benchmark: ${report.createdAt} (${report.gitCommit})`,
		`Baseline benchmark: ${report.baseline?.createdAt ?? "none"}${report.baseline?.gitCommit ? ` (${report.baseline.gitCommit})` : ""}`,
		"Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`",
		"",
		"Copy the primary sandbox new-session replay warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch plus the ranked target-level deltas below. Use the per-scenario `summary.md` Benchmark Modes section for true cold start, same-session replay, snapshot-off replay, host-control numbers, and current target hotspots.",
		"",
	];

	for (const scenario of report.scenarioOverview) {
		lines.push(`## ${scenario.title}`);
		lines.push("");
		if (!scenario.comparisonToPrevious) {
			lines.push("- No previous baseline was available for this scenario.");
			lines.push("");
			continue;
		}
		lines.push(
			`- Warm wall: ${formatDelta(scenario.comparisonToPrevious.metrics.warmWallMsMean)}`,
		);
		lines.push(
			`- Bridge calls/iteration: ${formatDelta(scenario.comparisonToPrevious.metrics.bridgeCallsPerIteration, "calls")}`,
		);
		lines.push(
			`- Warm fixed overhead: ${formatDelta(scenario.comparisonToPrevious.metrics.fixedSessionOverheadWarmMsMean)}`,
		);
		lines.push(
			`- Warm Create->InjectGlobals: ${formatDelta(scenario.comparisonToPrevious.metrics.createToInjectGlobalsWarmMsMean)}`,
		);
		lines.push(
			`- Warm InjectGlobals->Execute: ${formatDelta(scenario.comparisonToPrevious.metrics.injectGlobalsToExecuteSendWarmMsMean)}`,
		);
		lines.push(
			`- Warm ExecutionResult->Destroy: ${formatDelta(scenario.comparisonToPrevious.metrics.executeResultToDestroyWarmMsMean)}`,
		);
		lines.push(
			`- Warm residual overhead: ${formatDelta(scenario.comparisonToPrevious.metrics.residualFixedOverheadWarmMsMean)}`,
		);
		lines.push(
			`- Bridge time/iteration: ${formatDelta(scenario.comparisonToPrevious.metrics.bridgeDurationPerIterationMs)}`,
		);
		lines.push(
			`- BridgeResponse encoded bytes/iteration: ${formatDelta(scenario.comparisonToPrevious.metrics.bridgeResponseFrameBytesPerIteration, "bytes")}`,
		);
		const durationDelta = scenario.comparisonToPrevious.bridgeMethodDurationDeltas[0];
		if (durationDelta) {
			lines.push(
				`- Largest method-time delta: \`${durationDelta.method}\` ${durationDelta.before.toFixed(3)} -> ${durationDelta.after.toFixed(3)} ms/iteration (${durationDelta.delta > 0 ? "+" : ""}${durationDelta.delta.toFixed(3)})`,
			);
		}
		const bytesDelta = scenario.comparisonToPrevious.bridgeMethodResponseByteDeltas[0];
		if (bytesDelta) {
			lines.push(
				`- Largest method-byte delta: \`${bytesDelta.method}\` ${bytesDelta.before.toFixed(3)} -> ${bytesDelta.after.toFixed(3)} encoded bytes/iteration (${bytesDelta.delta > 0 ? "+" : ""}${bytesDelta.delta.toFixed(3)})`,
			);
		}
		const frameDelta = scenario.comparisonToPrevious.frameEncodedByteDeltas[0];
		if (frameDelta) {
			lines.push(
				`- Largest frame-byte delta: \`${frameDelta.direction}:${frameDelta.frameType}\` ${frameDelta.before.toFixed(3)} -> ${frameDelta.after.toFixed(3)} encoded bytes/iteration (${frameDelta.delta > 0 ? "+" : ""}${frameDelta.delta.toFixed(3)})`,
			);
		}
		for (const attributionDelta of scenario.comparisonToPrevious.loadPolyfillAttributionDeltas) {
			lines.push(
				`- _loadPolyfill ${attributionDelta.label}: ${formatLoadPolyfillAttributionDelta(attributionDelta)}`,
			);
			if (
				attributionDelta.unattributedCallsPerIteration.delta !== 0 ||
				attributionDelta.unattributedDurationMsPerIteration.delta !== 0 ||
				attributionDelta.unattributedResponseEncodedBytesPerIteration.delta !== 0
			) {
				lines.push(
					`- _loadPolyfill ${attributionDelta.label} unattributed remainder: calls ${formatDelta(attributionDelta.unattributedCallsPerIteration, "calls")}; time ${formatDelta(attributionDelta.unattributedDurationMsPerIteration)}; response bytes ${formatDelta(attributionDelta.unattributedResponseEncodedBytesPerIteration, "bytes")}`,
				);
			}
		}
		const hasTargetDeltas = scenario.comparisonToPrevious.loadPolyfillAttributionDeltas.some(
			(attributionDelta) =>
				attributionDelta.targetDeltasByCalls.length > 0 ||
				attributionDelta.targetDeltasByTime.length > 0 ||
				attributionDelta.targetDeltasByResponseBytes.length > 0,
		);
		if (hasTargetDeltas) {
			lines.push("");
			lines.push(
				"| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |",
			);
			lines.push("| --- | --- | --- | --- | --- | --- |");
			for (const attributionDelta of scenario.comparisonToPrevious.loadPolyfillAttributionDeltas) {
				pushLoadPolyfillTargetDeltaRows(
					lines,
					attributionDelta.label,
					"by calls",
					attributionDelta.targetDeltasByCalls,
				);
				pushLoadPolyfillTargetDeltaRows(
					lines,
					attributionDelta.label,
					"by time",
					attributionDelta.targetDeltasByTime,
				);
				pushLoadPolyfillTargetDeltaRows(
					lines,
					attributionDelta.label,
					"by response bytes",
					attributionDelta.targetDeltasByResponseBytes,
				);
			}
		}
		lines.push("");
	}

	if (report.transportRtt) {
		lines.push("## Transport RTT");
		lines.push("");
		if (!report.transportRtt.comparisonToPrevious) {
			lines.push("- No previous baseline was available for transport RTT.");
			lines.push("");
		} else {
			lines.push(
				`- Connect RTT: ${formatDelta(report.transportRtt.comparisonToPrevious.connectRttMs)}`,
			);
			for (const payload of report.transportRtt.comparisonToPrevious.payloads) {
				lines.push(
					`- ${payload.label} mean RTT: ${formatDelta(payload.meanRttMs)}`,
				);
				lines.push(
					`- ${payload.label} P95 RTT: ${formatDelta(payload.p95RttMs)}`,
				);
			}
			lines.push("");
		}
	}

	return `${lines.join("\n")}\n`;
}
