import {
	type UpstreamAssetLoader,
	createVendoredUpstreamAssetLoader,
} from "./asset-loader.js";
import {
	type UpstreamBuiltinRegistry,
	createUpstreamBuiltinRegistry,
} from "./builtin-registry.js";
import {
	type UpstreamBootstrapLoader,
	createUpstreamBootstrapLoader,
} from "./bootstrap-loader.js";
import {
	type UpstreamBootstrapEvalResult,
	runUpstreamBootstrapEval,
	runUpstreamFsFirstLightEval,
} from "./bootstrap-execution.js";
import {
	type UpstreamInternalBindingRegistry,
	createBootstrapBindingRegistryScaffold,
} from "./internal-binding-registry.js";
import type {
	UpstreamBindingStatus,
	UpstreamBuiltinsBinding,
	UpstreamInternalLoaders,
} from "./types.js";

export interface UpstreamRuntimeDriverScaffoldOptions {
	assetLoader?: UpstreamAssetLoader;
	bindingRegistry?: UpstreamInternalBindingRegistry;
}

export interface UpstreamRuntimeDriverScaffoldDescription {
	mode: "scaffold";
	nodeVersion: string;
	gitCommit: string;
	bindingCount: number;
	bootstrapStepCount: number;
	implementedBindingCount: number;
	internalLoadersReady: boolean;
}

/**
 * Internal-only scaffold for the upstream runtime workstream.
 *
 * This is intentionally not wired into the public NodeRuntime surface yet.
 * Later stories replace this placeholder with real builtin compilation,
 * binding providers, and bootstrap execution once the bring-up path is ready.
 */
export class UpstreamRuntimeDriverScaffold {
	readonly assetLoader: UpstreamAssetLoader;
	readonly builtinRegistry: UpstreamBuiltinRegistry;
	readonly bindingRegistry: UpstreamInternalBindingRegistry;
	readonly bootstrapLoader: UpstreamBootstrapLoader;
	#internalBindingResolver?: (name: string) => unknown;

	constructor(options: UpstreamRuntimeDriverScaffoldOptions = {}) {
		this.assetLoader = options.assetLoader ?? createVendoredUpstreamAssetLoader();
		this.bindingRegistry =
			options.bindingRegistry ?? createBootstrapBindingRegistryScaffold();
		this.builtinRegistry = createUpstreamBuiltinRegistry({
			assetLoader: this.assetLoader,
		});
		this.bootstrapLoader = createUpstreamBootstrapLoader({
			assetLoader: this.assetLoader,
			bindingRegistry: this.bindingRegistry,
		});
	}

	describe(): UpstreamRuntimeDriverScaffoldDescription {
		const versionMetadata = this.assetLoader.getVersionMetadata();
		const bootstrapPlan = this.bootstrapLoader.createBringUpPlan();
		const bindingInventory = this.bindingRegistry.listBindings();

		return {
			mode: "scaffold",
			nodeVersion: versionMetadata.nodeVersion,
			gitCommit: versionMetadata.gitCommit,
			bindingCount: bindingInventory.length,
			bootstrapStepCount: bootstrapPlan.steps.length,
			implementedBindingCount: bindingInventory.filter(
				(binding) => binding.status === ("implemented" satisfies UpstreamBindingStatus),
			).length,
			internalLoadersReady: this.builtinRegistry.hasInternalLoaders(),
		};
	}

	getBuiltinsBinding(): UpstreamBuiltinsBinding {
		return this.builtinRegistry.createBuiltinsBinding();
	}

	getInternalLoaders(): UpstreamInternalLoaders {
		return this.builtinRegistry.getInternalLoaders();
	}

	requireBuiltin(id: string): unknown {
		return this.builtinRegistry.requireBuiltin(id);
	}

	resolveInternalBinding(name: string): unknown {
		if (!this.#internalBindingResolver) {
			this.#internalBindingResolver = this.bindingRegistry.createResolver({
				builtinsBinding: this.getBuiltinsBinding(),
			});
		}

		return this.#internalBindingResolver(name);
	}

	runBootstrapEval(code: string): Promise<UpstreamBootstrapEvalResult> {
		return runUpstreamBootstrapEval({ code });
	}

	runFsFirstLightEval(code: string): Promise<UpstreamBootstrapEvalResult> {
		return runUpstreamFsFirstLightEval({ code });
	}
}

export function createExperimentalUpstreamRuntimeDriverScaffold(
	options: UpstreamRuntimeDriverScaffoldOptions = {},
): UpstreamRuntimeDriverScaffold {
	return new UpstreamRuntimeDriverScaffold(options);
}
