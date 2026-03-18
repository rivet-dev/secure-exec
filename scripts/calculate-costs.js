#!/usr/bin/env node

/**
 * Cost-per-second calculator for secure-exec vs sandbox providers.
 *
 * Run: node scripts/calculate-costs.js
 *
 * Update pricing inputs below when rates change.
 * All prices in USD unless noted.
 */

// === Pricing inputs ===

const SECURE_EXEC_BASELINE_MEMORY_MB = 3.4; // converged at-scale average
const EMPTY_CAPACITY_OVERHEAD = 0.3; // 30% idle capacity for container orchestration
const UTILIZATION = 1 - EMPTY_CAPACITY_OVERHEAD;

// Sandbox baseline — cheapest provider (Cloudflare Containers as of 2026-03-18)
const SANDBOX = {
  name: "Cloudflare Containers",
  minMemoryMb: 256,
  costPerGibSecond: 0.0000025, // $/GiB-second
  source: "https://developers.cloudflare.com/containers/platform/pricing/",
  asOf: "2026-03-18",
};

// Self-hosted hardware options for secure-exec
const HARDWARE = [
  {
    key: "aws-arm",
    name: "AWS t4g.micro (ARM/Graviton)",
    arch: "arm64",
    costPerHour: 0.0084,
    memoryMb: 1024,
    source: "https://aws.amazon.com/ec2/pricing/on-demand/",
    asOf: "2026-03-18",
  },
  {
    key: "aws-x86",
    name: "AWS t3.micro (x86/Intel)",
    arch: "x86_64",
    costPerHour: 0.0104,
    memoryMb: 1024,
    source: "https://aws.amazon.com/ec2/pricing/on-demand/",
    asOf: "2026-03-18",
  },
  {
    key: "hetzner-arm",
    name: "Hetzner CAX11 (ARM/Ampere)",
    arch: "arm64",
    costPerMonthEur: 3.29,
    eurToUsd: 1.09,
    memoryMb: 4096,
    source: "https://www.hetzner.com/cloud/",
    asOf: "2026-03-18",
  },
  {
    key: "hetzner-x86",
    name: "Hetzner CX22 (x86/Intel)",
    arch: "x86_64",
    costPerMonthEur: 5.39,
    eurToUsd: 1.09,
    memoryMb: 4096,
    source: "https://www.hetzner.com/cloud/",
    asOf: "2026-03-18",
  },
];

// === Calculations ===

function hwCostPerSecond(hw) {
  if (hw.costPerHour) return hw.costPerHour / 3600;
  if (hw.costPerMonthEur)
    return (hw.costPerMonthEur * hw.eurToUsd) / (30 * 24 * 3600);
  throw new Error(`No cost defined for ${hw.name}`);
}

// Sandbox: minimum memory × per-GiB-second rate
const sandboxCostPerSec =
  (SANDBOX.minMemoryMb / 1024) * SANDBOX.costPerGibSecond;

console.log("=== Sandbox baseline ===");
console.log(`Provider:        ${SANDBOX.name}`);
console.log(`Min memory:      ${SANDBOX.minMemoryMb} MB`);
console.log(`Rate:            $${SANDBOX.costPerGibSecond}/GiB·s`);
console.log(`Cost/exec-sec:   $${sandboxCostPerSec.toExponential(4)}`);
console.log(`Source:          ${SANDBOX.source} (as of ${SANDBOX.asOf})`);
console.log();

console.log("=== Secure Exec on self-hosted hardware ===");
console.log(
  `Baseline memory: ${SECURE_EXEC_BASELINE_MEMORY_MB} MB per execution`
);
console.log(
  `Utilization:     ${(UTILIZATION * 100).toFixed(0)}% (${(EMPTY_CAPACITY_OVERHEAD * 100).toFixed(0)}% empty capacity overhead)`
);
console.log();

const results = [];

for (const hw of HARDWARE) {
  const instanceCostPerSec = hwCostPerSecond(hw);
  const execsPerInstance = Math.floor(
    hw.memoryMb / SECURE_EXEC_BASELINE_MEMORY_MB
  );
  const effectiveExecs = Math.floor(execsPerInstance * UTILIZATION);
  const costPerExecSec = instanceCostPerSec / effectiveExecs;
  const ratio = sandboxCostPerSec / costPerExecSec;

  results.push({
    key: hw.key,
    name: hw.name,
    arch: hw.arch,
    instanceCostPerSec,
    execsPerInstance,
    effectiveExecs,
    costPerExecSec,
    ratio,
    source: hw.source,
    asOf: hw.asOf,
  });

  const priceLabel = hw.costPerHour
    ? `$${hw.costPerHour}/hr`
    : `€${hw.costPerMonthEur}/mo`;

  console.log(`--- ${hw.name} ---`);
  console.log(
    `  Instance cost:    $${instanceCostPerSec.toExponential(4)}/s (${priceLabel})`
  );
  console.log(
    `  Executions/inst:  ${execsPerInstance} (effective @ ${(UTILIZATION * 100).toFixed(0)}%: ${effectiveExecs})`
  );
  console.log(`  Cost/exec-sec:    $${costPerExecSec.toExponential(4)}`);
  console.log(`  vs sandbox:       ${ratio.toFixed(1)}× cheaper`);
  console.log(`  Source:           ${hw.source} (as of ${hw.asOf})`);
  console.log();
}

// Summary table
console.log("=== Summary table ===");
console.log(
  "Provider".padEnd(38),
  "$/exec-second".padEnd(18),
  "vs Sandbox"
);
console.log("-".repeat(72));
console.log(
  SANDBOX.name.padEnd(38),
  `$${sandboxCostPerSec.toExponential(4)}`.padEnd(18),
  "baseline"
);
for (const r of results) {
  console.log(
    r.name.padEnd(38),
    `$${r.costPerExecSec.toExponential(4)}`.padEnd(18),
    `${r.ratio.toFixed(1)}× cheaper`
  );
}
