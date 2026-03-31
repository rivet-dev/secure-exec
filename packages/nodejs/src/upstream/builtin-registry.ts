import {
	type UpstreamAssetLoader,
	createVendoredUpstreamAssetLoader,
} from "./asset-loader.js";
import type { UpstreamBuiltinManifestEntry, UpstreamBuiltinSource } from "./types.js";

export interface UpstreamBuiltinRegistryOptions {
	assetLoader?: UpstreamAssetLoader;
}

export class UpstreamBuiltinRegistry {
	readonly assetLoader: UpstreamAssetLoader;

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
}

export function createUpstreamBuiltinRegistry(
	options: UpstreamBuiltinRegistryOptions = {},
): UpstreamBuiltinRegistry {
	return new UpstreamBuiltinRegistry(options);
}
