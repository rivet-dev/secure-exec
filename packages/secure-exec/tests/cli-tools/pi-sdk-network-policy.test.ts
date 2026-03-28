/**
 * Pi SDK sandbox network-policy regressions.
 *
 * Proves that Pi SDK sessions obey SecureExec's outbound-network policy
 * exactly: allowed destinations succeed and denied destinations fail with
 * a clear surfaced error.  Denials are enforced by SecureExec's network
 * adapter/permissions path, not by removing tools, rewriting Pi config,
 * or intercepting requests in the test.
 *
 * Provider: mock LLM server (deterministic tool calls).
 */

import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	NodeRuntime,
	NodeFileSystem,
	allowAllFs,
	allowAllNetwork,
	allowAllChildProcess,
	allowAllEnv,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
} from "../../src/index.js";
import type { Permissions } from "../../src/index.js";
import {
	createMockLlmServer,
	type MockLlmServerHandle,
} from "./mock-llm-server.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, "../..");
const PI_SDK_ENTRY = path.resolve(
	SECURE_EXEC_ROOT,
	"node_modules/@mariozechner/pi-coding-agent/dist/index.js",
);

function skipUnlessPiInstalled(): string | false {
	return existsSync(PI_SDK_ENTRY)
		? false
		: "@mariozechner/pi-coding-agent not installed";
}

function parseLastJsonLine(stdout: string): Record<string, unknown> {
	const trimmed = stdout.trim();
	if (!trimmed) {
		throw new Error(
			`sandbox produced no JSON output: ${JSON.stringify(stdout)}`,
		);
	}
	for (
		let index = trimmed.lastIndexOf("{");
		index >= 0;
		index = trimmed.lastIndexOf("{", index - 1)
	) {
		const candidate = trimmed.slice(index);
		try {
			return JSON.parse(candidate) as Record<string, unknown>;
		} catch {
			// keep scanning backward
		}
	}
	throw new Error(
		`sandbox produced no trailing JSON object: ${JSON.stringify(stdout)}`,
	);
}

/** Build sandbox source that runs a single Pi session turn. */
function buildSessionSource(opts: {
	workDir: string;
	agentDir: string;
	initialMessage: string;
}): string {
	return [
		`const workDir = ${JSON.stringify(opts.workDir)};`,
		`const agentDir = ${JSON.stringify(opts.agentDir)};`,
		"let session;",
		"let toolEvents = [];",
		"try {",
		`  const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/entry.mjs");`,
		"  const authStorage = pi.AuthStorage.inMemory();",
		"  authStorage.setRuntimeApiKey('anthropic', 'test-key');",
		"  const modelRegistry = new pi.ModelRegistry(authStorage, `${agentDir}/models.json`);",
		"  const model = modelRegistry.find('anthropic', 'claude-sonnet-4-20250514')",
		"    ?? modelRegistry.getAll().find((c) => c.provider === 'anthropic');",
		"  if (!model) throw new Error('No anthropic model in registry');",
		"  ({ session } = await pi.createAgentSession({",
		"    cwd: workDir,",
		"    agentDir,",
		"    authStorage,",
		"    modelRegistry,",
		"    model,",
		"    tools: pi.createCodingTools(workDir),",
		"    sessionManager: pi.SessionManager.inMemory(),",
		"  }));",
		"  session.subscribe((event) => {",
		"    if (event.type === 'tool_execution_start') {",
		"      toolEvents.push({ type: event.type, toolName: event.toolName });",
		"    }",
		"    if (event.type === 'tool_execution_end') {",
		"      toolEvents.push({ type: event.type, toolName: event.toolName, isError: event.isError });",
		"    }",
		"  });",
		"  await pi.runPrintMode(session, {",
		"    mode: 'text',",
		`    initialMessage: ${JSON.stringify(opts.initialMessage)},`,
		"  });",
		"  console.log(JSON.stringify({",
		"    ok: true,",
		"    toolEvents,",
		"    model: `${model.provider}/${model.id}`,",
		"  }));",
		"  session.dispose();",
		"} catch (error) {",
		"  const errorMessage = error instanceof Error ? error.message : String(error);",
		"  console.log(JSON.stringify({",
		"    ok: false,",
		"    error: errorMessage.split('\\n')[0].slice(0, 600),",
		"    stack: error instanceof Error ? error.stack : String(error),",
		"    toolEvents,",
		"    lastStopReason: session?.state?.messages?.at(-1)?.stopReason,",
		"    lastErrorMessage: session?.state?.messages?.at(-1)?.errorMessage,",
		"  }));",
		"  process.exitCode = 1;",
		"}",
	].join("\n");
}

