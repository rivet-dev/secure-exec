import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { IpcClient, type BinaryFrame } from "../../../v8/src/index.js";
import {
	MODULE_LOAD_SCENARIOS,
	type ModuleLoadScenarioDefinition,
} from "./scenario-catalog.js";
import {
	runModuleLoadScenario,
	type ScenarioFailureResult,
	type ScenarioResult,
} from "./orchestration.js";
import {
	buildBenchmarkComparisonMarkdown,
	buildBenchmarkSummaryMarkdown,
	buildLoadPolyfillAttributionClassifier,
	buildScenarioSummaryMarkdown,
	buildTransportRttMarkdown,
	compareScenarioSummaries,
	compareTransportRtt,
	loadBenchmarkBaseline,
	loadScenarioDerivedSummary,
	type BenchmarkSummaryReport,
	type ScenarioDerivedSummary,
	type ScenarioRunResult,
	type TransportRttReport,
} from "./summary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const RESULTS_ROOT = path.resolve(__dirname, "../results/module-load");
const SCENARIO_RUNNER = path.resolve(__dirname, "scenario-runner.ts");
const NATIVE_V8_ROOT = path.resolve(REPO_ROOT, "native/v8-runtime");
const LOCAL_V8_RELEASE_BINARY = path.join(NATIVE_V8_ROOT, "target/release/secure-exec-v8");
const LOCAL_V8_DEBUG_BINARY = path.join(NATIVE_V8_ROOT, "target/debug/secure-exec-v8");

type TransportProbeHandle = {
	child: ChildProcess;
	socketPath: string;
	authToken: string;
};

const TRANSPORT_RTT_WARMUP_ITERATIONS = 3;
const TRANSPORT_RTT_SAMPLE_ITERATIONS = 20;
const TRANSPORT_RTT_PAYLOADS = [
	{ label: "1 B", payloadBytes: 1 },
	{ label: "1 KB", payloadBytes: 1024 },
	{ label: "64 KB", payloadBytes: 64 * 1024 },
] as const;

function round(value: number): number {
	return Number(value.toFixed(3));
}

function percentile(values: number[], ratio: number): number {
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * ratio) - 1),
	);
	return round(sorted[index] ?? 0);
}

async function getAvailablePort(): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Failed to allocate an ephemeral port"));
				return;
			}
			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

function getHostSummary(): Record<string, string | number> {
	return {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		cpu: os.cpus()[0]?.model ?? "unknown",
		cores: os.availableParallelism(),
		ramGb: round(os.totalmem() / (1024 ** 3)),
	};
}

function getGitCommit(): string {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: PACKAGE_ROOT,
			encoding: "utf8",
		}).trim();
	} catch {
		return "unknown";
	}
}

async function readSocketPath(child: ChildProcess): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const stdout = child.stdout;
		if (!stdout) {
			reject(new Error("V8 runtime did not expose stdout for socket path discovery"));
			return;
		}

		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(new Error("Timed out waiting for V8 runtime socket path"));
		}, 10_000);

		const rl = createInterface({ input: stdout });
		rl.on("line", (line) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			rl.close();
			resolve(line.trim());
		});
		rl.on("close", () => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(new Error("V8 runtime stdout closed before reporting a socket path"));
		});
	});
}

async function spawnTransportProbe(binaryPath: string): Promise<TransportProbeHandle> {
	const authToken = randomBytes(16).toString("hex");
	const child = spawn(binaryPath, [], {
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			SECURE_EXEC_V8_TOKEN: authToken,
			NO_COLOR: "1",
		},
	});
	const socketPath = await readSocketPath(child);
	return { child, socketPath, authToken };
}

