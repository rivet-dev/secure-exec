/**
 * Pi session resume and second-turn behavior — proves that a Pi session
 * retains filesystem and subprocess state across follow-up turns on both
 * SDK and PTY surfaces.
 *
 * Coverage:
 *   [SDK/resume]   NodeRuntime.exec() — two runPrintMode turns on same session
 *                  (filesystem write + bash subprocess in turn 1, read + bash in turn 2)
 *   [PTY/resume]   kernel.openShell() — two-turn flow through the kernel PTY layer
 *                  (filesystem write in turn 1, read + write in turn 2)
 *
 * Both regressions prove turn 2 observes state produced by turn 1.
 * All tests use the mock LLM server and run the unmodified
 * @mariozechner/pi-coding-agent package.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	NodeRuntime,
	NodeFileSystem,
	allowAll,
	allowAllChildProcess,
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
	createNodeDriver,
	createNodeHostCommandExecutor,
	createNodeRuntimeDriverFactory,
} from "../../src/index.js";
import { createKernel } from "../../../core/src/kernel/index.ts";
import type { Kernel } from "../../../core/src/kernel/index.ts";
import {
	createNodeHostNetworkAdapter,
	createNodeRuntime,
} from "../../../nodejs/src/index.ts";
import {
	createMockLlmServer,
	type MockLlmServerHandle,
	type MockLlmResponse,
} from "./mock-llm-server.ts";
import {
	createHybridVfs,
	SECURE_EXEC_ROOT,
	skipUnlessPiInstalled,
} from "./pi-pty-helpers.ts";

const PI_SDK_ENTRY = path.resolve(
	SECURE_EXEC_ROOT,
	"node_modules/@mariozechner/pi-coding-agent/dist/index.js",
);

// ---------------------------------------------------------------------------
// Shared scenario constants
// ---------------------------------------------------------------------------

const WRITE_FILE_NAME = "resume-turn1.txt";
const WRITE_CONTENT = "written_by_turn1_marker_abc123";
const BASH_MARKER = "BASH_TURN1_OK";
const TURN2_CANARY = "TURN2_READ_SUCCESS";
const TURN2_FILE_NAME = "resume-turn2.txt";
const TURN2_WRITE_CONTENT = "written_by_turn2_confirms_resume";

// ---------------------------------------------------------------------------
// Mock LLM queues
// ---------------------------------------------------------------------------

/** SDK queue: write + bash in turn 1, read + bash in turn 2 */
function buildSdkResumeQueue(workDir: string): MockLlmResponse[] {
	const targetFile = path.join(workDir, WRITE_FILE_NAME);
	return [
		{ type: "tool_use", name: "write", input: { path: targetFile, content: WRITE_CONTENT } },
		{ type: "tool_use", name: "bash", input: { command: `echo ${BASH_MARKER}` } },
		{ type: "text", text: "Turn 1 complete." },
		{ type: "tool_use", name: "read", input: { path: targetFile } },
		{ type: "tool_use", name: "bash", input: { command: `echo ${TURN2_CANARY}` } },
		{ type: "text", text: "Turn 2 complete." },
	];
}

/** PTY queue: write in turn 1, read + write in turn 2 (no bash — kernel PTY lacks /bin/bash) */
function buildPtyResumeQueue(workDir: string): MockLlmResponse[] {
	const targetFile = path.join(workDir, WRITE_FILE_NAME);
	const turn2File = path.join(workDir, TURN2_FILE_NAME);
	return [
		{ type: "tool_use", name: "write", input: { path: targetFile, content: WRITE_CONTENT } },
		{ type: "text", text: "Turn 1 complete." },
		{ type: "tool_use", name: "read", input: { path: targetFile } },
		{ type: "tool_use", name: "write", input: { path: turn2File, content: TURN2_WRITE_CONTENT } },
		{ type: "text", text: "Turn 2 complete." },
	];
}

// ---------------------------------------------------------------------------
// Sandbox source builder
// ---------------------------------------------------------------------------

