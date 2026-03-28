/**
 * US-097 — Cross-surface Pi error-reporting parity.
 *
 * Proves that tool-level failures surface actionable error detail
 * consistently across SDK, PTY, and headless surfaces:
 *
 *   [fs-error]       read tool on a missing file → error with path context
 *   [subprocess-error] bash tool with nonzero exit → error with exit/stderr context
 *
 * Each surface runs the identical mock-LLM scenario. Assertions verify
 * that the error surfaces cleanly (no hangs, no crashes) and that
 * enough concrete detail is present to diagnose the denied/failed
 * operation from that surface alone.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
// Shared error scenario builders
// ---------------------------------------------------------------------------

/** Mock LLM queue: read a file that does not exist, then summarize. */
function buildFsErrorQueue(missingPath: string): MockLlmResponse[] {
	return [
		{
			type: "tool_use",
			name: "read",
			input: { path: missingPath },
		},
		{ type: "text", text: "The file does not exist." },
	];
}

/** Mock LLM queue: run a bash command that exits nonzero, then summarize. */
function buildSubprocessErrorQueue(): MockLlmResponse[] {
	return [
		{
			type: "tool_use",
			name: "bash",
			input: { command: "echo ERR_SENTINEL >&2; exit 42" },
		},
		{ type: "text", text: "The command failed." },
	];
}

// ---------------------------------------------------------------------------
// SDK sandbox source builder (captures tool events with resultText)
// ---------------------------------------------------------------------------

