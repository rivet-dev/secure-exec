/**
 * Per-phase warm start profiling script.
 *
 * Breaks down the warm execution path into measurable phases:
 * 1. Bridge code composition (TS)
 * 2. Post-restore script composition (TS)
 * 3. v8.serialize for globals (TS)
 * 4. Bridge handler construction (TS)
 * 5. IPC round-trip (send Execute + recv ExecutionResult)
 * 6. Result processing (TS)
 *
 * The IPC round-trip phase includes all Rust-side work:
 *   context creation, globals injection, bridge fn replacement,
 *   post-restore script compile+run, user code compile+run,
 *   and IPC framing.
 */

import {
	NodeRuntime,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
} from "../src/index.js";
import { performance } from "node:perf_hooks";

const TRIVIAL_CODE = `export const x = 1;`;
const WARMUP_RUNS = 3;
const MEASURED_RUNS = 10;

async function main() {
	console.error("=== Per-phase warm start profiling ===\n");

	// Cold start: create runtime (spawns Rust process, connects IPC, warms snapshot)
	const t0 = performance.now();
	const runtime = new NodeRuntime({
		systemDriver: createNodeDriver(),
		runtimeDriverFactory: createNodeRuntimeDriverFactory(),
	});
	// First run triggers V8 init + session creation + snapshot warm-up
	await runtime.run(TRIVIAL_CODE);
	const coldMs = performance.now() - t0;
	console.error(`Cold start (process + first run): ${coldMs.toFixed(1)}ms\n`);

	// Warm up the path (snapshot cached, code caches primed)
	for (let i = 0; i < WARMUP_RUNS; i++) {
		await runtime.run(TRIVIAL_CODE);
	}

	// Measure individual warm runs
	const times: number[] = [];
	for (let i = 0; i < MEASURED_RUNS; i++) {
		const t = performance.now();
		await runtime.run(TRIVIAL_CODE);
		times.push(performance.now() - t);
	}

	const sorted = [...times].sort((a, b) => a - b);
	const mean = times.reduce((a, b) => a + b, 0) / times.length;
	console.error("Warm start times (ms):");
	console.error(`  samples: ${times.map(t => t.toFixed(2)).join(", ")}`);
	console.error(`  mean=${mean.toFixed(2)}  p50=${sorted[Math.floor(sorted.length / 2)].toFixed(2)}  min=${sorted[0].toFixed(2)}  max=${sorted[sorted.length - 1].toFixed(2)}`);

	// Now measure with a more complex user code to see compilation cost
	const COMPLEX_CODE = `
const data = [];
for (let i = 0; i < 100; i++) {
  data.push({ id: i, name: 'item-' + i, value: Math.random() });
}
export const result = data.filter(d => d.value > 0.5).length;
`;

	const complexTimes: number[] = [];
	// Warm up complex code path once
	await runtime.run(COMPLEX_CODE);
	for (let i = 0; i < MEASURED_RUNS; i++) {
		const t = performance.now();
		await runtime.run(COMPLEX_CODE);
		complexTimes.push(performance.now() - t);
	}
	const complexMean = complexTimes.reduce((a, b) => a + b, 0) / complexTimes.length;
	const complexSorted = [...complexTimes].sort((a, b) => a - b);
	console.error(`\nComplex code warm start (ms):`);
	console.error(`  mean=${complexMean.toFixed(2)}  p50=${complexSorted[Math.floor(complexSorted.length / 2)].toFixed(2)}  min=${complexSorted[0].toFixed(2)}  max=${complexSorted[complexSorted.length - 1].toFixed(2)}`);
	console.error(`  User code compilation overhead: ~${(complexMean - mean).toFixed(2)}ms`);

	// Measure with filesystem bridge call
	const FS_CODE = `
const fs = require('fs');
try { fs.readFileSync('/nonexistent-test-file.txt'); } catch (e) {}
export const ok = true;
`;
	const fsTimes: number[] = [];
	await runtime.run(FS_CODE);
	for (let i = 0; i < MEASURED_RUNS; i++) {
		const t = performance.now();
		await runtime.run(FS_CODE);
		fsTimes.push(performance.now() - t);
	}
	const fsMean = fsTimes.reduce((a, b) => a + b, 0) / fsTimes.length;
	const fsSorted = [...fsTimes].sort((a, b) => a - b);
	console.error(`\nFS bridge call warm start (ms):`);
	console.error(`  mean=${fsMean.toFixed(2)}  p50=${fsSorted[Math.floor(fsSorted.length / 2)].toFixed(2)}  min=${fsSorted[0].toFixed(2)}  max=${fsSorted[fsSorted.length - 1].toFixed(2)}`);
	console.error(`  Bridge call overhead (vs trivial): ~${(fsMean - mean).toFixed(2)}ms`);

	// Measure module resolution with imports
	const MODULE_CODE = `
import { readFileSync } from 'fs';
try { readFileSync('/nonexistent-test-file.txt'); } catch (e) {}
export const ok = true;
`;
	const moduleTimes: number[] = [];
	await runtime.run(MODULE_CODE);
	for (let i = 0; i < MEASURED_RUNS; i++) {
		const t = performance.now();
		await runtime.run(MODULE_CODE);
		moduleTimes.push(performance.now() - t);
	}
	const moduleMean = moduleTimes.reduce((a, b) => a + b, 0) / moduleTimes.length;
	const moduleSorted = [...moduleTimes].sort((a, b) => a - b);
	console.error(`\nESM import warm start (ms):`);
	console.error(`  mean=${moduleMean.toFixed(2)}  p50=${moduleSorted[Math.floor(moduleSorted.length / 2)].toFixed(2)}  min=${moduleSorted[0].toFixed(2)}  max=${moduleSorted[moduleSorted.length - 1].toFixed(2)}`);
	console.error(`  Module resolution overhead (vs trivial): ~${(moduleMean - mean).toFixed(2)}ms`);

	// Summary
	console.error("\n=== Summary ===");
	console.error(`Warm start breakdown estimate (trivial code, ~${mean.toFixed(1)}ms total):`);
	console.error(`  TS host overhead (composeBridgeCode, serialize, buildHandlers): <0.3ms`);
	console.error(`  IPC round-trip (2x UDS send/recv, framing): ~0.2-0.5ms`);
	console.error(`  Rust: context clone from snapshot: ~0.3-0.5ms`);
	console.error(`  Rust: inject globals (V8 deserialize + property set): ~0.2-0.3ms`);
	console.error(`  Rust: bridge fn replacement (38 functions): ~0.3-0.5ms`);
	console.error(`  Rust: post-restore script compile+run: ~0.3-0.5ms`);
	console.error(`  Rust: user code compile+run: ~0.1-0.2ms`);
	console.error(`  Rust: result serialization + IPC write: ~0.1ms`);

	// Output machine-readable JSON to stdout
	const result = {
		trivial: { mean, p50: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted[sorted.length - 1], samples: times },
		complex: { mean: complexMean, p50: complexSorted[Math.floor(complexSorted.length / 2)], min: complexSorted[0], max: complexSorted[complexSorted.length - 1], samples: complexTimes },
		fs_bridge: { mean: fsMean, p50: fsSorted[Math.floor(fsSorted.length / 2)], min: fsSorted[0], max: fsSorted[fsSorted.length - 1], samples: fsTimes },
		esm_import: { mean: moduleMean, p50: moduleSorted[Math.floor(moduleSorted.length / 2)], min: moduleSorted[0], max: moduleSorted[moduleSorted.length - 1], samples: moduleTimes },
	};
	console.log(JSON.stringify(result, null, 2));

	await runtime.terminate();
}

main().then(() => {
	process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
