import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	createKernel,
	type Kernel,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import {
	createNodeDriver,
} from "../src/index.ts";
import {
	createReplacementNodeKernelRuntime,
	createReplacementNodeRuntimeDriverFactory,
	runUpstreamBootstrapEval,
	type UpstreamBootstrapEvalResult,
} from "../src/upstream/bootstrap-execution.ts";

const CONFORMANCE_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../secure-exec/tests/node-conformance",
);
const COMMON_DIR = path.join(CONFORMANCE_ROOT, "common");
const PARALLEL_DIR = path.join(CONFORMANCE_ROOT, "parallel");

const CJS_COMMON_ENTRY = `
const common = require('../common');
process.stdout.write(JSON.stringify({
  value: common.answer,
}));
`.trim();

const ESM_PACKAGE_JSON = JSON.stringify({ type: "module" }, null, 2);

const ESM_ENTRY = `
import { value } from './dep.js';
process.stdout.write(JSON.stringify({
  value,
}));
`.trim();

const ESM_DEP = `
export const value = 'esm-from-package-json';
`.trim();

function readStdout(events: readonly StdioEvent[]): string {
	return events
		.filter((event) => event.channel === "stdout")
		.map((event) => event.message)
		.join("");
}

function parseJson<T>(stdout: string): T {
	return JSON.parse(stdout) as T;
}

function expectSuccessfulFileEval(
	result: UpstreamBootstrapEvalResult,
): void {
	expect(result.status, result.errorMessage ?? result.stderr).toBe("pass");
	expect(result.code, result.stderr || result.errorMessage).toBe(0);
	expect(result.entrypoint).toBe("secure_exec/file_entry");
	expect(result.internalBindings).toEqual(expect.arrayContaining(["modules"]));
	expect(result.appliedBindingShims).toEqual(
		expect.arrayContaining(["modules-getNearestParentPackageJSON-shim"]),
	);
}

async function loadCommonFiles(): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	for (const entry of await readdir(COMMON_DIR)) {
		if (!entry.endsWith(".js")) {
			continue;
		}
		files.set(
			`/test/common/${entry}`,
			await readFile(path.join(COMMON_DIR, entry), "utf8"),
		);
	}
	return files;
}

async function runVendoredConformanceFile(
	testFilename: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const filesystem = createInMemoryFileSystem();
	for (const [vfsPath, content] of await loadCommonFiles()) {
		await filesystem.writeFile(vfsPath, content);
	}
	await filesystem.mkdir("/test/parallel", { recursive: true });
	const testCode = await readFile(path.join(PARALLEL_DIR, testFilename), "utf8");
	const testVfsPath = `/test/parallel/${testFilename}`;
	await filesystem.writeFile(testVfsPath, testCode);
	const runtime = new NodeRuntime({
		systemDriver: createNodeDriver({
			filesystem,
			commandExecutor: createCommandExecutorStub(),
		}),
		runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
	});
	const stdout: string[] = [];
	const stderr: string[] = [];

	try {
		const result = await runtime.exec(testCode, {
			filePath: testVfsPath,
			cwd: "/test/parallel",
			env: {},
			onStdio: (event) => {
				if (event.channel === "stdout") {
					stdout.push(event.message);
					return;
				}
				stderr.push(event.message);
			},
		});

		return {
			code: result.code,
			stdout: stdout.join(""),
			stderr:
				stderr.join("") +
				(result.errorMessage ? `${result.errorMessage}\n` : ""),
		};
	} finally {
		runtime.dispose();
	}
}

