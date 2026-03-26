import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
	createDefaultNetworkAdapter,
	createNodeDriver,
	NodeFileSystem,
	NodeRuntime,
} from "../src/index.js";
import { createTestNodeRuntime } from "./test-utils.js";

const execFileAsync = promisify(execFile);
const TEST_TIMEOUT_MS = 55_000;
const COMMAND_TIMEOUT_MS = 45_000;
const CACHE_READY_MARKER = ".ready";

const TESTS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(TESTS_ROOT, "..");
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");
const FIXTURES_ROOT = path.join(TESTS_ROOT, "projects");
const CACHE_ROOT = path.join(PACKAGE_ROOT, ".cache", "project-matrix");

const fixturePermissions = {
	...allowAllFs,
	...allowAllEnv,
	...allowAllNetwork,
};

type PackageManager = "pnpm" | "npm" | "bun" | "yarn";

type PassFixtureMetadata = {
	entry: string;
	expectation: "pass";
	packageManager?: PackageManager;
};

type FailFixtureMetadata = {
	entry: string;
	expectation: "fail";
	fail: {
		code: number;
		stderrIncludes: string;
	};
	packageManager?: PackageManager;
};

type FixtureMetadata = PassFixtureMetadata | FailFixtureMetadata;

type FixtureProject = {
	name: string;
	sourceDir: string;
	metadata: FixtureMetadata;
};

type PreparedFixture = {
	cacheHit: boolean;
	cacheKey: string;
	projectDir: string;
};

type ResultEnvelope = {
	code: number;
	stdout: string;
	stderr: string;
};

type CapturedConsoleEvent = {
	channel: "stdout" | "stderr";
	message: string;
};

function formatConsoleChannel(
	events: CapturedConsoleEvent[],
	channel: CapturedConsoleEvent["channel"],
): string {
	const lines = events
		.filter((event) => event.channel === channel)
		.map((event) => event.message);
	return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

function formatErrorOutput(errorMessage: string | undefined): string {
	if (!errorMessage) {
		return "";
	}
	return errorMessage.endsWith("\n") ? errorMessage : `${errorMessage}\n`;
}

const discoveredFixtures = await discoverFixtures();

describe("compatibility project matrix", () => {
	it("discovers at least one fixture project", () => {
		expect(discoveredFixtures.length).toBeGreaterThan(0);
	});

	it(
		"runs module-access-pass fixture in overlay mode with host node parity",
		async () => {
			const fixture = discoveredFixtures.find(
				(item) => item.name === "module-access-pass",
			);
			if (!fixture) {
				throw new Error('Fixture "module-access-pass" was not discovered');
			}

			const prepared = await prepareFixtureProject(fixture);
			const host = await runHostExecution(prepared.projectDir, fixture.metadata.entry);
			const sandbox = await runOverlaySandboxExecution(
				prepared.projectDir,
				fixture.metadata.entry,
			);

			expect(sandbox.code).toBe(host.code);
			expect(sandbox.stdout).toBe(host.stdout);
			expect(sandbox.stderr).toBe(host.stderr);
		},
		TEST_TIMEOUT_MS,
	);

	for (const fixture of discoveredFixtures) {
		it(
			`runs fixture ${fixture.name} in host node and secure-exec`,
			async () => {
				const firstPrepare = await prepareFixtureProject(fixture);
				const secondPrepare = await prepareFixtureProject(fixture);

				expect(secondPrepare.cacheKey).toBe(firstPrepare.cacheKey);
				expect(secondPrepare.cacheHit).toBe(true);

				const host = await runHostExecution(
					secondPrepare.projectDir,
					fixture.metadata.entry,
				);
				const sandbox = await runSandboxExecution(
					secondPrepare.projectDir,
					fixture.metadata.entry,
				);

				if (fixture.metadata.expectation === "pass") {
					expect(sandbox.code).toBe(host.code);
					expect(sandbox.stdout).toBe(host.stdout);
					expect(sandbox.stderr).toBe(host.stderr);
					return;
				}

				expect(host.code).toBe(0);
				expect(sandbox.code).toBe(fixture.metadata.fail.code);
				expect(sandbox.stderr).toContain(fixture.metadata.fail.stderrIncludes);
			},
			TEST_TIMEOUT_MS,
		);
	}
});

async function discoverFixtures(): Promise<FixtureProject[]> {
	// Get project directories and validate metadata before running tests.
	const entries = await readdir(FIXTURES_ROOT, { withFileTypes: true });
	const fixtureDirs = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));

	const fixtures: FixtureProject[] = [];
	for (const fixtureName of fixtureDirs) {
		const sourceDir = path.join(FIXTURES_ROOT, fixtureName);
		const metadataPath = path.join(sourceDir, "fixture.json");
		const metadataText = await readFile(metadataPath, "utf8");
		const parsed = JSON.parse(metadataText) as unknown;
		const metadata = parseFixtureMetadata(parsed, fixtureName);
		const entryPath = path.join(sourceDir, metadata.entry);
		await assertPathExists(
			entryPath,
			`Fixture "${fixtureName}" entry file not found: ${metadata.entry}`,
		);
		await assertPathExists(
			path.join(sourceDir, "package.json"),
			`Fixture "${fixtureName}" requires package.json`,
		);
		fixtures.push({
			name: fixtureName,
			sourceDir,
			metadata,
		});
	}

	return fixtures;
}

