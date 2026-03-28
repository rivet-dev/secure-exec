/**
 * Cross-surface Pi parity — proves the same end-to-end scenario
 * produces equivalent observable outcomes across SDK, PTY, and
 * headless surfaces.
 *
 * Shared scenario:
 *   1. read  — read a pre-seeded file
 *   2. bash  — run `pwd`
 *   3. write — create a new file with known content
 *   4. text  — final natural-language answer with canary
 *
 * All three surfaces use the same mock LLM server with the same
 * deterministic tool calls. Verification:
 *   - Process exits 0
 *   - Written file exists on disk with exact content
 *   - Output contains the final canary text
 *
 * No host-spawn fallback is treated as proof for any surface.
 */

import { spawn as nodeSpawn } from "node:child_process";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PI_SDK_ENTRY = path.resolve(
	SECURE_EXEC_ROOT,
	"node_modules/@mariozechner/pi-coding-agent/dist/index.js",
);
const PI_CLI = path.resolve(
	SECURE_EXEC_ROOT,
	"node_modules/@mariozechner/pi-coding-agent/dist/cli.js",
);
const FETCH_INTERCEPT = path.resolve(__dirname, "fetch-intercept.cjs");

const PI_BASE_FLAGS = [
	"--verbose",
	"--no-session",
	"--no-extensions",
	"--no-skills",
	"--no-prompt-templates",
	"--no-themes",
];

// ---------------------------------------------------------------------------
// Shared scenario constants
// ---------------------------------------------------------------------------

const SEED_FILE_NAME = "seed-input.txt";
const SEED_FILE_CONTENT = "secret_parity_input_42";
const WRITE_FILE_NAME = "parity-output.txt";
const WRITE_FILE_CONTENT = "written_by_parity_scenario";
const FINAL_CANARY = "PARITY_CANARY_SUCCESS_99";

/** Build the mock LLM response queue for the shared scenario. */
function buildScenarioQueue(workDir: string): MockLlmResponse[] {
	return [
		// Turn 1: read the seeded file
		{
			type: "tool_use",
			name: "read",
			input: { path: path.join(workDir, SEED_FILE_NAME) },
		},
		// Turn 2: run pwd
		{
			type: "tool_use",
			name: "bash",
			input: { command: "pwd" },
		},
		// Turn 3: write a new file
		{
			type: "tool_use",
			name: "write",
			input: {
				path: path.join(workDir, WRITE_FILE_NAME),
				content: WRITE_FILE_CONTENT,
			},
		},
		// Turn 4: final text answer
		{ type: "text", text: FINAL_CANARY },
	];
}

// ---------------------------------------------------------------------------
// SDK sandbox source
// ---------------------------------------------------------------------------

