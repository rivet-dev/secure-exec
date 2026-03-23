/**
 * Generate a conformance report from expectations.json and vendored test files.
 *
 * Produces:
 *   - conformance-report.json  (structured test results)
 *   - docs/conformance-report.mdx (publishable MDX report page)
 *
 * Usage:
 *   pnpm tsx packages/secure-exec/tests/node-conformance/scripts/generate-report.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { minimatch } from "minimatch";

const CONFORMANCE_DIR = path.resolve(import.meta.dirname, "..");
const PARALLEL_DIR = path.join(CONFORMANCE_DIR, "parallel");
const EXPECTATIONS_PATH = path.join(CONFORMANCE_DIR, "expectations.json");
const REPORT_JSON_PATH = path.join(CONFORMANCE_DIR, "conformance-report.json");

// Resolve docs/ relative to the repo root (4 levels up from node-conformance/)
const REPO_ROOT = path.resolve(CONFORMANCE_DIR, "../../../..");
const REPORT_MDX_PATH = path.join(REPO_ROOT, "docs", "conformance-report.mdx");

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

interface ReportData {
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
	expectationsByCategory: Record<string, { key: string; reason: string; expected: string; issue?: string }[]>;
}

// Extract module name from test filename (same logic as runner.test.ts)
function extractModuleName(filename: string): string {
	const base = filename.replace(/^test-/, "").replace(/\.js$/, "");
	const firstSegment = base.split("-")[0];
	return firstSegment ?? "other";
}

// Resolve expectation for a test file (same logic as runner.test.ts)
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

function main(): void {
	if (!fs.existsSync(EXPECTATIONS_PATH)) {
		console.error(`expectations.json not found at ${EXPECTATIONS_PATH}`);
		process.exit(1);
	}
	if (!fs.existsSync(PARALLEL_DIR)) {
		console.error(
			`parallel/ directory not found at ${PARALLEL_DIR} — run import-tests.ts first`,
		);
		process.exit(1);
	}

	const expectationsFile: ExpectationsFile = JSON.parse(
		fs.readFileSync(EXPECTATIONS_PATH, "utf-8"),
	);
	const { expectations } = expectationsFile;

	// Discover test files
	const testFiles = fs
		.readdirSync(PARALLEL_DIR)
		.filter((f) => f.startsWith("test-") && f.endsWith(".js"))
		.sort();

	// Classify each test
	const modules = new Map<string, ModuleStats>();
	const expectationsByCategory = new Map<
		string,
		{ key: string; reason: string; expected: string; issue?: string }[]
	>();

	let totalPass = 0;
	let totalVacuousPass = 0;
	let totalFail = 0;
	let totalSkip = 0;

	for (const file of testFiles) {
		const moduleName = extractModuleName(file);
		if (!modules.has(moduleName)) {
			modules.set(moduleName, { total: 0, pass: 0, vacuousPass: 0, fail: 0, skip: 0 });
		}
		const stats = modules.get(moduleName)!;
		stats.total++;

		const expectation = resolveExpectation(file, expectations);

		if (!expectation || expectation.expected === "pass") {
			stats.pass++;
			totalPass++;

			// Track vacuous passes separately
			if (expectation?.category === "vacuous-skip") {
				stats.vacuousPass++;
				totalVacuousPass++;

				const cat = expectation.category;
				if (!expectationsByCategory.has(cat)) {
					expectationsByCategory.set(cat, []);
				}
				expectationsByCategory.get(cat)!.push({
					key: expectation.matchedKey,
					reason: expectation.reason,
					expected: "pass",
					issue: expectation.issue,
				});
			}
		} else if (expectation.expected === "skip") {
			stats.skip++;
			totalSkip++;

			const cat = expectation.category;
			if (!expectationsByCategory.has(cat)) {
				expectationsByCategory.set(cat, []);
			}
			expectationsByCategory.get(cat)!.push({
				key: expectation.matchedKey,
				reason: expectation.reason,
				expected: "skip",
				issue: expectation.issue,
			});
		} else {
			// fail
			stats.fail++;
			totalFail++;

			const cat = expectation.category;
			if (!expectationsByCategory.has(cat)) {
				expectationsByCategory.set(cat, []);
			}
			expectationsByCategory.get(cat)!.push({
				key: expectation.matchedKey,
				reason: expectation.reason,
				expected: "fail",
				issue: expectation.issue,
			});
		}
	}

	const total = testFiles.length;
	const totalGenuinePass = totalPass - totalVacuousPass;
	const passRate =
		total > 0 ? ((totalPass / total) * 100).toFixed(1) : "0.0";
	const genuinePassRate =
		total > 0 ? ((totalGenuinePass / total) * 100).toFixed(1) : "0.0";

	const generatedAt = new Date().toISOString().split("T")[0];

	// Build sorted modules object
	const sortedModules: Record<string, ModuleStats> = {};
	for (const [name, stats] of [...modules.entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		sortedModules[name] = stats;
	}

	// Deduplicate expectations by category (glob patterns appear once)
	const dedupedByCategory: Record<
		string,
		{ key: string; reason: string; expected: string; issue?: string }[]
	> = {};
	for (const [cat, entries] of [...expectationsByCategory.entries()].sort(
		(a, b) => a[0].localeCompare(b[0]),
	)) {
		const seen = new Set<string>();
		const unique: typeof entries = [];
		for (const entry of entries) {
			if (!seen.has(entry.key)) {
				seen.add(entry.key);
				unique.push(entry);
			}
		}
		dedupedByCategory[cat] = unique;
	}

	const report: ReportData = {
		nodeVersion: expectationsFile.nodeVersion,
		sourceCommit: expectationsFile.sourceCommit,
		lastUpdated: expectationsFile.lastUpdated,
		generatedAt,
		summary: {
			total,
			pass: totalPass,
			genuinePass: totalGenuinePass,
			vacuousPass: totalVacuousPass,
			fail: totalFail,
			skip: totalSkip,
			passRate: `${passRate}%`,
			genuinePassRate: `${genuinePassRate}%`,
		},
		modules: sortedModules,
		expectationsByCategory: dedupedByCategory,
	};

	// Write JSON report
	fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, "\t") + "\n");
	console.log(`Wrote ${REPORT_JSON_PATH}`);

	// Generate MDX report
	const mdx = generateMdx(report);
	fs.mkdirSync(path.dirname(REPORT_MDX_PATH), { recursive: true });
	fs.writeFileSync(REPORT_MDX_PATH, mdx);
	console.log(`Wrote ${REPORT_MDX_PATH}`);
}

function generateMdx(report: ReportData): string {
	const lines: string[] = [];

	// Frontmatter (must be first in file for Mintlify)
	lines.push("---");
	lines.push("title: Node.js Conformance Report");
	lines.push("description: Per-module pass rates from running the upstream Node.js test suite against secure-exec.");
	lines.push('icon: "clipboard-check"');
	lines.push("---");
	lines.push("");

	// Auto-generated header
	lines.push("{/* Auto-generated by generate-report.ts — do not edit manually */}");
	lines.push("");

	// Summary table
	lines.push("## Summary");
	lines.push("");
	lines.push("| Metric | Value |");
	lines.push("| --- | --- |");
	lines.push(`| Node.js Version | ${report.nodeVersion} |`);
	lines.push(`| Total Tests | ${report.summary.total} |`);
	lines.push(`| Genuine Passing | ${report.summary.genuinePass} (${report.summary.genuinePassRate}) |`);
	lines.push(`| Vacuous Passing | ${report.summary.vacuousPass} (tests self-skip without exercising functionality) |`);
	lines.push(`| Total Passing | ${report.summary.pass} (${report.summary.passRate}) |`);
	lines.push(`| Expected Fail | ${report.summary.fail} |`);
	lines.push(`| Skipped (hang/crash) | ${report.summary.skip} |`);
	lines.push(`| Last Updated | ${report.generatedAt} |`);
	lines.push("");

	// Per-module breakdown
	lines.push("## Per-Module Breakdown");
	lines.push("");
	lines.push("| Module | Total | Genuine Pass | Vacuous Pass | Fail | Skip | Genuine Pass Rate |");
	lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");

	for (const [name, stats] of Object.entries(report.modules)) {
		const genuinePass = stats.pass - stats.vacuousPass;
		const rate =
			stats.total > 0
				? ((genuinePass / stats.total) * 100).toFixed(1)
				: "0.0";
		lines.push(
			`| ${name} | ${stats.total} | ${genuinePass} | ${stats.vacuousPass} | ${stats.fail} | ${stats.skip} | ${rate}% |`,
		);
	}
	lines.push("");

	// Expectations by category
	lines.push("## Expectations by Category");
	lines.push("");

	const categoryLabels: Record<string, string> = {
		"unsupported-module": "Unsupported Module",
		"unsupported-api": "Unsupported API",
		"implementation-gap": "Implementation Gap",
		"security-constraint": "Security Constraint",
		"requires-v8-flags": "Requires V8 Flags",
		"requires-exec-path": "Requires execPath / argv[0]",
		"native-addon": "Native Addon",
		"platform-specific": "Platform Specific",
		"test-infra": "Test Infrastructure",
		"vacuous-skip": "Vacuous Self-Skip",
	};

	for (const [category, entries] of Object.entries(
		report.expectationsByCategory,
	)) {
		const label = categoryLabels[category] ?? category;
		lines.push(`### ${label}`);
		lines.push("");
		lines.push(`${entries.length} expectation(s).`);
		lines.push("");

		// Show a condensed list — glob patterns first, then individual files
		const globs = entries.filter((e) => e.key.includes("*"));
		const individual = entries.filter((e) => !e.key.includes("*"));

		if (globs.length > 0) {
			lines.push("**Glob patterns:**");
			lines.push("");
			for (const g of globs) {
				lines.push(`- \`${g.key}\` — ${g.reason}`);
			}
			lines.push("");
		}

		if (individual.length > 0 && individual.length <= 20) {
			lines.push("**Individual tests:**");
			lines.push("");
			for (const e of individual) {
				lines.push(`- \`${e.key}\` — ${e.reason}`);
			}
			lines.push("");
		} else if (individual.length > 20) {
			lines.push(
				`**Individual tests:** ${individual.length} test(s) — see expectations.json for full list.`,
			);
			lines.push("");
		}
	}

	// Implementation gaps with issue links
	const trackedEntries: { key: string; reason: string; issue?: string }[] = [];
	for (const entries of Object.values(report.expectationsByCategory)) {
		for (const e of entries) {
			if (e.issue) {
				trackedEntries.push(e);
			}
		}
	}

	if (trackedEntries.length > 0) {
		lines.push("## Tracked Implementation Gaps");
		lines.push("");
		lines.push(
			"These expectations have linked GitHub issues for tracking progress.",
		);
		lines.push("");
		lines.push("| Test | Reason | Tracking Issue |");
		lines.push("| --- | --- | --- |");

		for (const e of trackedEntries) {
			const issueLabel = e.issue!.replace(
				/.*\/issues\/(\d+)$/,
				"#$1",
			);
			lines.push(`| \`${e.key}\` | ${e.reason} | [${issueLabel}](${e.issue}) |`);
		}
		lines.push("");
	}

	return lines.join("\n") + "\n";
}

main();