function parseFixtureMetadata(raw: unknown, fixtureName: string): FixtureMetadata {
	// Enforce a strict metadata schema with only pass/fail expectations.
	if (!isRecord(raw)) {
		throw new Error(`Fixture "${fixtureName}" metadata must be an object`);
	}
	if ("knownMismatch" in raw) {
		throw new Error(
			`Fixture "${fixtureName}" uses unsupported knownMismatch classification`,
		);
	}
	if ("sandboxEntry" in raw || "nodeEntry" in raw) {
		throw new Error(
			`Fixture "${fixtureName}" must use a single shared entry for both runtimes`,
		);
	}

	const allowedTopLevelKeys = new Set(["entry", "expectation", "fail", "packageManager"]);
	for (const key of Object.keys(raw)) {
		if (!allowedTopLevelKeys.has(key)) {
			throw new Error(
				`Fixture "${fixtureName}" has unsupported metadata key "${key}"`,
			);
		}
	}

	if (typeof raw.entry !== "string" || raw.entry.length === 0) {
		throw new Error(`Fixture "${fixtureName}" requires a non-empty entry`);
	}
	if (raw.expectation !== "pass" && raw.expectation !== "fail") {
		throw new Error(
			`Fixture "${fixtureName}" expectation must be "pass" or "fail"`,
		);
	}

	// Validate optional packageManager field.
	const validPackageManagers = new Set(["pnpm", "npm", "bun", "yarn"]);
	if (
		raw.packageManager !== undefined &&
		(typeof raw.packageManager !== "string" || !validPackageManagers.has(raw.packageManager))
	) {
		throw new Error(
			`Fixture "${fixtureName}" packageManager must be "pnpm", "npm", "bun", or "yarn"`,
		);
	}
	const packageManager = (raw.packageManager as PackageManager | undefined) ?? undefined;

	if (raw.expectation === "pass") {
		return {
			entry: raw.entry,
			expectation: "pass",
			...(packageManager && { packageManager }),
		};
	}

	if (!isRecord(raw.fail)) {
		throw new Error(
			`Fixture "${fixtureName}" with expectation "fail" requires a fail contract`,
		);
	}
	const failKeys = new Set(["code", "stderrIncludes"]);
	for (const key of Object.keys(raw.fail)) {
		if (!failKeys.has(key)) {
			throw new Error(
				`Fixture "${fixtureName}" fail contract has unsupported key "${key}"`,
			);
		}
	}

	if (typeof raw.fail.code !== "number") {
		throw new Error(
			`Fixture "${fixtureName}" fail contract requires numeric code`,
		);
	}
	if (
		typeof raw.fail.stderrIncludes !== "string" ||
		raw.fail.stderrIncludes.length === 0
	) {
		throw new Error(
			`Fixture "${fixtureName}" fail contract requires stderrIncludes`,
		);
	}

	return {
		entry: raw.entry,
		expectation: "fail",
		fail: {
			code: raw.fail.code,
			stderrIncludes: raw.fail.stderrIncludes,
		},
		...(packageManager && { packageManager }),
	};
}

