import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minimatch } from "minimatch";
import { describe, expect, it } from "vitest";
import {
	allowAll,
	createInMemoryFileSystem,
	createNodeDriver,
	NodeRuntime,
} from "../../src/index.js";
import { createTestNodeRuntime } from "../test-utils.js";

const TEST_TIMEOUT_MS = 30_000;

const CONFORMANCE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PARALLEL_DIR = path.join(CONFORMANCE_ROOT, "parallel");
const COMMON_DIR = path.join(CONFORMANCE_ROOT, "common");
const FIXTURES_DIR = path.join(CONFORMANCE_ROOT, "fixtures");

// Valid expectation categories
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

// Expectation entry shape
// "pass" overrides a glob pattern for tests that actually pass
type ExpectationEntry = {
	expected: "skip" | "fail" | "pass";
	reason: string;
	category: string;
	glob?: boolean;
	issue?: string;
};

type ExpectationsFile = {
	nodeVersion: string;
	sourceCommit: string;
	lastUpdated: string;
	expectations: Record<string, ExpectationEntry>;
};

// Resolved expectation with the matched key for reporting
type ResolvedExpectation = ExpectationEntry & { matchedKey: string };

// Extract module name from test filename for grouping
// e.g. test-buffer-alloc.js -> buffer, test-path-resolve.js -> path
function extractModuleName(filename: string): string {
	const base = filename.replace(/^test-/, "").replace(/\.js$/, "");
	const firstSegment = base.split("-")[0];
	return firstSegment ?? "other";
}

// Load common shim files from disk (these run inside the sandbox VFS)
async function loadCommonFiles(): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	const entries = await readdir(COMMON_DIR);
	for (const entry of entries) {
		if (entry.endsWith(".js")) {
			const content = await readFile(path.join(COMMON_DIR, entry), "utf8");
			files.set(`/test/common/${entry}`, content);
		}
	}
	return files;
}

// Recursively load fixture files from disk into VFS paths
async function loadFixtureFiles(): Promise<Map<string, Uint8Array>> {
	const files = new Map<string, Uint8Array>();

	async function walk(dir: string, vfsBase: string): Promise<void> {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return; // fixtures dir may be empty or not populated
		}
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			const vfsPath = `${vfsBase}/${entry.name}`;
			if (entry.isDirectory()) {
				await walk(fullPath, vfsPath);
			} else if (entry.isFile()) {
				const content = await readFile(fullPath);
				files.set(vfsPath, content);
			}
		}
	}

	await walk(FIXTURES_DIR, "/test/fixtures");
	return files;
}

// Discover all test-*.js files in the parallel directory
async function discoverTests(): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(PARALLEL_DIR);
	} catch {
		return [];
	}
	return entries
		.filter((name) => name.startsWith("test-") && name.endsWith(".js"))
		.sort();
}

// Resolve expectation for a given test filename
function resolveExpectation(
	filename: string,
	expectations: Record<string, ExpectationEntry>,
): ResolvedExpectation | null {
	// Direct match first
	if (expectations[filename]) {
		return { ...expectations[filename], matchedKey: filename };
	}

	// Glob patterns
	for (const [key, entry] of Object.entries(expectations)) {
		if (entry.glob && minimatch(filename, key)) {
			return { ...entry, matchedKey: key };
		}
	}

	return null;
}

// Load expectations
async function loadExpectations(): Promise<ExpectationsFile> {
	const content = await readFile(
		path.join(CONFORMANCE_ROOT, "expectations.json"),
		"utf8",
	);
	return JSON.parse(content) as ExpectationsFile;
}

// Run a single test file in the secure-exec sandbox
async function runTestInSandbox(
	testCode: string,
	testFilename: string,
	commonFiles: Map<string, string>,
	fixtureFiles: Map<string, Uint8Array>,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const fs = createInMemoryFileSystem();

	// Populate common/ shims
	for (const [vfsPath, content] of commonFiles) {
		await fs.writeFile(vfsPath, content);
	}

	// Populate fixtures/
	for (const [vfsPath, content] of fixtureFiles) {
		await fs.writeFile(vfsPath, content);
	}

	// Write the test file itself
	const testVfsPath = `/test/parallel/${testFilename}`;
	await fs.writeFile(testVfsPath, testCode);

	// Create /tmp for tmpdir.refresh()
	await fs.mkdir("/tmp/node-test");

	const capturedStdout: string[] = [];
	const capturedStderr: string[] = [];

	const runtime = createTestNodeRuntime({
		filesystem: fs,
		permissions: allowAll,
		onStdio: (event) => {
			if (event.channel === "stdout") {
				capturedStdout.push(event.message);
			} else {
				capturedStderr.push(event.message);
			}
		},
		processConfig: {
			cwd: "/test/parallel",
			env: {},
		},
	});

	try {
		const result = await runtime.exec(testCode, {
			filePath: testVfsPath,
			cwd: "/test/parallel",
			env: {},
		});

		const stdout = capturedStdout.join("\n") + (capturedStdout.length > 0 ? "\n" : "");
		const stderr = capturedStderr.join("\n") + (capturedStderr.length > 0 ? "\n" : "");

		return {
			code: result.code,
			stdout,
			stderr: stderr + (result.errorMessage ? `${result.errorMessage}\n` : ""),
		};
	} finally {
		runtime.dispose();
	}
}

