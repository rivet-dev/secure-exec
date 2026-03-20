/**
 * Staggered TTI benchmark — launches runtimes with a delay between each.
 *
 * Matches the computesdk "staggered" pattern: sandbox creates are spaced
 * apart by a configurable delay, simulating real-world ramp-up traffic.
 * Tracks per-sandbox TTI and a launch/ready ramp profile.
 *
 * Usage: npx tsx benchmarks/staggered.bench.ts
 */

import {
	TRIVIAL_CODE,
	MAX_CONCURRENCY,
	createBenchRuntime,
	setupBench,
	teardownBench,
	getHardware,
	printTable,
	round,
	stats,
} from "./bench-utils.js";

const CONCURRENCY = 20;
const STAGGER_DELAY_MS = 50;
const ITERATIONS = 3;
const WARMUP_ITERATIONS = 1;

interface RampEntry {
	launchedAt: number;
	readyAt: number;
	ttiMs: number;
}

interface StaggeredResult {
	concurrency: number;
	staggerDelayMs: number;
	perSandboxTti: ReturnType<typeof stats>;
	wallClockMs: number;
	timeToFirstReadyMs: number;
	rampProfile: RampEntry[];
}

async function benchStaggered(): Promise<StaggeredResult> {
	const allTtis: number[] = [];
	let bestWallClock = Infinity;
	let bestFirstReady = Infinity;
	let bestRamp: RampEntry[] = [];

	for (let iter = 0; iter < WARMUP_ITERATIONS + ITERATIONS; iter++) {
		const wallStart = performance.now();
		const promises: Promise<number>[] = [];
		const ramp: RampEntry[] = [];

		for (let i = 0; i < CONCURRENCY; i++) {
			const launchedAt = performance.now() - wallStart;

			const p = (async () => {
				const t0 = performance.now();
				const rt = createBenchRuntime();
				const t1 = performance.now();
				await rt.run(TRIVIAL_CODE);
				const t2 = performance.now();
				const ttiMs = t2 - t0;
				const constructMs = t1 - t0;
				const runMs = t2 - t1;
				const readyAt = t2 - wallStart;
				ramp.push({ launchedAt: round(launchedAt), readyAt: round(readyAt), ttiMs: round(ttiMs), constructMs: round(constructMs), runMs: round(runMs) });
				await rt.terminate();
				return ttiMs;
			})();

			promises.push(p);

			// Stagger delay between launches (except after last)
			if (i < CONCURRENCY - 1) {
				await new Promise((r) => setTimeout(r, STAGGER_DELAY_MS));
			}
		}

		const ttis = await Promise.all(promises);
		const wallClockMs = performance.now() - wallStart;
		const firstReady = Math.min(...ttis);

		if (iter >= WARMUP_ITERATIONS) {
			allTtis.push(...ttis);
			if (wallClockMs < bestWallClock) {
				bestWallClock = wallClockMs;
				bestRamp = ramp.sort((a, b) => a.launchedAt - b.launchedAt);
			}
			if (firstReady < bestFirstReady) bestFirstReady = firstReady;
		}
	}

	return {
		concurrency: CONCURRENCY,
		staggerDelayMs: STAGGER_DELAY_MS,
		perSandboxTti: stats(allTtis),
		wallClockMs: round(bestWallClock),
		timeToFirstReadyMs: round(bestFirstReady),
		rampProfile: bestRamp,
	};
}

async function main() {
	const warmPoolSize = process.env.WARM_POOL_SIZE ? parseInt(process.env.WARM_POOL_SIZE) : undefined;
	const hardware = getHardware();
	console.error("=== Staggered TTI Benchmark ===");
	console.error(`CPU: ${hardware.cpu}`);
	console.error(`Cores: ${hardware.cores} | Max concurrency: ${MAX_CONCURRENCY}`);
	console.error(`RAM: ${hardware.ram} | Node: ${hardware.node}`);
	console.error(`Concurrency: ${CONCURRENCY} | Stagger delay: ${STAGGER_DELAY_MS}ms`);
	console.error(`Warm pool: ${warmPoolSize ?? "default (3)"}`);
	console.error(`Iterations: ${ITERATIONS} (+ ${WARMUP_ITERATIONS} warmup)`);

	console.error("\nSpawning shared V8 process...");
	await setupBench(warmPoolSize);
	console.error("V8 process ready.\n");

	const result = await benchStaggered();

	console.error(
		`TTI median=${result.perSandboxTti.p50}ms p95=${result.perSandboxTti.p95}ms | wall=${result.wallClockMs}ms | first=${result.timeToFirstReadyMs}ms`,
	);

	// Ramp profile table
	printTable(
		["#", "launched at", "ready at", "TTI", "construct", "run"],
		result.rampProfile.map((r: any, i: number) => [
			i + 1,
			`+${r.launchedAt}ms`,
			`+${r.readyAt}ms`,
			`${r.ttiMs}ms`,
			`${r.constructMs}ms`,
			`${r.runMs}ms`,
		]),
	);

	console.log(JSON.stringify({ hardware, result }, null, 2));
	await teardownBench();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