async function prepareFixtureProject(fixture: FixtureProject): Promise<PreparedFixture> {
	// Set up cache roots and return ready entries immediately.
	await mkdir(CACHE_ROOT, { recursive: true });
	const cacheKey = await createFixtureCacheKey(fixture);
	const cacheDir = path.join(CACHE_ROOT, `${fixture.name}-${cacheKey}`);
	const readyMarkerPath = path.join(cacheDir, CACHE_READY_MARKER);
	if (await pathExists(readyMarkerPath)) {
		return {
			cacheHit: true,
			cacheKey,
			projectDir: cacheDir,
		};
	}

	// Reset stale cache entries that do not have a ready marker.
	if (await pathExists(cacheDir)) {
		await rm(cacheDir, { recursive: true, force: true });
	}

	// Prepare and install dependencies in a staging directory.
	const stagingDir = `${cacheDir}.tmp-${process.pid}-${Date.now()}`;
	await rm(stagingDir, { recursive: true, force: true });
	await cp(fixture.sourceDir, stagingDir, {
		recursive: true,
		filter: (source) => !isNodeModulesPath(source),
	});
	const pm = fixture.metadata.packageManager ?? "pnpm";
	const installCmd =
		pm === "npm"
			? { cmd: "npm", args: ["install", "--prefer-offline"] }
			: pm === "bun"
				? { cmd: "bun", args: ["install"] }
				: pm === "yarn"
					? await getYarnInstallCmd(stagingDir)
					: { cmd: "pnpm", args: ["install", "--ignore-workspace", "--prefer-offline"] };
	await execFileAsync(installCmd.cmd, installCmd.args, {
		cwd: stagingDir,
		timeout: COMMAND_TIMEOUT_MS,
		maxBuffer: 10 * 1024 * 1024,
		...(pm === "yarn" && { env: yarnEnv }),
	});
	await writeFile(
		path.join(stagingDir, CACHE_READY_MARKER),
		`${new Date().toISOString()}\n`,
	);

	// Promote the staging directory after install is complete.
	try {
		await rename(stagingDir, cacheDir);
	} catch (error) {
		const code =
			error && typeof error === "object" && "code" in error
				? String(error.code)
				: "";
		if (code !== "EEXIST") {
			throw error;
		}
		await rm(stagingDir, { recursive: true, force: true });
		if (!(await pathExists(readyMarkerPath))) {
			throw new Error(`Cache entry race produced missing ready marker: ${cacheDir}`);
		}
	}

	return {
		cacheHit: false,
		cacheKey,
		projectDir: cacheDir,
	};
}

async function createFixtureCacheKey(fixture: FixtureProject): Promise<string> {
	// Hash fixture files and install-affecting runtime/tool factors.
	const hash = createHash("sha256");
	const nodeMajor = process.versions.node.split(".")[0] ?? "0";
	const pm = fixture.metadata.packageManager ?? "pnpm";
	const pmVersion =
		pm === "npm"
			? await getNpmVersion()
			: pm === "bun"
				? await getBunVersion()
				: pm === "yarn"
					? await getYarnVersion()
					: await getPnpmVersion();
	hash.update(`node-major:${nodeMajor}\n`);
	hash.update(`pm:${pm}\n`);
	hash.update(`pm-version:${pmVersion}\n`);
	hash.update(`platform:${process.platform}\n`);
	hash.update(`arch:${process.arch}\n`);

	await hashOptionalFile(
		hash,
		"workspace-lock",
		path.join(WORKSPACE_ROOT, "pnpm-lock.yaml"),
	);
	await hashOptionalFile(
		hash,
		"workspace-package",
		path.join(WORKSPACE_ROOT, "package.json"),
	);
	await hashOptionalFile(
		hash,
		"fixture-package",
		path.join(fixture.sourceDir, "package.json"),
	);
	const lockFile =
		pm === "npm"
			? "package-lock.json"
			: pm === "bun"
				? "bun.lock"
				: pm === "yarn"
					? "yarn.lock"
					: "pnpm-lock.yaml";
	await hashOptionalFile(
		hash,
		"fixture-lock",
		path.join(fixture.sourceDir, lockFile),
	);

	const files = await listFixtureFiles(fixture.sourceDir);
	for (const relativePath of files) {
		const absolutePath = path.join(fixture.sourceDir, relativePath);
		const content = await readFile(absolutePath);
		hash.update(`fixture-file:${toPosixPath(relativePath)}\n`);
		hash.update(content);
		hash.update("\n");
	}

	return hash.digest("hex").slice(0, 16);
}

let pnpmVersionPromise: Promise<string> | undefined;

