import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalHarness } from "../../core/test/kernel/terminal-harness.ts";
import { createDevShellKernel } from "../src/index.ts";
import { resolveWorkspacePaths } from "../src/shared.ts";

const paths = resolveWorkspacePaths(path.dirname(fileURLToPath(import.meta.url)));
const hasWasmBinaries = existsSync(path.join(paths.wasmCommandsDir, "bash"));
const SHELL_PROMPT = "sh-0.4$ ";

async function runKernelCommand(
	shell: Awaited<ReturnType<typeof createDevShellKernel>>,
	command: string,
	args: string[],
	timeoutMs = 20_000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	let stdout = "";
	let stderr = "";

	return Promise.race([
		(async () => {
			const proc = shell.kernel.spawn(command, args, {
				cwd: shell.workDir,
				env: shell.env,
				onStdout: (chunk) => {
					stdout += Buffer.from(chunk).toString("utf8");
				},
				onStderr: (chunk) => {
					stderr += Buffer.from(chunk).toString("utf8");
				},
			});
			const exitCode = await proc.wait();
			return { exitCode, stdout, stderr };
		})(),
		new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`Timed out running: ${command} ${args.join(" ")}`)),
				timeoutMs,
			),
		),
	]);
}

describe.skipIf(!hasWasmBinaries)("dev-shell integration", { timeout: 60_000 }, () => {
	let shell: Awaited<ReturnType<typeof createDevShellKernel>> | undefined;
	let harness: TerminalHarness | undefined;
	let workDir: string | undefined;

	afterEach(async () => {
		await harness?.dispose();
		harness = undefined;
		await shell?.dispose();
		shell = undefined;
		if (workDir) {
			await rm(workDir, { recursive: true, force: true });
			workDir = undefined;
		}
	});

	it("boots the sandbox-native dev-shell surface and runs node, pi, and the Wasm shell", async () => {
		workDir = await mkdtemp(path.join(tmpdir(), "secure-exec-dev-shell-"));
		await writeFile(path.join(workDir, "note.txt"), "dev-shell\n");

		shell = await createDevShellKernel({ workDir });

		expect(shell.loadedCommands).toEqual(
			expect.arrayContaining([
				"bash",
				"node",
				"npm",
				"npx",
				"pi",
				"python",
				"python3",
				"sh",
			]),
		);

		const nodeResult = await runKernelCommand(
			shell,
			"node",
			["-e", "console.log(process.version)"],
		);
		expect(nodeResult.exitCode).toBe(0);
		expect(nodeResult.stdout).toMatch(/v\d+\.\d+\.\d+/);

		const shellResult = await runKernelCommand(shell, "bash", ["-lc", "echo shell-ok"]);
		expect(shellResult.exitCode).toBe(0);
		expect(shellResult.stdout).toContain("shell-ok");

		const piResult = await runKernelCommand(shell, "pi", ["--help"], 30_000);
		expect(piResult.exitCode).toBe(0);
		expect(`${piResult.stdout}\n${piResult.stderr}`).toMatch(/pi|usage|Usage/);
	});

	it("supports an interactive PTY workflow through the Wasm shell", async () => {
		workDir = await mkdtemp(path.join(tmpdir(), "secure-exec-dev-shell-pty-"));
		await writeFile(path.join(workDir, "note.txt"), "pty-dev-shell\n");
		shell = await createDevShellKernel({ workDir, mountPython: false });
		harness = new TerminalHarness(shell.kernel, {
			command: "bash",
			cwd: shell.workDir,
			env: shell.env,
		});

		await harness.waitFor(SHELL_PROMPT, 1, 20_000);
		await harness.type("echo pty-dev-shell-ok\n");
		await harness.waitFor("pty-dev-shell-ok", 1, 10_000);
		await harness.type(`ls ${shell.workDir}\n`);
		await harness.waitFor("note.txt", 1, 10_000);
		await harness.type("exit\n");
		const exitCode = await harness.shell.wait();

		const screen = harness.screenshotTrimmed();
		expect(exitCode).toBe(0);
		expect(screen).toContain("pty-dev-shell-ok");
		expect(screen).toContain("note.txt");
	});
});