function buildSdkSandboxSource(opts: {
	workDir: string;
	agentDir: string;
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
		"      toolEvents.push({ type: event.type, toolName: event.toolName });",
		"    }",
		"    if (event.type === 'tool_execution_end') {",
		"      toolEvents.push({ type: event.type, toolName: event.toolName, isError: event.isError });",
		"    }",
		"  });",
		"  await pi.runPrintMode(session, {",
		"    mode: 'text',",
		"    initialMessage: 'Read the seed file, run pwd, write an output file, and summarize.',",
		"  });",
		"  console.log(JSON.stringify({",
		"    ok: true,",
		"    toolEvents,",
		"  }));",
		"  session.dispose();",
		"} catch (error) {",
		"  const errorMessage = error instanceof Error ? error.message : String(error);",
		"  console.log(JSON.stringify({",
		"    ok: false,",
		"    error: errorMessage.split('\\n')[0].slice(0, 600),",
		"    toolEvents,",
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
	if (!trimmed)
		throw new Error(`No JSON output: ${JSON.stringify(stdout)}`);
	for (
		let i = trimmed.lastIndexOf("{");
		i >= 0;
		i = trimmed.lastIndexOf("{", i - 1)
	) {
		try {
			return JSON.parse(trimmed.slice(i)) as Record<string, unknown>;
		} catch {
			/* scan backward */
		}
	}
	throw new Error(`No trailing JSON: ${JSON.stringify(stdout)}`);
}

/** Scaffold a temp workDir with seeded file and mock-provider agent config. */
async function scaffoldWorkDir(
	mockPort: number,
	prefix: string,
): Promise<{ workDir: string; agentDir: string }> {
	const workDir = await mkdtemp(path.join(tmpdir(), `pi-parity-${prefix}-`));
	const agentDir = path.join(workDir, ".pi", "agent");
	await mkdir(agentDir, { recursive: true });

	// Seed the input file
	await writeFile(path.join(workDir, SEED_FILE_NAME), SEED_FILE_CONTENT);

	// Point Pi at the mock LLM
	await writeFile(
		path.join(agentDir, "models.json"),
		JSON.stringify(
			{
				providers: {
					anthropic: {
						baseUrl: `http://127.0.0.1:${mockPort}`,
					},
				},
			},
			null,
			2,
		),
	);
	return { workDir, agentDir };
}

/** Verify the shared observable outcomes. */
async function assertParityOutcomes(
	surface: string,
	workDir: string,
	stdout: string,
	exitCode: number,
) {
	// 1. Process exited successfully
	expect(exitCode, `${surface}: non-zero exit`).toBe(0);

	// 2. Written file exists with correct content
	const writtenPath = path.join(workDir, WRITE_FILE_NAME);
	expect(
		existsSync(writtenPath),
		`${surface}: written file missing at ${writtenPath}`,
	).toBe(true);
	const writtenContent = await readFile(writtenPath, "utf8");
	expect(writtenContent, `${surface}: written file content mismatch`).toBe(
		WRITE_FILE_CONTENT,
	);

	// 3. Final canary appears in output
	expect(
		stdout.includes(FINAL_CANARY),
		`${surface}: final canary '${FINAL_CANARY}' not found in stdout`,
	).toBe(true);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const piSkip = skipUnlessPiInstalled();

describe.skipIf(piSkip)(
	"Pi cross-surface parity (SDK, PTY, headless)",
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

		// -----------------------------------------------------------------
		// Surface 1: SDK (NodeRuntime.exec sandbox)
		// -----------------------------------------------------------------
		it(
			"[SDK] shared scenario passes through NodeRuntime sandbox",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir(
					mockServer.port,
					"sdk",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				mockServer.reset(buildScenarioQueue(workDir));

				const stdio = { stdout: [] as string[], stderr: [] as string[] };
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
					}),
					runtimeDriverFactory: createNodeRuntimeDriverFactory(),
				});
				cleanups.push(async () => runtime.terminate());

				const result = await runtime.exec(
					buildSdkSandboxSource({ workDir, agentDir }),
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

				// SDK-specific: parse JSON output and check ok
				if (result.code !== 0) {
					const payload = parseLastJsonLine(combinedStdout);
					throw new Error(
						`SDK sandbox exited ${result.code}: ${JSON.stringify(payload)}\nstderr: ${combinedStderr.slice(0, 1000)}`,
					);
				}
				const payload = parseLastJsonLine(combinedStdout);
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				// Verify tool events fired for all 3 tools
				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];
				for (const toolName of ["read", "bash", "write"]) {
					expect(
						toolEvents.some(
							(e) =>
								e.toolName === toolName &&
								e.type === "tool_execution_start",
						),
						`${toolName} start event missing`,
					).toBe(true);
					expect(
						toolEvents.some(
							(e) =>
								e.toolName === toolName &&
								e.type === "tool_execution_end",
						),
						`${toolName} end event missing`,
					).toBe(true);
				}

				await assertParityOutcomes(
					"SDK",
					workDir,
					combinedStdout,
					result.code,
				);
			},
			90_000,
		);

		// -----------------------------------------------------------------
		// Surface 2: PTY (kernel.openShell interactive)
		// -----------------------------------------------------------------
		it(
			"[PTY] shared scenario passes through kernel openShell PTY",
			async () => {
				const { workDir, agentDir } = await scaffoldWorkDir(
					mockServer.port,
					"pty",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				mockServer.reset(buildScenarioQueue(workDir));

				// Build kernel with full permissions, host network for mock
				// LLM access, and hybrid VFS for host read + memory write
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

				// Build Pi print-mode code that patches fetch to use mock
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
					process.argv = ['node', 'pi', ${PI_BASE_FLAGS.map((f) => JSON.stringify(f)).join(", ")}, '--print', 'Run the full parity scenario.'];
					process.env.HOME = ${JSON.stringify(workDir)};
					process.env.ANTHROPIC_API_KEY = 'test-key';
					process.env.NO_COLOR = '1';
					await import(${JSON.stringify(PI_CLI)});
				})()`;

				// Run through openShell and collect output
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
										`PTY timed out. Output so far: ${output.slice(0, 2000)}`,
									),
								),
							60_000,
						),
					),
				]);

				await assertParityOutcomes("PTY", workDir, output, exitCode);
			},
			90_000,
		);

		// -----------------------------------------------------------------
		// Surface 3: Headless (host child_process.spawn)
		// -----------------------------------------------------------------
		it(
			"[headless] shared scenario passes through host spawn",
			async () => {
				const { workDir } = await scaffoldWorkDir(
					mockServer.port,
					"headless",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				mockServer.reset(buildScenarioQueue(workDir));

				const result = await new Promise<{
					code: number;
					stdout: string;
					stderr: string;
				}>((resolve) => {
					const child = nodeSpawn(
						"node",
						[
							PI_CLI,
							...PI_BASE_FLAGS,
							"--print",
							"Run the full parity scenario.",
						],
						{
							cwd: workDir,
							env: {
								...(process.env as Record<string, string>),
								ANTHROPIC_API_KEY: "test-key",
								MOCK_LLM_URL: `http://127.0.0.1:${mockServer.port}`,
								NODE_OPTIONS: `-r ${FETCH_INTERCEPT}`,
								HOME: workDir,
								PI_AGENT_DIR: path.join(workDir, ".pi"),
								NO_COLOR: "1",
							},
							stdio: ["pipe", "pipe", "pipe"],
						},
					);

					const stdoutChunks: Buffer[] = [];
					const stderrChunks: Buffer[] = [];
					child.stdout.on("data", (d: Buffer) => stdoutChunks.push(d));
					child.stderr.on("data", (d: Buffer) => stderrChunks.push(d));

					const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
					child.on("close", (code) => {
						clearTimeout(timer);
						resolve({
							code: code ?? 1,
							stdout: Buffer.concat(stdoutChunks).toString(),
							stderr: Buffer.concat(stderrChunks).toString(),
						});
					});
					child.stdin.end();
				});

				if (result.code !== 0) {
					console.log(
						"Headless stderr:",
						result.stderr.slice(0, 2000),
					);
				}

				await assertParityOutcomes(
					"headless",
					workDir,
					result.stdout,
					result.code,
				);
			},
			90_000,
		);
	},
);
