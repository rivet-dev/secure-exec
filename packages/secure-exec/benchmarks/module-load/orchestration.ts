import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ModuleLoadScenarioDefinition } from "./scenario-catalog.js";
import type {
	BenchmarkSample,
	ScenarioBenchmarkModes,
	ScenarioNewSessionReplayModeResult,
	ScenarioRunResult,
	ScenarioSameSessionReplayModeResult,
	ScenarioTrueColdStartModeResult,
} from "./summary.js";

export const SCENARIO_RUN_STAGES = [
	"samples",
	"sandbox_true_cold_start_warm_snapshot_enabled",
	"sandbox_true_cold_start_warm_snapshot_disabled",
	"sandbox_new_session_replay_warm_snapshot_disabled",
	"sandbox_same_session_replay",
	"host_same_session_control",
] as const;

export type ScenarioRunStage = (typeof SCENARIO_RUN_STAGES)[number];

type ScenarioMetadata = Pick<
	ScenarioRunResult,
	| "scenarioId"
	| "title"
	| "target"
	| "kind"
	| "description"
	| "iterations"
>;

export type ScenarioBenchmarkModesFragment = {
	sandboxTrueColdStart?: Partial<
		Record<"warmSnapshotEnabled" | "warmSnapshotDisabled", ScenarioTrueColdStartModeResult>
	>;
	sandboxNewSessionReplay?: Partial<
		Record<
			"warmSnapshotEnabled" | "warmSnapshotDisabled",
			ScenarioNewSessionReplayModeResult
		>
	>;
	sandboxSameSessionReplay?: ScenarioSameSessionReplayModeResult;
	hostSameSessionControl?: ScenarioSameSessionReplayModeResult;
};

export type ScenarioStageResult = ScenarioMetadata & {
	stage: ScenarioRunStage;
	createdAt: string;
	samples?: BenchmarkSample[];
	benchmarkModes?: ScenarioBenchmarkModesFragment;
};

export type ScenarioSuccessResult = Omit<ScenarioRunResult, "artifacts"> & {
	status: "passed";
	artifacts: ScenarioRunResult["artifacts"] & {
		runnerLogFile: string;
	};
};

export type ScenarioFailureResult = {
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

export type ScenarioResult = ScenarioSuccessResult | ScenarioFailureResult;

export type RunModuleLoadScenarioOptions = {
	scenario: ModuleLoadScenarioDefinition;
	iterations: number;
	binaryPath: string;
	packageRoot: string;
	resultsRoot: string;
	scenarioRunnerPath: string;
	stageTimeoutMs?: number;
	nodePath?: string;
	childEnv?: Record<string, string>;
};

type StageArtifacts = {
	resultFile: string;
	metricsFile: string;
	logFile: string;
};

type StageRunOutput = {
	stage: ScenarioRunStage;
	result: ScenarioStageResult;
	stdoutText: string;
	stderrText: string;
};

const DEFAULT_STAGE_TIMEOUT_MS = 45_000;

export function isScenarioRunStage(value: string): value is ScenarioRunStage {
	return SCENARIO_RUN_STAGES.includes(value as ScenarioRunStage);
}

function isScenarioStageResult(value: unknown): value is ScenarioStageResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"stage" in value &&
		typeof value.stage === "string" &&
		isScenarioRunStage(value.stage)
	);
}

function round(value: number): number {
	return Number(value.toFixed(3));
}