async function killChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) {
		return;
	}
	child.kill("SIGTERM");
	await new Promise<void>((resolve) => {
		const timeout = setTimeout(() => {
			if (child.exitCode === null) {
				child.kill("SIGKILL");
			}
			resolve();
		}, 5_000);
		child.once("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

async function measureTransportRtt(binaryPath: string): Promise<TransportRttReport> {
	const probe = await spawnTransportProbe(binaryPath);
	let client: IpcClient | null = null;
	let pendingPong:
		| {
				payload: Buffer;
				resolve: (value: number) => void;
				reject: (reason?: unknown) => void;
				timeout: NodeJS.Timeout;
				startedAt: number;
		  }
		| null = null;
	let clientError: Error | null = null;

	try {
		client = new IpcClient({
			socketPath: probe.socketPath,
			onMessage: (frame: BinaryFrame) => {
				if (frame.type !== "Pong") {
					return;
				}
				const current = pendingPong;
				if (!current) {
					return;
				}
				pendingPong = null;
				clearTimeout(current.timeout);
				if (!frame.payload.equals(current.payload)) {
					current.reject(
						new Error(
							`Ping payload mismatch for ${current.payload.length} byte probe`,
						),
					);
					return;
				}
				current.resolve(round(performance.now() - current.startedAt));
			},
			onError: (error) => {
				clientError = error;
				if (pendingPong) {
					const current = pendingPong;
					pendingPong = null;
					clearTimeout(current.timeout);
					current.reject(error);
				}
			},
			onClose: () => {
				if (pendingPong) {
					const current = pendingPong;
					pendingPong = null;
					clearTimeout(current.timeout);
					current.reject(new Error("IPC connection closed during Ping/Pong probe"));
				}
			},
		});

		const connectStartedAt = performance.now();
		await client.connect();
		const connectRttMs = round(performance.now() - connectStartedAt);
		client.authenticate(probe.authToken);

		const ping = async (payload: Buffer): Promise<number> =>
			new Promise<number>((resolve, reject) => {
				if (!client) {
					reject(new Error("IPC client is not connected"));
					return;
				}
				if (clientError) {
					reject(clientError);
					return;
				}
				if (pendingPong) {
					reject(new Error("Ping/Pong probe already has an in-flight request"));
					return;
				}
				const timeout = setTimeout(() => {
					if (!pendingPong) {
						return;
					}
					pendingPong = null;
					reject(
						new Error(
							`Timed out waiting for Pong (${payload.length} byte payload)`,
						),
					);
				}, 5_000);
				pendingPong = {
					payload,
					resolve,
					reject,
					timeout,
					startedAt: performance.now(),
				};
				try {
					client.send({
						type: "Ping",
						payload,
					});
				} catch (error) {
					pendingPong = null;
					clearTimeout(timeout);
					reject(error);
				}
			});

		const payloads: TransportRttReport["payloads"] = [];
		for (const spec of TRANSPORT_RTT_PAYLOADS) {
			const payload = Buffer.alloc(spec.payloadBytes, 0x61);
			for (let index = 0; index < TRANSPORT_RTT_WARMUP_ITERATIONS; index += 1) {
				await ping(payload);
			}
			const samplesMs: number[] = [];
			for (let index = 0; index < TRANSPORT_RTT_SAMPLE_ITERATIONS; index += 1) {
				samplesMs.push(await ping(payload));
			}
			payloads.push({
				label: spec.label,
				payloadBytes: spec.payloadBytes,
				sampleCount: samplesMs.length,
				samplesMs,
				minRttMs: round(Math.min(...samplesMs)),
				meanRttMs: round(
					samplesMs.reduce((sum, value) => sum + value, 0) / samplesMs.length,
				),
				p95RttMs: percentile(samplesMs, 0.95),
				maxRttMs: round(Math.max(...samplesMs)),
			});
		}

		return {
			createdAt: new Date().toISOString(),
			measurement: "ipc_ping_pong",
			warmupIterations: TRANSPORT_RTT_WARMUP_ITERATIONS,
			sampleIterations: TRANSPORT_RTT_SAMPLE_ITERATIONS,
			connectRttMs,
			payloads,
		};
	} finally {
		client?.close();
		await killChild(probe.child);
	}
}

function resolveBenchmarkV8Binary(): string {
	const override = process.env.SECURE_EXEC_BENCH_V8_BINARY?.trim();
	if (override) {
		return override;
	}
	if (existsSync(LOCAL_V8_RELEASE_BINARY)) {
		return LOCAL_V8_RELEASE_BINARY;
	}
	if (existsSync(LOCAL_V8_DEBUG_BINARY)) {
		return LOCAL_V8_DEBUG_BINARY;
	}

	console.error(
		"No local V8 runtime binary found; building native/v8-runtime with cargo build --release...",
	);
	execFileSync("cargo", ["build", "--release"], {
		cwd: NATIVE_V8_ROOT,
		stdio: "inherit",
		env: {
			...process.env,
			CARGO_TERM_COLOR: process.env.CARGO_TERM_COLOR ?? "never",
		},
	});
	if (existsSync(LOCAL_V8_RELEASE_BINARY)) {
		return LOCAL_V8_RELEASE_BINARY;
	}
	throw new Error(
		`Expected local V8 runtime binary at ${LOCAL_V8_RELEASE_BINARY} after cargo build --release`,
	);
}

async function collectScenarioSummaries(
	baseline: Awaited<ReturnType<typeof loadBenchmarkBaseline>>,
	loadPolyfillAttributionClassifier: Awaited<
		ReturnType<typeof buildLoadPolyfillAttributionClassifier>
	>,
): Promise<{
	results: ScenarioRunResult[];
	scenarioSummaries: ScenarioDerivedSummary[];
}> {
	const results: ScenarioRunResult[] = [];
	const scenarioSummaries: ScenarioDerivedSummary[] = [];

	for (const scenario of MODULE_LOAD_SCENARIOS) {
		const summary = await loadScenarioDerivedSummary(RESULTS_ROOT, scenario, {
			loadPolyfillAttributionClassifier,
		});
		if (!summary) continue;

		const baselineSummary = baseline?.scenarioSummaries.get(scenario.id);
		if (baselineSummary) {
			summary.comparisonToPrevious = compareScenarioSummaries(summary, baselineSummary);
		}

		const rawResult = JSON.parse(
			await readFile(path.join(RESULTS_ROOT, scenario.id, "result.json"), "utf8"),
		) as ScenarioRunResult;
		results.push(rawResult);
		scenarioSummaries.push(summary);
	}

	return { results, scenarioSummaries };
}

async function main(): Promise<void> {
	const iterations = 3;
	const reuseExistingResults = process.env.SECURE_EXEC_BENCH_REUSE_RESULTS === "1";
	const baselineRoot = process.env.SECURE_EXEC_BENCH_BASELINE_ROOT ?? RESULTS_ROOT;
	const stageTimeoutMs = process.env.SECURE_EXEC_BENCH_STAGE_TIMEOUT_MS
		? Number(process.env.SECURE_EXEC_BENCH_STAGE_TIMEOUT_MS)
		: undefined;
	const binaryPath = resolveBenchmarkV8Binary();
	const loadPolyfillAttributionClassifier =
		await buildLoadPolyfillAttributionClassifier();
	const baseline = await loadBenchmarkBaseline(baselineRoot, {
		loadPolyfillAttributionClassifier,
	});
	if (!reuseExistingResults) {
		await rm(RESULTS_ROOT, { recursive: true, force: true });
	}
	await mkdir(RESULTS_ROOT, { recursive: true });

	const results: ScenarioResult[] = [];
	if (!reuseExistingResults) {
		for (const scenario of MODULE_LOAD_SCENARIOS) {
			console.error(`\n=== ${scenario.id} ===`);
			const result = await runModuleLoadScenario({
				scenario,
				iterations,
				binaryPath,
				packageRoot: PACKAGE_ROOT,
				resultsRoot: RESULTS_ROOT,
				scenarioRunnerPath: SCENARIO_RUNNER,
				stageTimeoutMs,
			});
			results.push(result);
			if (result.status === "failed") {
				console.error(`Scenario ${scenario.id} failed: ${result.error}`);
			}
		}
	} else {
		console.error(
			`Reusing existing module-load scenario results under ${RESULTS_ROOT}`,
		);
	}

	const transportRtt = await measureTransportRtt(binaryPath);
	if (baseline?.transportRtt) {
		transportRtt.comparisonToPrevious = compareTransportRtt(
			transportRtt,
			baseline.transportRtt,
		);
	}

	const { results: passedResults, scenarioSummaries } =
		await collectScenarioSummaries(
			baseline,
			loadPolyfillAttributionClassifier,
		);
	for (const summary of scenarioSummaries) {
		await writeFile(
			path.join(RESULTS_ROOT, summary.artifacts.summaryFile),
			`${JSON.stringify(summary, null, 2)}\n`,
			"utf8",
		);
		await writeFile(
			path.join(RESULTS_ROOT, summary.artifacts.summaryMarkdownFile),
			buildScenarioSummaryMarkdown(summary),
			"utf8",
		);
	}

	const report: BenchmarkSummaryReport = {
		createdAt: new Date().toISOString(),
		gitCommit: getGitCommit(),
		host: getHostSummary(),
		v8BinaryPath: binaryPath,
		iterations,
		primaryComparisonMode: "sandbox_new_session_replay_warm_snapshot_enabled",
		baseline: baseline?.metadata,
		transportRtt,
		progressGuide: {
			copyTheseFields: [
				"Warm wall mean",
				"Bridge calls per iteration",
				"Warm fixed session overhead",
				"Benchmark mode controls from per-scenario summary.md: true cold start on/off, same-session replay, new-session replay on/off, and host same-session control",
				"`_loadPolyfill` real polyfill-body vs `__bd:*` bridge-dispatch splits from comparison.md",
				"`_loadPolyfill` ranked target hotspots from per-scenario summary.md and target-level deltas from comparison.md",
				"Warm phase attribution when fixed overhead changes",
				"Transport RTT means from transport-rtt.md for transport-sensitive changes",
				"Dominant bridge method time and byte deltas from comparison.md",
			],
			comparisonArtifact: "comparison.md",
		},
		results: passedResults,
		scenarioSummaries,
		scenarioOverview: scenarioSummaries.map((summary) => ({
			scenarioId: summary.scenarioId,
			title: summary.title,
			target: summary.target,
			kind: summary.kind,
			status: "passed",
			warmWallMsMean: summary.progressSignals.warmWallMsMean,
			bridgeCallsPerIteration: summary.progressSignals.bridgeCallsPerIteration,
			fixedSessionOverheadWarmMsMean:
				summary.progressSignals.fixedSessionOverheadWarmMsMean,
			dominantBridgeMethodByTime:
				summary.progressSignals.dominantBridgeMethodByTime,
			dominantFrameByEncodedBytes:
				summary.progressSignals.dominantFrameByEncodedBytes,
			comparisonToPrevious: summary.comparisonToPrevious,
		})),
	};

	const comparisonJson = {
		createdAt: report.createdAt,
		gitCommit: report.gitCommit,
		primaryComparisonMode: report.primaryComparisonMode,
		baseline: report.baseline ?? null,
		transportRtt: report.transportRtt ?? null,
		transportRttComparison: report.transportRtt?.comparisonToPrevious ?? null,
		scenarios: report.scenarioOverview.map((scenario) => ({
			scenarioId: scenario.scenarioId,
			title: scenario.title,
			comparisonToPrevious: scenario.comparisonToPrevious ?? null,
		})),
		failures: results
			.filter((result): result is ScenarioFailureResult => result.status === "failed")
			.map((result) => ({
				scenarioId: result.scenarioId,
				error: result.error,
			})),
	};

	await writeFile(
		path.join(RESULTS_ROOT, "summary.json"),
		`${JSON.stringify(report, null, 2)}\n`,
		"utf8",
	);
	await writeFile(
		path.join(RESULTS_ROOT, "summary.md"),
		buildBenchmarkSummaryMarkdown(report),
		"utf8",
	);
	await writeFile(
		path.join(RESULTS_ROOT, "comparison.json"),
		`${JSON.stringify(comparisonJson, null, 2)}\n`,
		"utf8",
	);
	await writeFile(
		path.join(RESULTS_ROOT, "comparison.md"),
		buildBenchmarkComparisonMarkdown(report),
		"utf8",
	);
	await writeFile(
		path.join(RESULTS_ROOT, "transport-rtt.json"),
		`${JSON.stringify(transportRtt, null, 2)}\n`,
		"utf8",
	);
	await writeFile(
		path.join(RESULTS_ROOT, "transport-rtt.md"),
		buildTransportRttMarkdown(transportRtt),
		"utf8",
	);
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
