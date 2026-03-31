import { describe, expect, it } from "vitest";
import { createBootstrapBindingRegistryScaffold } from "../src/upstream/internal-binding-registry.ts";
import { createExperimentalUpstreamRuntimeDriverScaffold } from "../src/upstream/runtime-driver.ts";
import type { UpstreamProcessMethodsBinding } from "../src/upstream/types.ts";

describe("upstream internal binding registry", () => {
	it("classifies bootstrap and fs-first bindings explicitly", () => {
		const registry = createBootstrapBindingRegistryScaffold();

		expect(registry.listBindingsByPhase("bootstrap").map((binding) => binding.name)).toEqual(
			expect.arrayContaining([
				"builtins",
				"module_wrap",
				"contextify",
				"process_methods",
				"uv",
				"timers",
			]),
		);
		expect(registry.listBindingsByPhase("fs-first").map((binding) => binding.name)).toEqual(
			expect.arrayContaining([
				"builtins",
				"buffer",
				"constants",
				"credentials",
				"modules",
				"uv",
				"fs",
				"fs_dir",
				"fs_event_wrap",
			]),
		);
		expect(registry.getBinding("uv")).toMatchObject({
			executionModel: "host-lifecycle-plus-backend",
			hostResponsibilities: [
				"callback-delivery",
				"close-semantics",
				"js-wrapper-identity",
				"ref-unref-state",
			],
		});
		expect(registry.getBinding("module_wrap").notes).toContain("US-001");
		expect(registry.listBindingsByStatus("deferred").map((binding) => binding.name)).toEqual(
			expect.arrayContaining(["fs", "fs_dir", "fs_event_wrap"]),
		);
	});

	it("resolves implemented host bindings with stable identity", () => {
		const runtimeScaffold = createExperimentalUpstreamRuntimeDriverScaffold();

		expect(runtimeScaffold.resolveInternalBinding("builtins")).toBe(
			runtimeScaffold.getBuiltinsBinding(),
		);

		const config = runtimeScaffold.resolveInternalBinding("config") as Record<
			string,
			unknown
		>;
		const constants = runtimeScaffold.resolveInternalBinding("constants") as {
			fs: Record<string, number>;
			os: Record<string, number>;
		};
		const buffer = runtimeScaffold.resolveInternalBinding("buffer") as {
			kMaxLength: number;
			setBufferPrototype: () => void;
		};
		const asyncWrap = runtimeScaffold.resolveInternalBinding("async_wrap") as {
			setupHooks: (hooks: unknown) => void;
		};
		const errors = runtimeScaffold.resolveInternalBinding("errors") as {
			exitCodes: { kNoFailure: number };
		};
		const processMethods = runtimeScaffold.resolveInternalBinding(
			"process_methods",
		) as UpstreamProcessMethodsBinding;
		const hrtimeSnapshot = new Uint32Array(3);
		const patchedTarget: Record<string, unknown> = {};

		expect(config).toMatchObject({
			hasIntl: expect.any(Boolean),
			hasNodeOptions: true,
			hasOpenSSL: expect.any(Boolean),
		});
		expect(constants.fs.O_RDONLY).toBeTypeOf("number");
		expect(constants.os.UV_UDP_REUSEADDR).toBeTypeOf("number");
		expect(runtimeScaffold.resolveInternalBinding("constants")).toBe(constants);
		expect(runtimeScaffold.resolveInternalBinding("buffer")).toBe(buffer);
		expect(buffer.kMaxLength).toBeGreaterThan(0);
		expect(() => buffer.setBufferPrototype()).not.toThrow();
		expect(() => asyncWrap.setupHooks({ init: () => {} })).not.toThrow();
		expect(errors.exitCodes.kNoFailure).toBe(0);
		processMethods.hrtime();
		hrtimeSnapshot.set(processMethods.hrtimeBuffer);
		processMethods.patchProcessObject(patchedTarget);
		expect(hrtimeSnapshot[2]).toBeGreaterThanOrEqual(0);
		expect(processMethods.hrtimeBuffer.buffer.byteLength).toBe(12);
		expect(patchedTarget).toMatchObject({
			title: process.title,
			pid: process.pid,
			ppid: process.ppid,
			execPath: process.execPath,
			versions: process.versions,
		});
		expect(() => processMethods.setEmitWarningSync(() => {})).not.toThrow();
		expect(() => processMethods.resetStdioForTesting()).not.toThrow();
	});

	it("throws explicit errors for deferred or not-yet-wired bindings", () => {
		const runtimeScaffold = createExperimentalUpstreamRuntimeDriverScaffold();

		expect(() => runtimeScaffold.resolveInternalBinding("fs")).toThrowError(
			/Upstream internal binding fs is deferred/,
		);
		expect(() => runtimeScaffold.resolveInternalBinding("module_wrap")).toThrowError(
			/Upstream internal binding module_wrap is planned/,
		);
	});
});
