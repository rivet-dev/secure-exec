/**
 * Import upstream Node.js test/parallel/ suite into the conformance directory.
 *
 * Usage:
 *   pnpm tsx packages/secure-exec/tests/node-conformance/scripts/import-tests.ts --node-version 22.14.0
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const CONFORMANCE_DIR = path.resolve(import.meta.dirname, "..");
const PARALLEL_DIR = path.join(CONFORMANCE_DIR, "parallel");
const FIXTURES_DIR = path.join(CONFORMANCE_DIR, "fixtures");
const EXPECTATIONS_PATH = path.join(CONFORMANCE_DIR, "expectations.json");
const CACHE_DIR = path.join(CONFORMANCE_DIR, ".cache");

function parseArgs(): { nodeVersion: string } {
	const args = process.argv.slice(2);
	const idx = args.indexOf("--node-version");
	if (idx === -1 || idx + 1 >= args.length) {
		console.error("Usage: import-tests.ts --node-version <version>");
		console.error("Example: import-tests.ts --node-version 22.14.0");
		process.exit(1);
	}
	const nodeVersion = args[idx + 1];
	if (!/^\d+\.\d+\.\d+$/.test(nodeVersion)) {
		console.error(`Invalid version format: ${nodeVersion} (expected X.Y.Z)`);
		process.exit(1);
	}
	return { nodeVersion };
}

function downloadTarball(version: string): string {
	const url = `https://nodejs.org/dist/v${version}/node-v${version}.tar.gz`;
	const tarballPath = path.join(CACHE_DIR, `node-v${version}.tar.gz`);

	if (fs.existsSync(tarballPath)) {
		console.log(`Using cached tarball: ${tarballPath}`);
		return tarballPath;
	}

	fs.mkdirSync(CACHE_DIR, { recursive: true });
	console.log(`Downloading ${url}...`);
	execSync(`curl -fSL -o "${tarballPath}" "${url}"`, { stdio: "inherit" });
	console.log(`Downloaded to ${tarballPath}`);
	return tarballPath;
}

function extractTests(tarballPath: string, version: string): void {
	const prefix = `node-v${version}`;

	// Clean existing vendored files
	if (fs.existsSync(PARALLEL_DIR)) {
		for (const entry of fs.readdirSync(PARALLEL_DIR)) {
			if (entry === ".gitkeep") continue;
			fs.rmSync(path.join(PARALLEL_DIR, entry), { recursive: true });
		}
	}
	if (fs.existsSync(FIXTURES_DIR)) {
		for (const entry of fs.readdirSync(FIXTURES_DIR)) {
			if (entry === ".gitkeep") continue;
			fs.rmSync(path.join(FIXTURES_DIR, entry), { recursive: true });
		}
	}

	fs.mkdirSync(PARALLEL_DIR, { recursive: true });
	fs.mkdirSync(FIXTURES_DIR, { recursive: true });

	// Extract test/parallel/ files
	console.log("Extracting test/parallel/...");
	execSync(
		`tar xzf "${tarballPath}" --strip-components=3 -C "${PARALLEL_DIR}" "${prefix}/test/parallel/"`,
		{ stdio: "inherit" },
	);

	// Extract test/fixtures/ files
	console.log("Extracting test/fixtures/...");
	execSync(
		`tar xzf "${tarballPath}" --strip-components=3 -C "${FIXTURES_DIR}" "${prefix}/test/fixtures/"`,
		{ stdio: "inherit" },
	);

	// Count extracted files
	const parallelCount = countFiles(PARALLEL_DIR);
	const fixturesCount = countFiles(FIXTURES_DIR);
	console.log(
		`Extracted ${parallelCount} files in parallel/, ${fixturesCount} files in fixtures/`,
	);
}

function countFiles(dir: string): number {
	let count = 0;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === ".gitkeep") continue;
		if (entry.isDirectory()) {
			count += countFiles(path.join(dir, entry.name));
		} else {
			count++;
		}
	}
	return count;
}

function getSourceCommit(tarballPath: string, version: string): string {
	// Try to extract the git commit from the tarball's BUILDING.md or configure script
	const prefix = `node-v${version}`;
	try {
		// The source tarball doesn't embed a commit hash directly.
		// Use the version tag as the reference instead.
		return `v${version}`;
	} catch {
		return `v${version}`;
	}
}

function updateExpectations(version: string, sourceCommit: string): void {
	const expectations = JSON.parse(fs.readFileSync(EXPECTATIONS_PATH, "utf-8"));
	expectations.nodeVersion = version;
	expectations.sourceCommit = sourceCommit;
	expectations.lastUpdated = new Date().toISOString().split("T")[0];
	fs.writeFileSync(EXPECTATIONS_PATH, JSON.stringify(expectations, null, "\t") + "\n");
	console.log(`Updated expectations.json: nodeVersion=${version}, sourceCommit=${sourceCommit}`);
}

function main(): void {
	const { nodeVersion } = parseArgs();

	console.log(`Importing Node.js v${nodeVersion} test suite...\n`);

	const tarballPath = downloadTarball(nodeVersion);
	extractTests(tarballPath, nodeVersion);

	const sourceCommit = getSourceCommit(tarballPath, nodeVersion);
	updateExpectations(nodeVersion, sourceCommit);

	console.log("\nImport complete!");
	console.log("Next steps:");
	console.log("  1. Run the conformance test runner to identify failures");
	console.log("  2. Triage failures into expectations.json");
}

main();
