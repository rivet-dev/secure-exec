import { spawn } from "node:child_process";
import { rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
	MODULE_LOAD_SCENARIOS,
	type ModuleLoadScenarioDefinition,
} from "./scenario-catalog.js";
import {
	buildBenchmarkComparisonMarkdown,
	buildBenchmarkSummaryMarkdown,
	buildScenarioSummaryMarkdown,
	compareScenarioSummaries,
	loadBenchmarkBaseline,
	loadScenarioDerivedSummary,
	type BenchmarkSummaryReport,
	type ScenarioDerivedSummary,
	type ScenarioRunResult,
} from "./summary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const RESULTS_ROOT = path.resolve(__dirname, "../results/module-load");
const SCENARIO_RUNNER = path.resolve(__dirname, "scenario-runner.ts");
const NATIVE_V8_ROOT = path.resolve(REPO_ROOT, "native/v8-runtime");
const LOCAL_V8_RELEASE_BINARY = path.join(NATIVE_V8_ROOT, "target/release/secure-exec-v8");
const LOCAL_V8_DEBUG_BINARY = path.join(NATIVE_V8_ROOT, "target/debug/secure-exec-v8");

type ScenarioSuccessResult = ScenarioRunResult & {
	status: "passed";
};

type ScenarioFailureResult = {
	status: "failed";
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
		runnerLogFile: string;
	};
	error: string;
};

type ScenarioResult = ScenarioSuccessResult | ScenarioFailureResult;

function round(value: number): number {
	return Number(value.toFixed(3));
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

async function runScenario(
	scenario: ModuleLoadScenarioDefinition,
	iterations: number,
	binaryPath: string,
): Promise<ScenarioResult> {
	const scenarioDir = path.join(RESULTS_ROOT, scenario.id);
	await mkdir(scenarioDir, { recursive: true });

	const resultFile = path.join(scenarioDir, "result.json");
	const metricsFile = path.join(scenarioDir, "metrics.prom");
	const logFile = path.join(scenarioDir, "ipc.ndjson");
	const runnerLogFile = path.join(scenarioDir, "runner.log");
	const metricsPort = await getAvailablePort();
	const runnerArgs = [
		"--import",
		"tsx",
		SCENARIO_RUNNER,
		"--scenario",
		scenario.id,
		"--result-file",
		resultFile,
		"--metrics-file",
		metricsFile,
		"--log-file",
		logFile,
		"--binary-path",
		binaryPath,
		"--metrics-host",
		"127.0.0.1",
		"--metrics-port",
		String(metricsPort),
		"--metrics-path",
		"/metrics",
		"--iterations",
		String(iterations),
	];

	const outputChunks: string[] = [];
	let childExitCode: number | null = null;
	let childError: Error | null = null;
	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(process.execPath, runnerArgs, {
				cwd: PACKAGE_ROOT,
				env: {
					...process.env,
					NO_COLOR: "1",
				},
				stdio: ["ignore", "pipe", "pipe"],
			});

			child.stdout.on("data", (chunk: Buffer) => {
				outputChunks.push(`[stdout] ${chunk.toString()}`);
			});
			child.stderr.on("data", (chunk: Buffer) => {
				outputChunks.push(`[stderr] ${chunk.toString()}`);
			});
			child.on("error", (error) => {
				childError = error;
				reject(error);
			});
			child.on("close", (code) => {
				childExitCode = code;
				resolve();
			});
		});
	} finally {
		await writeFile(runnerLogFile, outputChunks.join(""), "utf8");
	}

	if (childError) {
		throw childError;
	}

	const artifactPaths = {
		resultFile: path.relative(RESULTS_ROOT, resultFile),
		metricsFile: path.relative(RESULTS_ROOT, metricsFile),
		logFile: path.relative(RESULTS_ROOT, logFile),
		runnerLogFile: path.relative(RESULTS_ROOT, runnerLogFile),
	};
	const rawResult = await readFile(resultFile, "utf8").then((content) => JSON.parse(content) as Record<string, unknown>).catch(() => null);
	if (childExitCode === 0 && rawResult) {
		const success = rawResult as Omit<ScenarioSuccessResult, "status" | "artifacts"> & {
			artifacts?: Omit<ScenarioSuccessResult["artifacts"], "runnerLogFile">;
		};
		return {
			status: "passed",
			...success,
			artifacts: {
				resultFile: success.artifacts?.resultFile ?? artifactPaths.resultFile,
				metricsFile: success.artifacts?.metricsFile ?? artifactPaths.metricsFile,
				logFile: success.artifacts?.logFile ?? artifactPaths.logFile,
				runnerLogFile: artifactPaths.runnerLogFile,
			},
		};
	}

	const error =
		typeof rawResult?.error === "string"
			? rawResult.error
			: `Scenario ${scenario.id} exited with code ${childExitCode}`;
	return {
		status: "failed",
		scenarioId: scenario.id,
		title: scenario.title,
		target: scenario.target,
		kind: scenario.kind,
		description: scenario.description,
		createdAt: new Date().toISOString(),
		iterations,
		artifacts: artifactPaths,
		error,
	};
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
): Promise<{
	results: ScenarioRunResult[];
	scenarioSummaries: ScenarioDerivedSummary[];
}> {
	const results: ScenarioRunResult[] = [];
	const scenarioSummaries: ScenarioDerivedSummary[] = [];

	for (const scenario of MODULE_LOAD_SCENARIOS) {
		const summary = await loadScenarioDerivedSummary(RESULTS_ROOT, scenario);
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
	const binaryPath = resolveBenchmarkV8Binary();
	const baseline = await loadBenchmarkBaseline(RESULTS_ROOT);
	await rm(RESULTS_ROOT, { recursive: true, force: true });
	await mkdir(RESULTS_ROOT, { recursive: true });

	const results: ScenarioResult[] = [];
	for (const scenario of MODULE_LOAD_SCENARIOS) {
		console.error(`\n=== ${scenario.id} ===`);
		const result = await runScenario(scenario, iterations, binaryPath);
		results.push(result);
		if (result.status === "failed") {
			console.error(`Scenario ${scenario.id} failed: ${result.error}`);
		}
	}

	const { results: passedResults, scenarioSummaries } = await collectScenarioSummaries(
		baseline,
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
		baseline: baseline?.metadata,
		progressGuide: {
			copyTheseFields: [
				"Warm wall mean",
				"Bridge calls per iteration",
				"Warm fixed session overhead",
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
		baseline: report.baseline ?? null,
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
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
