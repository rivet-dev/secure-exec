import { compileFunction as compileVmFunction } from "node:vm";
import {
	type UpstreamAssetLoader,
	createVendoredUpstreamAssetLoader,
} from "./asset-loader.js";
import type {
	UpstreamBuiltinCompileFunction,
	UpstreamBuiltinCompileSpec,
	UpstreamBuiltinManifestEntry,
	UpstreamBuiltinSource,
	UpstreamBuiltinSourceType,
	UpstreamBuiltinsBinding,
	UpstreamInternalLoaders,
} from "./types.js";

const BUILTIN_PARAMETER_MAP: Record<
	Exclude<UpstreamBuiltinSourceType, "source-text-module">,
	readonly string[]
> = Object.freeze({
	"bootstrap-realm": Object.freeze([
		"process",
		"getLinkedBinding",
		"getInternalBinding",
		"primordials",
	]),
	"bootstrap-script": Object.freeze([
		"process",
		"require",
		"internalBinding",
		"primordials",
	]),
	"per-context-script": Object.freeze([
		"exports",
		"primordials",
		"privateSymbols",
		"perIsolateSymbols",
	]),
	"main-script": Object.freeze([
		"process",
		"require",
		"internalBinding",
		"primordials",
	]),
	function: Object.freeze([
		"exports",
		"require",
		"module",
		"process",
		"internalBinding",
		"primordials",
	]),
});

function classifyBuiltinSourceType(
	id: string,
	entry: UpstreamBuiltinManifestEntry,
): UpstreamBuiltinSourceType {
	if (
		entry.sourcePath.endsWith(".mjs") ||
		id.startsWith("internal/deps/v8/tools/")
	) {
		return "source-text-module";
	}
	if (id.startsWith("internal/bootstrap/realm")) {
		return "bootstrap-realm";
	}
	if (id.startsWith("internal/bootstrap/")) {
		return "bootstrap-script";
	}
	if (id.startsWith("internal/per_context/")) {
		return "per-context-script";
	}
	if (id.startsWith("internal/main/")) {
		return "main-script";
	}
	return "function";
}

export interface UpstreamBuiltinRegistryOptions {
	assetLoader?: UpstreamAssetLoader;
}

export class UpstreamBuiltinRegistry {
	readonly assetLoader: UpstreamAssetLoader;

	#compiledBuiltinCache = new Map<string, UpstreamBuiltinCompileFunction>();
	#builtinsBinding?: UpstreamBuiltinsBinding;
	#internalLoaders?: UpstreamInternalLoaders;
	#builtinExportsCache = new Map<string, unknown>();

	constructor(options: UpstreamBuiltinRegistryOptions = {}) {
		this.assetLoader = options.assetLoader ?? createVendoredUpstreamAssetLoader();
	}

	listBuiltinIds(): string[] {
		return this.assetLoader.listBuiltinIds();
	}

	hasBuiltin(id: string): boolean {
		return this.assetLoader.hasBuiltin(id);
	}

	getBuiltinEntry(id: string): UpstreamBuiltinManifestEntry {
		return this.assetLoader.getBuiltinEntry(id);
	}

	getBuiltinSource(id: string): string {
		return this.assetLoader.loadBuiltinSource(id);
	}

	getBuiltin(id: string): UpstreamBuiltinSource {
		return {
			entry: this.getBuiltinEntry(id),
			source: this.getBuiltinSource(id),
		};
	}

	getBuiltinCompileSpec(id: string): UpstreamBuiltinCompileSpec {
		const entry = this.getBuiltinEntry(id);
		const sourceType = classifyBuiltinSourceType(id, entry);

		if (sourceType === "source-text-module") {
			throw new Error(
				`Upstream builtin ${id} is a source text module and cannot be compiled with compileFunction() yet`,
			);
		}

		return {
			id,
			filename: `node:${id}`,
			sourceType,
			parameters: [...BUILTIN_PARAMETER_MAP[sourceType]],
		};
	}

	compileFunction(id: string): UpstreamBuiltinCompileFunction {
		const cached = this.#compiledBuiltinCache.get(id);
		if (cached) {
			return cached;
		}

		const spec = this.getBuiltinCompileSpec(id);
		const compiled = compileVmFunction(this.getBuiltinSource(id), [...spec.parameters], {
			filename: spec.filename,
		}) as UpstreamBuiltinCompileFunction;

		this.#compiledBuiltinCache.set(id, compiled);
		return compiled;
	}

	createBuiltinsBinding(): UpstreamBuiltinsBinding {
		if (!this.#builtinsBinding) {
			const builtinIds = Object.freeze([...this.listBuiltinIds()]);
			this.#builtinsBinding = Object.freeze({
				builtinIds,
				compileFunction: (id: string) => this.compileFunction(id),
				setInternalLoaders: (
					internalBinding: UpstreamInternalLoaders["internalBinding"],
					requireBuiltin: UpstreamInternalLoaders["requireBuiltin"],
				) => {
					this.setInternalLoaders(internalBinding, requireBuiltin);
				},
			});
		}

		return this.#builtinsBinding;
	}

	setInternalLoaders(loaders: UpstreamInternalLoaders): void;
	setInternalLoaders(
		internalBinding: UpstreamInternalLoaders["internalBinding"],
		requireBuiltin: UpstreamInternalLoaders["requireBuiltin"],
	): void;
	setInternalLoaders(
		loadersOrInternalBinding:
			| UpstreamInternalLoaders
			| UpstreamInternalLoaders["internalBinding"],
		maybeRequireBuiltin?: UpstreamInternalLoaders["requireBuiltin"],
	): void {
		let loaders: UpstreamInternalLoaders;
		if (typeof loadersOrInternalBinding === "function") {
			if (typeof maybeRequireBuiltin !== "function") {
				throw new TypeError(
					"setInternalLoaders expects internalBinding and requireBuiltin functions",
				);
			}
			loaders = {
				internalBinding: loadersOrInternalBinding,
				requireBuiltin: maybeRequireBuiltin,
			};
		} else {
			loaders = loadersOrInternalBinding;
		}

		if (
			typeof loaders.internalBinding !== "function" ||
			typeof loaders.requireBuiltin !== "function"
		) {
			throw new TypeError(
				"setInternalLoaders expects internalBinding and requireBuiltin functions",
			);
		}

		this.#internalLoaders = loaders;
		this.#builtinExportsCache.clear();
	}

	hasInternalLoaders(): boolean {
		return this.#internalLoaders !== undefined;
	}

	getInternalLoaders(): UpstreamInternalLoaders {
		if (!this.#internalLoaders) {
			throw new Error("Upstream internal loaders have not been initialized");
		}
		return this.#internalLoaders;
	}

	requireBuiltin(id: string): unknown {
		this.getBuiltinEntry(id);

		if (this.#builtinExportsCache.has(id)) {
			return this.#builtinExportsCache.get(id);
		}

		const exportsValue = this.getInternalLoaders().requireBuiltin(id);
		this.#builtinExportsCache.set(id, exportsValue);
		return exportsValue;
	}
}

export function createUpstreamBuiltinRegistry(
	options: UpstreamBuiltinRegistryOptions = {},
): UpstreamBuiltinRegistry {
	return new UpstreamBuiltinRegistry(options);
}
