/**
 * Pi SDK sandbox tool integration — mock-provider coverage.
 *
 * Coverage matrix axes proved by this file (mock LLM, deterministic):
 *
 *   [subprocess/bash]       bash tool via sandbox child_process bridge
 *   [filesystem mutation]   write tool (create) + edit tool (modify) via sandbox fs bridge
 *
 * Limitation: these tests use a mock LLM server, not a real provider.
 * Real-provider session execution is covered separately by
 * pi-sdk-real-provider.test.ts (opt-in, read tool only).
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
			// keep scanning backward until a full trailing object parses
		}
	}

	throw new Error(`sandbox produced no trailing JSON object: ${JSON.stringify(stdout)}`);
}

function buildSandboxSource(opts: {
	workDir: string;
	agentDir: string;
	initialMessage?: string;
}): string {
	const message =
		opts.initialMessage ??
		"Run pwd with the bash tool and reply with the exact output only.";
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
		"    ?? modelRegistry.getAll().find((candidate) => candidate.provider === 'anthropic');",
		"  if (!model) throw new Error('No anthropic model available in Pi model registry');",
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
		`    initialMessage: ${JSON.stringify(message)},`,
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

describe.skipIf(skipUnlessPiInstalled())("Pi SDK sandbox tool integration (mock-provider)", () => {
	let mockServer: MockLlmServerHandle | undefined;
	const cleanups: Array<() => Promise<void>> = [];

	beforeAll(async () => {
		mockServer = await createMockLlmServer([]);
	}, 15_000);

	afterAll(async () => {
		for (const cleanup of cleanups) await cleanup();
		await mockServer?.close();
	});

	/** Scaffold a temp workDir with mock-pointed agent config; returns cleanup handle. */
	async function scaffoldWorkDir(): Promise<{ workDir: string; agentDir: string }> {
		const workDir = await mkdtemp(path.join(tmpdir(), "pi-sdk-tool-integration-"));
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

	/** Create a fresh NodeRuntime wired to host FS + network. */
	function createRuntime(stdio: { stdout: string[]; stderr: string[] }): NodeRuntime {
		const runtime = new NodeRuntime({
			onStdio: (event) => {
				if (event.channel === "stdout") stdio.stdout.push(event.message);
				if (event.channel === "stderr") stdio.stderr.push(event.message);
			},
			systemDriver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				moduleAccess: { cwd: SECURE_EXEC_ROOT },
				permissions: allowAll,
				useDefaultNetwork: true,
			}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		});
		cleanups.push(async () => runtime.terminate());
		return runtime;
	}

	// --- Matrix axis: subprocess/bash (mock-provider) ---
	it(
		"[subprocess/bash] executes Pi bash tool end-to-end inside NodeRuntime",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			mockServer!.reset([
				{ type: "tool_use", name: "bash", input: { command: "pwd" } },
				{ type: "text", text: workDir },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({ workDir, agentDir }),
				{
					cwd: workDir,
					filePath: "/entry.mjs",
					env: { HOME: workDir, NO_COLOR: "1", ANTHROPIC_API_KEY: "test-key" },
				},
			);

			expect(result.code, stdio.stderr.join("")).toBe(0);

			const combinedStdout = stdio.stdout.join("");
			const combinedStderr = stdio.stderr.join("");
			const payload = parseLastJsonLine(combinedStdout);
			expect(payload.ok, JSON.stringify(payload)).toBe(true);
			expect(combinedStdout).toContain(workDir);
			expect(combinedStderr).not.toContain("wasmvm: failed to compile module for '/bin/bash'");
			expect(combinedStderr).not.toContain("Capabilities insufficient");
			expect(mockServer!.requestCount()).toBeGreaterThanOrEqual(2);

			const toolEvents = Array.isArray(payload.toolEvents)
				? (payload.toolEvents as Array<Record<string, unknown>>)
				: [];
			expect(
				toolEvents.some(
					(event) => event.toolName === "bash" && event.type === "tool_execution_start",
				),
			).toBe(true);
			expect(
				toolEvents.some(
					(event) => event.toolName === "bash" && event.type === "tool_execution_end",
				),
			).toBe(true);
		},
		60_000,
	);

	// --- Matrix axis: filesystem mutation / write (mock-provider) ---
	it(
		"[filesystem/write] creates a file through Pi write tool and sandbox fs bridge",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const targetFile = path.join(workDir, "created-by-pi.txt");
			const fileContent = "hello from pi sandbox write tool";

			// Mock: Pi calls write tool, then responds with text summary
			mockServer!.reset([
				{
					type: "tool_use",
					name: "write",
					input: { path: targetFile, content: fileContent },
				},
				{ type: "text", text: "File created successfully." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Create a file at ${targetFile}`,
				}),
				{
					cwd: workDir,
					filePath: "/entry.mjs",
					env: { HOME: workDir, NO_COLOR: "1", ANTHROPIC_API_KEY: "test-key" },
				},
			);

			expect(result.code, stdio.stderr.join("")).toBe(0);

			const payload = parseLastJsonLine(stdio.stdout.join(""));
			expect(payload.ok, JSON.stringify(payload)).toBe(true);

			// Verify write tool events
			const toolEvents = Array.isArray(payload.toolEvents)
				? (payload.toolEvents as Array<Record<string, unknown>>)
				: [];
			expect(
				toolEvents.some(
					(e) => e.toolName === "write" && e.type === "tool_execution_start",
				),
				"write tool_execution_start event missing",
			).toBe(true);
			expect(
				toolEvents.some(
					(e) =>
						e.toolName === "write" &&
						e.type === "tool_execution_end" &&
						e.isError === false,
				),
				"write tool_execution_end event missing or errored",
			).toBe(true);

			// Verify file was actually created on the host filesystem
			expect(existsSync(targetFile), "file was not created on disk").toBe(true);
			const written = await readFile(targetFile, "utf8");
			expect(written).toBe(fileContent);
		},
		60_000,
	);

	// --- Matrix axis: filesystem mutation / edit (mock-provider) ---
	it(
		"[filesystem/edit] modifies an existing file through Pi edit tool and sandbox fs bridge",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const targetFile = path.join(workDir, "edit-target.txt");
			const originalContent = "line one\noriginal content\nline three\n";
			const oldText = "original content";
			const newText = "modified by pi edit tool";

			// Pre-create the file that the edit tool will modify
			await writeFile(targetFile, originalContent);

			// Mock: Pi calls edit tool, then responds with text summary
			mockServer!.reset([
				{
					type: "tool_use",
					name: "edit",
					input: { path: targetFile, oldText, newText },
				},
				{ type: "text", text: "File edited successfully." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Edit the file at ${targetFile}`,
				}),
				{
					cwd: workDir,
					filePath: "/entry.mjs",
					env: { HOME: workDir, NO_COLOR: "1", ANTHROPIC_API_KEY: "test-key" },
				},
			);

			expect(result.code, stdio.stderr.join("")).toBe(0);

			const payload = parseLastJsonLine(stdio.stdout.join(""));
			expect(payload.ok, JSON.stringify(payload)).toBe(true);

			// Verify edit tool events
			const toolEvents = Array.isArray(payload.toolEvents)
				? (payload.toolEvents as Array<Record<string, unknown>>)
				: [];
			expect(
				toolEvents.some(
					(e) => e.toolName === "edit" && e.type === "tool_execution_start",
				),
				"edit tool_execution_start event missing",
			).toBe(true);
			expect(
				toolEvents.some(
					(e) =>
						e.toolName === "edit" &&
						e.type === "tool_execution_end" &&
						e.isError === false,
				),
				"edit tool_execution_end event missing or errored",
			).toBe(true);

			// Verify file was actually modified on disk
			const edited = await readFile(targetFile, "utf8");
			expect(edited).toBe("line one\nmodified by pi edit tool\nline three\n");
		},
		60_000,
	);
});