function mean(values: number[]): number | undefined {
	if (values.length === 0) {
		return undefined;
	}
	return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function summarizeNewSessionSamples(
	samples: BenchmarkSample[],
): ScenarioNewSessionReplayModeResult {
	const warmSamples = samples.slice(1);
	const mockRequests = warmSamples
		.map((sample) => sample.mockRequests)
		.filter((sample): sample is number => typeof sample === "number");
	return {
		coldWallMs: samples[0]?.wallMs ?? 0,
		warmWallMsMean: mean(warmSamples.map((sample) => sample.wallMs)),
		coldSandboxMs: samples[0]?.sandboxMs,
		warmSandboxMsMean: mean(
			warmSamples
				.map((sample) => sample.sandboxMs)
				.filter((sample): sample is number => typeof sample === "number"),
		),
		mockRequestsMean: mean(mockRequests),
	};
}

function buildScenarioMetadata(
	scenario: ModuleLoadScenarioDefinition,
	iterations: number,
): ScenarioMetadata {
	return {
		scenarioId: scenario.id,
		title: scenario.title,
		target: scenario.target,
		kind: scenario.kind,
		description: scenario.description,
		iterations,
	};
}

function buildScenarioRunResult(options: {
	scenario: ModuleLoadScenarioDefinition;
	iterations: number;
	artifacts: {
		resultFile: string;
		metricsFile: string;
		logFile: string;
	};
	samples: BenchmarkSample[];
	benchmarkModes: ScenarioBenchmarkModes;
}): ScenarioRunResult {
	const warmSamples = options.samples.slice(1);
	return {
		...buildScenarioMetadata(options.scenario, options.iterations),
		createdAt: new Date().toISOString(),
		artifacts: options.artifacts,
		samples: options.samples,
		benchmarkModes: options.benchmarkModes,
		summary: {
			coldWallMs: options.samples[0]?.wallMs ?? 0,
			warmWallMsMean: mean(warmSamples.map((sample) => sample.wallMs)),
			coldSandboxMs: options.samples[0]?.sandboxMs,
			warmSandboxMsMean: mean(
				warmSamples
					.map((sample) => sample.sandboxMs)
					.filter((sample): sample is number => typeof sample === "number"),
			),
		},
	};
}

function mergeBenchmarkModes(
	fragments: readonly ScenarioBenchmarkModesFragment[],
): ScenarioBenchmarkModes {
	const merged: ScenarioBenchmarkModesFragment = {};
	for (const fragment of fragments) {
		if (fragment.sandboxTrueColdStart) {
			merged.sandboxTrueColdStart = {
				...(merged.sandboxTrueColdStart ?? {}),
				...fragment.sandboxTrueColdStart,
			};
		}
		if (fragment.sandboxNewSessionReplay) {
			merged.sandboxNewSessionReplay = {
				...(merged.sandboxNewSessionReplay ?? {}),
				...fragment.sandboxNewSessionReplay,
			};
		}
		if (fragment.sandboxSameSessionReplay) {
			merged.sandboxSameSessionReplay = fragment.sandboxSameSessionReplay;
		}
		if (fragment.hostSameSessionControl) {
			merged.hostSameSessionControl = fragment.hostSameSessionControl;
		}
	}

	const sandboxTrueColdStart = merged.sandboxTrueColdStart;
	const sandboxNewSessionReplay = merged.sandboxNewSessionReplay;
	if (
		!sandboxTrueColdStart?.warmSnapshotEnabled ||
		!sandboxTrueColdStart.warmSnapshotDisabled ||
		!sandboxNewSessionReplay?.warmSnapshotEnabled ||
		!sandboxNewSessionReplay.warmSnapshotDisabled ||
		!merged.sandboxSameSessionReplay ||
		!merged.hostSameSessionControl
	) {
		throw new Error("Scenario stages did not produce a complete benchmark mode matrix");
	}

	return {
		sandboxTrueColdStart: {
			warmSnapshotEnabled: sandboxTrueColdStart.warmSnapshotEnabled,
			warmSnapshotDisabled: sandboxTrueColdStart.warmSnapshotDisabled,
		},
		sandboxNewSessionReplay: {
			warmSnapshotEnabled: sandboxNewSessionReplay.warmSnapshotEnabled,
			warmSnapshotDisabled: sandboxNewSessionReplay.warmSnapshotDisabled,
		},
		sandboxSameSessionReplay: merged.sandboxSameSessionReplay,
		hostSameSessionControl: merged.hostSameSessionControl,
	};
}

function formatStageOutput(stageOutput: StageRunOutput): string {
	const sections = [`=== ${stageOutput.stage} ===`];
	if (stageOutput.stdoutText.trim()) {
		sections.push(`[stdout]\n${stageOutput.stdoutText.trimEnd()}`);
	}
	if (stageOutput.stderrText.trim()) {
		sections.push(`[stderr]\n${stageOutput.stderrText.trimEnd()}`);
	}
	return `${sections.join("\n")}\n`;
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

async function spawnScenarioStage(
	options: RunModuleLoadScenarioOptions & {
		stage: ScenarioRunStage;
		artifacts: StageArtifacts;
	},
): Promise<StageRunOutput> {
	await mkdir(path.dirname(options.artifacts.resultFile), { recursive: true });
	await mkdir(path.dirname(options.artifacts.metricsFile), { recursive: true });
	await mkdir(path.dirname(options.artifacts.logFile), { recursive: true });
	const metricsPort =
		options.stage === "samples" ? await getAvailablePort() : 1;

	const childArgs = [
		"--import",
		"tsx",
		options.scenarioRunnerPath,
		"--scenario",
		options.scenario.id,
		"--stage",
		options.stage,
		"--result-file",
		options.artifacts.resultFile,
		"--metrics-file",
		options.artifacts.metricsFile,
		"--log-file",
		options.artifacts.logFile,
		"--binary-path",
		options.binaryPath,
		"--metrics-host",
		"127.0.0.1",
		"--metrics-port",
		String(metricsPort),
		"--metrics-path",
		"/metrics",
		"--iterations",
		String(options.iterations),
	];

	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	const timeoutMs = options.stageTimeoutMs ?? DEFAULT_STAGE_TIMEOUT_MS;

	const child = spawn(options.nodePath ?? process.execPath, childArgs, {
		cwd: options.packageRoot,
		env: {
			...process.env,
			NO_COLOR: "1",
			...options.childEnv,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	child.stdout.on("data", (chunk: Buffer) => {
		stdoutChunks.push(chunk.toString("utf8"));
	});
	child.stderr.on("data", (chunk: Buffer) => {
		stderrChunks.push(chunk.toString("utf8"));
	});

	let timedOut = false;
	let exitCode: number | null = null;
	const closed = new Promise<void>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => {
			exitCode = code;
			resolve();
		});
	});

	const timeout = setTimeout(() => {
		timedOut = true;
		child.kill("SIGTERM");
		setTimeout(() => {
			if (child.exitCode === null) {
				child.kill("SIGKILL");
			}
		}, 5_000).unref();
	}, timeoutMs);

	try {
		await closed;
	} finally {
		clearTimeout(timeout);
	}

	const rawResult = existsSync(options.artifacts.resultFile)
		? ((JSON.parse(
				await readFile(options.artifacts.resultFile, "utf8"),
			) as unknown) ?? null)
		: null;

	if (timedOut) {
		throw new Error(
			`Scenario stage ${options.scenario.id}/${options.stage} timed out after ${timeoutMs} ms`,
		);
	}
	if (exitCode !== 0) {
		const message =
			rawResult &&
			typeof rawResult === "object" &&
			"error" in rawResult &&
			typeof rawResult.error === "string"
				? rawResult.error
				: `Scenario stage ${options.scenario.id}/${options.stage} exited with code ${exitCode}`;
		throw new Error(message);
	}
	if (!isScenarioStageResult(rawResult) || rawResult.stage !== options.stage) {
		throw new Error(
			`Scenario stage ${options.scenario.id}/${options.stage} did not write a valid stage result`,
		);
	}

	return {
		stage: options.stage,
		result: rawResult as ScenarioStageResult,
		stdoutText: stdoutChunks.join(""),
		stderrText: stderrChunks.join(""),
	};
}

export async function runModuleLoadScenario(
	options: RunModuleLoadScenarioOptions,
): Promise<ScenarioResult> {
	const scenarioDir = path.join(options.resultsRoot, options.scenario.id);
	await mkdir(scenarioDir, { recursive: true });

	const resultFile = path.join(scenarioDir, "result.json");
	const metricsFile = path.join(scenarioDir, "metrics.prom");
	const logFile = path.join(scenarioDir, "ipc.ndjson");
	const runnerLogFile = path.join(scenarioDir, "runner.log");
	const artifactPaths = {
		resultFile: path.relative(options.resultsRoot, resultFile),
		metricsFile: path.relative(options.resultsRoot, metricsFile),
		logFile: path.relative(options.resultsRoot, logFile),
		runnerLogFile: path.relative(options.resultsRoot, runnerLogFile),
	};

	const runnerLogChunks: string[] = [];
	const stageTempRoot = await mkdtemp(
		path.join(tmpdir(), `secure-exec-module-load-${options.scenario.id}-`),
	);

	try {
		const stageOutputs: StageRunOutput[] = [];
		const sampleStage = await spawnScenarioStage({
			...options,
			stage: "samples",
			artifacts: { resultFile, metricsFile, logFile },
		});
		stageOutputs.push(sampleStage);
		runnerLogChunks.push(formatStageOutput(sampleStage));

		for (const stage of SCENARIO_RUN_STAGES) {
			if (stage === "samples") {
				continue;
			}
			const stageDir = path.join(stageTempRoot, stage);
			const stageOutput = await spawnScenarioStage({
				...options,
				stage,
				artifacts: {
					resultFile: path.join(stageDir, "result.json"),
					metricsFile: path.join(stageDir, "metrics.prom"),
					logFile: path.join(stageDir, "ipc.ndjson"),
				},
			});
			stageOutputs.push(stageOutput);
			runnerLogChunks.push(formatStageOutput(stageOutput));
		}

		const samples = sampleStage.result.samples;
		if (!samples?.length) {
			throw new Error(
				`Scenario ${options.scenario.id} samples stage did not return benchmark samples`,
			);
		}

		const benchmarkModes = mergeBenchmarkModes(
			stageOutputs
				.map((stageOutput) => stageOutput.result.benchmarkModes)
				.filter(
					(fragment): fragment is ScenarioBenchmarkModesFragment =>
						fragment !== undefined,
				),
		);
		const finalResult = buildScenarioRunResult({
			scenario: options.scenario,
			iterations: options.iterations,
			artifacts: {
				resultFile: artifactPaths.resultFile,
				metricsFile: artifactPaths.metricsFile,
				logFile: artifactPaths.logFile,
			},
			samples,
			benchmarkModes,
		});
		await writeFile(resultFile, `${JSON.stringify(finalResult, null, 2)}\n`, "utf8");
		await writeFile(runnerLogFile, runnerLogChunks.join(""), "utf8");

		return {
			status: "passed",
			...finalResult,
			artifacts: {
				...finalResult.artifacts,
				runnerLogFile: artifactPaths.runnerLogFile,
			},
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.stack ?? error.message : String(error);
		runnerLogChunks.push(`[error]\n${message}\n`);
		await writeFile(runnerLogFile, runnerLogChunks.join(""), "utf8").catch(
			() => {},
		);
		await writeFile(
			resultFile,
			`${JSON.stringify({ error: message }, null, 2)}\n`,
			"utf8",
		).catch(() => {});
		if (!existsSync(logFile)) {
			await writeFile(logFile, "", "utf8").catch(() => {});
		}
		if (!existsSync(metricsFile)) {
			await writeFile(metricsFile, "", "utf8").catch(() => {});
		}

		return {
			status: "failed",
			...buildScenarioMetadata(options.scenario, options.iterations),
			createdAt: new Date().toISOString(),
			artifacts: artifactPaths,
			error: message,
		};
	} finally {
		await rm(stageTempRoot, { recursive: true, force: true });
	}
}
