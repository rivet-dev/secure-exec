import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	runModuleLoadScenario,
	SCENARIO_RUN_STAGES,
} from "../benchmarks/module-load/orchestration.js";
import { getModuleLoadScenario } from "../benchmarks/module-load/scenario-catalog.js";

const TEMP_DIRS: string[] = [];
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
	TEMP_DIRS.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		TEMP_DIRS.splice(0).map((dir) =>
			rm(dir, { recursive: true, force: true }),
		),
	);
});

describe("module-load orchestration", () => {
	it("runs isolated scenario stages and merges them into a final result", async () => {
		const tempDir = await createTempDir("secure-exec-module-load-orchestration-");
		const resultsRoot = path.join(tempDir, "results");
		const invocationLog = path.join(tempDir, "invocations.ndjson");
		const result = await runModuleLoadScenario({
			scenario: getModuleLoadScenario("pdf-lib-end-to-end"),
			iterations: 3,
			binaryPath: "/unused-for-fake-runner",
			packageRoot: path.resolve(__dirname, ".."),
			resultsRoot,
			scenarioRunnerPath: path.resolve(
				__dirname,
				"fixtures/module-load-stage-runner.ts",
			),
			stageTimeoutMs: 500,
			childEnv: {
				SECURE_EXEC_BENCH_FAKE_INVOCATION_LOG: invocationLog,
			},
		});

		expect(result.status).toBe("passed");
		if (result.status !== "passed") {
			return;
		}

		expect(result.samples).toHaveLength(3);
		expect(
			result.benchmarkModes.sandboxTrueColdStart?.warmSnapshotDisabled
				?.firstPassWallMs,
		).toBe(130);
		expect(
			result.benchmarkModes.sandboxNewSessionReplay?.warmSnapshotEnabled
				?.warmWallMsMean,
		).toBe(75);
		expect(result.artifacts.runnerLogFile).toBe(
			"pdf-lib-end-to-end/runner.log",
		);

		const invocationEntries = (await readFile(invocationLog, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { stage: string | null });
		expect(invocationEntries).toHaveLength(SCENARIO_RUN_STAGES.length);
		expect(invocationEntries.map((entry) => entry.stage)).toEqual([
			...SCENARIO_RUN_STAGES,
		]);

		const finalResult = JSON.parse(
			await readFile(
				path.join(resultsRoot, "pdf-lib-end-to-end", "result.json"),
				"utf8",
			),
		);
		expect(finalResult.benchmarkModes.hostSameSessionControl.replayPassMs).toBe(
			15,
		);

		const runnerLog = await readFile(
			path.join(resultsRoot, "pdf-lib-end-to-end", "runner.log"),
			"utf8",
		);
		expect(runnerLog).toContain("=== samples ===");
		expect(runnerLog).toContain(
			"=== sandbox_true_cold_start_warm_snapshot_disabled ===",
		);
	});
});
