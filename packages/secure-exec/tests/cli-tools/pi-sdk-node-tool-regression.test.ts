/**
 * Pi SDK node-tool regression — US-102.
 *
 * Proves that Pi can execute `node` through its bash tool inside the
 * SecureExec sandbox without host-spawn fallback. Captures exact failure
 * text and tool event payloads so the concrete blocker is always visible.
 *
 * Coverage:
 *   [mock-provider/node-tool]   mock LLM forces Pi bash tool with `node -e`
 *   [real-provider/node-tool]   real Anthropic API asks Pi to run node code
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
	createNodeRuntimeDriverFactory,
} from "../../src/index.js";
import {
	createMockLlmServer,
	type MockLlmServerHandle,
} from "./mock-llm-server.ts";
import { loadRealProviderEnv } from "./real-provider-env.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, "../..");
const PI_SDK_ENTRY = path.resolve(
	SECURE_EXEC_ROOT,
	"node_modules/@mariozechner/pi-coding-agent/dist/index.js",
);
const REAL_PROVIDER_FLAG = "SECURE_EXEC_PI_REAL_PROVIDER_E2E";

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

function buildNodeToolSandboxSource(opts: {
	workDir: string;
	agentDir: string;
	initialMessage: string;
}): string {
	return [
		`const workDir = ${JSON.stringify(opts.workDir)};`,
		`const agentDir = ${JSON.stringify(opts.agentDir)};`,
		"let session;",
		"const toolEvents = [];",
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
		"      toolEvents.push({ type: event.type, toolName: event.toolName });",
		"    }",
		"    if (event.type === 'tool_execution_end') {",
		"      let resultText = '';",
		"      try {",
		"        const c = event.result?.content;",
		"        if (typeof c === 'string') resultText = c.slice(0, 1000);",
		"        else if (Array.isArray(c)) resultText = c.map((b) => b.text ?? '').join('').slice(0, 1000);",
		"      } catch {}",
		"      toolEvents.push({",
		"        type: event.type, toolName: event.toolName,",
		"        isError: event.isError, resultText,",
		"      });",
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

function buildRealProviderNodeToolSource(opts: { workDir: string }): string {
	return [
		'import path from "node:path";',
		`const workDir = ${JSON.stringify(opts.workDir)};`,
		"let session;",
		"const toolEvents = [];",
		"try {",
		`  const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/entry.mjs");`,
		"  const authStorage = pi.AuthStorage.create(path.join(workDir, 'auth.json'));",
		"  const modelRegistry = new pi.ModelRegistry(authStorage);",
		"  const available = await modelRegistry.getAvailable();",
		"  const preferredAnthropicIds = [",
		"    'claude-haiku-4-5-20251001',",
		"    'claude-sonnet-4-6',",
		"    'claude-sonnet-4-20250514',",
		"  ];",
		"  const model = preferredAnthropicIds",
		"    .map((id) => available.find((c) => c.provider === 'anthropic' && c.id === id))",
		"    .find(Boolean) ?? available.find((c) => c.provider === 'anthropic') ?? available[0];",
		"  if (!model) throw new Error('No Pi model available');",
		"  ({ session } = await pi.createAgentSession({",
		"    cwd: workDir,",
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
		"        const c = event.result?.content;",
		"        if (typeof c === 'string') resultText = c.slice(0, 1000);",
		"        else if (Array.isArray(c)) resultText = c.map((b) => b.text ?? '').join('').slice(0, 1000);",
		"      } catch {}",
		"      toolEvents.push({",
		"        type: event.type, toolName: event.toolName,",
		"        isError: event.isError, resultText,",
		"      });",
		"    }",
		"  });",
		"  await pi.runPrintMode(session, {",
		"    mode: 'text',",
		"    initialMessage: 'Use the bash tool to run this exact command: node -e \"console.log(42)\"\\nReport the exact stdout output only.',",
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
		"  }));",
		"  process.exitCode = 1;",
		"}",
	].join("\n");
}

// ---- Mock-provider suite: deterministic node-tool regression ----

describe.skipIf(skipUnlessPiInstalled())(
	"Pi SDK node-tool regression (mock-provider)",
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
				path.join(tmpdir(), "pi-node-tool-regression-"),
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

		it(
			"[node-tool/mock] Pi bash tool executes `node -e` inside sandbox — captures exact failure or success",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir();
				const canary = `NODE_CANARY_${Date.now()}`;

				// Mock: Pi calls bash tool with `node -e`, then responds with text
				mockServer!.reset([
					{
						type: "tool_use",
						name: "bash",
						input: { command: `node -e "console.log('${canary}')"` },
					},
					{ type: "text", text: `The node command output was: ${canary}` },
				]);

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
				const runtime = createRuntime(stdio);

				const result = await runtime.exec(
					buildNodeToolSandboxSource({
						workDir,
						agentDir,
						initialMessage: `Run this bash command: node -e "console.log('${canary}')"`,
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

				// Parse the JSON payload from the sandbox
				const payload = parseLastJsonLine(combinedStdout);
				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];

				// Find the bash tool_execution_end event to inspect the exact result
				const bashEnd = toolEvents.find(
					(e) =>
						e.toolName === "bash" &&
						e.type === "tool_execution_end",
				);

				// Capture the exact surfaced output for diagnosis
				const diagnostics = {
					exitCode: result.code,
					payloadOk: payload.ok,
					payloadError: payload.error,
					bashToolEnd: bashEnd,
					toolEvents,
					stderrSnippet: combinedStderr.slice(0, 500),
				};

				// The test must prove node execution succeeds through Pi's bash tool.
				// After the fix, the bash tool should complete without error and its
				// result should contain the canary.
				expect(payload.ok, JSON.stringify(diagnostics, null, 2)).toBe(true);
				expect(result.code, JSON.stringify(diagnostics, null, 2)).toBe(0);

				// bash tool must have been invoked
				expect(
					toolEvents.some(
						(e) =>
							e.toolName === "bash" &&
							e.type === "tool_execution_start",
					),
					"bash tool_execution_start missing",
				).toBe(true);

				// bash tool must complete without error
				expect(bashEnd, "bash tool_execution_end missing").toBeDefined();
				expect(
					bashEnd!.isError,
					`bash tool errored: ${JSON.stringify(bashEnd)}`,
				).toBe(false);

				// The tool result must contain the node output canary
				expect(
					String(bashEnd!.resultText),
					`bash resultText should contain canary but got: ${String(bashEnd!.resultText).slice(0, 200)}`,
				).toContain(canary);

				// Must not contain capability or ENOSYS errors
				expect(combinedStderr).not.toContain("Capabilities insufficient");
				expect(combinedStderr).not.toContain("ENOSYS");
			},
			60_000,
		);
	},
);

// ---- Real-provider suite: live Anthropic API node-tool regression ----

function getRealProviderSkipReason(): string | false {
	const piSkip = skipUnlessPiInstalled();
	if (piSkip) return piSkip;

	if (process.env[REAL_PROVIDER_FLAG] !== "1") {
		return `${REAL_PROVIDER_FLAG}=1 required for real provider E2E`;
	}

	return loadRealProviderEnv(["ANTHROPIC_API_KEY"]).skipReason ?? false;
}

const realProviderSkip = getRealProviderSkipReason();

describe.skipIf(realProviderSkip)(
	"Pi SDK node-tool regression (real-provider)",
	() => {
		const cleanups: Array<() => Promise<void>> = [];

		afterAll(async () => {
			for (const cleanup of cleanups) await cleanup();
		});

		it(
			"[node-tool/real] Pi executes `node -e` via bash tool with live Anthropic API — captures exact failure or success",
			async () => {
				const providerEnv = loadRealProviderEnv(["ANTHROPIC_API_KEY"]);
				expect(providerEnv.skipReason).toBeUndefined();

				const workDir = await mkdtemp(
					path.join(tmpdir(), "pi-node-tool-real-provider-"),
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				const stdout: string[] = [];
				const stderr: string[] = [];

				const runtime = new NodeRuntime({
					onStdio: (event) => {
						if (event.channel === "stdout") stdout.push(event.message);
						if (event.channel === "stderr") stderr.push(event.message);
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

				const result = await runtime.exec(
					buildRealProviderNodeToolSource({ workDir }),
					{
						cwd: workDir,
						filePath: "/entry.mjs",
						env: {
							...providerEnv.env!,
							HOME: workDir,
							NO_COLOR: "1",
						},
					},
				);

				const combinedStdout = stdout.join("");
				const combinedStderr = stderr.join("");
				const payload = parseLastJsonLine(combinedStdout);
				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];
				const bashEnd = toolEvents.find(
					(e) =>
						e.toolName === "bash" &&
						e.type === "tool_execution_end",
				);

				const diagnostics = {
					exitCode: result.code,
					payloadOk: payload.ok,
					payloadError: payload.error,
					bashToolEnd: bashEnd,
					toolEvents,
					stderrSnippet: combinedStderr.slice(0, 500),
				};

				// Same assertions as mock — node execution must work
				expect(payload.ok, JSON.stringify(diagnostics, null, 2)).toBe(true);
				expect(result.code, JSON.stringify(diagnostics, null, 2)).toBe(0);

				// bash tool must have been called and completed without error
				expect(
					toolEvents.some(
						(e) =>
							e.toolName === "bash" &&
							e.type === "tool_execution_start",
					),
					"bash tool_execution_start missing — LLM may not have used bash",
				).toBe(true);
				expect(bashEnd, "bash tool_execution_end missing").toBeDefined();
				expect(
					bashEnd!.isError,
					`bash tool errored: ${JSON.stringify(bashEnd)}`,
				).toBe(false);

				// Node output (42) should appear in the tool result
				expect(
					String(bashEnd!.resultText),
					`bash resultText should contain node output: ${String(bashEnd!.resultText).slice(0, 200)}`,
				).toContain("42");

				// Must not contain capability or ENOSYS errors
				expect(combinedStderr).not.toContain("Capabilities insufficient");
				expect(combinedStderr).not.toContain("ENOSYS");
			},
			90_000,
		);
	},
);
