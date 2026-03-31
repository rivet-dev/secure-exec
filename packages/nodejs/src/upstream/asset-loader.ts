import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
	UpstreamBuiltinManifest,
	UpstreamBuiltinManifestEntry,
	UpstreamVersionMetadata,
} from "./types.js";

const VERSION_METADATA_FILE = "VERSION.json";
const BUILTIN_MANIFEST_FILE = "builtin-manifest.json";

function normalizeAssetRoot(assetRoot: string | URL): URL {
	if (assetRoot instanceof URL) {
		return new URL(assetRoot.href.endsWith("/") ? assetRoot.href : `${assetRoot.href}/`);
	}

	if (assetRoot.startsWith("file:")) {
		return new URL(assetRoot.endsWith("/") ? assetRoot : `${assetRoot}/`);
	}

	const assetRootUrl = pathToFileURL(resolve(assetRoot));
	return new URL(
		assetRootUrl.href.endsWith("/") ? assetRootUrl.href : `${assetRootUrl.href}/`,
	);
}

function readJsonFile<T>(fileUrl: URL): T {
	return JSON.parse(readFileSync(fileUrl, "utf8")) as T;
}

function buildBuiltinIndex(
	manifest: UpstreamBuiltinManifest,
): Map<string, UpstreamBuiltinManifestEntry> {
	return new Map(manifest.builtins.map((entry) => [entry.id, entry]));
}

function assertManifestConsistency(
	versionMetadata: UpstreamVersionMetadata,
	manifest: UpstreamBuiltinManifest,
): void {
	if (versionMetadata.assetLayoutVersion !== manifest.assetLayoutVersion) {
		throw new Error(
			`Upstream asset layout mismatch: VERSION.json=${versionMetadata.assetLayoutVersion}, builtin-manifest.json=${manifest.assetLayoutVersion}`,
		);
	}
	if (versionMetadata.nodeVersion !== manifest.nodeVersion) {
		throw new Error(
			`Upstream asset version mismatch: VERSION.json=${versionMetadata.nodeVersion}, builtin-manifest.json=${manifest.nodeVersion}`,
		);
	}
	if (versionMetadata.gitCommit !== manifest.gitCommit) {
		throw new Error(
			`Upstream asset commit mismatch: VERSION.json=${versionMetadata.gitCommit}, builtin-manifest.json=${manifest.gitCommit}`,
		);
	}
	if (versionMetadata.builtinCount !== manifest.builtins.length) {
		throw new Error(
			`Upstream asset count mismatch: VERSION.json=${versionMetadata.builtinCount}, builtin-manifest.json=${manifest.builtins.length}`,
		);
	}
	if (versionMetadata.publicBuiltinCount !== manifest.publicBuiltinCount) {
		throw new Error(
			`Upstream public builtin count mismatch: VERSION.json=${versionMetadata.publicBuiltinCount}, builtin-manifest.json=${manifest.publicBuiltinCount}`,
		);
	}
	if (versionMetadata.internalBuiltinCount !== manifest.internalBuiltinCount) {
		throw new Error(
			`Upstream internal builtin count mismatch: VERSION.json=${versionMetadata.internalBuiltinCount}, builtin-manifest.json=${manifest.internalBuiltinCount}`,
		);
	}
}

export function resolveVendoredUpstreamAssetRoot(fromUrl: string | URL = import.meta.url): URL {
	return new URL("../../assets/upstream-node/", fromUrl);
}

export interface UpstreamAssetLoaderOptions {
	assetRoot?: string | URL;
}

export class UpstreamAssetLoader {
	readonly assetRoot: URL;

	#versionMetadata?: UpstreamVersionMetadata;
	#builtinManifest?: UpstreamBuiltinManifest;
	#builtinIndex?: Map<string, UpstreamBuiltinManifestEntry>;
	#sourceCache = new Map<string, string>();

	constructor(options: UpstreamAssetLoaderOptions = {}) {
		this.assetRoot = normalizeAssetRoot(
			options.assetRoot ?? resolveVendoredUpstreamAssetRoot(import.meta.url),
		);
	}

	get assetRootPath(): string {
		return fileURLToPath(this.assetRoot);
	}

	getVersionMetadata(): UpstreamVersionMetadata {
		this.#loadMetadataIfNeeded();
		return this.#versionMetadata!;
	}

	getBuiltinManifest(): UpstreamBuiltinManifest {
		this.#loadMetadataIfNeeded();
		return this.#builtinManifest!;
	}

	listBuiltinIds(): string[] {
		return this.getBuiltinManifest().builtins.map((entry) => entry.id);
	}

	listBuiltinEntries(): UpstreamBuiltinManifestEntry[] {
		return [...this.getBuiltinManifest().builtins];
	}

	hasBuiltin(id: string): boolean {
		this.#loadMetadataIfNeeded();
		return this.#builtinIndex!.has(id);
	}

	getBuiltinEntry(id: string): UpstreamBuiltinManifestEntry {
		this.#loadMetadataIfNeeded();
		const entry = this.#builtinIndex!.get(id);
		if (!entry) {
			throw new Error(`Unknown upstream builtin: ${id}`);
		}
		return entry;
	}

	loadBuiltinSource(id: string): string {
		const cached = this.#sourceCache.get(id);
		if (cached !== undefined) {
			return cached;
		}

		const entry = this.getBuiltinEntry(id);
		const source = readFileSync(new URL(entry.assetPath, this.assetRoot), "utf8");
		this.#sourceCache.set(id, source);
		return source;
	}

	#loadMetadataIfNeeded(): void {
		if (this.#versionMetadata && this.#builtinManifest && this.#builtinIndex) {
			return;
		}

		const versionMetadata = readJsonFile<UpstreamVersionMetadata>(
			new URL(VERSION_METADATA_FILE, this.assetRoot),
		);
		const builtinManifest = readJsonFile<UpstreamBuiltinManifest>(
			new URL(BUILTIN_MANIFEST_FILE, this.assetRoot),
		);

		assertManifestConsistency(versionMetadata, builtinManifest);

		this.#versionMetadata = versionMetadata;
		this.#builtinManifest = builtinManifest;
		this.#builtinIndex = buildBuiltinIndex(builtinManifest);
	}
}

export function createVendoredUpstreamAssetLoader(
	options: UpstreamAssetLoaderOptions = {},
): UpstreamAssetLoader {
	return new UpstreamAssetLoader(options);
}
