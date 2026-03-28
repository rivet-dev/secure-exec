/**
 * Pi SDK tool event contract — verifies tool_execution_start / tool_execution_end
 * event ordering, payload shape, and isError semantics across success and failure
 * tool paths.
 *
 * Coverage matrix axes proved by this file (mock LLM, deterministic):
 *
 *   [tool-event/multi-tool-ordering]   event ordering across sequential tool calls
 *   [tool-event/isError-success]       isError===false for successful bash, write, edit
 *   [tool-event/isError-success/pwd]   US-078 regression: bash:pwd isError===false after dispatch fix
 *   [tool-event/isError-failure]       isError===true for failed bash (nonzero exit) and edit (file not found)
 *   [tool-event/payload-shape]         toolCallId, toolName, result present on end events
 *
 * All tests run the unmodified @mariozechner/pi-coding-agent package
 * inside NodeRuntime — no Pi patches, host-spawn fallbacks, or
 * Pi-specific runtime exceptions.
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
	allowAll,
	createNodeDriver,
	createNodeHostCommandExecutor,
	createNodeRuntimeDriverFactory,
} from "../../src/index.js";
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

/**
 * Build sandbox source that captures full tool event payloads including
 * toolCallId, toolName, isError, and result content text.
 */
function buildEventCaptureSource(opts: {
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
		"  if (!model) throw new Error('No anthropic model available');",
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
		"      toolEvents.push({",
		"        type: event.type,",
		"        toolCallId: event.toolCallId,",
		"        toolName: event.toolName,",
		"        seq: toolEvents.length,",
		"      });",
		"    }",
		"    if (event.type === 'tool_execution_end') {",
		"      let resultText = '';",
		"      try {",
		"        if (event.result && Array.isArray(event.result.content)) {",
		"          resultText = event.result.content",
		"            .filter(c => c.type === 'text')",
		"            .map(c => c.text)",
		"            .join('');",
		"        }",
		"      } catch {}",
		"      toolEvents.push({",
		"        type: event.type,",
		"        toolCallId: event.toolCallId,",
		"        toolName: event.toolName,",
		"        isError: event.isError,",
		"        resultText: resultText.slice(0, 2000),",
		"        seq: toolEvents.length,",
		"      });",
		"    }",
		"  });",
		"  await pi.runPrintMode(session, {",
		"    mode: 'text',",
		`    initialMessage: ${JSON.stringify(opts.initialMessage)},`,
		"  });",
		"  session.dispose();",
		"  console.log(JSON.stringify({ ok: true, toolEvents }));",
		"} catch (error) {",
		"  const errorMessage = error instanceof Error ? error.message : String(error);",
		"  try { if (session) session.dispose(); } catch {}",
		"  console.log(JSON.stringify({",
		"    ok: false,",
		"    error: errorMessage.split('\\n')[0].slice(0, 600),",
		"    toolEvents,",
		"  }));",
		"  process.exitCode = 1;",
		"}",
	].join("\n");
}

interface ToolEvent {
	type: string;
	toolCallId?: string;
	toolName: string;
	isError?: boolean;
	resultText?: string;
	seq: number;
}

