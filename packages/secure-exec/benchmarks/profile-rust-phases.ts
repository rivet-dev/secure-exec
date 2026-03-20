/**
 * Rust-side per-phase profiling.
 * Uses the full NodeRuntime path (same as quick-bench.ts) with
 * SECURE_EXEC_V8_PROFILE=1 to get Rust-side timing output.
 */

import {
	NodeRuntime,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
} from "../src/index.js";

const TRIVIAL_CODE = `export const x = 1;`;

async function main() {
	process.env.SECURE_EXEC_V8_PROFILE = "1";

	console.error("=== Rust per-phase profiling ===\n");

	const runtime = new NodeRuntime({
		systemDriver: createNodeDriver(),
		runtimeDriverFactory: createNodeRuntimeDriverFactory(),
	});

	// First run (cold — creates isolate from snapshot)
	console.error("--- Cold execution (creates isolate) ---");
	await runtime.run(TRIVIAL_CODE);
	await new Promise(r => setTimeout(r, 200));

	// Warm runs
	for (let i = 0; i < 8; i++) {
		console.error(`\n--- Warm execution ${i + 1} ---`);
		await runtime.run(TRIVIAL_CODE);
		await new Promise(r => setTimeout(r, 100));
	}

	await runtime.terminate();
}

main().then(() => {
	process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
