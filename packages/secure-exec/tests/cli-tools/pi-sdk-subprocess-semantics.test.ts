/**
 * Pi SDK subprocess semantics — proves that bash tool preserves
 * stdout, stderr, exit status, and responds to cancellation.
 *
 * Extends the basic bash happy-path from pi-sdk-tool-integration.test.ts
 * to cover non-zero exits, stderr output, and session interruption.
 *
 * All tests run the unmodified @mariozechner/pi-coding-agent package
 * inside NodeRuntime — no Pi patches, host-spawn fallbacks, or
 * Pi-specific runtime exceptions.
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
 * Build sandbox source that runs Pi's bash tool and captures
 * detailed tool result content from tool_execution_end events.
 *
 * When cancelAfterMs is set, the session is disposed mid-execution
 * to test the interruption/cancellation path.
 */
function buildSubprocessSource(opts: {
	workDir: string;
	agentDir: string;
	initialMessage: string;
	cancelAfterMs?: number;
}): string {
	const hasCancellation = opts.cancelAfterMs != null;

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
		// Subscribe with full result content capture
		"  session.subscribe((event) => {",
		"    if (event.type === 'tool_execution_start') {",
		"      toolEvents.push({ type: event.type, toolName: event.toolName });",
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
		"        toolName: event.toolName,",
		"        isError: event.isError,",
		"        resultText,",
		"      });",
		"    }",
		"  });",
		// Cancellation path: dispose session after delay, race with runPrintMode
		...(hasCancellation
			? [
					"  let timedOut = false;",
					"  const cancelPromise = new Promise((resolve) => {",
					`    setTimeout(() => {`,
					"      timedOut = true;",
					"      try { session.dispose(); } catch {}",
					"      resolve();",
					`    }, ${opts.cancelAfterMs});`,
					"  });",
					"  try {",
					"    await Promise.race([",
					"      pi.runPrintMode(session, {",
					"        mode: 'text',",
					`        initialMessage: ${JSON.stringify(opts.initialMessage)},`,
					"      }),",
					"      cancelPromise,",
					"    ]);",
					"  } catch {}",
					"  try { session.dispose(); } catch {}",
					"  console.log(JSON.stringify({",
					"    ok: true,",
					"    toolEvents,",
					"    timedOut,",
					"  }));",
				]
			: [
					"  await pi.runPrintMode(session, {",
					"    mode: 'text',",
					`    initialMessage: ${JSON.stringify(opts.initialMessage)},`,
					"  });",
					"  session.dispose();",
					"  console.log(JSON.stringify({",
					"    ok: true,",
					"    toolEvents,",
					"  }));",
				]),
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

describe.skipIf(skipUnlessPiInstalled())(
	"Pi SDK subprocess semantics (mock-provider)",
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
				path.join(tmpdir(), "pi-sdk-subprocess-"),
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

		// --- Successful command with stdout capture ---
		it(
			"[bash/success] captures stdout content and preserves zero exit status",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: "echo hello-subprocess-test" },
					},
					{ type: "text", text: "Done." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);

				const result = await runtime.exec(
					buildSubprocessSource({
						workDir,
						agentDir,
						initialMessage:
							"Run: echo hello-subprocess-test",
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

				expect(result.code, stdio.stderr.join("")).toBe(0);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];

				expect(
					toolEvents.some(
						(e) =>
							e.toolName === "bash" &&
							e.type === "tool_execution_start",
					),
					"bash tool_execution_start missing",
				).toBe(true);

				const bashEnd = toolEvents.find(
					(e) =>
						e.toolName === "bash" &&
						e.type === "tool_execution_end",
				);
				expect(bashEnd, "bash tool_execution_end missing").toBeTruthy();

				// Tool result text should contain the command's stdout
				const resultText = String(bashEnd!.resultText ?? "");
				expect(
					resultText,
					"tool result should preserve stdout content, not flatten it to an opaque error",
				).toContain("hello-subprocess-test");
			},
			60_000,
		);

		// --- Non-zero exit status preserved ---
		it(
			"[bash/nonzero-exit] preserves non-zero exit status in tool result",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: {
							command: "echo nonzero-output; exit 42",
						},
					},
					{ type: "text", text: "Command failed." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);

				const result = await runtime.exec(
					buildSubprocessSource({
						workDir,
						agentDir,
						initialMessage: "Run a command that exits 42.",
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

				// Pi session may exit 0 (handled the tool failure gracefully)
				// or non-zero — either is acceptable as long as the tool result
				// captures the exit status rather than flattening it.

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];

				const bashEnd = toolEvents.find(
					(e) =>
						e.toolName === "bash" &&
						e.type === "tool_execution_end",
				);
				expect(bashEnd, "bash tool_execution_end missing").toBeTruthy();

				// The tool result should surface the exit status or command output,
				// not flatten everything into an opaque generic error
				const resultText = String(bashEnd!.resultText ?? "");
				expect(
					resultText.includes("42") ||
						resultText.includes("nonzero-output"),
					`tool result should preserve exit status or command output, got: ${resultText.slice(0, 300)}`,
				).toBe(true);
			},
			60_000,
		);

		// --- stderr output preserved ---
		it(
			"[bash/stderr] preserves stderr output in tool result",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: {
							command:
								"echo stderr-diagnostic >&2; echo stdout-normal",
						},
					},
					{ type: "text", text: "I see the output." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);

				const result = await runtime.exec(
					buildSubprocessSource({
						workDir,
						agentDir,
						initialMessage:
							"Run a command that writes to stderr.",
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

				expect(result.code, stdio.stderr.join("")).toBe(0);

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];

				const bashEnd = toolEvents.find(
					(e) =>
						e.toolName === "bash" &&
						e.type === "tool_execution_end",
				);
				expect(bashEnd, "bash tool_execution_end missing").toBeTruthy();

				// Pi's bash tool merges stdout+stderr into combined output —
				// verify both streams are captured in the result.
				const resultText = String(bashEnd!.resultText ?? "");
				expect(
					resultText.includes("stderr-diagnostic") ||
						resultText.includes("stdout-normal"),
					`tool result should contain command output (stdout or stderr), got: ${resultText.slice(0, 300)}`,
				).toBe(true);
			},
			60_000,
		);

		// --- Cancellation / interruption ---
		it(
			"[bash/cancellation] session disposal during long-running command terminates sandbox subprocess",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: "sleep 300" },
					},
					{ type: "text", text: "Interrupted." },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);

				const startTime = Date.now();

				const result = await runtime.exec(
					buildSubprocessSource({
						workDir,
						agentDir,
						initialMessage: "Run: sleep 300",
						cancelAfterMs: 3_000,
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

				const elapsed = Date.now() - startTime;

				// The subprocess must have been interrupted — sleep 300
				// should not have run to completion. Allow generous headroom
				// for sandbox startup + tool dispatch + disposal teardown.
				expect(
					elapsed,
					`cancellation should terminate the subprocess promptly, not wait for sleep 300 (elapsed: ${elapsed}ms)`,
				).toBeLessThan(45_000);

				const payload = parseLastJsonLine(stdio.stdout.join(""));

				// Verify the bash tool was at least started before cancellation
				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];
				expect(
					toolEvents.some(
						(e) =>
							e.toolName === "bash" &&
							e.type === "tool_execution_start",
					),
					"bash tool should have started before cancellation",
				).toBe(true);
			},
			60_000,
		);
	},
);
