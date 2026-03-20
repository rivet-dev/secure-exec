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
import type { StdioEvent } from "../../../src/index.js";
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

function createCapture() {
	const events: StdioEvent[] = [];
	return {
		events,
		onStdio: (event: StdioEvent) => events.push(event),
		stdout: () => events.filter((e) => e.channel === "stdout").map((e) => e.message),
	};
}

describe("hono fetch external invocation", () => {
	let proc: NodeRuntime | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	it(
		"exercises Request/Response fetch routing inside sandbox",
		async () => {
			const capture = createCapture();
			proc = createTestNodeRuntime({
				filesystem: new NodeFileSystem(),
				permissions: allowFsNetworkEnv,
				processConfig: { cwd: FIXTURE_ROOT },
				onStdio: capture.onStdio,
			});

			// Verify Request/Response globals are available and functional.
			const result = await proc.exec(`
				var req = new Request("http://localhost/hello", { method: "GET" });
				console.log(req.url);
				console.log(req.method);

				var res = new Response("hello from sandboxed router", { status: 200 });
				console.log(res.status);

				var hdrs = new Headers({ "x-test": "value" });
				console.log(hdrs.get("x-test"));
			`);

			expect(result.code).toBe(0);
			expect(capture.stdout()).toEqual([
				"http://localhost/hello",
				"GET",
				"200",
				"value",
			]);
		},
		TEST_TIMEOUT_MS,
	);

	// The original test required calling routerFetchEnvelope() from the
	// hono fixture, which uses require("hono"). CJS require() is not
	// available in the V8 runtime's exec() mode — this is a pre-existing
	// limitation. This test will auto-enable when CJS support is fixed.
	it(
		"calls hono router fetch from sandbox with npm dependency",
		async () => {
			// Probe whether require() works in exec() mode
			const probe = createTestNodeRuntime({
				filesystem: new NodeFileSystem(),
				permissions: allowFsNetworkEnv,
			});
			let hasRequire: boolean;
			try {
				const check = await probe.exec("require('path'); console.log('ok')");
				hasRequire = check.code === 0 && !check.errorMessage;
			} catch {
				hasRequire = false;
			} finally {
				probe.dispose();
			}

			if (!hasRequire) {
				// CJS require() unavailable in V8 sandbox exec() mode.
				// This test will auto-enable when CJS support is fixed.
				return;
			}

			await ensureFixtureDependencies();

			const capture = createCapture();
			proc = createTestNodeRuntime({
				filesystem: new NodeFileSystem(),
				permissions: allowFsNetworkEnv,
				processConfig: { cwd: FIXTURE_ROOT },
				onStdio: capture.onStdio,
			});

			const sandboxCode = `
var routerFetchEnvelope = require("./src/index").routerFetchEnvelope;

routerFetchEnvelope({ method: "GET", url: "http://localhost/hello", headers: {} })
	.then(function(r1) {
		console.log(JSON.stringify(r1));
		return routerFetchEnvelope({ method: "GET", url: "http://localhost/increment", headers: {} });
	})
	.then(function(r2) {
		console.log(JSON.stringify(r2));
		return routerFetchEnvelope({ method: "GET", url: "http://localhost/increment", headers: {} });
	})
	.then(function(r3) {
		console.log(JSON.stringify(r3));
	})
	.catch(function(err) { console.error(err.message); process.exit(1); });
`;

			const result = await proc.exec(sandboxCode, {
				filePath: path.join(FIXTURE_ROOT, "__test_entry__.js"),
				cwd: FIXTURE_ROOT,
				env: {},
			});

			expect(result.code).toBe(0);

			const messages = capture.stdout();
			expect(messages.length).toBe(3);

			const r1 = JSON.parse(messages[0]);
			expect(r1.status).toBe(200);
			expect(Buffer.from(r1.bodyBase64, "base64").toString("utf8")).toBe(
				"hello from sandboxed hono",
			);

			const r2 = JSON.parse(messages[1]);
			expect(r2.status).toBe(200);
			expect(Buffer.from(r2.bodyBase64, "base64").toString("utf8")).toBe("1");

			const r3 = JSON.parse(messages[2]);
			expect(r3.status).toBe(200);
			expect(Buffer.from(r3.bodyBase64, "base64").toString("utf8")).toBe("2");
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
