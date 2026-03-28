/**
 * Pi SDK sandbox filesystem edge cases — mock-provider coverage.
 *
 * Coverage matrix axes proved by this file (mock LLM, deterministic):
 *
 *   [fs-edge/missing-file]     read tool on non-existent file surfaces clean error
 *   [fs-edge/overwrite]        write tool overwrites existing file content
 *   [fs-edge/non-ascii]        write tool handles non-ASCII (Unicode) filenames
 *   [fs-edge/binary-content]   write tool handles binary-like content without truncation
 *   [fs-edge/large-payload]    write tool handles a larger payload without buffering bugs
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
		"      toolEvents.push({",
		"        type: event.type,",
		"        toolName: event.toolName,",
		"        isError: event.isError,",
		"        resultText: typeof event.result?.content === 'string'",
		"          ? event.result.content.slice(0, 2000)",
		"          : undefined,",
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

describe.skipIf(skipUnlessPiInstalled())("Pi SDK filesystem edge cases (mock-provider)", () => {
	let mockServer: MockLlmServerHandle | undefined;
	const cleanups: Array<() => Promise<void>> = [];

	beforeAll(async () => {
		mockServer = await createMockLlmServer([]);
	}, 15_000);

	afterAll(async () => {
		for (const cleanup of cleanups) await cleanup();
		await mockServer?.close();
	});

	async function scaffoldWorkDir(prefix = "pi-sdk-fs-edge-"): Promise<{ workDir: string; agentDir: string }> {
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
			}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		});
		cleanups.push(async () => runtime.terminate());
		return runtime;
	}

	// --- [fs-edge/missing-file] read tool on non-existent file ---
	it(
		"[fs-edge/missing-file] read tool on non-existent file surfaces error in tool event",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const missingFile = path.join(workDir, "does-not-exist.txt");

			mockServer!.reset([
				{
					type: "tool_use",
					name: "read",
					input: { path: missingFile },
				},
				{ type: "text", text: "The file does not exist." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Read the file at ${missingFile}`,
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

			// Read tool should have been called
			expect(
				toolEvents.some(
					(e) => e.toolName === "read" && e.type === "tool_execution_start",
				),
				"read tool_execution_start event missing",
			).toBe(true);

			// Read tool should report an error for missing file
			expect(
				toolEvents.some(
					(e) =>
						e.toolName === "read" &&
						e.type === "tool_execution_end" &&
						e.isError === true,
				),
				"read tool_execution_end should report isError for missing file",
			).toBe(true);

			// File should still not exist
			expect(existsSync(missingFile)).toBe(false);
		},
		60_000,
	);

	// --- [fs-edge/overwrite] write tool overwrites existing file ---
	it(
		"[fs-edge/overwrite] write tool overwrites existing file content completely",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const targetFile = path.join(workDir, "overwrite-target.txt");
			const originalContent = "this is the original content that should be replaced";
			const newContent = "completely new content after overwrite";

			await writeFile(targetFile, originalContent);

			mockServer!.reset([
				{
					type: "tool_use",
					name: "write",
					input: { path: targetFile, content: newContent },
				},
				{ type: "text", text: "File overwritten." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Overwrite the file at ${targetFile}`,
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

			// Verify file was completely overwritten, not appended
			const written = await readFile(targetFile, "utf8");
			expect(written).toBe(newContent);
			expect(written).not.toContain(originalContent);
		},
		60_000,
	);

	// --- [fs-edge/non-ascii] write tool handles Unicode filenames ---
	it(
		"[fs-edge/non-ascii] write tool creates file with non-ASCII Unicode filename",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const unicodeFilename = "données-résumé.txt";
			const targetFile = path.join(workDir, unicodeFilename);
			const fileContent = "contenu avec des caractères spéciaux: é à ü ñ 日本語 中文";

			mockServer!.reset([
				{
					type: "tool_use",
					name: "write",
					input: { path: targetFile, content: fileContent },
				},
				{ type: "text", text: "File created with Unicode name." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Create a file named ${unicodeFilename}`,
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
				"write tool should succeed for Unicode filename",
			).toBe(true);

			// Verify file exists with correct content
			expect(existsSync(targetFile), "Unicode-named file was not created").toBe(true);
			const written = await readFile(targetFile, "utf8");
			expect(written).toBe(fileContent);
		},
		60_000,
	);

	// --- [fs-edge/binary-content] write tool handles binary-like content ---
	it(
		"[fs-edge/binary-content] write tool preserves binary-like content without corruption",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const targetFile = path.join(workDir, "binary-like.txt");

			// Content with null-adjacent characters, control chars, and high Unicode
			const binaryLikeContent = [
				"line with tabs\there\tand\tthere",
				"line with backslash-n literal: \\n not a real newline",
				"emoji: 🔒🔑💻 and CJK: 漢字 and RTL: مرحبا",
				"special chars: \u0001\u0002\u0003 (control chars U+0001-U+0003)",
				"math: ∑∏∫ and currency: ¥€£",
				"astral plane: 𝐀𝐁𝐂 (mathematical bold)",
			].join("\n");

			mockServer!.reset([
				{
					type: "tool_use",
					name: "write",
					input: { path: targetFile, content: binaryLikeContent },
				},
				{ type: "text", text: "Binary-like content written." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Write binary-like content to ${targetFile}`,
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
				"write tool should succeed for binary-like content",
			).toBe(true);

			expect(existsSync(targetFile), "file was not created").toBe(true);
			const written = await readFile(targetFile, "utf8");
			expect(written).toBe(binaryLikeContent);
		},
		60_000,
	);

	// --- [fs-edge/large-payload] write tool handles a larger payload ---
	it(
		"[fs-edge/large-payload] write tool handles larger file without truncation or buffering bugs",
		async () => {
			const { workDir, agentDir } = await scaffoldWorkDir();
			const targetFile = path.join(workDir, "large-payload.txt");

			// Generate ~50KB of content — large enough to catch buffering issues
			const lines: string[] = [];
			for (let i = 0; i < 1000; i++) {
				lines.push(`line ${String(i).padStart(4, "0")}: ${"abcdefghij".repeat(5)}`);
			}
			const largeContent = lines.join("\n");

			mockServer!.reset([
				{
					type: "tool_use",
					name: "write",
					input: { path: targetFile, content: largeContent },
				},
				{ type: "text", text: "Large file written." },
			]);

			const stdio = { stdout: [] as string[], stderr: [] as string[] };
			const runtime = createRuntime(stdio);

			const result = await runtime.exec(
				buildSandboxSource({
					workDir,
					agentDir,
					initialMessage: `Write a large file to ${targetFile}`,
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
				"write tool should succeed for large payload",
			).toBe(true);

			expect(existsSync(targetFile), "large file was not created").toBe(true);
			const written = await readFile(targetFile, "utf8");

			// Verify exact content match — no truncation
			expect(written.length).toBe(largeContent.length);
			expect(written).toBe(largeContent);

			// Verify first and last lines to catch partial writes
			expect(written.startsWith("line 0000:")).toBe(true);
			expect(written.endsWith("abcdefghij")).toBe(true);
			expect(written).toContain("line 0999:");
		},
		60_000,
	);
});