function buildResumeSandboxSource(opts: {
	workDir: string;
	agentDir: string;
}): string {
	return [
		`const workDir = ${JSON.stringify(opts.workDir)};`,
		`const agentDir = ${JSON.stringify(opts.agentDir)};`,
		"let session;",
		"let turn1Events = [];",
		"let turn2Events = [];",
		"let currentTurn = 1;",
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
		"    const events = currentTurn === 1 ? turn1Events : turn2Events;",
		"    if (event.type === 'tool_execution_start') {",
		"      events.push({ type: event.type, toolName: event.toolName });",
		"    }",
		"    if (event.type === 'tool_execution_end') {",
		"      let resultText = '';",
		"      try {",
		"        const c = event.result?.content;",
		"        if (typeof c === 'string') resultText = c;",
		"        else if (Array.isArray(c)) resultText = c.filter(b => b.type === 'text').map(b => b.text).join('');",
		"      } catch {}",
		"      events.push({",
		"        type: event.type,",
		"        toolName: event.toolName,",
		"        isError: event.isError,",
		"        resultText: resultText.slice(0, 2000),",
		"      });",
		"    }",
		"  });",
		"  await pi.runPrintMode(session, {",
		"    mode: 'text',",
		"    initialMessage: 'Write a file and run a subprocess.',",
		"  });",
		"  currentTurn = 2;",
		"  await pi.runPrintMode(session, {",
		"    mode: 'text',",
		"    initialMessage: 'Read the file you just wrote and run another command.',",
		"  });",
		"  const msgCount = session.state?.messages?.length ?? 0;",
		"  console.log(JSON.stringify({",
		"    ok: true,",
		"    turn1Events,",
		"    turn2Events,",
		"    messageCount: msgCount,",
		"  }));",
		"  session.dispose();",
		"} catch (error) {",
		"  const errorMessage = error instanceof Error ? error.message : String(error);",
		"  try { if (session) session.dispose(); } catch {}",
		"  console.log(JSON.stringify({",
		"    ok: false,",
		"    error: errorMessage.split('\\n')[0].slice(0, 600),",
		"    stack: error instanceof Error ? error.stack?.split('\\n').slice(0, 5).join('\\n') : undefined,",
		"    turn1Events,",
		"    turn2Events,",
		"  }));",
		"  process.exitCode = 1;",
		"}",
	].join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
	throw new Error(
		`sandbox produced no trailing JSON object: ${JSON.stringify(stdout)}`,
	);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const piSkip = skipUnlessPiInstalled();

describe.skipIf(piSkip)(
	"Pi session resume and second-turn behavior (mock-provider)",
	() => {
		let mockServer: MockLlmServerHandle;
		const cleanups: Array<() => Promise<void>> = [];

		beforeAll(async () => {
			mockServer = await createMockLlmServer([]);
		}, 15_000);

		afterAll(async () => {
			for (const cleanup of cleanups) await cleanup();
			await mockServer?.close();
		});

		async function scaffoldWorkDir(
			prefix: string,
		): Promise<{ workDir: string; agentDir: string }> {
			const workDir = await mkdtemp(
				path.join(tmpdir(), `pi-resume-${prefix}-`),
			);
			const agentDir = path.join(workDir, ".pi", "agent");
			await mkdir(agentDir, { recursive: true });
			await writeFile(
				path.join(agentDir, "models.json"),
				JSON.stringify(
					{
						providers: {
							anthropic: {
								baseUrl: `http://127.0.0.1:${mockServer.port}`,
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

		// ---------------------------------------------------------------
		// [SDK] second turn observes prior state (write+bash → read+bash)
		// ---------------------------------------------------------------
		it(
			"[SDK] second turn observes filesystem and subprocess state from first turn",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir("sdk");

				mockServer.reset(buildSdkResumeQueue(workDir));

				const stdio = {
					stdout: [] as string[],
					stderr: [] as string[],
				};
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

				const result = await runtime.exec(
					buildResumeSandboxSource({ workDir, agentDir }),
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
				expect(
					result.code,
					`SDK exit ${result.code}, stderr: ${stdio.stderr.join("").slice(0, 1000)}`,
				).toBe(0);

				const payload = parseLastJsonLine(combinedStdout);
				expect(
					payload.ok,
					`SDK payload: ${JSON.stringify(payload)}`,
				).toBe(true);

				const turn1 = payload.turn1Events as Array<Record<string, unknown>>;
				const turn2 = payload.turn2Events as Array<Record<string, unknown>>;

				// Turn 1: write + bash completed
				expect(
					turn1.some(
						(e) => e.toolName === "write" && e.type === "tool_execution_end" && e.isError === false,
					),
					`SDK: turn 1 write should succeed, events: ${JSON.stringify(turn1)}`,
				).toBe(true);
				expect(
					turn1.some(
						(e) => e.toolName === "bash" && e.type === "tool_execution_end" && e.isError === false,
					),
					`SDK: turn 1 bash should succeed, events: ${JSON.stringify(turn1)}`,
				).toBe(true);

				// Turn 1 bash output contains marker
				const t1Bash = turn1.find((e) => e.toolName === "bash" && e.type === "tool_execution_end");
				expect(
					(t1Bash?.resultText as string)?.includes(BASH_MARKER),
					`SDK: turn 1 bash result should contain '${BASH_MARKER}', got: ${t1Bash?.resultText}`,
				).toBe(true);

				// Turn 2: read observes turn 1 content
				const t2Read = turn2.find((e) => e.toolName === "read" && e.type === "tool_execution_end");
				expect(t2Read?.isError, `SDK: turn 2 read should not error`).toBe(false);
				expect(
					(t2Read?.resultText as string)?.includes(WRITE_CONTENT),
					`SDK: turn 2 read should contain '${WRITE_CONTENT}', got: ${t2Read?.resultText}`,
				).toBe(true);

				// Turn 2: bash still works
				const t2Bash = turn2.find((e) => e.toolName === "bash" && e.type === "tool_execution_end");
				expect(t2Bash?.isError, `SDK: turn 2 bash should not error`).toBe(false);
				expect(
					(t2Bash?.resultText as string)?.includes(TURN2_CANARY),
					`SDK: turn 2 bash result should contain '${TURN2_CANARY}', got: ${t2Bash?.resultText}`,
				).toBe(true);

				// On-disk verification
				const written = await readFile(path.join(workDir, WRITE_FILE_NAME), "utf8");
				expect(written).toBe(WRITE_CONTENT);

				// Session accumulated messages from both turns
				expect(
					(payload.messageCount as number),
					`SDK: message count should reflect both turns`,
				).toBeGreaterThanOrEqual(6);
			},
			90_000,
		);

		// ---------------------------------------------------------------
		// [PTY] second turn observes prior state (write → read+write)
		// ---------------------------------------------------------------
		it(
			"[PTY] second turn observes filesystem state from first turn",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir("pty");

				mockServer.reset(buildPtyResumeQueue(workDir));

				// Build kernel with full permissions and hybrid VFS
				const permissions = {
					...allowAllFs,
					...allowAllNetwork,
					...allowAllChildProcess,
					...allowAllEnv,
				};
				const kernel: Kernel = createKernel({
					filesystem: createHybridVfs(workDir),
					hostNetworkAdapter: createNodeHostNetworkAdapter(),
					permissions,
				});
				await kernel.mount(createNodeRuntime({ permissions }));
				cleanups.push(async () => kernel.dispose());

				// Write results to a marker file (PTY output mixes Pi text
				// with our logging, making JSON parsing unreliable)
				const resultFile = path.join(workDir, "_pty_result.json");
				const mockUrl = `http://127.0.0.1:${mockServer.port}`;

				const piCode = `(async () => {
					const origFetch = globalThis.fetch;
					globalThis.fetch = function(input, init) {
						let url = typeof input === 'string' ? input
							: input instanceof URL ? input.href
							: input.url;
						if (url && url.includes('api.anthropic.com')) {
							const newUrl = url.replace(/https?:\\/\\/api\\.anthropic\\.com/, ${JSON.stringify(mockUrl)});
							if (typeof input === 'string') input = newUrl;
							else if (input instanceof URL) input = new URL(newUrl);
							else input = new Request(newUrl, input);
						}
						return origFetch.call(this, input, init);
					};

					const workDir = ${JSON.stringify(workDir)};
					const agentDir = ${JSON.stringify(agentDir)};
					const fs = require('node:fs');
					let session;
					let turn1Events = [];
					let turn2Events = [];
					let currentTurn = 1;
					try {
						const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/entry.mjs");
						const authStorage = pi.AuthStorage.inMemory();
						authStorage.setRuntimeApiKey('anthropic', 'test-key');
						const modelRegistry = new pi.ModelRegistry(authStorage, agentDir + '/models.json');
						const model = modelRegistry.find('anthropic', 'claude-sonnet-4-20250514')
							?? modelRegistry.getAll().find((c) => c.provider === 'anthropic');
						if (!model) throw new Error('No anthropic model');
						({ session } = await pi.createAgentSession({
							cwd: workDir,
							agentDir,
							authStorage,
							modelRegistry,
							model,
							tools: pi.createCodingTools(workDir),
							sessionManager: pi.SessionManager.inMemory(),
						}));
						session.subscribe((event) => {
							const events = currentTurn === 1 ? turn1Events : turn2Events;
							if (event.type === 'tool_execution_start') {
								events.push({ type: event.type, toolName: event.toolName });
							}
							if (event.type === 'tool_execution_end') {
								let resultText = '';
								try {
									const c = event.result?.content;
									if (typeof c === 'string') resultText = c;
									else if (Array.isArray(c)) resultText = c.filter(b => b.type === 'text').map(b => b.text).join('');
								} catch {}
								events.push({
									type: event.type,
									toolName: event.toolName,
									isError: event.isError,
									resultText: resultText.slice(0, 2000),
								});
							}
						});
						await pi.runPrintMode(session, {
							mode: 'text',
							initialMessage: 'Write a file.',
						});
						currentTurn = 2;
						await pi.runPrintMode(session, {
							mode: 'text',
							initialMessage: 'Read the file you just wrote and write another.',
						});
						const msgCount = session.state?.messages?.length ?? 0;
						fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({
							ok: true,
							turn1Events,
							turn2Events,
							messageCount: msgCount,
						}));
						session.dispose();
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						try { if (session) session.dispose(); } catch {}
						fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({
							ok: false,
							error: errorMessage.split('\\n')[0].slice(0, 600),
							turn1Events,
							turn2Events,
						}));
						process.exitCode = 1;
					}
				})()`;

				const shell = kernel.openShell({
					command: "node",
					args: ["-e", piCode],
					cwd: workDir,
					env: {
						HOME: workDir,
						ANTHROPIC_API_KEY: "test-key",
						NO_COLOR: "1",
						PATH: process.env.PATH ?? "/usr/bin",
					},
				});

				let output = "";
				shell.onData = (data) => {
					output += new TextDecoder().decode(data);
				};

				const exitCode = await Promise.race([
					shell.wait(),
					new Promise<number>((_, reject) =>
						setTimeout(
							() =>
								reject(
									new Error(
										`PTY timed out. Output so far:\n${output.slice(0, 3000)}`,
									),
								),
							60_000,
						),
					),
				]);

				expect(
					exitCode,
					`PTY exited ${exitCode}, output:\n${output.slice(0, 2000)}`,
				).toBe(0);

				// Read results from marker file
				expect(
					existsSync(resultFile),
					`PTY result file missing. Output:\n${output.slice(0, 2000)}`,
				).toBe(true);
				const payload = JSON.parse(
					await readFile(resultFile, "utf8"),
				) as Record<string, unknown>;
				expect(
					payload.ok,
					`PTY payload: ${JSON.stringify(payload)}`,
				).toBe(true);

				const turn1 = payload.turn1Events as Array<Record<string, unknown>>;
				const turn2 = payload.turn2Events as Array<Record<string, unknown>>;

				// Turn 1: write tool completed
				expect(
					turn1.some(
						(e) => e.toolName === "write" && e.type === "tool_execution_end" && e.isError === false,
					),
					`PTY: turn 1 write should succeed, events: ${JSON.stringify(turn1)}`,
				).toBe(true);

				// Turn 2: read observes turn 1 content
				const t2Read = turn2.find((e) => e.toolName === "read" && e.type === "tool_execution_end");
				expect(t2Read?.isError, `PTY: turn 2 read should not error`).toBe(false);
				expect(
					(t2Read?.resultText as string)?.includes(WRITE_CONTENT),
					`PTY: turn 2 read should contain '${WRITE_CONTENT}', got: ${t2Read?.resultText}`,
				).toBe(true);

				// Turn 2: second write tool completed
				const t2Write = turn2.find((e) => e.toolName === "write" && e.type === "tool_execution_end");
				expect(t2Write?.isError, `PTY: turn 2 write should not error`).toBe(false);

				// On-disk verification: both files exist
				expect(
					existsSync(path.join(workDir, WRITE_FILE_NAME)),
					"PTY: turn 1 file should exist on disk",
				).toBe(true);
				const written1 = await readFile(path.join(workDir, WRITE_FILE_NAME), "utf8");
				expect(written1).toBe(WRITE_CONTENT);

				expect(
					existsSync(path.join(workDir, TURN2_FILE_NAME)),
					"PTY: turn 2 file should exist on disk",
				).toBe(true);
				const written2 = await readFile(path.join(workDir, TURN2_FILE_NAME), "utf8");
				expect(written2).toBe(TURN2_WRITE_CONTENT);

				// Session accumulated messages from both turns
				expect(
					(payload.messageCount as number),
					`PTY: message count should reflect both turns`,
				).toBeGreaterThanOrEqual(4);
			},
			90_000,
		);
	},
);
