import {
	NodeRuntime,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
	createNodeV8Runtime,
} from "@secure-exec/node";
import type { V8Runtime } from "@secure-exec/node";
import os from "node:os";

export const BATCH_SIZES = [1, 10, 50, 100, 200];
export const ITERATIONS = 5;
export const MEMORY_ITERATIONS = 5;
export const WARMUP_ITERATIONS = 1;
export const TRIVIAL_CODE = `export const x = 1;`;
// Cap concurrency below available parallelism to leave headroom for the bench harness itself.
export const MAX_CONCURRENCY = Math.max(1, os.availableParallelism() - 4);

// Shared V8 process — spawned once via initSharedV8(), reused by all bench runtimes.
let sharedV8: V8Runtime | null = null;

export async function initSharedV8(): Promise<V8Runtime> {
	if (!sharedV8) {
		sharedV8 = await createNodeV8Runtime();
	}
	return sharedV8;
}

export async function shutdownSharedV8(): Promise<void> {
	if (sharedV8) {
		await sharedV8.dispose();
		sharedV8 = null;
	}
}

export function createBenchRuntime(): NodeRuntime {
	if (!sharedV8) {
		throw new Error("Call initSharedV8() before createBenchRuntime()");
	}
	return new NodeRuntime({
		systemDriver: createNodeDriver(),
		runtimeDriverFactory: createNodeRuntimeDriverFactory({ v8Runtime: sharedV8 }),
	});
}

export function percentile(sorted: number[], p: number): number {
	const idx = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, idx)];
}

export function stats(samples: number[]) {
	const sorted = [...samples].sort((a, b) => a - b);
	const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
	return {
		mean: round(mean),
		p50: round(percentile(sorted, 50)),
		p95: round(percentile(sorted, 95)),
		p99: round(percentile(sorted, 99)),
		min: round(sorted[0]),
		max: round(sorted[sorted.length - 1]),
	};
}

export function round(n: number, decimals = 2): number {
	const f = 10 ** decimals;
	return Math.round(n * f) / f;
}

export function formatBytes(bytes: number): string {
	if (Math.abs(bytes) < 1024) return `${bytes} B`;
	const mb = bytes / (1024 * 1024);
	return `${round(mb, 2)} MB`;
}

export function getHardware() {
	const cpus = os.cpus();
	return {
		cpu: cpus[0]?.model ?? "unknown",
		cores: os.availableParallelism(),
		ram: `${round(os.totalmem() / (1024 ** 3), 1)} GB`,
		node: process.version,
		os: `${os.type()} ${os.release()}`,
		arch: os.arch(),
	};
}

export function forceGC() {
	if (global.gc) {
		global.gc();
	} else {
		console.error("WARNING: global.gc not available. Run with --expose-gc");
	}
}

export async function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** Print a table to stderr for human readability. */
export function printTable(
	headers: string[],
	rows: (string | number)[][],
): void {
	const widths = headers.map((h, i) =>
		Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
	);
	const sep = widths.map((w) => "-".repeat(w)).join(" | ");
	const fmt = (row: (string | number)[]) =>
		row.map((c, i) => String(c).padStart(widths[i])).join(" | ");

	console.error("");
	console.error(fmt(headers));
	console.error(sep);
	for (const row of rows) {
		console.error(fmt(row));
	}
	console.error("");
}