describe("upstream modules file entry", () => {
	let runtime: NodeRuntime | undefined;
	let kernel: Kernel | undefined;
	const hostTempRoots: string[] = [];

	afterEach(async () => {
		runtime?.dispose();
		runtime = undefined;

		if (kernel) {
			await kernel.dispose();
			kernel = undefined;
		}

		await Promise.all(
			hostTempRoots.splice(0).map((tempRoot) =>
				rm(tempRoot, { recursive: true, force: true }),
			),
		);
	});

	it("loads a real CommonJS entry file with ../common through the isolated child runner", async () => {
		const hostRoot = await mkdtemp(
			path.join(os.tmpdir(), "secure-exec-upstream-modules-"),
		);
		hostTempRoots.push(hostRoot);
		await mkdir(path.join(hostRoot, "common"), { recursive: true });
		await mkdir(path.join(hostRoot, "parallel"), { recursive: true });
		await writeFile(
			path.join(hostRoot, "common", "index.js"),
			"module.exports = { answer: 42 };",
		);
		const entryFilePath = path.join(hostRoot, "parallel", "test.js");
		await writeFile(entryFilePath, CJS_COMMON_ENTRY);

		const result = await runUpstreamBootstrapEval({
			filePath: entryFilePath,
			cwd: path.join(hostRoot, "parallel"),
		});

		expectSuccessfulFileEval(result);
		expect(parseJson<{ value: number }>(result.stdout)).toEqual({ value: 42 });
	});

	it("loads a real CommonJS entry file with ../common through standalone NodeRuntime", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/test/common", { recursive: true });
		await filesystem.mkdir("/test/parallel", { recursive: true });
		await filesystem.writeFile(
			"/test/common/index.js",
			"module.exports = { answer: 42 };",
		);
		await filesystem.writeFile("/test/parallel/test.js", CJS_COMMON_ENTRY);
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem,
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(CJS_COMMON_ENTRY, {
			filePath: "/test/parallel/test.js",
			cwd: "/test/parallel",
		});

		expect(result.code).toBe(0);
		expect(parseJson<{ value: number }>(readStdout(stdio))).toEqual({ value: 42 });
	});

	it("executes a package-json-aware ESM entry file through standalone NodeRuntime", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/test/esm", { recursive: true });
		await filesystem.writeFile("/test/esm/package.json", ESM_PACKAGE_JSON);
		await filesystem.writeFile("/test/esm/index.js", ESM_ENTRY);
		await filesystem.writeFile("/test/esm/dep.js", ESM_DEP);
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem,
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(ESM_ENTRY, {
			filePath: "/test/esm/index.js",
			cwd: "/test/esm",
		});

		expect(result.code).toBe(0);
		expect(parseJson<{ value: string }>(readStdout(stdio))).toEqual({
			value: "esm-from-package-json",
		});
	});

	it("executes a real CommonJS file entry through a kernel-mounted replacement runtime", async () => {
		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.vfs.mkdir("/test/common", { recursive: true });
		await kernel.vfs.mkdir("/test/parallel", { recursive: true });
		await kernel.vfs.writeFile(
			"/test/common/index.js",
			"module.exports = { answer: 42 };",
		);
		await kernel.vfs.writeFile("/test/parallel/test.js", CJS_COMMON_ENTRY);
		await kernel.mount(createReplacementNodeKernelRuntime());

		const stdout: Uint8Array[] = [];
		const stderr: Uint8Array[] = [];
		const proc = kernel.spawn("node", ["/test/parallel/test.js"], {
			cwd: "/test/parallel",
			onStdout: (chunk) => stdout.push(chunk),
			onStderr: (chunk) => stderr.push(chunk),
		});

		expect(await proc.wait()).toBe(0);
		expect(
			parseJson<{ value: number }>(
				Buffer.concat(stdout.map((chunk) => Buffer.from(chunk))).toString("utf8"),
			),
		).toEqual({ value: 42 });
		expect(
			Buffer.concat(stderr.map((chunk) => Buffer.from(chunk))).toString("utf8"),
		).toBe("");
	});

	it("runs a targeted vendored conformance file that previously tripped package_json_reader", async () => {
		const result = await runVendoredConformanceFile("test-path-isabsolute.js");
		expect(result.code, result.stderr || result.stdout).toBe(0);
	});
});
