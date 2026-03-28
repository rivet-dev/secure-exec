/**
 * Pi worktree mutation — proves real file creation and editing in a
 * temp worktree across SDK, PTY, and headless surfaces.
 *
 * Coverage:
 *   [worktree/sdk]      SDK NodeRuntime.exec — multi-file mutation in git repo
 *   [worktree/pty]      PTY kernel.openShell — multi-file mutation in git repo
 *   [worktree/headless] Headless host spawn  — multi-file mutation in git repo
 *
 * Each surface uses a mock LLM that instructs Pi to:
 *   1. write  — create src/index.ts with known content
 *   2. bash   — mkdir -p src/utils
 *   3. write  — create src/utils/helpers.ts with known content
 *   4. edit   — modify README.md (pre-seeded) with a new section
 *   5. text   — final answer
 *
 * Verification: exact on-disk file contents and directory structure.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
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
// Worktree file constants
// ---------------------------------------------------------------------------

const README_ORIGINAL = `# test-project

A scaffold for worktree mutation tests.
`;

const README_EDIT_OLD = "A scaffold for worktree mutation tests.";
const README_EDIT_NEW =
	"A scaffold for worktree mutation tests.\n\n## Usage\n\nRun `npm start` to begin.";

const INDEX_TS_CONTENT = `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("world"));
`;

const HELPERS_TS_CONTENT = `export function add(a: number, b: number): number {
  return a + b;
}
`;

const PACKAGE_JSON_CONTENT = JSON.stringify(
	{
		name: "test-project",
		version: "1.0.0",
		main: "src/index.ts",
	},
	null,
	2,
);

const FINAL_CANARY = "WORKTREE_MUTATION_COMPLETE_77";

/** Build mock LLM tool-call queue for the worktree mutation scenario. */
function buildMutationQueue(workDir: string): MockLlmResponse[] {
	return [
		// 1. write src/index.ts
		{
			type: "tool_use",
			name: "write",
			input: {
				path: path.join(workDir, "src/index.ts"),
				content: INDEX_TS_CONTENT,
			},
		},
		// 2. mkdir -p src/utils
		{
			type: "tool_use",
			name: "bash",
			input: { command: "mkdir -p src/utils" },
		},
		// 3. write src/utils/helpers.ts
		{
			type: "tool_use",
			name: "write",
			input: {
				path: path.join(workDir, "src/utils/helpers.ts"),
				content: HELPERS_TS_CONTENT,
			},
		},
		// 4. edit README.md — add Usage section
		{
			type: "tool_use",
			name: "edit",
			input: {
				path: path.join(workDir, "README.md"),
				oldText: README_EDIT_OLD,
				newText: README_EDIT_NEW,
			},
		},
		// 5. final answer
		{ type: "text", text: FINAL_CANARY },
	];
}

// ---------------------------------------------------------------------------
// Scaffold helpers
// ---------------------------------------------------------------------------

