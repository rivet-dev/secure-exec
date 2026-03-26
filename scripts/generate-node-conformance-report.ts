#!/usr/bin/env -S npx tsx
/**
 * Generates Node.js conformance report JSON and docs page from expectations.json.
 *
 * This is a static analysis script — it reads expectations.json and the test file
 * list to compute pass/fail/skip counts without running any tests. To update the
 * actual test results, run the conformance suite first:
 *   pnpm vitest run packages/secure-exec/tests/node-conformance/runner.test.ts
 *
 * Usage: pnpm tsx scripts/generate-node-conformance-report.ts
 *   --expectations packages/secure-exec/tests/node-conformance/expectations.json
 *   --parallel-dir packages/secure-exec/tests/node-conformance/parallel
 *   --json-output packages/secure-exec/tests/node-conformance/conformance-report.json
 *   --docs-output docs/nodejs-conformance-report.mdx
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { minimatch } from "minimatch";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── CLI args ────────────────────────────────────────────────────────────

const { values } = parseArgs({
	options: {
		expectations: {
			type: "string",
			default: resolve(
				ROOT,
				"packages/secure-exec/tests/node-conformance/expectations.json",
			),
		},
		"parallel-dir": {
			type: "string",
			default: resolve(
				ROOT,
				"packages/secure-exec/tests/node-conformance/parallel",
			),
		},
		"json-output": {
			type: "string",
			default: resolve(
				ROOT,
				"packages/secure-exec/tests/node-conformance/conformance-report.json",
			),
		},
		"docs-output": {
			type: "string",
			default: resolve(ROOT, "docs/nodejs-conformance-report.mdx"),
		},
	},
});

const expectationsPath = resolve(values.expectations!);
const parallelDir = resolve(values["parallel-dir"]!);
const jsonOutputPath = resolve(values["json-output"]!);
const docsOutputPath = resolve(values["docs-output"]!);

// ── Types ───────────────────────────────────────────────────────────────

interface ExpectationEntry {
	expected: "skip" | "fail" | "pass";
	reason: string;
	category: string;
	glob?: boolean;
	issue?: string;
}

interface ExpectationsFile {
	nodeVersion: string;
	sourceCommit: string;
	lastUpdated: string;
	expectations: Record<string, ExpectationEntry>;
}

interface ModuleStats {
	total: number;
	pass: number;
	vacuousPass: number;
	fail: number;
	skip: number;
}

interface ConformanceReport {
	nodeVersion: string;
	sourceCommit: string;
	lastUpdated: string;
	generatedAt: string;
	summary: {
		total: number;
		pass: number;
		genuinePass: number;
		vacuousPass: number;
		fail: number;
		skip: number;
		passRate: string;
		genuinePassRate: string;
	};
	modules: Record<string, ModuleStats>;
	categories: Record<string, number>;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function extractModuleName(filename: string): string {
	const base = filename.replace(/^test-/, "").replace(/\.js$/, "");
	return base.split("-")[0] ?? "other";
}

function resolveExpectation(
	filename: string,
	expectations: Record<string, ExpectationEntry>,
): (ExpectationEntry & { matchedKey: string }) | null {
	if (expectations[filename]) {
		return { ...expectations[filename], matchedKey: filename };
	}
	for (const [key, entry] of Object.entries(expectations)) {
		if (entry.glob && minimatch(filename, key)) {
			return { ...entry, matchedKey: key };
		}
	}
	return null;
}

// ── Load data ───────────────────────────────────────────────────────────

const expectationsData: ExpectationsFile = JSON.parse(
	readFileSync(expectationsPath, "utf-8"),
);

let testFiles: string[];
try {
	testFiles = readdirSync(parallelDir)
		.filter((name) => name.startsWith("test-") && name.endsWith(".js"))
		.sort();
} catch {
	console.error(`No test files found in ${parallelDir}`);
	process.exit(1);
}

// ── Classify each test ──────────────────────────────────────────────────

const modules = new Map<string, ModuleStats>();
const categories = new Map<string, number>();
let totalPass = 0;
let genuinePass = 0;
let vacuousPass = 0;
let totalFail = 0;
let totalSkip = 0;

for (const file of testFiles) {
	const mod = extractModuleName(file);
	if (!modules.has(mod)) {
		modules.set(mod, { total: 0, pass: 0, vacuousPass: 0, fail: 0, skip: 0 });
	}
	const stats = modules.get(mod)!;
	stats.total++;

	const exp = resolveExpectation(file, expectationsData.expectations);

	if (exp?.expected === "skip") {
		stats.skip++;
		totalSkip++;
		categories.set(
			exp.category,
			(categories.get(exp.category) ?? 0) + 1,
		);
	} else if (exp?.expected === "fail") {
		stats.fail++;
		totalFail++;
		categories.set(
			exp.category,
			(categories.get(exp.category) ?? 0) + 1,
		);
	} else if (
		exp?.expected === "pass" &&
		exp.category === "vacuous-skip"
	) {
		stats.pass++;
		stats.vacuousPass++;
		totalPass++;
		vacuousPass++;
		categories.set("vacuous-skip", (categories.get("vacuous-skip") ?? 0) + 1);
	} else {
		// No expectation or pass override → genuine pass
		stats.pass++;
		totalPass++;
		genuinePass++;
	}
}

const total = testFiles.length;
const passRate = total > 0 ? ((totalPass / total) * 100).toFixed(1) + "%" : "0%";
const genuinePassRate =
	total > 0 ? ((genuinePass / total) * 100).toFixed(1) + "%" : "0%";

// ── Build JSON report ───────────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];

const report: ConformanceReport = {
	nodeVersion: expectationsData.nodeVersion,
	sourceCommit: expectationsData.sourceCommit,
	lastUpdated: today,
	generatedAt: today,
	summary: {
		total,
		pass: totalPass,
		genuinePass,
		vacuousPass,
		fail: totalFail,
		skip: totalSkip,
		passRate,
		genuinePassRate,
	},
	modules: Object.fromEntries(
		[...modules.entries()].sort(([a], [b]) => a.localeCompare(b)),
	),
	categories: Object.fromEntries(
		[...categories.entries()].sort(([a], [b]) => a.localeCompare(b)),
	),
};

writeFileSync(jsonOutputPath, JSON.stringify(report, null, 2) + "\n", "utf-8");

// ── Build MDX docs page ─────────────────────────────────────────────────

const lines: string[] = [];
function line(s = "") {
	lines.push(s);
}

// Frontmatter
line("---");
line("title: Node.js Conformance Report");
line(
	"description: Node.js v22 test/parallel/ conformance results for the secure-exec sandbox.",
);
line('icon: "chart-bar"');
line("---");
line();
line(
	"{/* AUTO-GENERATED — do not edit. Run: pnpm tsx scripts/generate-node-conformance-report.ts */}",
);
line();

