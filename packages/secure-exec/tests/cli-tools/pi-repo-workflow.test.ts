/**
 * Pi repo-aware workflows — proves that Pi can edit files in a
 * git-initialized repository and inspect repo state with git
 * subprocesses (git status, git diff), with the output accurately
 * reflecting sandbox worktree mutations.
 *
 * Coverage:
 *   [repo/sdk]      SDK NodeRuntime.exec — file edits + git status/diff
 *   [repo/headless] Headless host spawn  — file edits + git status/diff
 *
 * Each surface uses a mock LLM that instructs Pi to:
 *   1. write  — modify README.md with new content
 *   2. write  — create a new file src/main.ts
 *   3. bash   — run `git status` to see dirty worktree
 *   4. bash   — run `git diff` to see tracked changes
 *   5. text   — final answer
 *
 * Verification: tool result content from bash calls contains expected
 * git porcelain output reflecting the file mutations.
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
	createNodeDriver,
	createNodeHostCommandExecutor,
	createNodeRuntimeDriverFactory,
} from "../../src/index.js";
import {
	createMockLlmServer,
	type MockLlmServerHandle,
	type MockLlmResponse,
} from "./mock-llm-server.ts";
import {
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
// File constants
// ---------------------------------------------------------------------------

const README_ORIGINAL = `# my-repo

Initial project readme.
`;

const README_MODIFIED = `# my-repo

Initial project readme.

## Getting Started

Run \`npm install\` then \`npm start\`.
`;

const MAIN_TS_CONTENT = `console.log("hello from main");
`;

const PACKAGE_JSON_CONTENT = JSON.stringify(
	{ name: "my-repo", version: "1.0.0" },
	null,
	2,
);

// ---------------------------------------------------------------------------
// Mock LLM queue
// ---------------------------------------------------------------------------

/** Build tool-call queue: modify tracked file, create new file, then git status + git diff. */
function buildRepoWorkflowQueue(workDir: string): MockLlmResponse[] {
	return [
		// 1. Modify the tracked README.md
		{
			type: "tool_use",
			name: "write",
			input: {
				path: path.join(workDir, "README.md"),
				content: README_MODIFIED,
			},
		},
		// 2. Create a new untracked file
		{
			type: "tool_use",
			name: "write",
			input: {
				path: path.join(workDir, "src/main.ts"),
				content: MAIN_TS_CONTENT,
			},
		},
		// 3. Run git status
		{
			type: "tool_use",
			name: "bash",
			input: { command: "git status" },
		},
		// 4. Run git diff (tracked changes)
		{
			type: "tool_use",
			name: "bash",
			input: { command: "git diff" },
		},
		// 5. Final answer
		{ type: "text", text: "REPO_WORKFLOW_DONE" },
	];
}

// ---------------------------------------------------------------------------
// Scaffold helpers
// ---------------------------------------------------------------------------