/** Create a git-initialized temp worktree with seed files and mock LLM config. */
async function scaffoldGitWorktree(
	mockPort: number,
	prefix: string,
): Promise<{ workDir: string; agentDir: string }> {
	const workDir = await mkdtemp(
		path.join(tmpdir(), `pi-worktree-${prefix}-`),
	);

	// Seed project files
	await writeFile(path.join(workDir, "README.md"), README_ORIGINAL);
	await writeFile(path.join(workDir, "package.json"), PACKAGE_JSON_CONTENT);

	// Initialize git repo with initial commit
	execSync("git init", { cwd: workDir, stdio: "ignore" });
	execSync("git add -A", { cwd: workDir, stdio: "ignore" });
	execSync(
		'git -c user.email="test@test.com" -c user.name="Test" commit -m "initial"',
		{ cwd: workDir, stdio: "ignore" },
	);

	// Pi agent config pointing at mock LLM
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

/** Verify on-disk worktree state after mutation. */
async function assertWorktreeMutations(
	surface: string,
	workDir: string,
) {
	// 1. src/index.ts was created with correct content
	const indexPath = path.join(workDir, "src/index.ts");
	expect(
		existsSync(indexPath),
		`${surface}: src/index.ts not created`,
	).toBe(true);
	const indexContent = await readFile(indexPath, "utf8");
	expect(indexContent, `${surface}: src/index.ts content mismatch`).toBe(
		INDEX_TS_CONTENT,
	);

	// 2. src/utils/ directory exists
	const utilsDir = path.join(workDir, "src/utils");
	expect(
		existsSync(utilsDir),
		`${surface}: src/utils/ directory not created`,
	).toBe(true);

	// 3. src/utils/helpers.ts was created with correct content
	const helpersPath = path.join(workDir, "src/utils/helpers.ts");
	expect(
		existsSync(helpersPath),
		`${surface}: src/utils/helpers.ts not created`,
	).toBe(true);
	const helpersContent = await readFile(helpersPath, "utf8");
	expect(
		helpersContent,
		`${surface}: src/utils/helpers.ts content mismatch`,
	).toBe(HELPERS_TS_CONTENT);

	// 4. README.md was edited — contains Usage section
	const readmePath = path.join(workDir, "README.md");
	const readmeContent = await readFile(readmePath, "utf8");
	expect(
		readmeContent.includes("## Usage"),
		`${surface}: README.md missing edited Usage section`,
	).toBe(true);
	expect(
		readmeContent.includes("npm start"),
		`${surface}: README.md missing npm start`,
	).toBe(true);

	// 5. Original content still present (edit, not overwrite)
	expect(
		readmeContent.includes("# test-project"),
		`${surface}: README.md title missing after edit`,
	).toBe(true);
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
		"    initialMessage: 'Set up the project: create src/index.ts, mkdir src/utils, create helpers, and update README.',",
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const piSkip = skipUnlessPiInstalled();

describe.skipIf(piSkip)(
	"Pi worktree mutation (SDK, PTY, headless)",
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
			"[SDK] multi-file worktree mutation in a git-initialized project",
			async () => {
				const { workDir, agentDir } = await scaffoldGitWorktree(
					mockServer.port,
					"sdk",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				mockServer.reset(buildMutationQueue(workDir));

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

				if (result.code !== 0) {
					const payload = parseLastJsonLine(combinedStdout);
					throw new Error(
						`SDK sandbox exited ${result.code}: ${JSON.stringify(payload)}\nstderr: ${combinedStderr.slice(0, 2000)}`,
					);
				}
				const payload = parseLastJsonLine(combinedStdout);
				expect(payload.ok, JSON.stringify(payload)).toBe(true);

				// Verify all tools executed
				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];
				for (const toolName of ["write", "bash", "edit"]) {
					expect(
						toolEvents.some(
							(e) =>
								e.toolName === toolName &&
								e.type === "tool_execution_start",
						),
						`${toolName} start event missing — events: ${JSON.stringify(toolEvents)}`,
					).toBe(true);
					expect(
						toolEvents.some(
							(e) =>
								e.toolName === toolName &&
								e.type === "tool_execution_end",
						),
						`${toolName} end event missing — events: ${JSON.stringify(toolEvents)}`,
					).toBe(true);
				}
				// write and edit should succeed without errors
				for (const toolName of ["write", "edit"]) {
					expect(
						toolEvents.some(
							(e) =>
								e.toolName === toolName &&
								e.type === "tool_execution_end" &&
								e.isError === false,
						),
						`${toolName} tool errored — events: ${JSON.stringify(toolEvents)}`,
					).toBe(true);
				}

				// Verify on-disk mutations
				await assertWorktreeMutations("SDK", workDir);
			},
			90_000,
		);

		// -----------------------------------------------------------------
		// Surface 2: PTY (kernel.openShell interactive)
		// -----------------------------------------------------------------
		it(
			"[PTY] multi-file worktree mutation in a git-initialized project",
			async () => {
				const { workDir, agentDir } = await scaffoldGitWorktree(
					mockServer.port,
					"pty",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				mockServer.reset(buildMutationQueue(workDir));

				// Kernel with full permissions and hybrid VFS
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

				// Pi print-mode code that patches fetch to hit mock
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
					process.argv = ['node', 'pi', ${PI_BASE_FLAGS.map((f) => JSON.stringify(f)).join(", ")}, '--print', 'Set up the project with source files and update README.'];
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
										`PTY timed out. Output so far: ${output.slice(0, 2000)}`,
									),
								),
							60_000,
						),
					),
				]);

				expect(exitCode, `PTY exited ${exitCode}`).toBe(0);

				// Verify on-disk mutations
				await assertWorktreeMutations("PTY", workDir);
			},
			90_000,
		);

		// -----------------------------------------------------------------
		// Surface 3: Headless (host child_process.spawn)
		// -----------------------------------------------------------------
		it(
			"[headless] multi-file worktree mutation in a git-initialized project",
			async () => {
				const { workDir } = await scaffoldGitWorktree(
					mockServer.port,
					"headless",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				mockServer.reset(buildMutationQueue(workDir));

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
							"Set up the project with source files and update README.",
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

				if (result.code !== 0) {
					console.log(
						"Headless stderr:",
						result.stderr.slice(0, 2000),
					);
				}

				expect(
					result.code,
					`Headless exited ${result.code}\nstderr: ${result.stderr.slice(0, 2000)}`,
				).toBe(0);

				// Verify on-disk mutations
				await assertWorktreeMutations("headless", workDir);
			},
			90_000,
		);
	},
);
