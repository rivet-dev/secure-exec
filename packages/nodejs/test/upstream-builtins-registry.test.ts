import { describe, expect, it, vi } from "vitest";
import { createUpstreamBuiltinRegistry } from "../src/upstream/builtin-registry.ts";

describe("upstream builtins registry", () => {
	it("compiles representative builtin categories with Node-style wrapper signatures", () => {
		const registry = createUpstreamBuiltinRegistry();

		expect(registry.getBuiltinCompileSpec("internal/bootstrap/realm")).toMatchObject({
			sourceType: "bootstrap-realm",
			parameters: [
				"process",
				"getLinkedBinding",
				"getInternalBinding",
				"primordials",
			],
		});
		expect(registry.getBuiltinCompileSpec("internal/per_context/primordials")).toMatchObject(
			{
				sourceType: "per-context-script",
				parameters: [
					"exports",
					"primordials",
					"privateSymbols",
					"perIsolateSymbols",
				],
			},
		);
		expect(registry.getBuiltinCompileSpec("internal/bootstrap/node")).toMatchObject({
			sourceType: "bootstrap-script",
			parameters: ["process", "require", "internalBinding", "primordials"],
		});
		expect(registry.getBuiltinCompileSpec("process")).toMatchObject({
			sourceType: "function",
			parameters: [
				"exports",
				"require",
				"module",
				"process",
				"internalBinding",
				"primordials",
			],
		});

		const realmFn = registry.compileFunction("internal/bootstrap/realm");
		const primordialsFn = registry.compileFunction("internal/per_context/primordials");
		const bootstrapNodeFn = registry.compileFunction("internal/bootstrap/node");
		const processFn = registry.compileFunction("process");

		expect(realmFn.length).toBe(4);
		expect(primordialsFn.length).toBe(4);
		expect(bootstrapNodeFn.length).toBe(4);
		expect(processFn.length).toBe(6);
		expect(registry.compileFunction("process")).toBe(processFn);

		const moduleRecord = { exports: {} as unknown };
		const processShim = { pid: 42 };
		processFn(
			moduleRecord.exports,
			() => {
				throw new Error("unexpected require()");
			},
			moduleRecord,
			processShim,
			() => ({}),
			{},
		);
		expect(moduleRecord.exports).toBe(processShim);
	});

	it("stores internal loaders via the builtins binding contract", () => {
		const registry = createUpstreamBuiltinRegistry();
		const binding = registry.createBuiltinsBinding();
		const internalBinding = vi.fn((name: string) => ({ name }));
		const requireBuiltin = vi.fn((id: string) => ({ id }));

		expect(binding.builtinIds).toContain("internal/bootstrap/realm");
		expect(registry.hasInternalLoaders()).toBe(false);

		binding.setInternalLoaders(internalBinding, requireBuiltin);

		expect(registry.hasInternalLoaders()).toBe(true);
		expect(registry.getInternalLoaders()).toMatchObject({
			internalBinding,
			requireBuiltin,
		});
	});

	it("caches builtin exports for later requireBuiltin calls", () => {
		const registry = createUpstreamBuiltinRegistry();
		let loadCount = 0;
		const requireBuiltin = vi.fn((id: string) => ({
			id,
			loadCount: ++loadCount,
		}));

		registry.setInternalLoaders(() => ({}), requireBuiltin);

		const firstEvents = registry.requireBuiltin("events");
		const secondEvents = registry.requireBuiltin("events");
		const firstPath = registry.requireBuiltin("path");

		expect(firstEvents).toBe(secondEvents);
		expect(firstEvents).toMatchObject({ id: "events", loadCount: 1 });
		expect(firstPath).toMatchObject({ id: "path", loadCount: 2 });
		expect(requireBuiltin).toHaveBeenCalledTimes(2);
		expect(requireBuiltin).toHaveBeenNthCalledWith(1, "events");
		expect(requireBuiltin).toHaveBeenNthCalledWith(2, "path");
	});
});
