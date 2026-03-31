import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	allowAll,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
	NodeFileSystem,
	NodeRuntime,
} from "../../src/index.js";
import {
	createMockLlmServer,
	type MockLlmServerHandle,
} from "./mock-llm-server.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, "../..");
const PI_MAIN_ENTRY = path.resolve(
	SECURE_EXEC_ROOT,
	"node_modules/@mariozechner/pi-coding-agent/dist/main.js",
);
const PI_BASE_FLAGS = [
	"--verbose",
	"--no-session",
	"--no-extensions",
	"--no-skills",
	"--no-prompt-templates",
	"--no-themes",
	"--provider",
	"anthropic",
	"--model",
	"claude-sonnet-4-20250514",
] as const;

function skipUnlessPiInstalled(): string | false {
	return existsSync(PI_MAIN_ENTRY)
		? false
		: "@mariozechner/pi-coding-agent main entry not installed";
}

function buildDirectPiMainSource(opts: {
	workDir: string;
	agentDir: string;
	initialMessage: string;
}): string {
	return [
		"process.title = 'pi';",
		"let finishState = 'running';",
		"let failureText = '';",
		"const keepAlive = setInterval(() => {",
		"  if (finishState === 'running') return;",
		"  clearInterval(keepAlive);",
		"  if (finishState === 'exit-0') {",
		"    process.exit(0);",
		"    return;",
		"  }",
		"  if (finishState === 'error') {",
		"    console.error(failureText);",
		"    process.exitCode = 1;",
		"  }",
		"}, 10);",
		"(async () => {",
		"  try {",
		`    const { main } = await globalThis.__dynamicImport(${JSON.stringify(PI_MAIN_ENTRY)}, "/entry.mjs");`,
		`    process.env.HOME = ${JSON.stringify(opts.workDir)};`,
		`    process.env.PI_CODING_AGENT_DIR = ${JSON.stringify(opts.agentDir)};`,
		"    process.env.ANTHROPIC_API_KEY = 'test-key';",
		"    process.env.NO_COLOR = '1';",
		"    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });",
		`    await main([...${JSON.stringify(PI_BASE_FLAGS)}, '--print', ${JSON.stringify(opts.initialMessage)}]);`,
		"    finishState = 'done';",
		"  } catch (error) {",
		"    const message = error instanceof Error ? error.message : String(error);",
		"    if (error instanceof Error && error.name === 'ProcessExitError' && message === 'process.exit(0)') {",
		"      finishState = 'exit-0';",
		"      return;",
		"    }",
		"    failureText = error instanceof Error ? error.stack ?? error.message : String(error);",
		"    finishState = 'error';",
		"  }",
		"})();",
	].join("\n");
}

describe.skipIf(skipUnlessPiInstalled())(
	"Pi CLI standalone NodeRuntime headless regressions (mock-provider)",
	() => {
		let mockServer: MockLlmServerHandle | undefined;
		const cleanups: Array<() => Promise<void>> = [];

		beforeAll(async () => {
			mockServer = await createMockLlmServer([]);
		}, 15_000);

		afterAll(async () => {
			for (const cleanup of cleanups) {
				await cleanup();
			}
			await mockServer?.close();
		});

		async function scaffoldWorkDir(): Promise<{
			workDir: string;
			agentDir: string;
		}> {
			const server = mockServer;
			if (!server) {
				throw new Error("mock server not initialized");
			}
			const workDir = await mkdtemp(path.join(tmpdir(), "pi-cli-standalone-"));
			const agentDir = path.join(workDir, ".pi", "agent");
			await mkdir(agentDir, { recursive: true });
			await writeFile(
				path.join(agentDir, "models.json"),
				JSON.stringify(
					{
						providers: {
							anthropic: {
								baseUrl: `http://127.0.0.1:${server.port}`,
							},
						},
					},
					null,
					2,
				),
			);
			cleanups.push(async () => {
				await rm(workDir, { recursive: true, force: true });
			});
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
			cleanups.push(async () => {
				await runtime.terminate();
			});
			return runtime;
		}

		it("[direct-main] empty-stdin headless print mode reaches the provider and prints output", async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const sentinel = "PI_DIRECT_MAIN_STANDALONE_SENTINEL";
			const server = mockServer;
			if (!server) {
				throw new Error("mock server not initialized");
			}
			server.reset([{ type: "text", text: sentinel }]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await Promise.race([
				runtime.exec(
					buildDirectPiMainSource({
						workDir,
						agentDir,
						initialMessage: "Say hello from the standalone Pi CLI test.",
					}),
					{
						cwd: workDir,
						filePath: "/entry.js",
						env: {
							HOME: workDir,
							PI_CODING_AGENT_DIR: agentDir,
							ANTHROPIC_API_KEY: "test-key",
							NO_COLOR: "1",
						},
						stdin: "",
					},
				),
				new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(
							new Error(
								[
									"standalone Pi CLI timed out",
									`requestCount=${server.requestCount()}`,
									`stdout=${JSON.stringify(stdio.stdout.join(""))}`,
									`stderr=${JSON.stringify(stdio.stderr.join(""))}`,
								].join(" "),
							),
						);
					}, 15_000);
				}),
			]);

			const stdout = stdio.stdout.join("");
			const stderr = stdio.stderr.join("");

			expect(
				{
					code: result.code,
					errorMessage: result.errorMessage,
					requestCount: server.requestCount(),
					stdout,
					stderr,
				},
				"direct dist/main.js path must not reproduce the old code=0/requestCount=0/empty stdout failure",
			).toMatchObject({
				code: 0,
			});
			expect(
				server.requestCount(),
				`mock server must receive at least one request; stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`,
			).toBeGreaterThan(0);
			expect(
				stdout,
				`stdout must include the mock response; stderr=${JSON.stringify(stderr)}`,
			).toContain(sentinel);
		}, 20_000);
	},
);
