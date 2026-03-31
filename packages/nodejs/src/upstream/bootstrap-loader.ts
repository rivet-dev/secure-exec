import {
	type UpstreamAssetLoader,
	createVendoredUpstreamAssetLoader,
} from "./asset-loader.js";
import {
	type UpstreamInternalBindingRegistry,
	createBootstrapBindingRegistryScaffold,
} from "./internal-binding-registry.js";
import type { UpstreamBootstrapPlan, UpstreamBootstrapStep } from "./types.js";

const REQUIRED_BINDINGS = Object.freeze([
	"builtins",
	"module_wrap",
	"contextify",
	"config",
	"util",
	"process_methods",
	"uv",
	"cares_wrap",
	"credentials",
	"async_wrap",
	"trace_events",
	"timers",
	"errors",
	"buffer",
	"constants",
	"symbols",
	"modules",
]);

const DEFAULT_BOOTSTRAP_STEPS: ReadonlyArray<UpstreamBootstrapStep> = Object.freeze([
	{
		phase: "per_context",
		builtinId: "internal/per_context/primordials",
		description: "Populate per-context primordials before bootstrap realm execution.",
	},
	{
		phase: "per_context",
		builtinId: "internal/per_context/domexception",
		description: "Install DOMException globals before realm bootstrap.",
	},
	{
		phase: "per_context",
		builtinId: "internal/per_context/messageport",
		description: "Install MessagePort globals before realm bootstrap.",
	},
	{
		phase: "bootstrap",
		builtinId: "internal/bootstrap/realm",
		description:
			"Construct BuiltinModule, internalBinding(), and builtin require() in snapshot-free mode.",
	},
	{
		phase: "bootstrap",
		builtinId: "internal/bootstrap/node",
		description: "Run the narrow bootstrap/node path after realm setup.",
	},
	{
		phase: "entrypoint",
		builtinId: "internal/main/eval_string",
		description: "Use internal/main/eval_string as the first narrow user entry path.",
	},
]);

export interface UpstreamBootstrapLoaderOptions {
	assetLoader?: UpstreamAssetLoader;
	bindingRegistry?: UpstreamInternalBindingRegistry;
}

export class UpstreamBootstrapLoader {
	readonly assetLoader: UpstreamAssetLoader;
	readonly bindingRegistry: UpstreamInternalBindingRegistry;

	constructor(options: UpstreamBootstrapLoaderOptions = {}) {
		this.assetLoader = options.assetLoader ?? createVendoredUpstreamAssetLoader();
		this.bindingRegistry =
			options.bindingRegistry ?? createBootstrapBindingRegistryScaffold();
	}

	createBringUpPlan(): UpstreamBootstrapPlan {
		this.bindingRegistry.assertBindings(REQUIRED_BINDINGS);

		for (const step of DEFAULT_BOOTSTRAP_STEPS) {
			if (!this.assetLoader.hasBuiltin(step.builtinId)) {
				throw new Error(
					`Vendored upstream asset set is missing bootstrap builtin ${step.builtinId}`,
				);
			}
		}

		return {
			mode: "snapshot-free",
			nodeVersion: this.assetLoader.getVersionMetadata().nodeVersion,
			requiredBindings: [...REQUIRED_BINDINGS],
			steps: [...DEFAULT_BOOTSTRAP_STEPS],
		};
	}
}

export function createUpstreamBootstrapLoader(
	options: UpstreamBootstrapLoaderOptions = {},
): UpstreamBootstrapLoader {
	return new UpstreamBootstrapLoader(options);
}
