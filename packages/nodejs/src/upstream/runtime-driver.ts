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
	type UpstreamInternalBindingRegistry,
	createBootstrapBindingRegistryScaffold,
} from "./internal-binding-registry.js";

export interface UpstreamRuntimeDriverScaffoldOptions {
	assetLoader?: UpstreamAssetLoader;
	bindingRegistry?: UpstreamInternalBindingRegistry;
}

export interface UpstreamRuntimeDriverScaffoldDescription {
	mode: "scaffold";
	nodeVersion: string;
	gitCommit: string;
	plannedBindingCount: number;
	bootstrapStepCount: number;
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

		return {
			mode: "scaffold",
			nodeVersion: versionMetadata.nodeVersion,
			gitCommit: versionMetadata.gitCommit,
			plannedBindingCount: this.bindingRegistry.listBindings().length,
			bootstrapStepCount: bootstrapPlan.steps.length,
		};
	}
}

export function createExperimentalUpstreamRuntimeDriverScaffold(
	options: UpstreamRuntimeDriverScaffoldOptions = {},
): UpstreamRuntimeDriverScaffold {
	return new UpstreamRuntimeDriverScaffold(options);
}
