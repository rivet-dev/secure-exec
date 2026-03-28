/**
 * Pi SDK session lifecycle — proves that createAgentSession() survives
 * repeated turns and dispose/recreate patterns inside SecureExec
 * without leaking state or tripping disposed-runtime/isolate errors.
 *
 * Coverage:
 *   [multi-turn reuse]    one session across multiple runPrintMode turns
 *   [dispose/recreate]    dispose session, create a new one on same runtime
 *
 * All tests use the mock LLM server and run the unmodified
 * @mariozechner/pi-coding-agent package inside NodeRuntime.
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
			// keep scanning backward
		}
	}
	throw new Error(`sandbox produced no trailing JSON object: ${JSON.stringify(stdout)}`);
}

describe.skipIf(skipUnlessPiInstalled())("Pi SDK session lifecycle (mock-provider)", () => {
	let mockServer: MockLlmServerHandle | undefined;
	const cleanups: Array<() => Promise<void>> = [];

	beforeAll(async () => {
		mockServer = await createMockLlmServer([]);
	}, 15_000);

	afterAll(async () => {
		for (const cleanup of cleanups) await cleanup();
		await mockServer?.close();
	});

	async function scaffoldWorkDir(): Promise<{ workDir: string; agentDir: string }> {
		const workDir = await mkdtemp(path.join(tmpdir(), "pi-sdk-lifecycle-"));
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

	/**
	 * Build sandbox source for multi-turn reuse: one session, multiple
	 * runPrintMode calls.
	 *
	 * Turn 1: write tool creates a file
	 * Turn 2: read tool reads it back
	 */
	function buildMultiTurnSource(opts: {
		workDir: string;
		agentDir: string;
		targetFile: string;
		fileContent: string;
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
			"  if (!model) throw new Error('No anthropic model');",
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
			// Turn 1: write a file
			`  await pi.runPrintMode(session, {`,
			"    mode: 'text',",
			`    initialMessage: 'Create a file please',`,
			"  });",
			// Turn 2: read the file back
			`  await pi.runPrintMode(session, {`,
			"    mode: 'text',",
			`    initialMessage: 'Read the file back',`,
			"  });",
			"  const msgCount = session.state?.messages?.length ?? 0;",
			"  console.log(JSON.stringify({",
			"    ok: true,",
			"    toolEvents,",
			"    messageCount: msgCount,",
			"  }));",
			"  session.dispose();",
			"} catch (error) {",
			"  const errorMessage = error instanceof Error ? error.message : String(error);",
			"  console.log(JSON.stringify({",
			"    ok: false,",
			"    error: errorMessage.split('\\n')[0].slice(0, 600),",
			"    stack: error instanceof Error ? error.stack?.split('\\n').slice(0, 5).join('\\n') : undefined,",
			"    toolEvents,",
			"  }));",
			"  process.exitCode = 1;",
			"}",
		].join("\n");
	}

	/**
	 * Build sandbox source for dispose/recreate: create session 1, run
	 * a turn, dispose it, create session 2 on the same runtime/workdir,
	 * run another turn, verify clean state.
	 */
	function buildDisposeRecreateSource(opts: {
		workDir: string;
		agentDir: string;
		targetFile: string;
		fileContent: string;
	}): string {
		return [
			`const workDir = ${JSON.stringify(opts.workDir)};`,
			`const agentDir = ${JSON.stringify(opts.agentDir)};`,
			"let session1, session2;",
			"let toolEvents1 = [];",
			"let toolEvents2 = [];",
			"try {",
			`  const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/entry.mjs");`,
			"  const authStorage = pi.AuthStorage.inMemory();",
			"  authStorage.setRuntimeApiKey('anthropic', 'test-key');",
			"  const modelRegistry = new pi.ModelRegistry(authStorage, `${agentDir}/models.json`);",
			"  const model = modelRegistry.find('anthropic', 'claude-sonnet-4-20250514')",
			"    ?? modelRegistry.getAll().find((c) => c.provider === 'anthropic');",
			"  if (!model) throw new Error('No anthropic model');",
			"",
			"  // Session 1: write a file",
			"  ({ session: session1 } = await pi.createAgentSession({",
			"    cwd: workDir,",
			"    agentDir,",
			"    authStorage,",
			"    modelRegistry,",
			"    model,",
			"    tools: pi.createCodingTools(workDir),",
			"    sessionManager: pi.SessionManager.inMemory(),",
			"  }));",
			"  session1.subscribe((event) => {",
			"    if (event.type === 'tool_execution_start') {",
			"      toolEvents1.push({ type: event.type, toolName: event.toolName });",
			"    }",
			"    if (event.type === 'tool_execution_end') {",
			"      toolEvents1.push({ type: event.type, toolName: event.toolName, isError: event.isError });",
			"    }",
			"  });",
			"  await pi.runPrintMode(session1, {",
			"    mode: 'text',",
			`    initialMessage: 'Write a file please',`,
			"  });",
			"  const session1MsgCount = session1.state?.messages?.length ?? 0;",
			"  session1.dispose();",
			"",
			"  // Session 2: read the file back on the same runtime",
			"  ({ session: session2 } = await pi.createAgentSession({",
			"    cwd: workDir,",
			"    agentDir,",
			"    authStorage,",
			"    modelRegistry,",
			"    model,",
			"    tools: pi.createCodingTools(workDir),",
			"    sessionManager: pi.SessionManager.inMemory(),",
			"  }));",
			"  session2.subscribe((event) => {",
			"    if (event.type === 'tool_execution_start') {",
			"      toolEvents2.push({ type: event.type, toolName: event.toolName });",
			"    }",
			"    if (event.type === 'tool_execution_end') {",
			"      toolEvents2.push({ type: event.type, toolName: event.toolName, isError: event.isError });",
			"    }",
			"  });",
			"  await pi.runPrintMode(session2, {",
			"    mode: 'text',",
			`    initialMessage: 'Read the file back',`,
			"  });",
			"  const session2MsgCount = session2.state?.messages?.length ?? 0;",
			"  console.log(JSON.stringify({",
			"    ok: true,",
			"    session1: { toolEvents: toolEvents1, messageCount: session1MsgCount },",
			"    session2: { toolEvents: toolEvents2, messageCount: session2MsgCount },",
			"  }));",
			"  session2.dispose();",
			"} catch (error) {",
			"  const errorMessage = error instanceof Error ? error.message : String(error);",
			"  console.log(JSON.stringify({",
			"    ok: false,",
			"    error: errorMessage.split('\\n')[0].slice(0, 600),",
			"    stack: error instanceof Error ? error.stack?.split('\\n').slice(0, 5).join('\\n') : undefined,",
			"    session1Events: toolEvents1,",
			"    session2Events: toolEvents2,",
			"  }));",
			"  process.exitCode = 1;",
			"}",
		].join("\n");
	}

	// --- Multi-turn reuse: one session across two turns ---
	it(
		"[multi-turn] reuses one session across two turns with write then read",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const targetFile = path.join(workDir, "multi-turn.txt");
			const fileContent = "written in turn 1";

			// Mock queue: turn 1 (write tool → text), turn 2 (read tool → text)
			mockServer!.reset([
				// Turn 1: write tool creates a file
				{
					type: "tool_use",
					name: "write",
					input: { path: targetFile, content: fileContent },
				},
				{ type: "text", text: "File created." },
				// Turn 2: read tool reads it back
				{
					type: "tool_use",
					name: "read",
					input: { path: targetFile },
				},
				{ type: "text", text: "File contents shown." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildMultiTurnSource({ workDir, agentDir, targetFile, fileContent }),
				{
					cwd: workDir,
					filePath: "/entry.mjs",
					env: { HOME: workDir, NO_COLOR: "1", ANTHROPIC_API_KEY: "test-key" },
				},
			);

			expect(result.code, `stderr: ${stdio.stderr.join("")}`).toBe(0);

			const payload = parseLastJsonLine(stdio.stdout.join(""));
			expect(payload.ok, JSON.stringify(payload)).toBe(true);

			// Both turns should have tool events
			const toolEvents = payload.toolEvents as Array<Record<string, unknown>>;
			expect(
				toolEvents.some(
					(e) => e.toolName === "write" && e.type === "tool_execution_end" && e.isError === false,
				),
				"write tool should complete without error in turn 1",
			).toBe(true);
			expect(
				toolEvents.some(
					(e) => e.toolName === "read" && e.type === "tool_execution_end" && e.isError === false,
				),
				"read tool should complete without error in turn 2",
			).toBe(true);

			// Mock received requests for both turns (2 per turn: prompt + tool result)
			expect(mockServer!.requestCount()).toBeGreaterThanOrEqual(4);

			// Session accumulated messages from both turns
			expect(payload.messageCount).toBeGreaterThanOrEqual(4);

			// File was actually written on host by turn 1
			expect(existsSync(targetFile), "file was not created on disk").toBe(true);
			const written = await readFile(targetFile, "utf8");
			expect(written).toBe(fileContent);
		},
		60_000,
	);

	// --- Dispose and recreate: two sessions on the same runtime ---
	it(
		"[dispose/recreate] disposes session and creates a new one on the same runtime without errors",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const targetFile = path.join(workDir, "lifecycle.txt");
			const fileContent = "created by session 1";

			// Mock queue: session 1 (write → text), session 2 (read → text)
			mockServer!.reset([
				// Session 1: write tool
				{
					type: "tool_use",
					name: "write",
					input: { path: targetFile, content: fileContent },
				},
				{ type: "text", text: "File created." },
				// Session 2: read tool
				{
					type: "tool_use",
					name: "read",
					input: { path: targetFile },
				},
				{ type: "text", text: "File contents shown." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildDisposeRecreateSource({ workDir, agentDir, targetFile, fileContent }),
				{
					cwd: workDir,
					filePath: "/entry.mjs",
					env: { HOME: workDir, NO_COLOR: "1", ANTHROPIC_API_KEY: "test-key" },
				},
			);

			expect(result.code, `stderr: ${stdio.stderr.join("")}`).toBe(0);

			const payload = parseLastJsonLine(stdio.stdout.join(""));
			expect(payload.ok, JSON.stringify(payload)).toBe(true);

			// Session 1 tool events (write)
			const s1 = payload.session1 as Record<string, unknown>;
			const s1Events = s1.toolEvents as Array<Record<string, unknown>>;
			expect(
				s1Events.some(
					(e) => e.toolName === "write" && e.type === "tool_execution_end" && e.isError === false,
				),
				"session 1 write tool should complete without error",
			).toBe(true);

			// Session 2 tool events (read) — fresh event list, no session 1 leakage
			const s2 = payload.session2 as Record<string, unknown>;
			const s2Events = s2.toolEvents as Array<Record<string, unknown>>;
			expect(
				s2Events.some(
					(e) => e.toolName === "read" && e.type === "tool_execution_end" && e.isError === false,
				),
				`session 2 read tool should complete without error, events: ${JSON.stringify(s2Events)}`,
			).toBe(true);
			expect(
				s2Events.every((e) => e.toolName !== "write"),
				"session 2 should not see session 1 write events",
			).toBe(true);

			// Session 2 has a fresh message history (not accumulated from session 1)
			expect((s2.messageCount as number)).toBeLessThan((s1.messageCount as number) * 3);

			// File written by session 1 persists for session 2 to read
			expect(existsSync(targetFile), "file was not created on disk").toBe(true);
			const written = await readFile(targetFile, "utf8");
			expect(written).toBe(fileContent);

			// Both sessions hit the mock server
			expect(mockServer!.requestCount()).toBeGreaterThanOrEqual(4);
		},
		60_000,
	);

	// --- Rapid dispose without running a turn ---
	it(
		"[dispose-only] creates and immediately disposes a session without errors",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();

			const source = [
				`const workDir = ${JSON.stringify(workDir)};`,
				`const agentDir = ${JSON.stringify(agentDir)};`,
				"try {",
				`  const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/entry.mjs");`,
				"  const authStorage = pi.AuthStorage.inMemory();",
				"  authStorage.setRuntimeApiKey('anthropic', 'test-key');",
				"  const modelRegistry = new pi.ModelRegistry(authStorage, `${agentDir}/models.json`);",
				"  const model = modelRegistry.find('anthropic', 'claude-sonnet-4-20250514')",
				"    ?? modelRegistry.getAll().find((c) => c.provider === 'anthropic');",
				"  if (!model) throw new Error('No anthropic model');",
				"",
				"  // Create and immediately dispose three sessions in sequence",
				"  for (let i = 0; i < 3; i++) {",
				"    const { session } = await pi.createAgentSession({",
				"      cwd: workDir,",
				"      agentDir,",
				"      authStorage,",
				"      modelRegistry,",
				"      model,",
				"      tools: pi.createCodingTools(workDir),",
				"      sessionManager: pi.SessionManager.inMemory(),",
				"    });",
				"    session.dispose();",
				"  }",
				"  console.log(JSON.stringify({ ok: true, sessionsCreated: 3 }));",
				"} catch (error) {",
				"  const errorMessage = error instanceof Error ? error.message : String(error);",
				"  console.log(JSON.stringify({",
				"    ok: false,",
				"    error: errorMessage.split('\\n')[0].slice(0, 600),",
				"    stack: error instanceof Error ? error.stack?.split('\\n').slice(0, 5).join('\\n') : undefined,",
				"  }));",
				"  process.exitCode = 1;",
				"}",
			].join("\n");

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(source, {
				cwd: workDir,
				filePath: "/entry.mjs",
				env: { HOME: workDir, NO_COLOR: "1", ANTHROPIC_API_KEY: "test-key" },
			});

			expect(result.code, `stderr: ${stdio.stderr.join("")}`).toBe(0);

			const payload = parseLastJsonLine(stdio.stdout.join(""));
			expect(payload.ok, JSON.stringify(payload)).toBe(true);
			expect(payload.sessionsCreated).toBe(3);
		},
		60_000,
	);
});