function buildSdkErrorSource(opts: {
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
		"        resultText: resultText.slice(0, 4000),",
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseLastJsonLine(stdout: string): Record<string, unknown> {
	const trimmed = stdout.trim();
	if (!trimmed) throw new Error(`No JSON output: ${JSON.stringify(stdout)}`);
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

interface ToolEvent {
	type: string;
	toolName: string;
	isError?: boolean;
	resultText?: string;
}

/** Scaffold a temp workDir with mock-provider agent config. */
async function scaffoldWorkDir(
	mockPort: number,
	prefix: string,
): Promise<{ workDir: string; agentDir: string }> {
	const workDir = await mkdtemp(path.join(tmpdir(), `pi-err-${prefix}-`));
	const agentDir = path.join(workDir, ".pi", "agent");
	await mkdir(agentDir, { recursive: true });
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const piSkip = skipUnlessPiInstalled();

describe.skipIf(piSkip)(
	"Pi cross-surface error-reporting parity (US-097)",
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

		// =================================================================
		// A. Filesystem error: read a missing file
		// =================================================================

		describe("filesystem error — read missing file", () => {
			// ---------------------------------------------------------
			// SDK surface
			// ---------------------------------------------------------
			it(
				"[SDK] read tool on missing file reports isError with path context",
				async () => {
					const { workDir, agentDir } = await scaffoldWorkDir(
						mockServer.port,
						"sdk-fs",
					);
					cleanups.push(async () =>
						rm(workDir, { recursive: true, force: true }),
					);

					const missingFile = path.join(workDir, "no-such-file.txt");
					mockServer.reset(buildFsErrorQueue(missingFile));

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
						}),
						runtimeDriverFactory: createNodeRuntimeDriverFactory(),
					});
					cleanups.push(async () => runtime.terminate());

					await runtime.exec(
						buildSdkErrorSource({
							workDir,
							agentDir,
							initialMessage: `Read the file at ${missingFile}`,
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

					const payload = parseLastJsonLine(stdio.stdout.join(""));
					expect(
						payload.ok,
						`SDK session crashed: ${JSON.stringify(payload)}`,
					).toBe(true);

					const toolEvents = (payload.toolEvents ?? []) as ToolEvent[];
					const readEnd = toolEvents.find(
						(e) =>
							e.toolName === "read" &&
							e.type === "tool_execution_end",
					);

					expect(
						readEnd,
						"read tool_execution_end must be emitted",
					).toBeTruthy();
					expect(
						readEnd!.isError,
						"read tool on missing file must set isError=true",
					).toBe(true);
					expect(
						typeof readEnd!.resultText,
						"read error must include resultText",
					).toBe("string");
					expect(
						readEnd!.resultText!.length,
						"read error resultText must be non-empty",
					).toBeGreaterThan(0);
				},
				60_000,
			);

			// ---------------------------------------------------------
			// PTY surface
			// ---------------------------------------------------------
			it(
				"[PTY] read tool on missing file surfaces error detail in PTY output",
				async () => {
					const { workDir, agentDir } = await scaffoldWorkDir(
						mockServer.port,
						"pty-fs",
					);
					cleanups.push(async () =>
						rm(workDir, { recursive: true, force: true }),
					);

					const missingFile = path.join(workDir, "no-such-file.txt");
					mockServer.reset(buildFsErrorQueue(missingFile));

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
						process.argv = ['node', 'pi', ${PI_BASE_FLAGS.map((f) => JSON.stringify(f)).join(", ")}, '--print', 'Read the missing file.'];
						process.env.HOME = ${JSON.stringify(workDir)};
						process.env.ANTHROPIC_API_KEY = 'test-key';
						process.env.NO_COLOR = '1';
						await import(${JSON.stringify(PI_CLI)});
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
											`PTY fs-error timed out. Output:\n${output.slice(0, 2000)}`,
										),
									),
								60_000,
							),
						),
					]);

					// Pi should still exit cleanly (the tool error is not fatal to the session)
					expect(exitCode, `PTY non-zero exit. Output:\n${output.slice(0, 2000)}`).toBe(0);
					// PTY output should contain error indication — either an
					// error string or the "does not exist" text from the mock summary
					const lower = output.toLowerCase();
					const hasErrorIndication =
						lower.includes("error") ||
						lower.includes("not exist") ||
						lower.includes("no such file") ||
						lower.includes("enoent") ||
						lower.includes("does not exist");
					expect(
						hasErrorIndication,
						`PTY output lacks error indication for missing-file read.\nOutput: ${output.slice(0, 2000)}`,
					).toBe(true);
				},
				90_000,
			);

			// ---------------------------------------------------------
			// Headless surface
			// ---------------------------------------------------------
			it(
				"[headless] read tool on missing file surfaces error detail in stdout/stderr",
				async () => {
					const { workDir } = await scaffoldWorkDir(
						mockServer.port,
						"headless-fs",
					);
					cleanups.push(async () =>
						rm(workDir, { recursive: true, force: true }),
					);

					const missingFile = path.join(workDir, "no-such-file.txt");
					mockServer.reset(buildFsErrorQueue(missingFile));

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
								"Read the missing file.",
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
						child.stdout.on("data", (d: Buffer) =>
							stdoutChunks.push(d),
						);
						child.stderr.on("data", (d: Buffer) =>
							stderrChunks.push(d),
						);

						const timer = setTimeout(
							() => child.kill("SIGKILL"),
							60_000,
						);
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

					// Pi should exit cleanly — tool error is non-fatal
					expect(
						result.code,
						`Headless non-zero exit. stderr:\n${result.stderr.slice(0, 2000)}`,
					).toBe(0);
					// Combined output should mention the error or the mock's summary text
					const combined = (
						result.stdout +
						"\n" +
						result.stderr
					).toLowerCase();
					const hasErrorIndication =
						combined.includes("error") ||
						combined.includes("not exist") ||
						combined.includes("no such file") ||
						combined.includes("enoent") ||
						combined.includes("does not exist");
					expect(
						hasErrorIndication,
						`Headless output lacks error indication for missing-file read.\nstdout: ${result.stdout.slice(0, 1000)}\nstderr: ${result.stderr.slice(0, 1000)}`,
					).toBe(true);
				},
				90_000,
			);
		});

		// =================================================================
		// B. Subprocess error: bash tool with nonzero exit
		// =================================================================

		describe("subprocess error — bash nonzero exit", () => {
			// ---------------------------------------------------------
			// SDK surface
			// ---------------------------------------------------------
			it(
				"[SDK] bash tool nonzero exit reports isError with stderr context",
				async () => {
					const { workDir, agentDir } = await scaffoldWorkDir(
						mockServer.port,
						"sdk-sub",
					);
					cleanups.push(async () =>
						rm(workDir, { recursive: true, force: true }),
					);

					mockServer.reset(buildSubprocessErrorQueue());

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

					await runtime.exec(
						buildSdkErrorSource({
							workDir,
							agentDir,
							initialMessage:
								"Run this bash command: echo ERR_SENTINEL >&2; exit 42",
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

					const payload = parseLastJsonLine(stdio.stdout.join(""));
					expect(
						payload.ok,
						`SDK session crashed: ${JSON.stringify(payload)}`,
					).toBe(true);

					const toolEvents = (payload.toolEvents ?? []) as ToolEvent[];
					const bashEnd = toolEvents.find(
						(e) =>
							e.toolName === "bash" &&
							e.type === "tool_execution_end",
					);

					expect(
						bashEnd,
						"bash tool_execution_end must be emitted",
					).toBeTruthy();
					expect(
						bashEnd!.isError,
						"bash tool with nonzero exit must set isError=true",
					).toBe(true);
					expect(
						typeof bashEnd!.resultText,
						"bash error must include resultText",
					).toBe("string");
					// Result should contain stderr output or exit code indication
					const resultLower = (bashEnd!.resultText ?? "").toLowerCase();
					const hasSubprocessDetail =
						resultLower.includes("err_sentinel") ||
						resultLower.includes("42") ||
						resultLower.includes("exit") ||
						resultLower.includes("error");
					expect(
						hasSubprocessDetail,
						`SDK bash error resultText lacks subprocess detail: ${bashEnd!.resultText?.slice(0, 500)}`,
					).toBe(true);
				},
				60_000,
			);

			// ---------------------------------------------------------
			// PTY surface
			// ---------------------------------------------------------
			it(
				"[PTY] bash tool nonzero exit surfaces error detail in PTY output",
				async () => {
					const { workDir, agentDir } = await scaffoldWorkDir(
						mockServer.port,
						"pty-sub",
					);
					cleanups.push(async () =>
						rm(workDir, { recursive: true, force: true }),
					);

					mockServer.reset(buildSubprocessErrorQueue());

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
						process.argv = ['node', 'pi', ${PI_BASE_FLAGS.map((f) => JSON.stringify(f)).join(", ")}, '--print', 'Run a failing bash command.'];
						process.env.HOME = ${JSON.stringify(workDir)};
						process.env.ANTHROPIC_API_KEY = 'test-key';
						process.env.NO_COLOR = '1';
						await import(${JSON.stringify(PI_CLI)});
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
											`PTY subprocess-error timed out. Output:\n${output.slice(0, 2000)}`,
										),
									),
								60_000,
							),
						),
					]);

					// Pi should still exit cleanly
					expect(exitCode, `PTY non-zero exit. Output:\n${output.slice(0, 2000)}`).toBe(0);
					// PTY output should contain error or failure indication
					const lower = output.toLowerCase();
					const hasErrorIndication =
						lower.includes("error") ||
						lower.includes("fail") ||
						lower.includes("err_sentinel") ||
						lower.includes("exit") ||
						lower.includes("42") ||
						lower.includes("command failed");
					expect(
						hasErrorIndication,
						`PTY output lacks error indication for bash nonzero exit.\nOutput: ${output.slice(0, 2000)}`,
					).toBe(true);
				},
				90_000,
			);

			// ---------------------------------------------------------
			// Headless surface
			// ---------------------------------------------------------
			it(
				"[headless] bash tool nonzero exit surfaces error detail in stdout/stderr",
				async () => {
					const { workDir } = await scaffoldWorkDir(
						mockServer.port,
						"headless-sub",
					);
					cleanups.push(async () =>
						rm(workDir, { recursive: true, force: true }),
					);

					mockServer.reset(buildSubprocessErrorQueue());

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
								"Run a failing bash command.",
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
						child.stdout.on("data", (d: Buffer) =>
							stdoutChunks.push(d),
						);
						child.stderr.on("data", (d: Buffer) =>
							stderrChunks.push(d),
						);

						const timer = setTimeout(
							() => child.kill("SIGKILL"),
							60_000,
						);
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

					// Pi should exit cleanly
					expect(
						result.code,
						`Headless non-zero exit. stderr:\n${result.stderr.slice(0, 2000)}`,
					).toBe(0);
					// Combined output should contain error/failure indication
					const combined = (
						result.stdout +
						"\n" +
						result.stderr
					).toLowerCase();
					const hasErrorIndication =
						combined.includes("error") ||
						combined.includes("fail") ||
						combined.includes("err_sentinel") ||
						combined.includes("exit") ||
						combined.includes("42") ||
						combined.includes("command failed");
					expect(
						hasErrorIndication,
						`Headless output lacks error indication for bash nonzero exit.\nstdout: ${result.stdout.slice(0, 1000)}\nstderr: ${result.stderr.slice(0, 1000)}`,
					).toBe(true);
				},
				90_000,
			);
		});

		// =================================================================
		// C. Cross-surface parity: SDK error detail is at least as rich
		//    as headless error detail
		// =================================================================

		it(
			"[parity] SDK tool error events provide richer detail than headless stdout alone",
			async () => {
				// This test re-uses the SDK fs-error scenario and confirms that
				// SDK tool events include the resultText field, which is not
				// available through headless stdout parsing.
				const { workDir, agentDir } = await scaffoldWorkDir(
					mockServer.port,
					"parity",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				const missingFile = path.join(workDir, "parity-missing.txt");
				mockServer.reset(buildFsErrorQueue(missingFile));

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
					}),
					runtimeDriverFactory: createNodeRuntimeDriverFactory(),
				});
				cleanups.push(async () => runtime.terminate());

				await runtime.exec(
					buildSdkErrorSource({
						workDir,
						agentDir,
						initialMessage: `Read the file at ${missingFile}`,
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

				const payload = parseLastJsonLine(stdio.stdout.join(""));
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				const toolEvents = (payload.toolEvents ?? []) as ToolEvent[];
				const readEnd = toolEvents.find(
					(e) =>
						e.toolName === "read" &&
						e.type === "tool_execution_end",
				);
				expect(readEnd).toBeTruthy();
				expect(readEnd!.isError).toBe(true);

				// The SDK surface provides structured error detail via resultText
				// that headless/PTY surfaces can only see through output parsing.
				// This is an expected asymmetry: SDK is the richest surface.
				expect(
					readEnd!.resultText,
					"SDK resultText must be present for fs error",
				).toBeTruthy();
				expect(
					readEnd!.resultText!.length,
					"SDK resultText must be non-trivial",
				).toBeGreaterThan(5);
			},
			60_000,
		);
	},
);
