/**
 * Burst TTI benchmark — fires N runtimes simultaneously.
 *
 * Matches the computesdk "concurrent/burst" pattern: all sandbox creates
 * launch at once, measuring per-sandbox TTI and wall-clock time to all-ready.
 *
 * Usage: npx tsx benchmarks/burst.bench.ts
 */

import {
	TRIVIAL_CODE,
	MAX_CONCURRENCY,
	createBenchRuntime,
	initSharedV8,
	shutdownSharedV8,
	getHardware,
	printTable,
	round,
	stats,
} from "./bench-utils.js";

const BURST_SIZES = [1, 5, 10, 25, 50];
const ITERATIONS = 3;
const WARMUP_ITERATIONS = 1;

interface BurstResult {
	burstSize: number;
	perSandboxTti: ReturnType<typeof stats>;
	wallClockMs: number;
	timeToFirstReadyMs: number;
}

async function measureOne(): Promise<number> {
	const t0 = performance.now();
	const rt = createBenchRuntime();
	await rt.run(TRIVIAL_CODE);
	const ttiMs = performance.now() - t0;
	await rt.terminate();
	return ttiMs;
}

async function benchBurst(burstSize: number): Promise<BurstResult> {
	const allTtis: number[] = [];
	let bestWallClock = Infinity;
	let bestFirstReady = Infinity;

	for (let iter = 0; iter < WARMUP_ITERATIONS + ITERATIONS; iter++) {
		const wallStart = performance.now();

		// Fire all at once
		const promises = Array.from({ length: burstSize }, () => measureOne());
		const ttis = await Promise.all(promises);

		const wallClockMs = performance.now() - wallStart;
		const firstReady = Math.min(...ttis);

		if (iter >= WARMUP_ITERATIONS) {
			allTtis.push(...ttis);
			if (wallClockMs < bestWallClock) bestWallClock = wallClockMs;
			if (firstReady < bestFirstReady) bestFirstReady = firstReady;
		}
	}

	return {
		burstSize,
		perSandboxTti: stats(allTtis),
		wallClockMs: round(bestWallClock),
		timeToFirstReadyMs: round(bestFirstReady),
	};
}

async function main() {
	const hardware = getHardware();
	console.error("=== Burst TTI Benchmark ===");
	console.error(`CPU: ${hardware.cpu}`);
	console.error(`Cores: ${hardware.cores} | Max concurrency: ${MAX_CONCURRENCY}`);
	console.error(`RAM: ${hardware.ram} | Node: ${hardware.node}`);
	console.error(`Iterations: ${ITERATIONS} (+ ${WARMUP_ITERATIONS} warmup)`);
	console.error(`Burst sizes: ${BURST_SIZES.join(", ")}`);

	console.error("\nSpawning shared V8 process...");
	await initSharedV8();
	console.error("V8 process ready.\n");

	const results: BurstResult[] = [];

	for (const burstSize of BURST_SIZES) {
		console.error(`--- burst=${burstSize} ---`);
		const result = await benchBurst(burstSize);
		results.push(result);
		console.error(
			`  TTI median=${result.perSandboxTti.p50}ms p95=${result.perSandboxTti.p95}ms | wall=${result.wallClockMs}ms | first=${result.timeToFirstReadyMs}ms`,
		);
	}

	printTable(
		["burst", "TTI median", "TTI p95", "TTI p99", "wall clock", "first ready"],
		results.map((r) => [
			r.burstSize,
			`${r.perSandboxTti.p50}ms`,
			`${r.perSandboxTti.p95}ms`,
			`${r.perSandboxTti.p99}ms`,
			`${r.wallClockMs}ms`,
			`${r.timeToFirstReadyMs}ms`,
		]),
	);

	console.log(JSON.stringify({ hardware, results }, null, 2));
	await shutdownSharedV8();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
