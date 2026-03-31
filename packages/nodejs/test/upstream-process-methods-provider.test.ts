import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
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
const PARALLEL_DIR = path.join(CONFORMANCE_ROOT, "parallel");

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

async function runVendoredProcessConformanceFile(
	testFilename: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const filesystem = createInMemoryFileSystem();
	for (const [vfsPath, content] of await loadCommonFiles()) {
		await filesystem.writeFile(vfsPath, content);
	}
	await filesystem.mkdir("/test/parallel", { recursive: true });
	await filesystem.writeFile(
		`/test/parallel/${testFilename}`,
		await readFile(path.join(PARALLEL_DIR, testFilename), "utf8"),
	);

	const stdout: string[] = [];
	const stderr: string[] = [];
	const runtime = new NodeRuntime({
		systemDriver: createNodeDriver({
			filesystem,
			commandExecutor: createCommandExecutorStub(),
		}),
		runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
		onStdio: (event) => {
			if (event.channel === "stdout") {
				stdout.push(event.message);
				return;
			}
			stderr.push(event.message);
		},
	});

	try {
		const result = await runtime.exec(
			await readFile(path.join(PARALLEL_DIR, testFilename), "utf8"),
			{
				filePath: `/test/parallel/${testFilename}`,
				cwd: "/test/parallel",
				env: {},
			},
		);
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

describe("upstream process_methods provider", () => {
	let runtime: NodeRuntime | undefined;

	afterEach(() => {
		runtime?.dispose();
		runtime = undefined;
	});

	it("installs process cpu/memory/resource methods and raw debug through bootstrap", async () => {
		const result = await runUpstreamBootstrapEval({
			code: `
				const cpu = process.cpuUsage();
				const memory = process.memoryUsage();
				const resource = process.resourceUsage();
				const before = process.hrtime();
				const after = process.hrtime(before);
				process.stdout.write(JSON.stringify({
					cpuKeys: Object.keys(cpu).sort(),
					memoryKeys: Object.keys(memory).sort(),
					resourceKeys: Object.keys(resource).sort().slice(0, 4),
					hrtimeLength: before.length,
					hrtimeDiffLength: after.length,
				}));
			`,
		});

		expect(result.status, result.errorMessage ?? result.stderr).toBe("pass");
		expect(result.code, result.stderr || result.errorMessage).toBe(0);
		expect(result.appliedBindingShims).toEqual(
			expect.arrayContaining(["process_methods-explicit-provider"]),
		);
		expect(JSON.parse(result.stdout)).toEqual({
			cpuKeys: ["system", "user"],
			memoryKeys: ["arrayBuffers", "external", "heapTotal", "heapUsed", "rss"],
			resourceKeys: [
				"fsRead",
				"fsWrite",
				"involuntaryContextSwitches",
				"ipcReceived",
			],
			hrtimeLength: 2,
			hrtimeDiffLength: 2,
		});
	});

	it("passes targeted vendored process conformance files on the replacement runtime", async () => {
		for (const testFilename of [
			"test-process-cpuUsage.js",
			"test-process-hrtime.js",
			"test-resource-usage.js",
			"test-memory-usage.js",
		]) {
			const result = await runVendoredProcessConformanceFile(testFilename);
			expect(result.code, `${testFilename}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
				.toBe(0);
		}
	});
});
