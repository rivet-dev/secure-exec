/**
 * Phase-level profiling: isolate where time goes in cold vs warm.
 */

import {
	NodeRuntime,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
	createNodeV8Runtime,
} from "../src/index.js";

const TRIVIAL_CODE = `export const x = 1;`;
const RUNS = 30;

async function main() {
	const v8 = await createNodeV8Runtime();
	// Reuse driver/factory — createNodeDriver() scans node_modules (~15ms per call)
	const driver = createNodeDriver();
	const factory = createNodeRuntimeDriverFactory({ v8Runtime: v8 });

	// First cold — warms the snapshot cache
	const warmupRt = new NodeRuntime({
		systemDriver: driver,
		runtimeDriverFactory: factory,
	});
	await warmupRt.run(TRIVIAL_CODE);
	await warmupRt.terminate();

	console.error("Snapshot cached. Profiling cold + warm paths.\n");

	// Measure cold starts (new runtime each time, driver/factory reused)
	const coldConstruct: number[] = [];
	const coldFirstRun: number[] = [];
	const warmRun: number[] = [];

	for (let i = 0; i < RUNS; i++) {
		const t0 = performance.now();
		const rt = new NodeRuntime({
			systemDriver: driver,
			runtimeDriverFactory: factory,
		});
		const t1 = performance.now();
		await rt.run(TRIVIAL_CODE);
		const t2 = performance.now();
		await rt.run(TRIVIAL_CODE);
		const t3 = performance.now();

		coldConstruct.push(t1 - t0);
		coldFirstRun.push(t2 - t1);
		warmRun.push(t3 - t2);

		await rt.terminate();
	}

	const fmt = (arr: number[]) => {
		const s = [...arr].sort((a, b) => a - b);
		const m = arr.reduce((a, b) => a + b, 0) / arr.length;
		return `mean=${m.toFixed(2)}  p50=${s[Math.floor(s.length / 2)].toFixed(2)}  min=${s[0].toFixed(2)}  max=${s[s.length - 1].toFixed(2)}`;
	};

	console.error(`constructor (TS obj only):  ${fmt(coldConstruct)}ms`);
	console.error(`first run (cold):           ${fmt(coldFirstRun)}ms`);
	console.error(`second run (warm):          ${fmt(warmRun)}ms`);
	console.error(`cold - warm delta:          ${((coldFirstRun.reduce((a,b) => a+b,0) - warmRun.reduce((a,b) => a+b,0)) / RUNS).toFixed(2)}ms`);

	await v8.dispose();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
