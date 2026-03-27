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

function buildSandboxSource(opts: { workDir: string; agentDir: string }): string {
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
		"    initialMessage: 'Run pwd with the bash tool and reply with the exact output only.',",
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

describe.skipIf(skipUnlessPiInstalled())("Pi SDK sandbox tool integration", () => {
	let runtime: NodeRuntime | undefined;
	let mockServer: MockLlmServerHandle | undefined;
	let workDir: string | undefined;

	beforeAll(async () => {
		mockServer = await createMockLlmServer([]);
	}, 15_000);

	afterAll(async () => {
		await runtime?.terminate();
		await mockServer?.close();
		if (workDir) {
			await rm(workDir, { recursive: true, force: true });
		}
	});

	it(
		"executes Pi bash tool end-to-end inside NodeRuntime without /bin/bash resolution failures",
		async () => {
			workDir = await mkdtemp(path.join(tmpdir(), "pi-sdk-tool-integration-"));
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
			mockServer!.reset([
				{ type: "tool_use", name: "bash", input: { command: "pwd" } },
				{ type: "text", text: workDir },
			]);

			const stdout: string[] = [];
			const stderr: string[] = [];

			runtime = new NodeRuntime({
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

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
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

			expect(result.code, stderr.join("")).toBe(0);

			const combinedStdout = stdout.join("");
			const combinedStderr = stderr.join("");
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
});
