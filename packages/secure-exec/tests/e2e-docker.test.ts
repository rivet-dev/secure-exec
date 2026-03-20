import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	access,
	cp,
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
	createDefaultNetworkAdapter,
	NodeFileSystem,
} from "../src/index.js";
import { createTestNodeRuntime } from "./test-utils.js";
import {
	buildImage,
	getContainerInternalIp,
	skipUnlessDocker,
	startContainer,
	type Container,
} from "./utils/docker.js";

const execFileAsync = promisify(execFile);
const TEST_TIMEOUT_MS = 55_000;
const COMMAND_TIMEOUT_MS = 45_000;
const CACHE_READY_MARKER = ".ready";

const TESTS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(TESTS_ROOT, "..");
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");
const FIXTURES_ROOT = path.join(TESTS_ROOT, "e2e-docker");
const CACHE_ROOT = path.join(PACKAGE_ROOT, ".cache", "e2e-docker");

const fixturePermissions = {
	...allowAllFs,
	...allowAllEnv,
	...allowAllNetwork,
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ServiceName = "postgres" | "mysql" | "redis" | "ssh";

const validServices = new Set<string>(["postgres", "mysql", "redis", "ssh"]);

type PassFixtureMetadata = {
	entry: string;
	expectation: "pass";
	services: ServiceName[];
};

type FailFixtureMetadata = {
	entry: string;
	expectation: "fail";
	services: ServiceName[];
	fail: {
		code: number;
		stderrIncludes: string;
	};
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

type ServiceConnection = { host: string; port: number };
type ServiceConnections = Partial<Record<ServiceName, ServiceConnection>>;

/* ------------------------------------------------------------------ */
/*  Skip logic                                                         */
/* ------------------------------------------------------------------ */

const skipReason = skipUnlessDocker();

/* ------------------------------------------------------------------ */
/*  Container lifecycle state                                          */
/* ------------------------------------------------------------------ */

const activeContainers: Container[] = [];
let services: ServiceConnections = {};
let internalAddresses: Partial<
	Record<ServiceName, { host: string; port: number }>
> = {};

/* ------------------------------------------------------------------ */
/*  Fixture discovery (runs at module load)                            */
/* ------------------------------------------------------------------ */

const discoveredFixtures = await discoverFixtures();

/* ------------------------------------------------------------------ */
/*  Test suite                                                         */
/* ------------------------------------------------------------------ */

describe.skipIf(skipReason)("e2e-docker", () => {
	beforeAll(async () => {
		// Build custom images
		const sshdDockerfile = path.join(
			FIXTURES_ROOT,
			"dockerfiles",
			"sshd.Dockerfile",
		);
		buildImage(sshdDockerfile, "secure-exec-test-sshd");

		const pgSslDockerfile = path.join(
			FIXTURES_ROOT,
			"dockerfiles",
			"postgres-ssl.Dockerfile",
		);
		buildImage(pgSslDockerfile, "secure-exec-test-postgres-ssl");

		// Start containers (startContainer is synchronous — sequential start)
		const pg = startContainer("secure-exec-test-postgres-ssl", {
			ports: { 5432: 0 },
			env: {
				POSTGRES_USER: "testuser",
				POSTGRES_PASSWORD: "testpass",
				POSTGRES_DB: "testdb",
			},
			healthCheck: ["pg_isready", "-U", "testuser", "-d", "testdb"],
			healthCheckTimeout: 30_000,
			args: ["--tmpfs", "/var/lib/postgresql/data"],
			// Enable SSL with self-signed certificate from custom image
			command: [
				"-c", "ssl=on",
				"-c", "ssl_cert_file=/var/lib/postgresql/server.crt",
				"-c", "ssl_key_file=/var/lib/postgresql/server.key",
			],
		});

		const mysql = startContainer("mysql:8.0", {
			ports: { 3306: 0 },
			env: {
				MYSQL_ROOT_PASSWORD: "rootpass",
				MYSQL_DATABASE: "testdb",
				MYSQL_USER: "testuser",
				MYSQL_PASSWORD: "testpass",
			},
			healthCheck: [
				"mysql",
				"-u",
				"testuser",
				"-ptestpass",
				"-e",
				"SELECT 1",
			],
			healthCheckTimeout: 60_000,
			args: ["--tmpfs", "/var/lib/mysql"],
			// Use mysql_native_password to bypass caching_sha2_password which
			// requires crypto.publicEncrypt() not yet available in the sandbox
			command: ["--default-authentication-plugin=mysql_native_password"],
		});

		const redis = startContainer("redis:7-alpine", {
			ports: { 6379: 0 },
			healthCheck: ["redis-cli", "ping"],
			healthCheckTimeout: 15_000,
		});

		const ssh = startContainer("secure-exec-test-sshd", {
			ports: { 22: 0 },
			healthCheck: ["sshd", "-t"],
			healthCheckTimeout: 15_000,
		});

		activeContainers.push(pg, mysql, redis, ssh);

		services = {
			postgres: { host: pg.host, port: pg.port },
			mysql: { host: mysql.host, port: mysql.port },
			redis: { host: redis.host, port: redis.port },
			ssh: { host: ssh.host, port: ssh.port },
		};

		// Internal Docker bridge IPs for tunnel tests (SSH container can reach
		// other containers on the same bridge by their internal IP)
		internalAddresses = {
			redis: {
				host: getContainerInternalIp(redis.containerId),
				port: 6379,
			},
		};
	}, 180_000);

	afterAll(() => {
		for (const container of activeContainers) {
			container.stop();
		}
	});

	it("services are configured", () => {
		expect(services.postgres).toBeDefined();
		expect(services.mysql).toBeDefined();
		expect(services.redis).toBeDefined();
		expect(services.ssh).toBeDefined();
	});

	for (const fixture of discoveredFixtures) {
		it(
			`parity: ${fixture.name}`,
			async () => {
				const prepared = await prepareFixtureProject(fixture);
				const serviceEnv = getServiceEnvVars(
					fixture.metadata.services,
					services,
				);

				const host = await runHostExecution(
					prepared.projectDir,
					fixture.metadata.entry,
					serviceEnv,
				);
				const sandbox = await runSandboxExecution(
					prepared.projectDir,
					fixture.metadata.entry,
					serviceEnv,
				);

				if (fixture.metadata.expectation === "pass") {
					expect(sandbox.code).toBe(host.code);
					expect(sandbox.stdout).toBe(host.stdout);
					expect(sandbox.stderr).toBe(host.stderr);
					return;
				}

				// Fail expectation: host should succeed, sandbox should fail predictably
				expect(host.code).toBe(0);
				expect(sandbox.code).toBe(fixture.metadata.fail.code);
				expect(sandbox.stderr).toContain(
					fixture.metadata.fail.stderrIncludes,
				);
			},
			TEST_TIMEOUT_MS,
		);
	}
});

/* ------------------------------------------------------------------ */
/*  Service env var injection                                          */
/* ------------------------------------------------------------------ */

function getServiceEnvVars(
	neededServices: ServiceName[],
	connections: ServiceConnections,
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const svc of neededServices) {
		const conn = connections[svc];
		if (!conn) continue;
		switch (svc) {
			case "postgres":
				env.PG_HOST = conn.host;
				env.PG_PORT = String(conn.port);
				break;
			case "mysql":
				env.MYSQL_HOST = conn.host;
				env.MYSQL_PORT = String(conn.port);
				break;
			case "redis": {
				env.REDIS_HOST = conn.host;
				env.REDIS_PORT = String(conn.port);
				const internal = internalAddresses.redis;
				if (internal) {
					env.REDIS_INTERNAL_HOST = internal.host;
					env.REDIS_INTERNAL_PORT = String(internal.port);
				}
				break;
			}
			case "ssh":
				env.SSH_HOST = conn.host;
				env.SSH_PORT = String(conn.port);
				break;
		}
	}
	return env;
}

/* ------------------------------------------------------------------ */
/*  Fixture discovery and metadata                                     */
/* ------------------------------------------------------------------ */

async function discoverFixtures(): Promise<FixtureProject[]> {
	let entries;
	try {
		entries = await readdir(FIXTURES_ROOT, { withFileTypes: true });
	} catch {
		return [];
	}

	const fixtureDirs = entries
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort((left, right) => left.localeCompare(right));

	const fixtures: FixtureProject[] = [];
	for (const name of fixtureDirs) {
		const sourceDir = path.join(FIXTURES_ROOT, name);
		const metadataPath = path.join(sourceDir, "fixture.json");
		if (!(await pathExists(metadataPath))) continue;

		const metadataText = await readFile(metadataPath, "utf8");
		const metadata = parseFixtureMetadata(
			JSON.parse(metadataText) as unknown,
			name,
		);

		const entryPath = path.join(sourceDir, metadata.entry);
		await assertPathExists(
			entryPath,
			`Fixture "${name}" entry file not found: ${metadata.entry}`,
		);
		await assertPathExists(
			path.join(sourceDir, "package.json"),
			`Fixture "${name}" requires package.json`,
		);

		fixtures.push({ name, sourceDir, metadata });
	}

	return fixtures;
}

function parseFixtureMetadata(
	raw: unknown,
	fixtureName: string,
): FixtureMetadata {
	if (!isRecord(raw)) {
		throw new Error(`Fixture "${fixtureName}" metadata must be an object`);
	}
	if (typeof raw.entry !== "string" || raw.entry.length === 0) {
		throw new Error(`Fixture "${fixtureName}" requires a non-empty entry`);
	}
	if (raw.expectation !== "pass" && raw.expectation !== "fail") {
		throw new Error(
			`Fixture "${fixtureName}" expectation must be "pass" or "fail"`,
		);
	}

	// Validate services array
	if (!Array.isArray(raw.services)) {
		throw new Error(`Fixture "${fixtureName}" requires a services array`);
	}
	for (const s of raw.services) {
		if (typeof s !== "string" || !validServices.has(s)) {
			throw new Error(
				`Fixture "${fixtureName}" has invalid service: ${s}`,
			);
		}
	}
	const svcs = raw.services as ServiceName[];

	if (raw.expectation === "pass") {
		return { entry: raw.entry, expectation: "pass", services: svcs };
	}

	// Fail expectation requires a fail contract
	if (!isRecord(raw.fail)) {
		throw new Error(
			`Fixture "${fixtureName}" with expectation "fail" requires a fail contract`,
		);
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
		services: svcs,
		fail: {
			code: raw.fail.code,
			stderrIncludes: raw.fail.stderrIncludes,
		},
	};
}

/* ------------------------------------------------------------------ */
/*  Fixture preparation (cache + install)                              */
/* ------------------------------------------------------------------ */

async function prepareFixtureProject(
	fixture: FixtureProject,
): Promise<PreparedFixture> {
	await mkdir(CACHE_ROOT, { recursive: true });
	const cacheKey = await createFixtureCacheKey(fixture);
	const cacheDir = path.join(CACHE_ROOT, `${fixture.name}-${cacheKey}`);
	const readyMarkerPath = path.join(cacheDir, CACHE_READY_MARKER);

	if (await pathExists(readyMarkerPath)) {
		return { cacheHit: true, cacheKey, projectDir: cacheDir };
	}

	if (await pathExists(cacheDir)) {
		await rm(cacheDir, { recursive: true, force: true });
	}

	// Prepare staging directory and install deps
	const stagingDir = `${cacheDir}.tmp-${process.pid}-${Date.now()}`;
	await rm(stagingDir, { recursive: true, force: true });
	await cp(fixture.sourceDir, stagingDir, {
		recursive: true,
		filter: (source) => !isNodeModulesPath(source),
	});

	await execFileAsync(
		"pnpm",
		["install", "--ignore-workspace", "--prefer-offline"],
		{
			cwd: stagingDir,
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 10 * 1024 * 1024,
		},
	);

	await writeFile(
		path.join(stagingDir, CACHE_READY_MARKER),
		`${new Date().toISOString()}\n`,
	);

	// Promote staging to cache
	try {
		await rename(stagingDir, cacheDir);
	} catch (error) {
		const code =
			error && typeof error === "object" && "code" in error
				? String(error.code)
				: "";
		if (code !== "EEXIST") throw error;
		await rm(stagingDir, { recursive: true, force: true });
		if (!(await pathExists(readyMarkerPath))) {
			throw new Error(
				`Cache entry race produced missing ready marker: ${cacheDir}`,
			);
		}
	}

	return { cacheHit: false, cacheKey, projectDir: cacheDir };
}

async function createFixtureCacheKey(
	fixture: FixtureProject,
): Promise<string> {
	const hash = createHash("sha256");
	const nodeMajor = process.versions.node.split(".")[0] ?? "0";
	hash.update(`node-major:${nodeMajor}\n`);
	hash.update(`platform:${process.platform}\n`);
	hash.update(`arch:${process.arch}\n`);

	await hashOptionalFile(
		hash,
		"workspace-lock",
		path.join(WORKSPACE_ROOT, "pnpm-lock.yaml"),
	);
	await hashOptionalFile(
		hash,
		"fixture-package",
		path.join(fixture.sourceDir, "package.json"),
	);
	await hashOptionalFile(
		hash,
		"fixture-lock",
		path.join(fixture.sourceDir, "pnpm-lock.yaml"),
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

/* ------------------------------------------------------------------ */
/*  Execution                                                          */
/* ------------------------------------------------------------------ */

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
	if (!errorMessage) return "";
	return errorMessage.endsWith("\n") ? errorMessage : `${errorMessage}\n`;
}

async function runHostExecution(
	projectDir: string,
	entryRelativePath: string,
	serviceEnv: Record<string, string>,
): Promise<ResultEnvelope> {
	const entryPath = path.join(projectDir, entryRelativePath);
	const result = await runCommand(
		process.execPath,
		[entryPath],
		projectDir,
		serviceEnv,
	);
	return normalizeEnvelope(result, projectDir);
}

async function runSandboxExecution(
	projectDir: string,
	entryRelativePath: string,
	serviceEnv: Record<string, string>,
): Promise<ResultEnvelope> {
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
			env: serviceEnv,
		},
	});

	try {
		const result = await proc.exec(entryCode, {
			filePath: entryPath,
			cwd: projectDir,
			env: serviceEnv,
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
	extraEnv: Record<string, string>,
): Promise<ResultEnvelope> {
	try {
		const result = await execFileAsync(command, args, {
			cwd,
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 10 * 1024 * 1024,
			env: { ...process.env, ...extraEnv },
		});
		return { code: 0, stdout: result.stdout, stderr: result.stderr };
	} catch (error: unknown) {
		if (!isExecError(error)) throw error;
		return {
			code: typeof error.code === "number" ? error.code : 1,
			stdout: typeof error.stdout === "string" ? error.stdout : "",
			stderr: typeof error.stderr === "string" ? error.stderr : "",
		};
	}
}

/* ------------------------------------------------------------------ */
/*  Normalization                                                      */
/* ------------------------------------------------------------------ */

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
	return normalized
		.split(projectDir)
		.join("<project>")
		.split(projectDirPosix)
		.join("<project>");
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
		if (!isNotFoundError(error)) throw error;
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
			if (entry.isFile()) files.push(relativePath);
		}
	}

	await walk("");
	return files.sort((left, right) => left.localeCompare(right));
}

async function assertPathExists(
	pathname: string,
	message: string,
): Promise<void> {
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

function isExecError(
	value: unknown,
): value is { code?: number; stdout?: string; stderr?: string } {
	return Boolean(value) && typeof value === "object" && "stdout" in value;
}

function toPosixPath(value: string): string {
	return value.split(path.sep).join(path.posix.sep);
}