// Summary
line("## Summary");
line();
line("| Metric | Value |");
line("| --- | --- |");
line(`| Node.js version | ${report.nodeVersion} |`);
line(`| Source | ${report.sourceCommit} (test/parallel/) |`);
line(`| Total tests | ${total} |`);
line(`| Passing (genuine) | ${genuinePass} (${genuinePassRate}) |`);
line(`| Passing (vacuous self-skip) | ${vacuousPass} |`);
line(`| Passing (total) | ${totalPass} (${passRate}) |`);
line(`| Expected fail | ${totalFail} |`);
line(`| Skip | ${totalSkip} |`);
line(`| Last updated | ${today} |`);
line();

// Category breakdown
line("## Failure Categories");
line();
line("| Category | Tests |");
line("| --- | --- |");
const sortedCats = [...categories.entries()].sort(([, a], [, b]) => b - a);
for (const [cat, count] of sortedCats) {
	line(`| ${cat} | ${count} |`);
}
line();

// Per-module table
line("## Per-Module Results");
line();
line("| Module | Total | Pass | Fail | Skip | Pass Rate |");
line("| --- | --- | --- | --- | --- | --- |");

const sortedModules = [...modules.entries()].sort(([a], [b]) =>
	a.localeCompare(b),
);
for (const [mod, stats] of sortedModules) {
	const runnable = stats.total - stats.skip;
	const rate =
		runnable > 0 ? `${((stats.pass / runnable) * 100).toFixed(1)}%` : "—";
	const passStr =
		stats.vacuousPass > 0
			? `${stats.pass} (${stats.vacuousPass} vacuous)`
			: `${stats.pass}`;
	line(
		`| ${mod} | ${stats.total} | ${passStr} | ${stats.fail} | ${stats.skip} | ${rate} |`,
	);
}

// Totals row
const runnableTotal = total - totalSkip;
const totalRate =
	runnableTotal > 0
		? `${((totalPass / runnableTotal) * 100).toFixed(1)}%`
		: "—";
line(
	`| **Total** | **${total}** | **${totalPass}** | **${totalFail}** | **${totalSkip}** | **${totalRate}** |`,
);
line();

// Expectations detail — group by category
line("## Expectations Detail");
line();

// Collect all non-glob individual expectations
const byCategory = new Map<string, { key: string; entry: ExpectationEntry }[]>();
for (const [key, entry] of Object.entries(expectationsData.expectations)) {
	const cat = entry.category;
	if (!byCategory.has(cat)) byCategory.set(cat, []);
	byCategory.get(cat)!.push({ key, entry });
}

const categoryOrder = [
	"implementation-gap",
	"unsupported-module",
	"unsupported-api",
	"requires-v8-flags",
	"requires-exec-path",
	"security-constraint",
	"test-infra",
	"native-addon",
	"platform-specific",
	"vacuous-skip",
];

for (const cat of categoryOrder) {
	const entries = byCategory.get(cat);
	if (!entries || entries.length === 0) continue;

	// Separate globs from individual entries
	const globs = entries.filter((e) => e.entry.glob);
	const individual = entries.filter((e) => !e.entry.glob);

	line(`### ${cat} (${entries.length} entries)`);
	line();

	if (globs.length > 0) {
		line("**Glob patterns:**");
		line();
		for (const { key, entry } of globs) {
			line(`- \`${key}\` — ${entry.reason}`);
		}
		line();
	}

	if (individual.length > 0 && individual.length <= 200) {
		line(
			`<details><summary>${individual.length} individual test${individual.length === 1 ? "" : "s"}</summary>`,
		);
		line();
		line("| Test | Reason |");
		line("| --- | --- |");
		for (const { key, entry } of individual) {
			line(`| \`${key}\` | ${entry.reason} |`);
		}
		line();
		line("</details>");
		line();
	} else if (individual.length > 200) {
		line(
			`*${individual.length} individual tests — see expectations.json for full list.*`,
		);
		line();
	}
}

// Write docs
const mdx = lines.join("\n");
writeFileSync(docsOutputPath, mdx, "utf-8");

// ── Summary output ──────────────────────────────────────────────────────

console.log("Node.js Conformance Report generated");
console.log(`  Expectations: ${expectationsPath}`);
console.log(`  JSON output:  ${jsonOutputPath}`);
console.log(`  Docs output:  ${docsOutputPath}`);
console.log(
	`  Summary:      ${genuinePass}/${total} genuine pass (${genuinePassRate}), ${totalPass}/${total} total (${passRate})`,
);