function getPnpmVersion(): Promise<string> {
	// Get pnpm version once so cache-key calculation stays stable.
	if (!pnpmVersionPromise) {
		pnpmVersionPromise = execFileAsync("pnpm", ["--version"], {
			cwd: WORKSPACE_ROOT,
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 1024 * 1024,
		}).then((result) => result.stdout.trim());
	}

	return pnpmVersionPromise;
}

let npmVersionPromise: Promise<string> | undefined;

function getNpmVersion(): Promise<string> {
	if (!npmVersionPromise) {
		npmVersionPromise = execFileAsync("npm", ["--version"], {
			cwd: WORKSPACE_ROOT,
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 1024 * 1024,
		}).then((result) => result.stdout.trim());
	}

	return npmVersionPromise;
}

let bunVersionPromise: Promise<string> | undefined;

function getBunVersion(): Promise<string> {
	if (!bunVersionPromise) {
		bunVersionPromise = execFileAsync("bun", ["--version"], {
			cwd: WORKSPACE_ROOT,
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 1024 * 1024,
		}).then((result) => result.stdout.trim());
	}

	return bunVersionPromise;
}

let yarnVersionPromise: Promise<string> | undefined;

// Bypass corepack packageManager enforcement so yarn runs in a pnpm workspace.
const yarnEnv = { ...process.env, COREPACK_ENABLE_STRICT: "0" };

function getYarnVersion(): Promise<string> {
	if (!yarnVersionPromise) {
		yarnVersionPromise = execFileAsync("yarn", ["--version"], {
			cwd: WORKSPACE_ROOT,
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 1024 * 1024,
			env: yarnEnv,
		}).then((result) => result.stdout.trim());
	}

	return yarnVersionPromise;
}

async function getYarnInstallCmd(
	projectDir: string,
): Promise<{ cmd: string; args: string[] }> {
	// Berry (v2+) uses .yarnrc.yml; classic (v1) does not.
	const isBerry = await pathExists(path.join(projectDir, ".yarnrc.yml"));
	return isBerry
		? { cmd: "yarn", args: ["install", "--immutable"] }
		: { cmd: "yarn", args: ["install"] };
}

async function runHostExecution(
	projectDir: string,
	entryRelativePath: string,
): Promise<ResultEnvelope> {
	const entryPath = path.join(projectDir, entryRelativePath);
	const result = await runCommand(process.execPath, [entryPath], projectDir);
	return normalizeEnvelope(result, projectDir);
}

async function runSandboxExecution(
	projectDir: string,
	entryRelativePath: string,
): Promise<ResultEnvelope> {
	// Execute the same entrypoint code against secure-exec.
	const entryPath = path.join(projectDir, entryRelativePath);
	const entryCode = await readFile(entryPath, "utf8");
	const capturedEvents: CapturedConsoleEvent[] = [];
	const proc = createTestNodeRuntime({
		filesystem: new NodeFileSystem(),
		networkAdapter: createDefaultNetworkAdapter(),
		permissions: fixturePermissions,
		onStdio: (event) => {
			capturedEvents.push(event);
		},
		processConfig: {
			cwd: projectDir,
			env: {},
		},
	});

	try {
		const result = await proc.exec(entryCode, {
			filePath: entryPath,
			cwd: projectDir,
			env: {},
		});
		return normalizeEnvelope(
			{
				code: result.code,
				stdout: formatConsoleChannel(capturedEvents, "stdout"),
				stderr:
					formatConsoleChannel(capturedEvents, "stderr") +
					formatErrorOutput(result.errorMessage),
			},
			projectDir,
		);
	} finally {
		proc.dispose();
	}
}

async function runOverlaySandboxExecution(
	projectDir: string,
	entryRelativePath: string,
): Promise<ResultEnvelope> {
	// Execute the fixture entrypoint with overlay-only node_modules access.
	const entryPath = path.join(projectDir, entryRelativePath);
	const entryCode = await readFile(entryPath, "utf8");
	const capturedEvents: CapturedConsoleEvent[] = [];
	const driver = createNodeDriver({
		moduleAccess: {
			cwd: projectDir,
		},
		permissions: fixturePermissions,
	});
	const sandboxEntry = `/root/${entryRelativePath
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")}`;
	const proc = createTestNodeRuntime({
		driver,
		onStdio: (event) => {
			capturedEvents.push(event);
		},
		processConfig: {
			cwd: "/root",
			env: {},
		},
	});

	try {
		const result = await proc.exec(entryCode, {
			filePath: sandboxEntry,
			cwd: "/root",
			env: {},
		});
		return normalizeEnvelope(
			{
				code: result.code,
				stdout: formatConsoleChannel(capturedEvents, "stdout"),
				stderr:
					formatConsoleChannel(capturedEvents, "stderr") +
					formatErrorOutput(result.errorMessage),
			},
			projectDir,
		);
	} finally {
		proc.dispose();
	}
}

