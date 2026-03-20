/**
 * Cold-start and warm-start latency benchmark for NodeRuntime.
 *
 * Measures:
 *   - Cold start: time to construct a NodeRuntime + complete first run()
 *   - Warm start: time for a second run() on an already-initialized runtime
 *   - Both sequential and concurrent modes at various batch sizes
 *
 * NOTE: The shared V8 process is spawned before the benchmark loop
 * (initSharedV8), so these numbers do NOT include V8 process startup.
 * They measure only isolate/session creation + execution latency.
 *
 * With the warm pool enabled (default), "cold start" actually claims a
 * pre-warmed session (~2ms) rather than spawning a thread + creating an
 * isolate from snapshot (~6ms). This is expected — the warm pool is the
 * production default. To measure true cold-start without the pool, set
 * SECURE_EXEC_NO_SNAPSHOT_WARMUP=1 or configure warmPoolSize: 0.
 *
 * Usage: npx tsx benchmarks/coldstart.bench.ts
 */

import {
	BATCH_SIZES,
	ITERATIONS,
	MAX_CONCURRENCY,
	TRIVIAL_CODE,
	WARMUP_ITERATIONS,
	createBenchRuntime,
	initSharedV8,
	shutdownSharedV8,
	getHardware,
	printTable,
	round,
	stats,
} from "./bench-utils.js";
import type { NodeRuntime } from "../src/index.js";

interface ColdStartEntry {
	batchSize: number;
	mode: "sequential" | "concurrent";
	iterations: number;
	coldStart: ReturnType<typeof stats>;
	warmStart: ReturnType<typeof stats>;
}

async function measureOne(): Promise<{ coldMs: number; warmMs: number }> {
	const t0 = performance.now();
	const runtime = createBenchRuntime();
	await runtime.run(TRIVIAL_CODE);
	const coldMs = performance.now() - t0;

	const t1 = performance.now();
	await runtime.run(TRIVIAL_CODE);
	const warmMs = performance.now() - t1;

	await runtime.terminate();
	return { coldMs, warmMs };
}

async function benchSequential(batchSize: number): Promise<ColdStartEntry> {
	const coldSamples: number[] = [];
	const warmSamples: number[] = [];

	for (let iter = 0; iter < WARMUP_ITERATIONS + ITERATIONS; iter++) {
		const iterCold: number[] = [];
		const iterWarm: number[] = [];

		for (let i = 0; i < batchSize; i++) {
			const { coldMs, warmMs } = await measureOne();
			iterCold.push(coldMs);
			iterWarm.push(warmMs);
		}

		// Skip warmup iterations
		if (iter >= WARMUP_ITERATIONS) {
			coldSamples.push(...iterCold);
			warmSamples.push(...iterWarm);
		}
	}

	return {
		batchSize,
		mode: "sequential",
		iterations: ITERATIONS,
		coldStart: stats(coldSamples),
		warmStart: stats(warmSamples),
	};
}

async function benchConcurrent(batchSize: number): Promise<ColdStartEntry> {
	const effectiveConcurrency = Math.min(batchSize, MAX_CONCURRENCY);
	const coldSamples: number[] = [];
	const warmSamples: number[] = [];

	for (let iter = 0; iter < WARMUP_ITERATIONS + ITERATIONS; iter++) {
		// Launch in chunks up to MAX_CONCURRENCY
		const iterCold: number[] = [];
		const iterWarm: number[] = [];
		let remaining = batchSize;

		while (remaining > 0) {
			const chunk = Math.min(remaining, effectiveConcurrency);
			const results = await Promise.all(
				Array.from({ length: chunk }, () => measureOne()),
			);
			for (const { coldMs, warmMs } of results) {
				iterCold.push(coldMs);
				iterWarm.push(warmMs);
			}
			remaining -= chunk;
		}

		if (iter >= WARMUP_ITERATIONS) {
			coldSamples.push(...iterCold);
			warmSamples.push(...iterWarm);
		}
	}

	return {
		batchSize,
		mode: "concurrent",
		iterations: ITERATIONS,
		coldStart: stats(coldSamples),
		warmStart: stats(warmSamples),
	};
}

async function main() {
	const hardware = getHardware();
	console.error(`=== Cold Start Benchmark ===`);
	console.error(`CPU: ${hardware.cpu}`);
	console.error(`Cores: ${hardware.cores} | Max concurrency: ${MAX_CONCURRENCY}`);
	console.error(`RAM: ${hardware.ram} | Node: ${hardware.node}`);
	console.error(`Iterations: ${ITERATIONS} (+ ${WARMUP_ITERATIONS} warmup)`);
	console.error(`Batch sizes: ${BATCH_SIZES.join(", ")}`);

	// Pre-spawn the shared V8 process so the bench loop only measures isolate creation
	console.error(`\nSpawning shared V8 process...`);
	await initSharedV8();
	console.error(`V8 process ready.\n`);

	const results: ColdStartEntry[] = [];

	for (const batchSize of BATCH_SIZES) {
		console.error(`\n--- batch=${batchSize}, mode=sequential ---`);
		const seq = await benchSequential(batchSize);
		results.push(seq);
		console.error(
			`  cold: mean=${seq.coldStart.mean}ms p50=${seq.coldStart.p50}ms p95=${seq.coldStart.p95}ms`,
		);
		console.error(
			`  warm: mean=${seq.warmStart.mean}ms p50=${seq.warmStart.p50}ms p95=${seq.warmStart.p95}ms`,
		);

		console.error(`\n--- batch=${batchSize}, mode=concurrent ---`);
		const conc = await benchConcurrent(batchSize);
		results.push(conc);
		console.error(
			`  cold: mean=${conc.coldStart.mean}ms p50=${conc.coldStart.p50}ms p95=${conc.coldStart.p95}ms`,
		);
		console.error(
			`  warm: mean=${conc.warmStart.mean}ms p50=${conc.warmStart.p50}ms p95=${conc.warmStart.p95}ms`,
		);
	}

	// Summary table
	printTable(
		["batch", "mode", "cold mean", "cold p50", "cold p95", "warm mean", "warm p50", "warm p95"],
		results.map((r) => [
			r.batchSize,
			r.mode,
			`${r.coldStart.mean}ms`,
			`${r.coldStart.p50}ms`,
			`${r.coldStart.p95}ms`,
			`${r.warmStart.mean}ms`,
			`${r.warmStart.p50}ms`,
			`${r.warmStart.p95}ms`,
		]),
	);

	// JSON to stdout
	console.log(JSON.stringify({ hardware, results }, null, 2));

	await shutdownSharedV8();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
