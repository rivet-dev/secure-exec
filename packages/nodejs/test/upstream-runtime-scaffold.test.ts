import { describe, expect, it } from "vitest";
import { createVendoredUpstreamAssetLoader } from "../src/upstream/asset-loader.ts";
import { createUpstreamBuiltinRegistry } from "../src/upstream/builtin-registry.ts";
import { createUpstreamBootstrapLoader } from "../src/upstream/bootstrap-loader.ts";
import { createBootstrapBindingRegistryScaffold } from "../src/upstream/internal-binding-registry.ts";
import { createExperimentalUpstreamRuntimeDriverScaffold } from "../src/upstream/runtime-driver.ts";

describe("upstream runtime scaffold", () => {
	it("loads pinned upstream asset metadata and builtin sources", () => {
		const loader = createVendoredUpstreamAssetLoader();
		const registry = createUpstreamBuiltinRegistry({ assetLoader: loader });
		const metadata = loader.getVersionMetadata();

		expect(metadata.nodeVersion).toBe("v24.14.1");
		expect(metadata.gitCommit).toBe(
			"d89bb1b482fa09245c4f2cbb3b5b6a70bea6deaf",
		);
		expect(loader.listBuiltinIds()).toContain("fs");
		expect(registry.getBuiltin("internal/bootstrap/realm").source).toContain(
			"BuiltinModule",
		);
	});

	it("builds the snapshot-free bootstrap bring-up plan from vendored assets", () => {
		const bootstrapLoader = createUpstreamBootstrapLoader();
		const plan = bootstrapLoader.createBringUpPlan();

		expect(plan.mode).toBe("snapshot-free");
		expect(plan.requiredBindings).toEqual(
			expect.arrayContaining([
				"builtins",
				"module_wrap",
				"contextify",
				"uv",
				"cares_wrap",
				"async_wrap",
			]),
		);
		expect(plan.steps.map((step) => step.builtinId)).toEqual([
			"internal/per_context/primordials",
			"internal/per_context/domexception",
			"internal/per_context/messageport",
			"internal/bootstrap/realm",
			"internal/bootstrap/node",
			"internal/main/eval_string",
		]);
	});

	it("keeps binding and runtime bring-up state explicit", () => {
		const bindingRegistry = createBootstrapBindingRegistryScaffold();
		const runtimeScaffold = createExperimentalUpstreamRuntimeDriverScaffold({
			bindingRegistry,
		});

		expect(bindingRegistry.getBinding("builtins")).toMatchObject({
			status: "implemented",
		});
		expect(bindingRegistry.getBinding("async_wrap").notes).toContain("US-006");
		expect(bindingRegistry.getBinding("fs").status).toBe("deferred");
		expect(runtimeScaffold.describe()).toMatchObject({
			mode: "scaffold",
			nodeVersion: "v24.14.1",
			bindingCount: 20,
			bootstrapStepCount: 6,
			implementedBindingCount: 13,
			internalLoadersReady: false,
		});

		const internalBinding = (name: string) => ({ name });
		const requireBuiltin = (id: string) => ({ id });
		runtimeScaffold
			.getBuiltinsBinding()
			.setInternalLoaders(internalBinding, requireBuiltin);

		expect(runtimeScaffold.describe().internalLoadersReady).toBe(true);
		expect(runtimeScaffold.getInternalLoaders()).toMatchObject({
			internalBinding,
			requireBuiltin,
		});
		expect(runtimeScaffold.requireBuiltin("process")).toMatchObject({
			id: "process",
		});
		expect(runtimeScaffold.resolveInternalBinding("builtins")).toBe(
			runtimeScaffold.getBuiltinsBinding(),
		);
	});
});