async function scaffoldGitRepo(
	mockPort: number,
	prefix: string,
): Promise<{ workDir: string; agentDir: string }> {
	const workDir = await mkdtemp(
		path.join(tmpdir(), `pi-repo-workflow-${prefix}-`),
	);

	// Seed files and commit
	await writeFile(path.join(workDir, "README.md"), README_ORIGINAL);
	await writeFile(path.join(workDir, "package.json"), PACKAGE_JSON_CONTENT);

	execSync("git init", { cwd: workDir, stdio: "ignore" });
	execSync("git add -A", { cwd: workDir, stdio: "ignore" });
	execSync(
		'git -c user.email="test@test.com" -c user.name="Test" commit -m "initial"',
		{ cwd: workDir, stdio: "ignore" },
	);

	// Pi agent config
	const agentDir = path.join(workDir, ".pi", "agent");
	await mkdir(agentDir, { recursive: true });
	await writeFile(
		path.join(agentDir, "models.json"),
		JSON.stringify(
			{
				providers: {
					anthropic: { baseUrl: `http://127.0.0.1:${mockPort}` },
				},
			},
			null,
			2,
		),
	);

	return { workDir, agentDir };
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
		"      const resultText = event.result?.content",
		"        ? event.result.content.map(b => b.type === 'text' ? b.text : '').join('')",
		"        : '';",
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
		"    initialMessage: 'Update README with getting started section, create src/main.ts, then run git status and git diff.',",
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
	"Pi repo-aware workflows (SDK, headless)",
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
		// Surface 1: SDK (NodeRuntime.exec sandbox) — non-PTY
		// -----------------------------------------------------------------
		it(
			"[SDK] file edits + git status/diff in a git-initialized repo",
			async () => {
				const { workDir, agentDir } = await scaffoldGitRepo(
					mockServer.port,
					"sdk",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				mockServer.reset(buildRepoWorkflowQueue(workDir));

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
						commandExecutor: createNodeHostCommandExecutor(),
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
							PATH: process.env.PATH ?? "/usr/bin:/bin",
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

				const toolEvents = Array.isArray(payload.toolEvents)
					? (payload.toolEvents as Array<Record<string, unknown>>)
					: [];

				// Verify all expected tools ran
				for (const toolName of ["write", "bash"]) {
					expect(
						toolEvents.some(
							(e) =>
								e.toolName === toolName &&
								e.type === "tool_execution_start",
						),
						`${toolName} start event missing — events: ${JSON.stringify(toolEvents)}`,
					).toBe(true);
				}

				// Verify write tool succeeded
				expect(
					toolEvents.some(
						(e) =>
							e.toolName === "write" &&
							e.type === "tool_execution_end" &&
							e.isError === false,
					),
					`write tool errored — events: ${JSON.stringify(toolEvents)}`,
				).toBe(true);

				// Find the bash tool_execution_end events to inspect git output
				const bashResults = toolEvents.filter(
					(e) =>
						e.toolName === "bash" &&
						e.type === "tool_execution_end",
				);
				expect(
					bashResults.length,
					`Expected 2 bash results (git status + git diff), got ${bashResults.length}`,
				).toBeGreaterThanOrEqual(2);

				// git status result should mention README.md as modified and src/ as untracked
				const gitStatusResult = String(bashResults[0].resultText ?? "");
				expect(
					gitStatusResult.includes("README.md"),
					`git status should mention README.md — got: ${gitStatusResult.slice(0, 500)}`,
				).toBe(true);
				expect(
					gitStatusResult.includes("src/"),
					`git status should mention src/ (untracked) — got: ${gitStatusResult.slice(0, 500)}`,
				).toBe(true);

				// git diff result should contain the README.md changes
				const gitDiffResult = String(bashResults[1].resultText ?? "");
				expect(
					gitDiffResult.includes("Getting Started"),
					`git diff should contain 'Getting Started' from README edit — got: ${gitDiffResult.slice(0, 500)}`,
				).toBe(true);

				// On-disk verification: files actually mutated
				const readmeContent = await readFile(
					path.join(workDir, "README.md"),
					"utf8",
				);
				expect(readmeContent).toContain("## Getting Started");
				expect(readmeContent).toContain("npm install");

				expect(
					existsSync(path.join(workDir, "src/main.ts")),
					"src/main.ts should exist on disk",
				).toBe(true);
				const mainContent = await readFile(
					path.join(workDir, "src/main.ts"),
					"utf8",
				);
				expect(mainContent).toBe(MAIN_TS_CONTENT);

				// Verify git agrees on host side too
				const hostGitStatus = execSync("git status", {
					cwd: workDir,
					encoding: "utf8",
				});
				expect(hostGitStatus).toContain("README.md");
				expect(hostGitStatus).toContain("src/");
			},
			90_000,
		);

		// -----------------------------------------------------------------
		// Surface 2: Headless (host child_process.spawn)
		// -----------------------------------------------------------------
		it(
			"[headless] file edits + git status/diff in a git-initialized repo",
			async () => {
				const { workDir } = await scaffoldGitRepo(
					mockServer.port,
					"headless",
				);
				cleanups.push(async () =>
					rm(workDir, { recursive: true, force: true }),
				);

				mockServer.reset(buildRepoWorkflowQueue(workDir));

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
							"Update README, create src/main.ts, then run git status and git diff.",
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

				// On-disk verification: files actually mutated
				const readmeContent = await readFile(
					path.join(workDir, "README.md"),
					"utf8",
				);
				expect(readmeContent).toContain("## Getting Started");
				expect(readmeContent).toContain("npm install");

				expect(
					existsSync(path.join(workDir, "src/main.ts")),
					"src/main.ts should exist on disk",
				).toBe(true);

				// Git state on disk reflects the mutations
				const hostGitStatus = execSync("git status", {
					cwd: workDir,
					encoding: "utf8",
				});
				expect(hostGitStatus).toContain("README.md");
				expect(hostGitStatus).toContain("src/");

				const hostGitDiff = execSync("git diff", {
					cwd: workDir,
					encoding: "utf8",
				});
				expect(hostGitDiff).toContain("Getting Started");
			},
			90_000,
		);
	},
);
