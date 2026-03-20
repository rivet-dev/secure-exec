import { createBenchRuntime, TRIVIAL_CODE } from "./bench-utils.js";
import { disposeSharedV8Runtime } from "../src/index.js";

async function measureOne() {
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

async function main() {
  // NOTE: Reduced from 5 to 2 runs for testing speed
  console.error("⚠ BENCH: Reduced to 2 runs for speed (was 5)");
  console.error("=== Quick bench (2 sequential runs) ===");
  for (let i = 0; i < 2; i++) {
    const { coldMs, warmMs } = await measureOne();
    console.error(`  run ${i+1}: cold=${coldMs.toFixed(1)}ms  warm=${warmMs.toFixed(1)}ms`);
  }
}

main()
  .then(() => disposeSharedV8Runtime())
  .catch(e => { console.error(e); process.exit(1); });