async function runCommand(
	command: string,
	args: string[],
	cwd: string,
): Promise<ResultEnvelope> {
	try {
		const result = await execFileAsync(command, args, {
			cwd,
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 10 * 1024 * 1024,
		});
		return {
			code: 0,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	} catch (error: unknown) {
		if (!isExecError(error)) {
			throw error;
		}
		return {
			code: typeof error.code === "number" ? error.code : 1,
			stdout: typeof error.stdout === "string" ? error.stdout : "",
			stderr: typeof error.stderr === "string" ? error.stderr : "",
		};
	}
}

function normalizeEnvelope(
	envelope: ResultEnvelope,
	projectDir: string,
): ResultEnvelope {
	return {
		code: envelope.code,
		stdout: normalizeText(envelope.stdout, projectDir),
		stderr: normalizeText(envelope.stderr, projectDir),
	};
}

function normalizeText(value: string, projectDir: string): string {
	const normalized = value.replace(/\r\n/g, "\n");
	const projectDirPosix = toPosixPath(projectDir);
	const withoutPaths = normalized
		.split(projectDir)
		.join("<project>")
		.split(projectDirPosix)
		.join("<project>");
	return normalizeModuleNotFoundText(withoutPaths);
}

function normalizeModuleNotFoundText(value: string): string {
	if (!value.includes("Cannot find module")) {
		return value;
	}
	const quotedMatch = value.match(/Cannot find module '([^']+)'/);
	if (quotedMatch) {
		return `Cannot find module '${quotedMatch[1]}'\n`;
	}
	const fromMatch = value.match(/Cannot find module:\s*([^\s]+)\s+from\s+/);
	if (fromMatch) {
		return `Cannot find module '${fromMatch[1]}'\n`;
	}
	return value;
}

async function hashOptionalFile(
	hash: ReturnType<typeof createHash>,
	label: string,
	filePath: string,
): Promise<void> {
	hash.update(`${label}:`);
	try {
		const content = await readFile(filePath);
		hash.update(content);
	} catch (error) {
		if (!isNotFoundError(error)) {
			throw error;
		}
		hash.update("<missing>");
	}
	hash.update("\n");
}

async function listFixtureFiles(rootDir: string): Promise<string[]> {
	const files: string[] = [];

	async function walk(relativeDir: string): Promise<void> {
		const directory = path.join(rootDir, relativeDir);
		const entries = await readdir(directory, { withFileTypes: true });
		const sortedEntries = entries
			.filter((entry) => !isNodeModulesPath(entry.name))
			.sort((left, right) => left.name.localeCompare(right.name));

		for (const entry of sortedEntries) {
			const relativePath = relativeDir
				? path.join(relativeDir, entry.name)
				: entry.name;
			if (entry.isDirectory()) {
				await walk(relativePath);
				continue;
			}
			if (entry.isFile()) {
				files.push(relativePath);
			}
		}
	}

	await walk("");
	return files.sort((left, right) => left.localeCompare(right));
}

async function assertPathExists(pathname: string, message: string): Promise<void> {
	try {
		await access(pathname);
	} catch {
		throw new Error(message);
	}
}

async function pathExists(pathname: string): Promise<boolean> {
	try {
		await access(pathname);
		return true;
	} catch {
		return false;
	}
}

function isNodeModulesPath(value: string): boolean {
	return value.split(path.sep).includes("node_modules");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNotFoundError(value: unknown): boolean {
	return (
		Boolean(value) &&
		typeof value === "object" &&
		"code" in value &&
		String(value.code) === "ENOENT"
	);
}

function isExecError(value: unknown): value is {
	code?: number;
	stdout?: string;
	stderr?: string;
} {
	return Boolean(value) && typeof value === "object" && "stdout" in value;
}

function toPosixPath(value: string): string {
	return value.split(path.sep).join(path.posix.sep);
}
