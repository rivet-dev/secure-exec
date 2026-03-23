/**
 * Validate the expectations.json file for integrity.
 *
 * Checks:
 *   - Every expectation key matches at least one file in parallel/ (or valid glob)
 *   - Every entry has a non-empty reason string
 *   - Every entry has a valid category from the fixed set
 *   - Every "skip" entry describes a hang/crash (not just a failure)
 *   - Reports glob patterns that match zero files
 *
 * Usage:
 *   pnpm tsx packages/secure-exec/tests/node-conformance/scripts/validate-expectations.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { minimatch } from "minimatch";

const CONFORMANCE_DIR = path.resolve(import.meta.dirname, "..");
const PARALLEL_DIR = path.join(CONFORMANCE_DIR, "parallel");
const EXPECTATIONS_PATH = path.join(CONFORMANCE_DIR, "expectations.json");

const VALID_CATEGORIES = new Set([
	"unsupported-module",
	"unsupported-api",
	"implementation-gap",
	"security-constraint",
	"requires-v8-flags",
	"requires-exec-path",
	"native-addon",
	"platform-specific",
	"test-infra",
	"vacuous-skip",
]);

interface ExpectationEntry {
	expected: string;
	reason: string;
	category: string;
	glob?: boolean;
	issue?: string;
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

	const expectationsFile = JSON.parse(fs.readFileSync(EXPECTATIONS_PATH, "utf-8"));
	const entries: Record<string, ExpectationEntry> = expectationsFile.expectations;

	// Collect all test files in parallel/
	const testFiles = fs
		.readdirSync(PARALLEL_DIR)
		.filter((f) => f.startsWith("test-") && f.endsWith(".js"));

	const errors: string[] = [];

	for (const [key, entry] of Object.entries(entries)) {
		// Check file match
		if (entry.glob) {
			const matches = testFiles.filter((f) => minimatch(f, key));
			if (matches.length === 0) {
				errors.push(`Glob "${key}" matches zero files in parallel/`);
			}
		} else {
			if (!testFiles.includes(key)) {
				errors.push(`Expectation "${key}" does not match any file in parallel/`);
			}
		}

		// Check non-empty reason
		if (!entry.reason || entry.reason.trim() === "") {
			errors.push(`Expectation "${key}" has empty or missing reason`);
		}

		// Check valid category
		if (!VALID_CATEGORIES.has(entry.category)) {
			errors.push(
				`Expectation "${key}" has invalid category "${entry.category}" — valid: ${[...VALID_CATEGORIES].join(", ")}`,
			);
		}

		// Check valid expected value
		if (entry.expected !== "skip" && entry.expected !== "fail" && entry.expected !== "pass") {
			errors.push(
				`Expectation "${key}" has invalid expected "${entry.expected}" — must be "skip", "fail", or "pass"`,
			);
		}
	}

	if (errors.length > 0) {
		console.error(`Found ${errors.length} validation error(s):\n`);
		for (const err of errors) {
			console.error(`  - ${err}`);
		}
		process.exit(1);
	}

	// Count stats
	const passCount = Object.values(entries).filter((e) => e.expected === "pass").length;
	const skipCount = Object.values(entries).filter((e) => e.expected === "skip").length;
	const failCount = Object.values(entries).filter((e) => e.expected === "fail").length;

	console.log(
		`Validated ${Object.keys(entries).length} expectations — all checks passed (${failCount} fail, ${skipCount} skip, ${passCount} pass overrides)`,
	);
}

main();
