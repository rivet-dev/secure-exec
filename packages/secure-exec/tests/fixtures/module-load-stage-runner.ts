import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function readArg(name: string): string {
	const flag = `--${name}`;
	const index = process.argv.indexOf(flag);
	if (index === -1 || index + 1 >= process.argv.length) {
		throw new Error(`Missing required argument: ${flag}`);
	}
	return process.argv[index + 1];
}

function readOptionalArg(name: string): string | undefined {
	const flag = `--${name}`;
	const index = process.argv.indexOf(flag);
	if (index === -1 || index + 1 >= process.argv.length) {
		return undefined;
	}
	return process.argv[index + 1];
}

const scenarioId = readArg("scenario");
const resultFile = readArg("result-file");
const metricsFile = readArg("metrics-file");
const logFile = readArg("log-file");
const iterations = Number(readArg("iterations"));
const stage = readOptionalArg("stage");
const invocationLog = process.env.SECURE_EXEC_BENCH_FAKE_INVOCATION_LOG;

if (invocationLog) {
	await appendFile(
		invocationLog,
		`${JSON.stringify({ scenarioId, stage: stage ?? null })}\n`,
		"utf8",
	);
}

if (!stage) {
	setInterval(() => {}, 1_000);
	await new Promise(() => {});
}

await mkdir(path.dirname(resultFile), { recursive: true });
await mkdir(path.dirname(metricsFile), { recursive: true });
await mkdir(path.dirname(logFile), { recursive: true });

const base = {
	stage,
	scenarioId,
	title: "pdf-lib End-to-End",
	target: "pdf_lib",
	kind: "end_to_end",
	description: "Fake stage runner for orchestration tests.",
	createdAt: "2026-03-31T23:00:00.000Z",
	iterations,
};

const logLine = JSON.stringify({
	stage,
	event: "fake-stage-complete",
	scenarioId,
});
await writeFile(logFile, `${logLine}\n`, "utf8");
await writeFile(
	metricsFile,
	stage === "samples"
		? "# HELP fake_metric_total Synthetic metric for orchestration tests.\n# TYPE fake_metric_total counter\nfake_metric_total 1\n"
		: "",
	"utf8",
);

const sample = (iteration: number, wallMs: number, sandboxMs: number) => ({
	iteration,
	wallMs,
	code: 0,
	stdoutBytes: 10,
	stderrBytes: 0,
	sandboxMs,
	stdoutPreview: `sample-${iteration}`,
	stderrPreview: "",
	checks: {
		stage,
		iteration,
	},
});

let payload: Record<string, unknown>;
switch (stage) {
	case "samples":
		payload = {
			...base,
			samples: [sample(1, 120, 80), sample(2, 90, 60), sample(3, 60, 40)],
			benchmarkModes: {
				sandboxNewSessionReplay: {
					warmSnapshotEnabled: {
						coldWallMs: 120,
						warmWallMsMean: 75,
						coldSandboxMs: 80,
						warmSandboxMsMean: 50,
						mockRequestsMean: 0,
					},
				},
			},
		};
		break;
	case "sandbox_true_cold_start_warm_snapshot_enabled":
		payload = {
			...base,
			benchmarkModes: {
				sandboxTrueColdStart: {
					warmSnapshotEnabled: {
						totalWallMs: 140,
						runtimeCreateMs: 20,
						firstPassWallMs: 120,
						firstPassSandboxMs: 80,
						checks: { stage },
					},
				},
			},
		};
		break;
	case "sandbox_true_cold_start_warm_snapshot_disabled":
		payload = {
			...base,
			benchmarkModes: {
				sandboxTrueColdStart: {
					warmSnapshotDisabled: {
						totalWallMs: 160,
						runtimeCreateMs: 30,
						firstPassWallMs: 130,
						firstPassSandboxMs: 85,
						checks: { stage },
					},
				},
			},
		};
		break;
	case "sandbox_new_session_replay_warm_snapshot_disabled":
		payload = {
			...base,
			benchmarkModes: {
				sandboxNewSessionReplay: {
					warmSnapshotDisabled: {
						coldWallMs: 130,
						warmWallMsMean: 95,
						coldSandboxMs: 85,
						warmSandboxMsMean: 65,
						mockRequestsMean: 0,
					},
				},
			},
		};
		break;
	case "sandbox_same_session_replay":
		payload = {
			...base,
			benchmarkModes: {
				sandboxSameSessionReplay: {
					totalWallMs: 70,
					firstPassMs: 40,
					replayPassMs: 30,
					firstPassChecks: { stage, pass: "first" },
					replayPassChecks: { stage, pass: "replay" },
				},
			},
		};
		break;
	case "host_same_session_control":
		payload = {
			...base,
			benchmarkModes: {
				hostSameSessionControl: {
					totalWallMs: 35,
					firstPassMs: 20,
					replayPassMs: 15,
					firstPassChecks: { stage, pass: "first" },
					replayPassChecks: { stage, pass: "replay" },
				},
			},
		};
		break;
	default:
		throw new Error(`Unhandled fake stage: ${stage}`);
}

await writeFile(resultFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.error(`fake stage ${stage} complete`);
