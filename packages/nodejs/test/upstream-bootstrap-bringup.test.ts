import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	createKernel,
	type Kernel,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import { createNodeDriver } from "../src/driver.ts";
import {
	createExperimentalUpstreamBootstrapKernelRuntime,
	createExperimentalUpstreamBootstrapRuntimeDriverFactory,
	runUpstreamBootstrapEval,
} from "../src/upstream/bootstrap-execution.ts";

describe("upstream bootstrap bring-up", () => {
	let runtime: NodeRuntime | undefined;
	let kernel: Kernel | undefined;

	afterEach(async () => {
		runtime?.dispose();
		runtime = undefined;

		if (kernel) {
			await kernel.dispose();
			kernel = undefined;
		}
	});

	it("runs vendored bootstrap and eval_string through the isolated child runner", async () => {
		const result = await runUpstreamBootstrapEval({
			code: "process.stdout.write('runner-upstream');",
		});

		expect(result.status).toBe("pass");
		expect(result.code).toBe(0);
		expect(result.entrypoint).toBe("internal/main/eval_string");
		expect(result.stdout).toBe("runner-upstream");
		expect(result.bootstrapPhases).toEqual([
			"internal/per_context/primordials",
			"internal/per_context/domexception",
			"internal/per_context/messageport",
			"internal/bootstrap/realm",
			"internal/bootstrap/node",
			"internal/main/eval_string",
		]);
		expect(result.internalBindings).toEqual(
			expect.arrayContaining([
				"async_wrap",
				"buffer",
				"builtins",
				"config",
				"process_methods",
				"trace_events",
				"util",
			]),
		);
		expect(result.publicBuiltinFallbacks).toEqual(
			expect.arrayContaining(["fs", "module", "path"]),
		);
		expect(result.appliedBindingShims).toEqual(
			expect.arrayContaining([
				"async_wrap.setupHooks-noop",
				"buffer.setBufferPrototype-noop",
				"internal/options-host-shim",
				"public-builtin-host-fallback",
			]),
		);
	});

	it("boots the vendored bring-up path through standalone NodeRuntime", async () => {
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem: createInMemoryFileSystem(),
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory:
				createExperimentalUpstreamBootstrapRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec("process.stdout.write('standalone-upstream');");

		expect(result.code).toBe(0);
		expect(stdio).toContainEqual({
			channel: "stdout",
			message: "standalone-upstream",
		});
	});

	it("boots the vendored bring-up path through a kernel-mounted runtime driver", async () => {
		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.mount(createExperimentalUpstreamBootstrapKernelRuntime());

		const stdout: Uint8Array[] = [];
		const stderr: Uint8Array[] = [];
		const proc = kernel.spawn("node", ["-e", "process.stdout.write('kernel-upstream')"], {
			onStdout: (data) => stdout.push(data),
			onStderr: (data) => stderr.push(data),
		});
		const exitCode = await proc.wait();
		const stdoutText = Buffer.concat(stdout.map((chunk) => Buffer.from(chunk))).toString(
			"utf8",
		);
		const stderrText = Buffer.concat(stderr.map((chunk) => Buffer.from(chunk))).toString(
			"utf8",
		);

		expect(exitCode).toBe(0);
		expect(stdoutText).toBe("kernel-upstream");
		expect(stderrText).toBe("");
	});
});