describe.skipIf(skipUnlessPiInstalled())(
	"Pi SDK sandbox network-policy regressions (mock-provider)",
	() => {
		let mockServer: MockLlmServerHandle | undefined;
		const cleanups: Array<() => Promise<void>> = [];

		beforeAll(async () => {
			mockServer = await createMockLlmServer([]);
		}, 15_000);

		afterAll(async () => {
			for (const cleanup of cleanups) await cleanup();
			await mockServer?.close();
		});

		async function scaffoldWorkDir(): Promise<{
			workDir: string;
			agentDir: string;
		}> {
			const workDir = await mkdtemp(
				path.join(tmpdir(), "pi-sdk-net-policy-"),
			);
			const agentDir = path.join(workDir, ".pi", "agent");
			await mkdir(agentDir, { recursive: true });
			await writeFile(
				path.join(agentDir, "models.json"),
				JSON.stringify(
					{
						providers: {
							anthropic: {
								baseUrl: `http://127.0.0.1:${mockServer!.port}`,
							},
						},
					},
					null,
					2,
				),
			);
			cleanups.push(async () =>
				rm(workDir, { recursive: true, force: true }),
			);
			return { workDir, agentDir };
		}

		function createRuntime(
			stdio: { stdout: string[]; stderr: string[] },
			permissions: Permissions,
		): NodeRuntime {
			const runtime = new NodeRuntime({
				onStdio: (event) => {
					if (event.channel === "stdout") stdio.stdout.push(event.message);
					if (event.channel === "stderr") stdio.stderr.push(event.message);
				},
				systemDriver: createNodeDriver({
					filesystem: new NodeFileSystem(),
					moduleAccess: { cwd: SECURE_EXEC_ROOT },
					permissions,
					useDefaultNetwork: true,
				}),
				runtimeDriverFactory: createNodeRuntimeDriverFactory(),
			});
			cleanups.push(async () => runtime.terminate());
			return runtime;
		}

		// -----------------------------------------------------------------
		// 1. Network allowed — Pi SDK request to mock LLM server succeeds
		// -----------------------------------------------------------------
		it(
			"[network-allow] Pi SDK session succeeds when outbound network is allowed",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				const readableFile = path.join(workDir, "hello.txt");
				await writeFile(readableFile, "network-allow-sentinel");

				mockServer!.reset([
					{
						type: "tool_use",
						name: "read",
						input: { path: readableFile },
					},
					{ type: "text", text: "Done reading the file." },
				]);

				const permissions: Permissions = {
					...allowAllFs,
					...allowAllNetwork,
					...allowAllChildProcess,
					...allowAllEnv,
				};

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio, permissions);

				await runtime.exec(
					buildSessionSource({
						workDir,
						agentDir,
						initialMessage: "Read hello.txt and tell me its contents.",
					}),
					{
						cwd: workDir,
						filePath: "/entry.mjs",
						env: {
							HOME: workDir,
							NO_COLOR: "1",
							ANTHROPIC_API_KEY: "test-key",
						},
					},
				);

				const combinedStdout = stdio.stdout.join("");
				const payload = parseLastJsonLine(combinedStdout);

				// Session must complete successfully
				expect(
					payload.ok,
					`session should succeed with allowed network: ${JSON.stringify(payload)}`,
				).toBe(true);

				// Mock server must have received requests
				expect(
					mockServer!.requestCount(),
					"mock server must receive at least one request when network is allowed",
				).toBeGreaterThan(0);

				// Read tool must have executed
				const toolEvents = (payload.toolEvents ?? []) as Array<
					Record<string, unknown>
				>;
				const readEnd = toolEvents.find(
					(e) =>
						e.toolName === "read" &&
						e.type === "tool_execution_end",
				);
				expect(
					readEnd,
					"read tool_execution_end event must be emitted",
				).toBeTruthy();
				expect(
					readEnd?.isError,
					"read tool must succeed (isError=false) when network is allowed",
				).toBe(false);
			},
			60_000,
		);

		// -----------------------------------------------------------------
		// 2. Network denied for the mock server destination — Pi surfaces
		//    a clean error and zero requests reach the server
		// -----------------------------------------------------------------
		it(
			"[network-deny-destination] Pi SDK fails cleanly when destination is denied by network policy",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();

				mockServer!.reset([
					{ type: "text", text: "unreachable" },
				]);

				// Deny fetch/http to the mock server's loopback port, allow dns
				const denyMockServer: Permissions = {
					...allowAllFs,
					...allowAllChildProcess,
					...allowAllEnv,
					network: (req) => {
						// Allow DNS so the URL can be parsed, deny actual fetch/http
						if (req.op === "dns") return { allow: true };
						if (req.op === "fetch" || req.op === "http") {
							return {
								allow: false,
								reason: `outbound request to ${req.url} denied by test policy`,
							};
						}
						return { allow: false, reason: "network denied by test policy" };
					},
				};

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio, denyMockServer);

				await runtime.exec(
					buildSessionSource({
						workDir,
						agentDir,
						initialMessage: "Say hello.",
					}),
					{
						cwd: workDir,
						filePath: "/entry.mjs",
						env: {
							HOME: workDir,
							NO_COLOR: "1",
							ANTHROPIC_API_KEY: "test-key",
						},
					},
				);

				const combinedStdout = stdio.stdout.join("");
				const payload = parseLastJsonLine(combinedStdout);

				// Session must surface an error (network denied)
				expect(
					payload.ok === false || payload.error !== undefined,
					`session should fail when destination is denied, got: ${JSON.stringify(payload)}`,
				).toBe(true);

				// Mock server must NOT have been contacted
				expect(
					mockServer!.requestCount(),
					"mock server must receive zero requests when destination is denied",
				).toBe(0);
			},
			60_000,
		);

		// -----------------------------------------------------------------
		// 3. Selective hostname policy — loopback allowed, non-loopback denied
		//
		// The kernel HTTP client path routes through socketTable.connect()
		// which checks { op: "connect", hostname }.  This test proves that
		// the permission callback can allow loopback while denying other
		// hostnames through the same SecureExec enforcement path.
		// -----------------------------------------------------------------
		it(
			"[network-selective] allowed hostname succeeds while denied hostname is blocked",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				const readableFile = path.join(workDir, "selective.txt");
				await writeFile(readableFile, "selective-allow-sentinel");

				mockServer!.reset([
					{
						type: "tool_use",
						name: "read",
						input: { path: readableFile },
					},
					{ type: "text", text: "Done." },
				]);

				// Allow loopback (127.0.0.1) — deny everything else
				const selectivePolicy: Permissions = {
					...allowAllFs,
					...allowAllChildProcess,
					...allowAllEnv,
					network: (req) => {
						if (req.op === "dns") return { allow: true };
						if (req.op === "listen") return { allow: true };
						// Allow loopback hostname for mock server
						if (req.hostname === "127.0.0.1" || req.hostname === "::1" || req.hostname === "localhost") {
							return { allow: true };
						}
						// fetch/http ops carry url — check for loopback there too
						if ((req.op === "fetch" || req.op === "http") && req.url) {
							try {
								const host = new URL(req.url).hostname;
								if (host === "127.0.0.1" || host === "::1" || host === "localhost") {
									return { allow: true };
								}
							} catch {
								// fall through to deny
							}
						}
						return {
							allow: false,
							reason: `only loopback is allowed; got hostname=${req.hostname ?? "unknown"}`,
						};
					},
				};

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio, selectivePolicy);

				// Pi session should succeed — mock server is on 127.0.0.1
				await runtime.exec(
					buildSessionSource({
						workDir,
						agentDir,
						initialMessage: "Read selective.txt.",
					}),
					{
						cwd: workDir,
						filePath: "/entry.mjs",
						env: {
							HOME: workDir,
							NO_COLOR: "1",
							ANTHROPIC_API_KEY: "test-key",
						},
					},
				);

				const combinedStdout = stdio.stdout.join("");
				const payload = parseLastJsonLine(combinedStdout);

				expect(
					payload.ok,
					`session should succeed with loopback-only policy: ${JSON.stringify(payload)}`,
				).toBe(true);

				expect(
					mockServer!.requestCount(),
					"mock server must receive requests on allowed loopback",
				).toBeGreaterThan(0);

				// Probe: fetch to a non-loopback private IP must be denied
				const probeSource = [
					"try {",
					'  const resp = await fetch("http://10.0.0.1/probe");',
					"  console.log(JSON.stringify({ ok: true, status: resp.status }));",
					"} catch (error) {",
					"  console.log(JSON.stringify({",
					"    ok: false,",
					"    error: error instanceof Error ? error.message : String(error),",
					"  }));",
					"}",
				].join("\n");

				const probeStdio = {
					stdout: [] as string[],
					stderr: [] as string[],
				};
				const probeRuntime = createRuntime(probeStdio, selectivePolicy);

				await probeRuntime.exec(probeSource, {
					cwd: workDir,
					filePath: "/probe.mjs",
					env: { HOME: workDir, NO_COLOR: "1" },
				});

				const probeOut = probeStdio.stdout.join("");
				const probePayload = parseLastJsonLine(probeOut);

				expect(
					probePayload.ok,
					`fetch to non-loopback 10.0.0.1 must be denied: ${JSON.stringify(probePayload)}`,
				).toBe(false);
			},
			60_000,
		);
	},
);
