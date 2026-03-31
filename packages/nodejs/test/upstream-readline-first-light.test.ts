import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	createKernel,
	type Kernel,
	type StdioEvent,
} from "@secure-exec/core";
import { TerminalHarness } from "../../core/test/kernel/terminal-harness.ts";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import {
	createNodeDriver,
	createNodeRuntime,
	createNodeRuntimeDriverFactory,
} from "../src/index.ts";
import {
	runUpstreamReadlineFirstLightEval,
	type UpstreamBootstrapEvalResult,
} from "../src/upstream/bootstrap-execution.ts";

interface ReadlineFirstLightSummary {
	createInterfaceType: string;
	promisesCreateInterfaceType: string;
}

const READLINE_LOAD_EVAL = `
const readline = require('readline');
const readlinePromises = require('readline/promises');
process.stdout.write(JSON.stringify({
  createInterfaceType: typeof readline.createInterface,
  promisesCreateInterfaceType: typeof readlinePromises.createInterface,
}));
process.__secureExecDone();
`.trim();

const READLINE_PTY_LINE_EVAL = `
const readline = require('readline');
console.log('TTY:' + process.stdin.isTTY + ':' + process.stdout.isTTY + ':' + process.stdout.columns + 'x' + process.stdout.rows);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  prompt: 'prompt> ',
});
rl.on('line', (line) => {
  console.log('LINE:' + line);
  rl.close();
  process.exit(0);
});
rl.prompt();
`.trim();

const READLINE_PTY_SIGINT_EVAL = `
const readline = require('readline');
const rawModes = [];
const originalSetRawMode = process.stdin.setRawMode.bind(process.stdin);
process.stdin.setRawMode = (mode) => {
  rawModes.push(!!mode);
  return originalSetRawMode(mode);
};
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  prompt: 'prompt> ',
});
rl.on('SIGINT', () => {
  rl.close();
  queueMicrotask(() => {
    console.log('RL_SIGINT:' + rawModes.join(','));
    process.exit(0);
  });
});
rl.prompt();
`.trim();

function readStdout(events: readonly StdioEvent[]): string {
	return events
		.filter((event) => event.channel === "stdout")
		.map((event) => event.message)
		.join("");
}

function parseSummary(stdout: string): ReadlineFirstLightSummary {
	return JSON.parse(stdout) as ReadlineFirstLightSummary;
}

function expectSuccessfulReadlineEval(
	result: UpstreamBootstrapEvalResult,
): void {
	expect(result.status, result.errorMessage ?? result.stderr).toBe("pass");
	expect(result.code, result.stderr || result.errorMessage).toBe(0);
	expect(result.entrypoint).toBe("secure_exec/post_bootstrap_eval");
	expect(result.vendoredPublicBuiltinsLoaded).toEqual(
		expect.arrayContaining(["readline", "readline/promises"]),
	);
	expect(result.publicBuiltinFallbacks).not.toContain("readline");
	expect(result.publicBuiltinFallbacks).not.toContain("readline/promises");
}

function expectSummary(summary: ReadlineFirstLightSummary): void {
	expect(summary).toEqual({
		createInterfaceType: "function",
		promisesCreateInterfaceType: "function",
	});
}

describe("upstream readline first-light", () => {
	let runtime: NodeRuntime | undefined;
	let kernel: Kernel | undefined;
	let harness: TerminalHarness | undefined;

	afterEach(async () => {
		await harness?.dispose();
		harness = undefined;

		runtime?.dispose();
		runtime = undefined;

		if (kernel) {
			await kernel.dispose();
			kernel = undefined;
		}
	});

	it("loads vendored readline through the isolated child runner", async () => {
		const result = await runUpstreamReadlineFirstLightEval({
			code: READLINE_LOAD_EVAL,
		});

		expectSuccessfulReadlineEval(result);
		expectSummary(parseSummary(result.stdout));
	});

	it("runs vendored readline first-light through standalone NodeRuntime", async () => {
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem: createInMemoryFileSystem(),
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(READLINE_LOAD_EVAL);

		expect(result.code).toBe(0);
		expectSummary(parseSummary(readStdout(stdio)));
	});

	it("reads a line through kernel.openShell() with PTY-backed readline", async () => {
		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.mount(createNodeRuntime());
		harness = new TerminalHarness(kernel, {
			command: "node",
			args: ["-e", READLINE_PTY_LINE_EVAL],
			cols: 90,
			rows: 30,
		});

		await harness.waitFor("prompt>");
		await harness.type("hello\r");

		const screen = harness.screenshotTrimmed();
		expect(screen).toContain("TTY:true:true:90x30");
		expect(screen).toContain("LINE:hello");
		expect(await harness.shell.wait()).toBe(0);
	});

	it("keeps readline ctrl-c on the raw-mode path and emits SIGINT instead of killing the session", async () => {
		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.mount(createNodeRuntime());
		harness = new TerminalHarness(kernel, {
			command: "node",
			args: ["-e", READLINE_PTY_SIGINT_EVAL],
		});

	await harness.waitFor("prompt>");
	await harness.type("\u0003");
	await harness.waitFor("RL_SIGINT:true");
	expect(await harness.shell.wait()).toBe(0);
	});
});
