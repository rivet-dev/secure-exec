import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import v8 from "node:v8";
import { afterEach, describe, expect, it } from "vitest";
import {
	createIpcObservability,
	resolveIpcObservabilityOptions,
} from "../src/ipc-observability.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	while (cleanupDirs.length > 0) {
		const dir = cleanupDirs.pop();
		if (dir) {
			await rm(dir, { recursive: true, force: true });
		}
	}
});

describe("IPC observability", () => {
	it("writes structured frame logs and exposes Prometheus metrics", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ipc-observability-"));
		cleanupDirs.push(dir);
		const logFile = path.join(dir, "ipc.ndjson");

		const observability = await createIpcObservability({
			logFile,
			metrics: {
				host: "127.0.0.1",
				port: 0,
				path: "/metrics",
			},
		});

		expect(observability).toBeTruthy();
		expect(observability?.metricsEndpointUrl).toMatch(
			/^http:\/\/127\.0\.0\.1:\d+\/metrics$/,
		);

		observability?.recordConnectionEvent("connect_start", {
			socketPath: "/tmp/secure-exec-v8.sock",
		});
		observability?.recordFrame(
			"send",
			{
				type: "CreateSession",
				sessionId: "session-1",
				heapLimitMb: 64,
				cpuTimeLimitMs: 250,
			},
			32,
		);
		observability?.recordFrame(
			"recv",
			{
				type: "BridgeCall",
				sessionId: "session-1",
				callId: 6,
				method: "_loadPolyfill",
				payload: Buffer.from(v8.serialize(["__bd:_loadFileSync:[\"/tmp/demo.js\"]"])),
			},
			96,
		);
		observability?.markExecuteStart("session-1", {
			mode: "exec",
			filePath: "/entry.js",
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		observability?.markExecuteFinish("session-1", {
			exitCode: 0,
		});
		observability?.markBridgeCallStart("session-1", 7, "_fsReadFile", 12);
		await new Promise((resolve) => setTimeout(resolve, 5));
		observability?.markBridgeCallFinish("session-1", 7, {
			status: 0,
			payloadBytes: 24,
		});
		observability?.recordFrameError("decode", {
			frameBytes: 128,
		});

		const metricsResponse = await fetch(observability?.metricsEndpointUrl ?? "");
		expect(metricsResponse.status).toBe(200);
		const metricsText = await metricsResponse.text();
		expect(metricsText).toContain(
			'secure_exec_v8_ipc_frames_total{direction="send",frame_type="CreateSession"} 1',
		);
		expect(metricsText).toContain(
			'secure_exec_v8_ipc_connection_events_total{event="connect_start"} 1',
		);
		expect(metricsText).toContain(
			'secure_exec_v8_ipc_frame_errors_total{reason="decode"} 1',
		);
		expect(metricsText).toContain("secure_exec_v8_ipc_execute_duration_seconds_count{mode=\"exec\"} 1");
		expect(metricsText).toContain(
			'secure_exec_v8_ipc_bridge_call_duration_seconds_count{method="_fsReadFile",status="0"} 1',
		);
		expect(metricsText).toContain(
			'secure_exec_v8_host_runtime_memory_peak_bytes{kind="rss"}',
		);
		expect(metricsText).toContain(
			'secure_exec_v8_host_runtime_cpu_seconds{kind="user"}',
		);
		expect(metricsText).toContain(
			"secure_exec_v8_host_runtime_heap_limit_bytes",
		);

		await observability?.close();

		const logLines = (await readFile(logFile, "utf8"))
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as Record<string, unknown>);
		expect(
			logLines.some(
				(entry) =>
					entry.kind === "ipc_frame" &&
					entry.direction === "send" &&
					entry.frameType === "CreateSession" &&
					entry.encodedBytes === 32,
			),
		).toBe(true);
		expect(
			logLines.some(
				(entry) =>
					entry.kind === "ipc_execute" &&
					entry.event === "finish" &&
					typeof entry.durationMs === "number" &&
					Number(entry.durationMs) > 0,
			),
		).toBe(true);
		expect(
			logLines.some(
				(entry) =>
					entry.kind === "ipc_bridge_call" &&
					entry.event === "finish" &&
					entry.method === "_fsReadFile" &&
					entry.status === 0,
			),
		).toBe(true);
		expect(
			logLines.some(
				(entry) =>
					entry.kind === "ipc_frame" &&
					entry.frameType === "BridgeCall" &&
					entry.method === "_loadPolyfill" &&
					entry.bridgeTarget === "__bd:_loadFileSync:[\"/tmp/demo.js\"]" &&
					entry.bridgeTargetKind === "bridge_dispatch",
			),
		).toBe(true);
	});

	it("merges env defaults into observability options", () => {
		const options = resolveIpcObservabilityOptions(undefined, {
			SECURE_EXEC_V8_IPC_LOG_FILE: "/tmp/ipc.log",
			SECURE_EXEC_V8_METRICS_PORT: "9464",
			SECURE_EXEC_V8_METRICS_HOST: "127.0.0.1",
			SECURE_EXEC_V8_METRICS_PATH: "/internal/metrics",
		});

		expect(options).toEqual({
			logFile: "/tmp/ipc.log",
			metrics: {
				host: "127.0.0.1",
				port: 9464,
				path: "/internal/metrics",
			},
		});
	});
});
