import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import { createNodeDriver } from "../src/index.ts";
import {
	createReplacementNodeRuntimeDriverFactory,
	runUpstreamBootstrapEval,
} from "../src/upstream/bootstrap-execution.ts";

const CONFORMANCE_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../secure-exec/tests/node-conformance",
);
const COMMON_DIR = path.join(CONFORMANCE_ROOT, "common");
const FIXTURES_DIR = path.join(CONFORMANCE_ROOT, "fixtures");
const PARALLEL_DIR = path.join(CONFORMANCE_ROOT, "parallel");

function readStdout(events: readonly StdioEvent[]): string {
	return events
		.filter((event) => event.channel === "stdout")
		.map((event) => event.message)
		.join("");
}

function createReplacementRuntime(
	filesystem = createInMemoryFileSystem(),
	onStdio?: (event: StdioEvent) => void,
): NodeRuntime {
	return new NodeRuntime({
		systemDriver: createNodeDriver({
			filesystem,
			commandExecutor: createCommandExecutorStub(),
		}),
		runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
		onStdio,
	});
}

async function runVendoredConformanceFile(testFilename: string) {
	const hostRoot = await mkdtemp(
		path.join(tmpdir(), "secure-exec-node-module-conformance-"),
	);

	async function copyDir(sourceDir: string, targetDir: string): Promise<void> {
		await mkdir(targetDir, { recursive: true });
		for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
			const sourcePath = path.join(sourceDir, entry.name);
			const targetPath = path.join(targetDir, entry.name);
			if (entry.isDirectory()) {
				await copyDir(sourcePath, targetPath);
				continue;
			}
			if (entry.isFile()) {
				await mkdir(path.dirname(targetPath), { recursive: true });
				await writeFile(targetPath, await readFile(sourcePath));
			}
		}
	}

	try {
		await copyDir(COMMON_DIR, path.join(hostRoot, "common"));
		await copyDir(FIXTURES_DIR, path.join(hostRoot, "fixtures"));
		await mkdir(path.join(hostRoot, "parallel"), { recursive: true });
		const testPath = path.join(hostRoot, "parallel", testFilename);
		await writeFile(
			testPath,
			await readFile(path.join(PARALLEL_DIR, testFilename)),
		);

		const result = await runUpstreamBootstrapEval({
			filePath: testPath,
			cwd: path.join(hostRoot, "parallel"),
			env: {
				SECURE_EXEC_CONFORMANCE_FIXTURES_DIR: path.join(hostRoot, "fixtures"),
			},
		});

		return {
			code: result.code,
			stdout: result.stdout,
			stderr:
				result.stderr +
				(result.errorMessage ? `${result.errorMessage}\n` : ""),
		};
	} finally {
		await rm(hostRoot, { recursive: true, force: true });
	}
}

describe("replacement runtime node:module builtin", () => {
	let runtime: NodeRuntime | undefined;

	afterEach(() => {
		runtime?.dispose();
		runtime = undefined;
	});

	it("preserves logical filePath semantics for CommonJS node:module helpers", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/app", { recursive: true });
		await filesystem.writeFile(
			"/app/package.json",
			JSON.stringify({ name: "sandbox-app" }, null, 2),
		);
		await filesystem.writeFile(
			"/app/helper.cjs",
			"module.exports = { value: 42 };\n",
		);

		const stdio: StdioEvent[] = [];
		runtime = createReplacementRuntime(filesystem, (event) => stdio.push(event));

		const result = await runtime.exec(
			`
			const Module = require('node:module');
			const staged = require('./helper.cjs');
			const req = Module.createRequire(__filename);
			let invalidCode;
			try {
				Module.createRequire('../');
			} catch (error) {
				invalidCode = error.code;
			}
			const cacheResult = Module.enableCompileCache('/tmp/compile-cache');
			const before = Module.getSourceMapsSupport();
			Module.setSourceMapsSupport(true, {
				generatedCode: true,
				nodeModules: true,
			});
			const after = Module.getSourceMapsSupport();
			process.stdout.write(JSON.stringify({
				value: staged.value,
				resolved: req.resolve('./helper.cjs'),
				pkg: Module.findPackageJSON('./entry.js', __filename),
				invalidCode,
				cacheStatus: cacheResult.status,
				cacheMessage: cacheResult.message ?? null,
				cacheDir: Module.getCompileCacheDir() ?? null,
				before,
				after,
				found: Module.findSourceMap(__filename) ?? null,
			}));
			`,
			{
				filePath: "/app/entry.js",
				cwd: "/app",
			},
		);

		expect(result.code, result.errorMessage).toBe(0);
		expect(JSON.parse(readStdout(stdio))).toEqual({
			value: 42,
			resolved: "/app/helper.cjs",
			pkg: "/app/package.json",
			invalidCode: "ERR_INVALID_ARG_VALUE",
			cacheStatus: 3,
			cacheMessage: "Disabled by NODE_DISABLE_COMPILE_CACHE",
			cacheDir: null,
			before: {
				enabled: false,
				nodeModules: false,
				generatedCode: false,
			},
			after: {
				enabled: true,
				nodeModules: true,
				generatedCode: true,
			},
			found: null,
		});
	});

	it("supports createRequire() and package lookup from ESM filePath entrypoints", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/app", { recursive: true });
		await filesystem.writeFile(
			"/app/package.json",
			JSON.stringify({ name: "sandbox-app", type: "module" }, null, 2),
		);
		await filesystem.writeFile(
			"/app/helper.cjs",
			"module.exports = { value: 42 };\n",
		);

		const stdio: StdioEvent[] = [];
		runtime = createReplacementRuntime(filesystem, (event) => stdio.push(event));

		const result = await runtime.exec(
			`
			import { createRequire, findPackageJSON } from 'node:module';
			import helper from './helper.cjs';
			const req = createRequire(import.meta.url);
			process.stdout.write(JSON.stringify({
				value: helper.value,
				resolved: req.resolve('./helper.cjs'),
				pkg: findPackageJSON('./entry.js', import.meta.url),
			}));
			`,
			{
				filePath: "/app/entry.js",
				cwd: "/app",
			},
		);

		expect(result.code, result.errorMessage).toBe(0);
		const payload = JSON.parse(readStdout(stdio)) as {
			value: number;
			resolved: string;
			pkg: string;
		};
		expect(payload.value).toBe(42);
		expect(payload.resolved.endsWith("/app/helper.cjs")).toBe(true);
		expect(payload.pkg.endsWith("/app/package.json")).toBe(true);
	});

	it("passes targeted vendored node:module API files through the replacement runtime", async () => {
		for (const testFilename of [
			"test-module-create-require.js",
			"test-module-setsourcemapssupport.js",
			"test-compile-cache-api-error.js",
		]) {
			const result = await runVendoredConformanceFile(testFilename);
			expect(
				result.code,
				`${testFilename}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
			).toBe(0);
		}
	});
});