describe.skipIf(skipUnlessPiInstalled())(
	"Pi SDK tool event contract (mock-provider)",
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
				path.join(tmpdir(), "pi-sdk-tool-event-"),
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

		function createRuntime(stdio: {
			stdout: string[];
			stderr: string[];
		}): NodeRuntime {
			const runtime = new NodeRuntime({
				onStdio: (event) => {
					if (event.channel === "stdout")
						stdio.stdout.push(event.message);
					if (event.channel === "stderr")
						stdio.stderr.push(event.message);
				},
				systemDriver: createNodeDriver({
					filesystem: new NodeFileSystem(),
					moduleAccess: { cwd: SECURE_EXEC_ROOT },
					permissions: allowAll,
					useDefaultNetwork: true,
					commandExecutor: createNodeHostCommandExecutor(),
				}),
				runtimeDriverFactory: createNodeRuntimeDriverFactory(),
			});
			cleanups.push(async () => runtime.terminate());
			return runtime;
		}

		function runAndParse(
			runtime: NodeRuntime,
			source: string,
			opts: { cwd: string },
			stdio: { stdout: string[]; stderr: string[] },
		) {
			return runtime.exec(source, {
				cwd: opts.cwd,
				filePath: "/entry.mjs",
				env: {
					HOME: opts.cwd,
					NO_COLOR: "1",
					ANTHROPIC_API_KEY: "test-key",
				},
			});
		}

		// ------------------------------------------------------------------
		// Multi-tool ordering: bash then write, both successful
		// ------------------------------------------------------------------
		it(
			"[tool-event/multi-tool-ordering] events arrive start→end for each sequential tool",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				const targetFile = path.join(workDir, "multi-tool-output.txt");

				// Mock: first call → bash tool, second call → write tool, third call → text
				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: "echo multi-tool-test" },
					},
					{
						type: "tool_use",
						name: "write",
						input: {
							path: targetFile,
							content: "written after bash",
						},
					},
					{ type: "text", text: "Both tools ran." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);
				await runAndParse(
					runtime,
					buildEventCaptureSource({
						workDir,
						agentDir,
						initialMessage: "Run bash then write a file.",
					}),
					{ cwd: workDir },
					stdio,
				);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				const events = payload.toolEvents as ToolEvent[];
				expect(events.length).toBeGreaterThanOrEqual(4);

				// Find events by tool name
				const bashStart = events.find(
					(e) => e.toolName === "bash" && e.type === "tool_execution_start",
				);
				const bashEnd = events.find(
					(e) => e.toolName === "bash" && e.type === "tool_execution_end",
				);
				const writeStart = events.find(
					(e) => e.toolName === "write" && e.type === "tool_execution_start",
				);
				const writeEnd = events.find(
					(e) => e.toolName === "write" && e.type === "tool_execution_end",
				);

				expect(bashStart, "bash start event missing").toBeTruthy();
				expect(bashEnd, "bash end event missing").toBeTruthy();
				expect(writeStart, "write start event missing").toBeTruthy();
				expect(writeEnd, "write end event missing").toBeTruthy();

				// Ordering: bash start < bash end < write start < write end
				expect(bashStart!.seq).toBeLessThan(bashEnd!.seq);
				expect(bashEnd!.seq).toBeLessThan(writeStart!.seq);
				expect(writeStart!.seq).toBeLessThan(writeEnd!.seq);
			},
			60_000,
		);

		// ------------------------------------------------------------------
		// isError === false for successful bash (exit 0)
		// ------------------------------------------------------------------
		it(
			"[tool-event/isError-success] bash exit 0 reports isError===false",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();

				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: "echo success-check" },
					},
					{ type: "text", text: "Done." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);
				await runAndParse(
					runtime,
					buildEventCaptureSource({
						workDir,
						agentDir,
						initialMessage: "Run echo success-check.",
					}),
					{ cwd: workDir },
					stdio,
				);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				const events = payload.toolEvents as ToolEvent[];
				const bashEnd = events.find(
					(e) =>
						e.toolName === "bash" && e.type === "tool_execution_end",
				);
				expect(bashEnd, "bash tool_execution_end missing").toBeTruthy();
				expect(
					bashEnd!.isError,
					`bash exit 0 should report isError===false, got isError===${bashEnd!.isError}; ` +
						`resultText: ${String(bashEnd!.resultText).slice(0, 200)}`,
				).toBe(false);

				// Verify result text contains command output
				expect(String(bashEnd!.resultText)).toContain("success-check");
			},
			60_000,
		);

		// ------------------------------------------------------------------
		// isError === false for successful write and edit
		// ------------------------------------------------------------------
		it(
			"[tool-event/isError-success] write and edit report isError===false on success",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				const targetFile = path.join(workDir, "event-contract-file.txt");

				// Pre-create file for edit
				await writeFile(targetFile, "original line\n");

				// Mock: write a new file, then edit it
				mockServer!.reset([
					{
						type: "tool_use",
						name: "write",
						input: {
							path: targetFile,
							content: "rewritten by write tool\nsecond line\n",
						},
					},
					{
						type: "tool_use",
						name: "edit",
						input: {
							path: targetFile,
							oldText: "second line",
							newText: "edited second line",
						},
					},
					{ type: "text", text: "File updated." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);
				await runAndParse(
					runtime,
					buildEventCaptureSource({
						workDir,
						agentDir,
						initialMessage: "Write then edit the file.",
					}),
					{ cwd: workDir },
					stdio,
				);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				const events = payload.toolEvents as ToolEvent[];
				const writeEnd = events.find(
					(e) =>
						e.toolName === "write" && e.type === "tool_execution_end",
				);
				const editEnd = events.find(
					(e) =>
						e.toolName === "edit" && e.type === "tool_execution_end",
				);

				expect(writeEnd, "write tool_execution_end missing").toBeTruthy();
				expect(
					writeEnd!.isError,
					`successful write should report isError===false, got ${writeEnd!.isError}`,
				).toBe(false);

				expect(editEnd, "edit tool_execution_end missing").toBeTruthy();
				expect(
					editEnd!.isError,
					`successful edit should report isError===false, got ${editEnd!.isError}`,
				).toBe(false);

				// Verify edit actually applied
				const content = await readFile(targetFile, "utf8");
				expect(content).toContain("edited second line");
			},
			60_000,
		);

		// ------------------------------------------------------------------
		// isError === true for failed bash (nonzero exit)
		// ------------------------------------------------------------------
		it(
			"[tool-event/isError-failure] bash nonzero exit reports isError===true",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();

				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: "echo fail-output; exit 1" },
					},
					{ type: "text", text: "Command failed." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);
				await runAndParse(
					runtime,
					buildEventCaptureSource({
						workDir,
						agentDir,
						initialMessage: "Run a command that exits 1.",
					}),
					{ cwd: workDir },
					stdio,
				);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				const events = payload.toolEvents as ToolEvent[];
				const bashEnd = events.find(
					(e) =>
						e.toolName === "bash" && e.type === "tool_execution_end",
				);
				expect(bashEnd, "bash tool_execution_end missing").toBeTruthy();

				// Pi SDK bash tool rejects on non-zero exit → isError must be true
				expect(
					bashEnd!.isError,
					`bash exit 1 should report isError===true, got isError===${bashEnd!.isError}`,
				).toBe(true);

				// Result should still contain the command output
				const resultText = String(bashEnd!.resultText ?? "");
				expect(
					resultText.includes("fail-output") || resultText.includes("exit code"),
					`failed bash result should preserve output or mention exit code, got: ${resultText.slice(0, 200)}`,
				).toBe(true);
			},
			60_000,
		);

		// ------------------------------------------------------------------
		// isError === true for failed edit (file does not exist)
		// ------------------------------------------------------------------
		it(
			"[tool-event/isError-failure] edit on nonexistent file reports isError===true",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();

				mockServer!.reset([
					{
						type: "tool_use",
						name: "edit",
						input: {
							path: path.join(workDir, "does-not-exist.txt"),
							oldText: "phantom",
							newText: "replacement",
						},
					},
					{ type: "text", text: "File not found." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);
				await runAndParse(
					runtime,
					buildEventCaptureSource({
						workDir,
						agentDir,
						initialMessage: "Edit a file that does not exist.",
					}),
					{ cwd: workDir },
					stdio,
				);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				// Session may still complete ok=true since Pi handles tool errors gracefully
				const events = payload.toolEvents as ToolEvent[];
				const editEnd = events.find(
					(e) =>
						e.toolName === "edit" && e.type === "tool_execution_end",
				);
				expect(editEnd, "edit tool_execution_end missing").toBeTruthy();

				// Pi SDK edit tool rejects when file doesn't exist → isError must be true
				expect(
					editEnd!.isError,
					`edit on missing file should report isError===true, got isError===${editEnd!.isError}`,
				).toBe(true);
			},
			60_000,
		);

		// ------------------------------------------------------------------
		// US-078 regression: bash:pwd success reports isError===false
		//
		// Root cause: the sandbox bash tool previously failed with
		// "ENOENT: command not found: /bin/bash" because the kernel didn't
		// expose host /bin/bash. Pi emitted isError===true for the failed
		// tool call even though the user intent (run pwd) was valid.
		// After the bash-command dispatch fix, isError correctly reports
		// false for successful execution. This is NOT a Pi SDK contract
		// issue — Pi faithfully reflects tool execution outcome.
		// ------------------------------------------------------------------
		it(
			"[tool-event/isError-success] bash pwd reports isError===false (US-078 regression)",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();

				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: "pwd" },
					},
					{ type: "text", text: "Done." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);
				await runAndParse(
					runtime,
					buildEventCaptureSource({
						workDir,
						agentDir,
						initialMessage: "Print the current working directory.",
					}),
					{ cwd: workDir },
					stdio,
				);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				const events = payload.toolEvents as ToolEvent[];
				const bashStart = events.find(
					(e) =>
						e.toolName === "bash" &&
						e.type === "tool_execution_start",
				);
				const bashEnd = events.find(
					(e) =>
						e.toolName === "bash" && e.type === "tool_execution_end",
				);

				expect(bashStart, "bash tool_execution_start missing").toBeTruthy();
				expect(bashEnd, "bash tool_execution_end missing").toBeTruthy();

				// US-078: successful bash:pwd must report isError===false
				expect(
					bashEnd!.isError,
					`bash pwd should report isError===false, got isError===${bashEnd!.isError}; ` +
						`resultText: ${String(bashEnd!.resultText).slice(0, 200)}`,
				).toBe(false);

				// Result text should contain the working directory path
				expect(String(bashEnd!.resultText)).toContain(workDir);
			},
			60_000,
		);

		// ------------------------------------------------------------------
		// Payload shape: toolCallId present and consistent across start/end
		// ------------------------------------------------------------------
		it(
			"[tool-event/payload-shape] toolCallId is present and matches between start and end",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();

				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: "echo shape-test" },
					},
					{ type: "text", text: "Done." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);
				await runAndParse(
					runtime,
					buildEventCaptureSource({
						workDir,
						agentDir,
						initialMessage: "Run echo shape-test.",
					}),
					{ cwd: workDir },
					stdio,
				);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				const events = payload.toolEvents as ToolEvent[];
				const bashStart = events.find(
					(e) =>
						e.toolName === "bash" &&
						e.type === "tool_execution_start",
				);
				const bashEnd = events.find(
					(e) =>
						e.toolName === "bash" && e.type === "tool_execution_end",
				);

				expect(bashStart, "bash start missing").toBeTruthy();
				expect(bashEnd, "bash end missing").toBeTruthy();

				// toolCallId must be present on both events
				expect(
					bashStart!.toolCallId,
					"toolCallId missing on tool_execution_start",
				).toBeTruthy();
				expect(
					bashEnd!.toolCallId,
					"toolCallId missing on tool_execution_end",
				).toBeTruthy();

				// toolCallId must match between start and end for the same tool call
				expect(bashEnd!.toolCallId).toBe(bashStart!.toolCallId);

				// toolName must be present
				expect(bashStart!.toolName).toBe("bash");
				expect(bashEnd!.toolName).toBe("bash");
			},
			60_000,
		);
	},
);
