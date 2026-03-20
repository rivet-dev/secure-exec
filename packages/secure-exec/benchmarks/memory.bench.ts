/**
 * Memory overhead benchmark for NodeRuntime.
 *
 * Measures incremental RSS and heap per live runtime instance by spinning up
 * N runtimes, sampling memory, then tearing them down.
 *
 * Usage: node --expose-gc --import tsx/esm benchmarks/memory.bench.ts
 */

import {
	BATCH_SIZES,
	MAX_CONCURRENCY,
	MEMORY_ITERATIONS,
	TRIVIAL_CODE,
	createBenchRuntime,
	setupBench,
	teardownBench,
	forceGC,
	formatBytes,
	getHardware,
	printTable,
	round,
	sleep,
} from "./bench-utils.js";
import type { NodeRuntime } from "../src/index.js";

interface MemoryEntry {
	batchSize: number;
	totalDeltaRssBytes: number;
	totalDeltaHeapBytes: number;
	perRuntimeRssBytes: number;
	perRuntimeHeapBytes: number;
	teardownReclaimedRssBytes: number;
}

async function measureBatch(batchSize: number): Promise<MemoryEntry> {
	const rssSamples: number[] = [];
	const heapSamples: number[] = [];
	const reclaimSamples: number[] = [];

	for (let iter = 0; iter < MEMORY_ITERATIONS; iter++) {
		// Baseline — multiple GC passes to flush incremental/concurrent phases
		forceGC();
		forceGC();
		await sleep(50);
		const baseline = process.memoryUsage();

		// Create and initialize runtimes
		const runtimes: NodeRuntime[] = [];
		let remaining = batchSize;

		while (remaining > 0) {
			const chunk = Math.min(remaining, MAX_CONCURRENCY);
			const batch = await Promise.all(
				Array.from({ length: chunk }, async () => {
					const rt = createBenchRuntime();
					await rt.run(TRIVIAL_CODE);
					return rt;
				}),
			);
			runtimes.push(...batch);
			remaining -= chunk;
		}

		// Measure after init
		forceGC();
		forceGC();
		await sleep(50);
		const afterInit = process.memoryUsage();

		const rssDelta = afterInit.rss - baseline.rss;
		const heapDelta = afterInit.heapUsed - baseline.heapUsed;

		rssSamples.push(rssDelta);
		heapSamples.push(heapDelta);

		// Teardown
		await Promise.all(runtimes.map((rt) => rt.terminate()));
		forceGC();
		forceGC();
		await sleep(50);
		const afterTeardown = process.memoryUsage();

		reclaimSamples.push(afterInit.rss - afterTeardown.rss);
	}

	// Average across iterations
	const avgRss = rssSamples.reduce((a, b) => a + b, 0) / MEMORY_ITERATIONS;
	const avgHeap = heapSamples.reduce((a, b) => a + b, 0) / MEMORY_ITERATIONS;
	const avgReclaim =
		reclaimSamples.reduce((a, b) => a + b, 0) / MEMORY_ITERATIONS;

	return {
		batchSize,
		totalDeltaRssBytes: Math.round(avgRss),
		totalDeltaHeapBytes: Math.round(avgHeap),
		perRuntimeRssBytes: Math.round(avgRss / batchSize),
		perRuntimeHeapBytes: Math.round(avgHeap / batchSize),
		teardownReclaimedRssBytes: Math.round(avgReclaim),
	};
}

async function main() {
	if (!global.gc) {
		console.error(
			"ERROR: Run with --expose-gc flag\n" +
				"  node --expose-gc --import tsx/esm benchmarks/memory.bench.ts",
		);
		process.exit(1);
	}

	const hardware = getHardware();
	console.error(`=== Memory Overhead Benchmark ===`);
	console.error(`CPU: ${hardware.cpu}`);
	console.error(`RAM: ${hardware.ram} | Node: ${hardware.node}`);
	console.error(`Iterations per batch: ${MEMORY_ITERATIONS}`);
	console.error(`Batch sizes: ${BATCH_SIZES.join(", ")}`);

	// Pre-spawn the shared V8 process so the bench loop only measures isolate overhead
	console.error(`\nSpawning shared V8 process...`);
	await setupBench();
	console.error(`V8 process ready.\n`);

	const results: MemoryEntry[] = [];

	for (const batchSize of BATCH_SIZES) {
		console.error(`\n--- batch=${batchSize} ---`);
		const entry = await measureBatch(batchSize);
		results.push(entry);
		console.error(
			`  total RSS delta: ${formatBytes(entry.totalDeltaRssBytes)}`,
		);
		console.error(
			`  per-runtime RSS: ${formatBytes(entry.perRuntimeRssBytes)}`,
		);
		console.error(
			`  per-runtime heap: ${formatBytes(entry.perRuntimeHeapBytes)}`,
		);
		console.error(
			`  teardown reclaimed: ${formatBytes(entry.teardownReclaimedRssBytes)}`,
		);
	}

	// Summary table
	printTable(
		[
			"batch",
			"total RSS",
			"per-rt RSS",
			"per-rt heap",
			"reclaimed",
		],
		results.map((r) => [
			r.batchSize,
			formatBytes(r.totalDeltaRssBytes),
			formatBytes(r.perRuntimeRssBytes),
			formatBytes(r.perRuntimeHeapBytes),
			formatBytes(r.teardownReclaimedRssBytes),
		]),
	);

	// JSON to stdout
	console.log(JSON.stringify({ hardware, results }, null, 2));

	await teardownBench();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
