/**
 * Pi SDK sandbox permission-denial regressions.
 *
 * Each test exercises createAgentSession() + createCodingTools(workDir) through
 * the unmodified @mariozechner/pi-coding-agent package while selectively denying
 * one SecureExec capability.  The tests prove that:
 *
 *   1. Denied operations surface clean tool-failure results (not hangs or crashes)
 *   2. Allowed operations still work alongside the denied capability
 *   3. Denials flow through the real SecureExec permissions/kernel/runtime path
 *
 * Provider: mock LLM server (deterministic tool calls).
 */

import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
		throw new Error(`sandbox produced no JSON output: ${JSON.stringify(stdout)}`);
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
	throw new Error(`sandbox produced no trailing JSON object: ${JSON.stringify(stdout)}`);
}

/** Build sandbox source that runs Pi with two sequential mock turns. */
function buildDualToolSource(opts: {
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
	"Pi SDK sandbox permission-denial regressions (mock-provider)",
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
				path.join(tmpdir(), "pi-sdk-perm-denial-"),
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
			cleanups.push(async () => rm(workDir, { recursive: true, force: true }));
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
		// 1. Deny filesystem mutation — write tool fails, read tool works
		// -----------------------------------------------------------------
		it(
			"[deny-fs-write] write tool fails cleanly while read tool succeeds",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				const targetFile = path.join(workDir, "should-not-exist.txt");
				const readableFile = path.join(workDir, "readable.txt");
				await writeFile(readableFile, "readable-content-sentinel");

				// Mock turn 1: Pi calls write tool (should fail — fs mutation denied).
				// Mock turn 2: Pi reports error; mock replies with read tool call.
				// Mock turn 3: text summary.
				mockServer!.reset([
					{
						type: "tool_use",
						name: "write",
						input: { path: targetFile, content: "denied content" },
					},
					{
						type: "tool_use",
						name: "read",
						input: { path: readableFile },
					},
					{ type: "text", text: "Done." },
				]);

				// Allow read + network + subprocess + env, deny fs mutation
				const readOnlyFs: Permissions = {
					fs: (req) => ({
						allow: ["read", "readdir", "stat", "exists"].includes(req.op),
					}),
					...allowAllNetwork,
					...allowAllChildProcess,
					...allowAllEnv,
				};

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio, readOnlyFs);

				const result = await runtime.exec(
					buildDualToolSource({
						workDir,
						agentDir,
						initialMessage: "Write a file, then read another.",
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

				// Session must complete (not hang)
				expect(payload.ok, `session crashed: ${JSON.stringify(payload)}`).toBe(
					true,
				);

				// The denied file must not have been created
				expect(
					existsSync(targetFile),
					"denied write tool must not create the file on disk",
				).toBe(false);

				// Write tool must have surfaced an error event
				const toolEvents = (payload.toolEvents ?? []) as Array<
					Record<string, unknown>
				>;
				const writeEnd = toolEvents.find(
					(e) =>
						e.toolName === "write" && e.type === "tool_execution_end",
				);
				expect(
					writeEnd,
					"write tool_execution_end event must be emitted",
				).toBeTruthy();
				expect(
					writeEnd?.isError,
					"write tool must report isError=true when fs mutation is denied",
				).toBe(true);

				// Read tool must have succeeded alongside the denial
				const readEnd = toolEvents.find(
					(e) =>
						e.toolName === "read" && e.type === "tool_execution_end",
				);
				expect(
					readEnd,
					"read tool_execution_end event must be emitted",
				).toBeTruthy();
				expect(
					readEnd?.isError,
					"read tool must succeed (isError=false) while fs write is denied",
				).toBe(false);
			},
			60_000,
		);

		// -----------------------------------------------------------------
		// 2. Deny subprocess — bash tool fails, write tool works
		// -----------------------------------------------------------------
		it(
			"[deny-subprocess] bash tool fails cleanly while write tool succeeds",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				const targetFile = path.join(workDir, "written-under-denial.txt");
				const fileContent = "allowed write content";

				// Mock turn 1: Pi calls bash tool (should fail).
				// Mock turn 2: Pi calls write tool (should succeed).
				// Mock turn 3: text summary.
				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: "echo should-not-run" },
					},
					{
						type: "tool_use",
						name: "write",
						input: { path: targetFile, content: fileContent },
					},
					{ type: "text", text: "Done." },
				]);

				// Allow fs + network + env, deny subprocess
				const noSubprocess: Permissions = {
					...allowAllFs,
					...allowAllNetwork,
					// childProcess omitted → denied
					...allowAllEnv,
				};

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio, noSubprocess);

				const result = await runtime.exec(
					buildDualToolSource({
						workDir,
						agentDir,
						initialMessage: "Run a command, then write a file.",
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

				expect(payload.ok, `session crashed: ${JSON.stringify(payload)}`).toBe(
					true,
				);

				const toolEvents = (payload.toolEvents ?? []) as Array<
					Record<string, unknown>
				>;

				// Bash tool must surface an error
				const bashEnd = toolEvents.find(
					(e) =>
						e.toolName === "bash" && e.type === "tool_execution_end",
				);
				expect(
					bashEnd,
					"bash tool_execution_end event must be emitted",
				).toBeTruthy();
				expect(
					bashEnd?.isError,
					"bash tool must report isError=true when subprocess is denied",
				).toBe(true);

				// Write tool must succeed alongside the denial
				const writeEnd = toolEvents.find(
					(e) =>
						e.toolName === "write" && e.type === "tool_execution_end",
				);
				expect(
					writeEnd,
					"write tool_execution_end event must be emitted",
				).toBeTruthy();
				expect(
					writeEnd?.isError,
					"write tool must succeed (isError=false) while subprocess is denied",
				).toBe(false);

				// File must have been created on disk
				expect(
					existsSync(targetFile),
					"allowed write tool must create the file on disk",
				).toBe(true);
				const written = await readFile(targetFile, "utf8");
				expect(written).toBe(fileContent);
			},
			60_000,
		);

		// -----------------------------------------------------------------
		// 3. Deny outbound network — SDK fails cleanly (can't reach API)
		// -----------------------------------------------------------------
		it(
			"[deny-network] Pi SDK surfaces clean error when network is denied",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();

				// No mock turn matters — the SDK cannot reach the server at all.
				mockServer!.reset([
					{ type: "text", text: "unreachable" },
				]);

				// Allow fs + subprocess + env, deny network
				const noNetwork: Permissions = {
					...allowAllFs,
					...allowAllChildProcess,
					...allowAllEnv,
					// network omitted → denied
				};

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio, noNetwork);

				const result = await runtime.exec(
					buildDualToolSource({
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
				const combinedStderr = stdio.stderr.join("");

				// Runtime must not hang — it should exit (possibly with non-zero)
				// but not timeout or crash the harness.
				const payload = parseLastJsonLine(combinedStdout);

				// The session should surface an error (network denied) rather than
				// hanging or crashing without any output.
				expect(
					payload.ok === false || payload.error !== undefined,
					`session should fail with network denied, got: ${JSON.stringify(payload)}`,
				).toBe(true);

				// Verify the mock server was NOT contacted
				expect(
					mockServer!.requestCount(),
					"mock server must receive zero requests when network is denied",
				).toBe(0);
			},
			60_000,
		);
	},
);
