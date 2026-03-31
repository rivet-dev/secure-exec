import { describe, expect, it } from "vitest";
import { getModuleLoadScenario } from "../benchmarks/module-load/scenario-catalog.js";
import {
	buildBenchmarkComparisonMarkdown,
	buildBenchmarkSummaryMarkdown,
	buildTransportRttMarkdown,
	compareScenarioSummaries,
	compareTransportRtt,
	deriveScenarioSummary,
	parseIpcLog,
	type BenchmarkSummaryReport,
	type ScenarioRunResult,
	type TransportRttReport,
} from "../benchmarks/module-load/summary.js";

function buildLog(lines: Array<Record<string, unknown>>): string {
	return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

describe("module-load summary generation", () => {
	it("derives per-iteration timings, bridge stats, and frame bytes from the IPC log", () => {
		const scenario = getModuleLoadScenario("pi-sdk-startup");
		const result: ScenarioRunResult = {
			scenarioId: scenario.id,
			title: scenario.title,
			target: scenario.target,
			kind: scenario.kind,
			description: scenario.description,
			createdAt: "2026-03-31T05:00:00.000Z",
			iterations: 2,
			artifacts: {
				resultFile: "pi-sdk-startup/result.json",
				metricsFile: "pi-sdk-startup/metrics.prom",
				logFile: "pi-sdk-startup/ipc.ndjson",
			},
			samples: [
				{
					iteration: 1,
					wallMs: 320,
					code: 0,
					stdoutBytes: 10,
					stderrBytes: 0,
					sandboxMs: 0,
					stdoutPreview: "ok",
					stderrPreview: "",
					checks: { ok: true },
				},
				{
					iteration: 2,
					wallMs: 210,
					code: 0,
					stdoutBytes: 12,
					stderrBytes: 0,
					sandboxMs: 0,
					stdoutPreview: "ok",
					stderrPreview: "",
					checks: { ok: true },
				},
			],
			summary: {
				coldWallMs: 320,
				warmWallMsMean: 210,
				coldSandboxMs: 0,
				warmSandboxMsMean: 0,
			},
		};

		const logText = buildLog([
			{
				ts: "2026-03-31T05:00:00.000Z",
				kind: "ipc_connection",
				event: "connect_start",
			},
			{
				ts: "2026-03-31T05:00:00.004Z",
				kind: "ipc_connection",
				event: "connect_ok",
			},
			{
				ts: "2026-03-31T05:00:00.001Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "WarmSnapshot",
				encodedBytes: 90,
				payloadBytes: 80,
			},
			{
				ts: "2026-03-31T05:00:00.010Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "CreateSession",
				sessionId: "s1",
				encodedBytes: 10,
			},
			{
				ts: "2026-03-31T05:00:00.011Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "InjectGlobals",
				sessionId: "s1",
				encodedBytes: 20,
				payloadBytes: 15,
			},
			{
				ts: "2026-03-31T05:00:00.012Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "Execute",
				sessionId: "s1",
				encodedBytes: 30,
				payloadBytes: 25,
			},
			{
				ts: "2026-03-31T05:00:00.020Z",
				kind: "ipc_frame",
				direction: "recv",
				frameType: "BridgeCall",
				sessionId: "s1",
				callId: 1,
				method: "_loadPolyfill",
				encodedBytes: 80,
				payloadBytes: 20,
			},
			{
				ts: "2026-03-31T05:00:00.050Z",
				kind: "ipc_bridge_call",
				event: "finish",
				sessionId: "s1",
				callId: 1,
				method: "_loadPolyfill",
				status: 0,
				durationMs: 30,
			},
			{
				ts: "2026-03-31T05:00:00.051Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "BridgeResponse",
				sessionId: "s1",
				callId: 1,
				status: 0,
				encodedBytes: 180,
				payloadBytes: 120,
			},
			{
				ts: "2026-03-31T05:00:00.060Z",
				kind: "ipc_frame",
				direction: "recv",
				frameType: "BridgeCall",
				sessionId: "s1",
				callId: 2,
				method: "_resolveModule",
				encodedBytes: 90,
				payloadBytes: 30,
			},
			{
				ts: "2026-03-31T05:00:00.070Z",
				kind: "ipc_bridge_call",
				event: "finish",
				sessionId: "s1",
				callId: 2,
				method: "_resolveModule",
				status: 0,
				durationMs: 10,
			},
			{
				ts: "2026-03-31T05:00:00.071Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "BridgeResponse",
				sessionId: "s1",
				callId: 2,
				status: 0,
				encodedBytes: 130,
				payloadBytes: 70,
			},
			{
				ts: "2026-03-31T05:00:00.212Z",
				kind: "ipc_frame",
				direction: "recv",
				frameType: "ExecutionResult",
				sessionId: "s1",
				encodedBytes: 12,
			},
			{
				ts: "2026-03-31T05:00:00.212Z",
				kind: "ipc_execute",
				event: "finish",
				sessionId: "s1",
				durationMs: 200,
			},
			{
				ts: "2026-03-31T05:00:00.250Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "DestroySession",
				sessionId: "s1",
				encodedBytes: 10,
			},
			{
				ts: "2026-03-31T05:00:01.010Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "CreateSession",
				sessionId: "s2",
				encodedBytes: 10,
			},
			{
				ts: "2026-03-31T05:00:01.011Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "InjectGlobals",
				sessionId: "s2",
				encodedBytes: 20,
				payloadBytes: 15,
			},
			{
				ts: "2026-03-31T05:00:01.012Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "Execute",
				sessionId: "s2",
				encodedBytes: 30,
				payloadBytes: 25,
			},
			{
				ts: "2026-03-31T05:00:01.020Z",
				kind: "ipc_frame",
				direction: "recv",
				frameType: "BridgeCall",
				sessionId: "s2",
				callId: 1,
				method: "_loadPolyfill",
				encodedBytes: 50,
				payloadBytes: 10,
			},
			{
				ts: "2026-03-31T05:00:01.035Z",
				kind: "ipc_bridge_call",
				event: "finish",
				sessionId: "s2",
				callId: 1,
				method: "_loadPolyfill",
				status: 0,
				durationMs: 15,
			},
			{
				ts: "2026-03-31T05:00:01.036Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "BridgeResponse",
				sessionId: "s2",
				callId: 1,
				status: 0,
				encodedBytes: 90,
				payloadBytes: 60,
			},
			{
				ts: "2026-03-31T05:00:01.040Z",
				kind: "ipc_frame",
				direction: "recv",
				frameType: "BridgeCall",
				sessionId: "s2",
				callId: 2,
				method: "_resolveModule",
				encodedBytes: 60,
				payloadBytes: 20,
			},
			{
				ts: "2026-03-31T05:00:01.045Z",
				kind: "ipc_bridge_call",
				event: "finish",
				sessionId: "s2",
				callId: 2,
				method: "_resolveModule",
				status: 0,
				durationMs: 5,
			},
			{
				ts: "2026-03-31T05:00:01.046Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "BridgeResponse",
				sessionId: "s2",
				callId: 2,
				status: 0,
				encodedBytes: 60,
				payloadBytes: 30,
			},
			{
				ts: "2026-03-31T05:00:01.132Z",
				kind: "ipc_frame",
				direction: "recv",
				frameType: "ExecutionResult",
				sessionId: "s2",
				encodedBytes: 12,
			},
			{
				ts: "2026-03-31T05:00:01.132Z",
				kind: "ipc_execute",
				event: "finish",
				sessionId: "s2",
				durationMs: 120,
			},
			{
				ts: "2026-03-31T05:00:01.150Z",
				kind: "ipc_frame",
				direction: "send",
				frameType: "DestroySession",
				sessionId: "s2",
				encodedBytes: 10,
			},
		]);

		const summary = deriveScenarioSummary(scenario, result, parseIpcLog(logText));

		expect(summary.timing.connectRttMs).toBe(4);
		expect(summary.timing.warmExecuteDurationMsMean).toBe(120);
		expect(summary.timing.coldFixedSessionOverheadMs).toBe(120);
		expect(summary.timing.warmFixedSessionOverheadMsMean).toBe(90);
		expect(summary.timing.coldCreateToInjectGlobalsMs).toBe(1);
		expect(summary.timing.warmCreateToInjectGlobalsMsMean).toBe(1);
		expect(summary.timing.warmInjectGlobalsToExecuteSendMsMean).toBe(1);
		expect(summary.timing.warmExecuteResultToDestroyMsMean).toBe(18);
		expect(summary.timing.warmResidualFixedOverheadMsMean).toBe(70);
		expect(summary.iterationsDetail[0].bridgeCalls).toBe(2);
		expect(summary.iterationsDetail[0].createToInjectGlobalsMs).toBe(1);
		expect(summary.iterationsDetail[0].injectGlobalsToExecuteSendMs).toBe(1);
		expect(summary.iterationsDetail[0].executeResultToDestroyMs).toBe(38);
		expect(summary.iterationsDetail[0].residualFixedOverheadMs).toBe(80);
		expect(summary.bridge.callsPerIteration).toBe(2);
		expect(summary.bridge.durationMsPerIteration).toBe(30);
		expect(summary.progressSignals.dominantBridgeMethodByTime).toEqual({
			method: "_loadPolyfill",
			durationMsPerIteration: 22.5,
			callsPerIteration: 1,
		});
		expect(summary.progressSignals.dominantFrameByEncodedBytes).toEqual({
			direction: "send",
			frameType: "BridgeResponse",
			encodedBytesPerIteration: 230,
		});
		expect(summary.bridge.methodsByResponseBytes[0]?.responseEncodedBytesPerIteration).toBe(135);
	});

	it("compares against a previous baseline and surfaces progress-ready markdown", () => {
		const scenario = getModuleLoadScenario("pi-sdk-startup");
		const currentResult: ScenarioRunResult = {
			scenarioId: scenario.id,
			title: scenario.title,
			target: scenario.target,
			kind: scenario.kind,
			description: scenario.description,
			createdAt: "2026-03-31T06:00:00.000Z",
			iterations: 2,
			artifacts: {
				resultFile: "pi-sdk-startup/result.json",
				metricsFile: "pi-sdk-startup/metrics.prom",
				logFile: "pi-sdk-startup/ipc.ndjson",
			},
			samples: [
				{
					iteration: 1,
					wallMs: 320,
					code: 0,
					stdoutBytes: 10,
					stderrBytes: 0,
					sandboxMs: 0,
					stdoutPreview: "ok",
					stderrPreview: "",
					checks: { ok: true },
				},
				{
					iteration: 2,
					wallMs: 210,
					code: 0,
					stdoutBytes: 10,
					stderrBytes: 0,
					sandboxMs: 0,
					stdoutPreview: "ok",
					stderrPreview: "",
					checks: { ok: true },
				},
			],
			summary: {
				coldWallMs: 320,
				warmWallMsMean: 210,
			},
		};
		const baselineResult: ScenarioRunResult = {
			...currentResult,
			createdAt: "2026-03-30T06:00:00.000Z",
			samples: [
				{
					...currentResult.samples[0],
					wallMs: 360,
				},
				{
					...currentResult.samples[1],
					wallMs: 240,
				},
			],
			summary: {
				coldWallMs: 360,
				warmWallMsMean: 240,
			},
		};

		const currentLog = buildLog([
			{ ts: "2026-03-31T05:59:59.995Z", kind: "ipc_connection", event: "connect_start" },
			{ ts: "2026-03-31T05:59:59.999Z", kind: "ipc_connection", event: "connect_ok" },
			{ ts: "2026-03-31T06:00:00.001Z", kind: "ipc_frame", direction: "send", frameType: "WarmSnapshot", encodedBytes: 90, payloadBytes: 80 },
			{ ts: "2026-03-31T06:00:00.010Z", kind: "ipc_frame", direction: "send", frameType: "CreateSession", sessionId: "c1", encodedBytes: 10 },
			{ ts: "2026-03-31T06:00:00.011Z", kind: "ipc_frame", direction: "send", frameType: "InjectGlobals", sessionId: "c1", encodedBytes: 20, payloadBytes: 15 },
			{ ts: "2026-03-31T06:00:00.012Z", kind: "ipc_frame", direction: "send", frameType: "Execute", sessionId: "c1", encodedBytes: 30, payloadBytes: 25 },
			{ ts: "2026-03-31T06:00:00.020Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "c1", callId: 1, method: "_loadPolyfill", encodedBytes: 80, payloadBytes: 20 },
			{ ts: "2026-03-31T06:00:00.050Z", kind: "ipc_bridge_call", event: "finish", sessionId: "c1", callId: 1, method: "_loadPolyfill", status: 0, durationMs: 30 },
			{ ts: "2026-03-31T06:00:00.051Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "c1", callId: 1, status: 0, encodedBytes: 180, payloadBytes: 120 },
			{ ts: "2026-03-31T06:00:00.060Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "c1", callId: 2, method: "_resolveModule", encodedBytes: 90, payloadBytes: 30 },
			{ ts: "2026-03-31T06:00:00.070Z", kind: "ipc_bridge_call", event: "finish", sessionId: "c1", callId: 2, method: "_resolveModule", status: 0, durationMs: 10 },
			{ ts: "2026-03-31T06:00:00.071Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "c1", callId: 2, status: 0, encodedBytes: 130, payloadBytes: 70 },
			{ ts: "2026-03-31T06:00:00.210Z", kind: "ipc_frame", direction: "recv", frameType: "ExecutionResult", sessionId: "c1", encodedBytes: 12 },
			{ ts: "2026-03-31T06:00:00.210Z", kind: "ipc_execute", event: "finish", sessionId: "c1", durationMs: 200 },
			{ ts: "2026-03-31T06:00:00.250Z", kind: "ipc_frame", direction: "send", frameType: "DestroySession", sessionId: "c1", encodedBytes: 10 },
			{ ts: "2026-03-31T06:00:01.010Z", kind: "ipc_frame", direction: "send", frameType: "CreateSession", sessionId: "c2", encodedBytes: 10 },
			{ ts: "2026-03-31T06:00:01.011Z", kind: "ipc_frame", direction: "send", frameType: "InjectGlobals", sessionId: "c2", encodedBytes: 20, payloadBytes: 15 },
			{ ts: "2026-03-31T06:00:01.012Z", kind: "ipc_frame", direction: "send", frameType: "Execute", sessionId: "c2", encodedBytes: 30, payloadBytes: 25 },
			{ ts: "2026-03-31T06:00:01.020Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "c2", callId: 1, method: "_loadPolyfill", encodedBytes: 50, payloadBytes: 10 },
			{ ts: "2026-03-31T06:00:01.035Z", kind: "ipc_bridge_call", event: "finish", sessionId: "c2", callId: 1, method: "_loadPolyfill", status: 0, durationMs: 15 },
			{ ts: "2026-03-31T06:00:01.036Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "c2", callId: 1, status: 0, encodedBytes: 90, payloadBytes: 60 },
			{ ts: "2026-03-31T06:00:01.040Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "c2", callId: 2, method: "_resolveModule", encodedBytes: 60, payloadBytes: 20 },
			{ ts: "2026-03-31T06:00:01.045Z", kind: "ipc_bridge_call", event: "finish", sessionId: "c2", callId: 2, method: "_resolveModule", status: 0, durationMs: 5 },
			{ ts: "2026-03-31T06:00:01.046Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "c2", callId: 2, status: 0, encodedBytes: 60, payloadBytes: 30 },
			{ ts: "2026-03-31T06:00:01.120Z", kind: "ipc_frame", direction: "recv", frameType: "ExecutionResult", sessionId: "c2", encodedBytes: 12 },
			{ ts: "2026-03-31T06:00:01.120Z", kind: "ipc_execute", event: "finish", sessionId: "c2", durationMs: 120 },
			{ ts: "2026-03-31T06:00:01.150Z", kind: "ipc_frame", direction: "send", frameType: "DestroySession", sessionId: "c2", encodedBytes: 10 },
		]);

		const baselineLog = buildLog([
			{ ts: "2026-03-30T05:59:59.994Z", kind: "ipc_connection", event: "connect_start" },
			{ ts: "2026-03-30T05:59:59.999Z", kind: "ipc_connection", event: "connect_ok" },
			{ ts: "2026-03-30T06:00:00.001Z", kind: "ipc_frame", direction: "send", frameType: "WarmSnapshot", encodedBytes: 90, payloadBytes: 80 },
			{ ts: "2026-03-30T06:00:00.010Z", kind: "ipc_frame", direction: "send", frameType: "CreateSession", sessionId: "b1", encodedBytes: 10 },
			{ ts: "2026-03-30T06:00:00.011Z", kind: "ipc_frame", direction: "send", frameType: "InjectGlobals", sessionId: "b1", encodedBytes: 20, payloadBytes: 15 },
			{ ts: "2026-03-30T06:00:00.012Z", kind: "ipc_frame", direction: "send", frameType: "Execute", sessionId: "b1", encodedBytes: 30, payloadBytes: 25 },
			{ ts: "2026-03-30T06:00:00.020Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "b1", callId: 1, method: "_loadPolyfill", encodedBytes: 80, payloadBytes: 20 },
			{ ts: "2026-03-30T06:00:00.055Z", kind: "ipc_bridge_call", event: "finish", sessionId: "b1", callId: 1, method: "_loadPolyfill", status: 0, durationMs: 35 },
			{ ts: "2026-03-30T06:00:00.056Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "b1", callId: 1, status: 0, encodedBytes: 200, payloadBytes: 140 },
			{ ts: "2026-03-30T06:00:00.060Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "b1", callId: 2, method: "_resolveModule", encodedBytes: 90, payloadBytes: 30 },
			{ ts: "2026-03-30T06:00:00.075Z", kind: "ipc_bridge_call", event: "finish", sessionId: "b1", callId: 2, method: "_resolveModule", status: 0, durationMs: 15 },
			{ ts: "2026-03-30T06:00:00.076Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "b1", callId: 2, status: 0, encodedBytes: 160, payloadBytes: 90 },
			{ ts: "2026-03-30T06:00:00.080Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "b1", callId: 3, method: "_fsExists", encodedBytes: 70, payloadBytes: 15 },
			{ ts: "2026-03-30T06:00:00.090Z", kind: "ipc_bridge_call", event: "finish", sessionId: "b1", callId: 3, method: "_fsExists", status: 0, durationMs: 10 },
			{ ts: "2026-03-30T06:00:00.091Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "b1", callId: 3, status: 0, encodedBytes: 100, payloadBytes: 40 },
			{ ts: "2026-03-30T06:00:00.260Z", kind: "ipc_frame", direction: "recv", frameType: "ExecutionResult", sessionId: "b1", encodedBytes: 12 },
			{ ts: "2026-03-30T06:00:00.260Z", kind: "ipc_execute", event: "finish", sessionId: "b1", durationMs: 220 },
			{ ts: "2026-03-30T06:00:00.300Z", kind: "ipc_frame", direction: "send", frameType: "DestroySession", sessionId: "b1", encodedBytes: 10 },
			{ ts: "2026-03-30T06:00:01.010Z", kind: "ipc_frame", direction: "send", frameType: "CreateSession", sessionId: "b2", encodedBytes: 10 },
			{ ts: "2026-03-30T06:00:01.011Z", kind: "ipc_frame", direction: "send", frameType: "InjectGlobals", sessionId: "b2", encodedBytes: 20, payloadBytes: 15 },
			{ ts: "2026-03-30T06:00:01.012Z", kind: "ipc_frame", direction: "send", frameType: "Execute", sessionId: "b2", encodedBytes: 30, payloadBytes: 25 },
			{ ts: "2026-03-30T06:00:01.020Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "b2", callId: 1, method: "_loadPolyfill", encodedBytes: 60, payloadBytes: 15 },
			{ ts: "2026-03-30T06:00:01.045Z", kind: "ipc_bridge_call", event: "finish", sessionId: "b2", callId: 1, method: "_loadPolyfill", status: 0, durationMs: 25 },
			{ ts: "2026-03-30T06:00:01.046Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "b2", callId: 1, status: 0, encodedBytes: 110, payloadBytes: 70 },
			{ ts: "2026-03-30T06:00:01.050Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "b2", callId: 2, method: "_resolveModule", encodedBytes: 70, payloadBytes: 20 },
			{ ts: "2026-03-30T06:00:01.058Z", kind: "ipc_bridge_call", event: "finish", sessionId: "b2", callId: 2, method: "_resolveModule", status: 0, durationMs: 8 },
			{ ts: "2026-03-30T06:00:01.059Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "b2", callId: 2, status: 0, encodedBytes: 90, payloadBytes: 50 },
			{ ts: "2026-03-30T06:00:01.060Z", kind: "ipc_frame", direction: "recv", frameType: "BridgeCall", sessionId: "b2", callId: 3, method: "_fsExists", encodedBytes: 50, payloadBytes: 10 },
			{ ts: "2026-03-30T06:00:01.067Z", kind: "ipc_bridge_call", event: "finish", sessionId: "b2", callId: 3, method: "_fsExists", status: 0, durationMs: 5 },
			{ ts: "2026-03-30T06:00:01.068Z", kind: "ipc_frame", direction: "send", frameType: "BridgeResponse", sessionId: "b2", callId: 3, status: 0, encodedBytes: 80, payloadBytes: 30 },
			{ ts: "2026-03-30T06:00:01.180Z", kind: "ipc_frame", direction: "recv", frameType: "ExecutionResult", sessionId: "b2", encodedBytes: 12 },
			{ ts: "2026-03-30T06:00:01.180Z", kind: "ipc_execute", event: "finish", sessionId: "b2", durationMs: 150 },
			{ ts: "2026-03-30T06:00:01.220Z", kind: "ipc_frame", direction: "send", frameType: "DestroySession", sessionId: "b2", encodedBytes: 10 },
		]);

		const currentSummary = deriveScenarioSummary(
			scenario,
			currentResult,
			parseIpcLog(currentLog),
		);
		const baselineSummary = deriveScenarioSummary(
			scenario,
			baselineResult,
			parseIpcLog(baselineLog),
		);
		const comparison = compareScenarioSummaries(currentSummary, baselineSummary);
		currentSummary.comparisonToPrevious = comparison;

		expect(comparison.metrics.warmWallMsMean?.delta).toBe(-30);
		expect(comparison.metrics.bridgeCallsPerIteration?.delta).toBe(-1);
		expect(comparison.metrics.bridgeResponseFrameBytesPerIteration?.delta).toBe(-140);
		expect(comparison.bridgeMethodCountDeltas[0]).toEqual({
			method: "_fsExists",
			before: 1,
			after: 0,
			delta: -1,
		});

		const transportRtt: TransportRttReport = {
			createdAt: "2026-03-31T06:05:00.000Z",
			measurement: "ipc_ping_pong",
			warmupIterations: 3,
			sampleIterations: 5,
			connectRttMs: 0.45,
			payloads: [
				{
					label: "1 B",
					payloadBytes: 1,
					sampleCount: 5,
					samplesMs: [0.12, 0.13, 0.14, 0.15, 0.16],
					minRttMs: 0.12,
					meanRttMs: 0.14,
					p95RttMs: 0.16,
					maxRttMs: 0.16,
				},
				{
					label: "64 KB",
					payloadBytes: 64 * 1024,
					sampleCount: 5,
					samplesMs: [0.9, 1.0, 1.1, 1.2, 1.3],
					minRttMs: 0.9,
					meanRttMs: 1.1,
					p95RttMs: 1.3,
					maxRttMs: 1.3,
				},
			],
		};
		transportRtt.comparisonToPrevious = compareTransportRtt(transportRtt, {
			...transportRtt,
			createdAt: "2026-03-30T06:05:00.000Z",
			connectRttMs: 0.5,
			payloads: [
				{
					label: "1 B",
					payloadBytes: 1,
					sampleCount: 5,
					samplesMs: [0.15, 0.16, 0.17, 0.18, 0.19],
					minRttMs: 0.15,
					meanRttMs: 0.17,
					p95RttMs: 0.19,
					maxRttMs: 0.19,
				},
				{
					label: "64 KB",
					payloadBytes: 64 * 1024,
					sampleCount: 5,
					samplesMs: [1.1, 1.2, 1.3, 1.4, 1.5],
					minRttMs: 1.1,
					meanRttMs: 1.3,
					p95RttMs: 1.5,
					maxRttMs: 1.5,
				},
			],
		});

		const report: BenchmarkSummaryReport = {
			createdAt: "2026-03-31T06:05:00.000Z",
			gitCommit: "abc123",
			host: { node: "v24.13.0", platform: "linux" },
			v8BinaryPath: "/tmp/secure-exec-v8",
			iterations: 2,
			baseline: {
				createdAt: "2026-03-30T06:05:00.000Z",
				gitCommit: "def456",
			},
			transportRtt,
			progressGuide: {
				copyTheseFields: ["Warm wall mean", "Bridge calls per iteration"],
				comparisonArtifact: "comparison.md",
			},
			results: [currentResult],
			scenarioSummaries: [currentSummary],
			scenarioOverview: [
				{
					scenarioId: currentSummary.scenarioId,
					title: currentSummary.title,
					target: currentSummary.target,
					kind: currentSummary.kind,
					status: "passed",
					warmWallMsMean: currentSummary.progressSignals.warmWallMsMean,
					bridgeCallsPerIteration: currentSummary.progressSignals.bridgeCallsPerIteration,
					fixedSessionOverheadWarmMsMean:
						currentSummary.progressSignals.fixedSessionOverheadWarmMsMean,
					dominantBridgeMethodByTime:
						currentSummary.progressSignals.dominantBridgeMethodByTime,
					dominantFrameByEncodedBytes:
						currentSummary.progressSignals.dominantFrameByEncodedBytes,
					comparisonToPrevious: comparison,
				},
			],
		};

		expect(buildBenchmarkSummaryMarkdown(report)).toContain("comparison.md");
		expect(buildBenchmarkSummaryMarkdown(report)).toContain("Transport RTT");
		expect(buildBenchmarkComparisonMarkdown(report)).toContain("BridgeResponse encoded bytes/iteration");
		expect(buildBenchmarkComparisonMarkdown(report)).toContain("Transport RTT");
		expect(buildBenchmarkComparisonMarkdown(report)).toContain("_fsExists");
		expect(buildTransportRttMarkdown(transportRtt)).toContain("64 KB");
	});
});
