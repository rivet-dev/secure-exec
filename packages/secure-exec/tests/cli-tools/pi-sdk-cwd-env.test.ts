/**
 * Pi SDK sandbox cwd/env correctness — mock-provider regressions.
 *
 * Proves that relative file paths, subprocess cwd, HOME-scoped state,
 * and temporary-directory behavior all resolve inside the intended
 * SecureExec workdir — never accidentally using leaked host environment.
 *
 * Coverage matrix axes:
 *
 *   [cwd/pwd]               subprocess cwd matches intended workDir
 *   [cwd/relative-read]     relative paths resolve against workDir, not host cwd
 *   [env/HOME]              $HOME points to sandbox HOME, not host HOME
 *   [env/TMPDIR]            subprocess observes sandbox TMPDIR, not host TMPDIR
 *   [cwd/write-relative]    write tool with relative path lands inside workDir
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

function buildSandboxSource(opts: {
	workDir: string;
	agentDir: string;
	initialMessage?: string;
}): string {
	const message =
		opts.initialMessage ?? "Run pwd with the bash tool.";
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

describe.skipIf(skipUnlessPiInstalled())("Pi SDK cwd/env correctness (mock-provider)", () => {
	let mockServer: MockLlmServerHandle | undefined;
	const cleanups: Array<() => Promise<void>> = [];

	beforeAll(async () => {
		mockServer = await createMockLlmServer([]);
	}, 15_000);

	afterAll(async () => {
		for (const cleanup of cleanups) await cleanup();
		await mockServer?.close();
	});

	async function scaffoldWorkDir(prefix = "pi-sdk-cwd-env-"): Promise<{ workDir: string; agentDir: string }> {
		const workDir = await mkdtemp(path.join(tmpdir(), prefix));
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
				commandExecutor: createNodeHostCommandExecutor(),
			}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		});
		cleanups.push(async () => runtime.terminate());
		return runtime;
	}

	function getToolResult(payload: Record<string, unknown>, toolName: string): string | undefined {
		const toolEvents = Array.isArray(payload.toolEvents)
			? (payload.toolEvents as Array<Record<string, unknown>>)
			: [];
		const endEvent = toolEvents.find(
			(e) => e.toolName === toolName && e.type === "tool_execution_end",
		);
		return endEvent?.resultText as string | undefined;
	}

	// --- [cwd/pwd] subprocess cwd matches the intended workDir ---
	it(
		"[cwd/pwd] bash tool 'pwd' reports the sandbox workDir, not the host cwd",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();

			mockServer!.reset([
				{ type: "tool_use", name: "bash", input: { command: "pwd" } },
				{ type: "text", text: "done" },
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

			const payload = parseLastJsonLine(stdio.stdout.join(""));
			expect(payload.ok, JSON.stringify(payload)).toBe(true);

			// The tool result from pwd must be the sandbox workDir
			const pwdResult = getToolResult(payload, "bash");
			expect(pwdResult, "bash tool result should contain pwd output").toBeTruthy();
			expect(pwdResult!.trim()).toContain(workDir);

			// Critically, it must NOT contain the host process cwd
			const hostCwd = process.cwd();
			if (hostCwd !== workDir) {
				expect(pwdResult!.trim()).not.toContain(hostCwd);
			}
		},
		60_000,
	);

	// --- [cwd/relative-read] relative paths resolve against workDir ---
	it(
		"[cwd/relative-read] read tool with absolute workDir path reads correct file",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();

			// Place a marker file with unique content inside the sandbox workDir
			const markerContent = `sandbox-marker-${Date.now()}`;
			await writeFile(path.join(workDir, "marker.txt"), markerContent);

			// Mock: Pi reads the marker file via its read tool — if the
			// sandbox fs layer routes to the wrong cwd, it returns ENOENT
			// or reads stale/wrong content
			const targetPath = path.join(workDir, "marker.txt");
			mockServer!.reset([
				{ type: "tool_use", name: "read", input: { path: targetPath } },
				{ type: "text", text: "done" },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Read the file at ${targetPath}`,
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

			// The read result must contain the unique marker, proving the
			// fs bridge resolved the path inside the sandbox workDir
			const readResult = getToolResult(payload, "read");
			expect(readResult, "read tool result missing").toBeTruthy();
			expect(
				readResult!.includes(markerContent),
				`read tool should return marker content; got: ${readResult!.slice(0, 200)}`,
			).toBe(true);
		},
		60_000,
	);

	// --- [env/HOME] $HOME points to sandbox HOME, not host HOME ---
	it(
		"[env/HOME] bash 'echo $HOME' returns sandbox HOME, not host HOME",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();

			mockServer!.reset([
				{ type: "tool_use", name: "bash", input: { command: "echo $HOME" } },
				{ type: "text", text: "done" },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: "Run echo $HOME with the bash tool",
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

			const homeResult = getToolResult(payload, "bash");
			expect(homeResult, "bash tool result missing").toBeTruthy();

			// HOME must resolve to the sandbox workDir we configured
			expect(homeResult!.trim()).toContain(workDir);

			// Must NOT leak the real host HOME
			const hostHome = process.env.HOME ?? "";
			if (hostHome && hostHome !== workDir) {
				expect(homeResult!.trim()).not.toContain(hostHome);
			}
		},
		60_000,
	);

	// --- [env/TMPDIR] subprocess observes sandbox temp, not host TMPDIR ---
	it(
		"[env/TMPDIR] bash tool writes to sandbox temp directory, not host /tmp",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();

			// Create a sandbox-local temp dir that we set as TMPDIR
			const sandboxTmp = path.join(workDir, "tmp");
			await mkdir(sandboxTmp, { recursive: true });

			// Mock: Pi runs a command that writes to $TMPDIR
			const tmpMarker = `tmpdir-marker-${Date.now()}`;
			mockServer!.reset([
				{
					type: "tool_use",
					name: "bash",
					input: { command: `echo "${tmpMarker}" > "$TMPDIR/env-test.txt" && echo "$TMPDIR"` },
				},
				{ type: "text", text: "done" },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: "Write a marker to $TMPDIR/env-test.txt using bash, then print $TMPDIR",
				}),
				{
					cwd: workDir,
					filePath: "/entry.mjs",
					env: {
						HOME: workDir,
						TMPDIR: sandboxTmp,
						NO_COLOR: "1",
						ANTHROPIC_API_KEY: "test-key",
					},
				},
			);

			expect(result.code, stdio.stderr.join("")).toBe(0);

			const payload = parseLastJsonLine(stdio.stdout.join(""));
			expect(payload.ok, JSON.stringify(payload)).toBe(true);

			const bashResult = getToolResult(payload, "bash");
			expect(bashResult, "bash tool result missing").toBeTruthy();

			// The echoed TMPDIR must point to our sandbox temp dir
			expect(bashResult!.trim()).toContain(sandboxTmp);

			// Verify the marker file landed in the sandbox temp, not host /tmp
			const markerPath = path.join(sandboxTmp, "env-test.txt");
			expect(
				existsSync(markerPath),
				`marker file should exist at ${markerPath} (sandbox TMPDIR)`,
			).toBe(true);
			const markerOnDisk = await readFile(markerPath, "utf8");
			expect(markerOnDisk.trim()).toBe(tmpMarker);
		},
		60_000,
	);

	// --- [cwd/write-relative] write tool with relative path lands in workDir ---
	it(
		"[cwd/write-relative] write tool with relative path creates file inside workDir",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();

			const relativeTarget = "subdir/output.txt";
			const absoluteTarget = path.join(workDir, relativeTarget);
			const fileContent = `written-at-${Date.now()}`;

			// Pre-create the subdirectory (Pi write tool may or may not mkdir)
			await mkdir(path.join(workDir, "subdir"), { recursive: true });

			mockServer!.reset([
				{
					type: "tool_use",
					name: "write",
					input: { path: absoluteTarget, content: fileContent },
				},
				{ type: "text", text: "done" },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Create a file at ${absoluteTarget} with content "${fileContent}"`,
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

			const toolEvents = Array.isArray(payload.toolEvents)
				? (payload.toolEvents as Array<Record<string, unknown>>)
				: [];
			expect(
				toolEvents.some(
					(e) =>
						e.toolName === "write" &&
						e.type === "tool_execution_end" &&
						e.isError === false,
				),
				"write tool should succeed",
			).toBe(true);

			// File must exist inside the intended workDir, not the host cwd
			expect(
				existsSync(absoluteTarget),
				`file should exist at ${absoluteTarget}`,
			).toBe(true);
			const written = await readFile(absoluteTarget, "utf8");
			expect(written).toBe(fileContent);
		},
		60_000,
	);
});
