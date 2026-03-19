import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
	allowAllEnv,
	allowAllFs,
	NodeFileSystem,
	NodeRuntime,
} from "../../../src/index.js";
import { createTestNodeRuntime } from "../../test-utils.js";

const execFileAsync = promisify(execFile);
const TEST_TIMEOUT_MS = 55_000;
const COMMAND_TIMEOUT_MS = 45_000;
const TESTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE_ROOT = path.join(TESTS_ROOT, "fixtures", "hono-fetch-external");

const allowFsNetworkEnv = {
	...allowAllFs,
	...allowAllEnv,
};

// This test was written for isolated-vm's __unsafeCreateContext / __unsafeIsolate
// internals which are not available in the V8 runtime. Needs rewrite for US-033
// (run existing test suite against new V8 runtime).
describe.skip("hono fetch external invocation", () => {
	let proc: NodeRuntime | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	it(
		"calls router fetch directly from host-triggered executions multiple times",
		async () => {
			await ensureFixtureDependencies();
			proc = createTestNodeRuntime({
				filesystem: new NodeFileSystem(),
				permissions: allowFsNetworkEnv,
				processConfig: {
					cwd: FIXTURE_ROOT,
				},
			});

			// TODO: Rewrite test for V8 runtime — needs exec() with async
			// main() pattern or a new V8-native approach for host-to-sandbox
			// function invocations.
		},
		TEST_TIMEOUT_MS,
	);
});

async function ensureFixtureDependencies(): Promise<void> {
	try {
		await access(path.join(FIXTURE_ROOT, "node_modules", "hono"));
		return;
	} catch {
		// Install only when fixture dependencies are missing.
	}

	await execFileAsync(
		"pnpm",
		["install", "--ignore-workspace", "--prefer-offline"],
		{
			cwd: FIXTURE_ROOT,
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 10 * 1024 * 1024,
		},
	);
}