// Group tests by module name for readable output
function groupByModule(
	testFiles: string[],
): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	for (const file of testFiles) {
		const module = extractModuleName(file);
		const list = groups.get(module) ?? [];
		list.push(file);
		groups.set(module, list);
	}
	// Sort groups by module name
	return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

// Main test suite
const testFiles = await discoverTests();
const expectationsData = await loadExpectations();
const commonFiles = await loadCommonFiles();

// Load fixtures once (may be large)
let fixtureFiles: Map<string, Uint8Array> | undefined;
async function getFixtureFiles(): Promise<Map<string, Uint8Array>> {
	if (!fixtureFiles) {
		fixtureFiles = await loadFixtureFiles();
	}
	return fixtureFiles;
}

const grouped = groupByModule(testFiles);

describe("node.js conformance tests", () => {
	it("discovers vendored test files", () => {
		// Skip if test files haven't been imported yet
		if (testFiles.length === 0) {
			return;
		}
		expect(testFiles.length).toBeGreaterThan(0);
	});

	if (testFiles.length === 0) {
		it.skip("no vendored tests found - run import-tests.ts first", () => {});
		return;
	}

	// Track vacuous passes for summary
	let vacuousPassCount = 0;
	let genuinePassCount = 0;

	for (const [moduleName, files] of grouped) {
		describe(`node/${moduleName}`, () => {
			for (const testFile of files) {
				const expectation = resolveExpectation(
					testFile,
					expectationsData.expectations,
				);

				if (expectation?.expected === "skip") {
					it.skip(`${testFile} (${expectation.reason})`, () => {});
					continue;
				}

				if (expectation?.expected === "fail") {
					// Execute expected-fail tests: if they pass, tell developer to remove expectation
					it(
						testFile,
						async () => {
							const testCode = await readFile(
								path.join(PARALLEL_DIR, testFile),
								"utf8",
							);
							const fixtures = await getFixtureFiles();
							const result = await runTestInSandbox(
								testCode,
								testFile,
								commonFiles,
								fixtures,
							);

							if (result.code === 0) {
								throw new Error(
									`Test ${testFile} now passes! Remove its expectation ` +
									`(matched key: "${expectation.matchedKey}") from expectations.json`,
								);
							}
							// Expected to fail — test passes (the failure is expected)
						},
						TEST_TIMEOUT_MS,
					);
					continue;
				}

				// Vacuous pass: test self-skips without exercising functionality
				if (expectation?.expected === "pass" && expectation.category === "vacuous-skip") {
					vacuousPassCount++;
					it(
						`${testFile} [vacuous self-skip]`,
						async () => {
							const testCode = await readFile(
								path.join(PARALLEL_DIR, testFile),
								"utf8",
							);
							const fixtures = await getFixtureFiles();
							const result = await runTestInSandbox(
								testCode,
								testFile,
								commonFiles,
								fixtures,
							);

							expect(
								result.code,
								`Vacuous test ${testFile} failed with exit code ${result.code}.\n` +
								`stdout: ${result.stdout.slice(0, 500)}\n` +
								`stderr: ${result.stderr.slice(0, 500)}`,
							).toBe(0);
						},
						TEST_TIMEOUT_MS,
					);
					continue;
				}

				// No expectation or pass override: genuine pass — must pass
				genuinePassCount++;
				it(
					testFile,
					async () => {
						const testCode = await readFile(
							path.join(PARALLEL_DIR, testFile),
							"utf8",
						);
						const fixtures = await getFixtureFiles();
						const result = await runTestInSandbox(
							testCode,
							testFile,
							commonFiles,
							fixtures,
						);

						expect(
							result.code,
							`Test ${testFile} failed with exit code ${result.code}.\n` +
							`stdout: ${result.stdout.slice(0, 500)}\n` +
							`stderr: ${result.stderr.slice(0, 500)}`,
						).toBe(0);
					},
					TEST_TIMEOUT_MS,
				);
			}
		});
	}
});
