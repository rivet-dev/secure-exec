import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import {
	createNodeDriver,
} from "../src/index.ts";
import {
	createExperimentalUpstreamBootstrapRuntimeDriverFactory,
	runUpstreamBootstrapEval,
	type UpstreamBootstrapEvalResult,
} from "../src/upstream/bootstrap-execution.ts";

interface VmContextSummary {
	extra: number;
	isContext: boolean;
	result: number;
}

interface VmModuleSummary {
	dependencyAnswer: number;
	entryDefault: number;
	hasModule: boolean;
	hasSourceTextModule: boolean;
	hasSyntheticModule: boolean;
}

const VM_CONTEXT_EVAL = `
const vm = require('node:vm');
const context = vm.createContext({ value: 2 });
const result = vm.runInContext('globalThis.extra = value * 2; value + 41;', context);
process.stdout.write(JSON.stringify({
  extra: context.extra,
  isContext: vm.isContext(context),
  result,
}));
process.__secureExecDone();
`.trim();

const VM_MODULE_EVAL = `
const vm = require('node:vm');
Promise.resolve().then(async () => {
  const dependency = new vm.SourceTextModule('export const answer = 42;');
  const entry = new vm.SourceTextModule('import { answer } from "dep"; export default answer + 1;');
  await entry.link(async (specifier) => {
    if (specifier !== 'dep') {
      throw new Error('Unexpected module request: ' + specifier);
    }
    return dependency;
  });
  await dependency.evaluate();
  await entry.evaluate();
  process.stdout.write(JSON.stringify({
    dependencyAnswer: dependency.namespace.answer,
    entryDefault: entry.namespace.default,
    hasModule: typeof vm.Module === 'function',
    hasSourceTextModule: typeof vm.SourceTextModule === 'function',
    hasSyntheticModule: typeof vm.SyntheticModule === 'function',
  }));
  process.__secureExecDone();
}).catch((error) => process.__secureExecDone(error));
`.trim();

function readStdout(events: readonly StdioEvent[]): string {
	return events
		.filter((event) => event.channel === "stdout")
		.map((event) => event.message)
		.join("");
}

function parseJson<T>(stdout: string): T {
	return JSON.parse(stdout) as T;
}

function expectSuccessfulVmEval(
	result: UpstreamBootstrapEvalResult,
): void {
	expect(result.status, result.errorMessage ?? result.stderr).toBe("pass");
	expect(result.code, result.stderr || result.errorMessage).toBe(0);
	expect(result.entrypoint).toBe("secure_exec/post_bootstrap_eval");
	expect(result.vendoredPublicBuiltinsLoaded).toEqual(
		expect.arrayContaining(["vm"]),
	);
	expect(result.publicBuiltinFallbacks).not.toContain("vm");
	expect(result.appliedBindingShims).toEqual(
		expect.arrayContaining(["async_wrap-bootstrap-hook-provider"]),
	);
}

describe("upstream vm first-light", () => {
	let runtime: NodeRuntime | undefined;

	afterEach(() => {
		runtime?.dispose();
		runtime = undefined;
	});

	it("runs vendored node:vm createContext()/runInContext() through the replacement runtime", async () => {
		const result = await runUpstreamBootstrapEval({
			code: VM_CONTEXT_EVAL,
			awaitCompletionSignal: true,
			vendoredPublicBuiltins: ["vm"],
		});

		expectSuccessfulVmEval(result);
		expect(result.internalBindings).toEqual(
			expect.arrayContaining(["contextify"]),
		);
		expect(parseJson<VmContextSummary>(result.stdout)).toEqual({
			extra: 4,
			isContext: true,
			result: 43,
		});
	});

	it("patches vendored node:vm with experimental module constructors and runs a trivial ESM graph", async () => {
		const result = await runUpstreamBootstrapEval({
			code: VM_MODULE_EVAL,
			execArgv: ["--experimental-vm-modules"],
			awaitCompletionSignal: true,
			vendoredPublicBuiltins: ["vm"],
		});

		expectSuccessfulVmEval(result);
		expect(result.internalBindings).toEqual(
			expect.arrayContaining(["module_wrap"]),
		);
		expect(parseJson<VmModuleSummary>(result.stdout)).toEqual({
			dependencyAnswer: 42,
			entryDefault: 43,
			hasModule: true,
			hasSourceTextModule: true,
			hasSyntheticModule: true,
		});
	});

	it("loads vendored node:vm through standalone NodeRuntime with the scoped vm-first driver", async () => {
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem: createInMemoryFileSystem(),
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory:
				createExperimentalUpstreamBootstrapRuntimeDriverFactory({
					awaitCompletionSignalMode: "auto",
					vendoredPublicBuiltins: ["vm"],
				}),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(VM_CONTEXT_EVAL);

		expect(result.code).toBe(0);
		expect(parseJson<VmContextSummary>(readStdout(stdio))).toEqual({
			extra: 4,
			isContext: true,
			result: 43,
		});
	});
});
