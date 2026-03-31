export type UpstreamBuiltinClassification = "internal" | "public";

export interface UpstreamVersionMetadata {
	assetLayoutVersion: number;
	nodeVersion: string;
	nodeMajorLine: string;
	releaseDate: string;
	ltsCodename: string;
	gitCommit: string;
	sourceRef: string;
	upstreamRepository: string;
	upstreamForkRepository: string;
	builtinCount: number;
	publicBuiltinCount: number;
	internalBuiltinCount: number;
}

export interface UpstreamBuiltinManifestEntry {
	id: string;
	sourcePath: string;
	assetPath: string;
	classification: UpstreamBuiltinClassification;
	sha256: string;
	bytes: number;
}

export interface UpstreamBuiltinManifest {
	assetLayoutVersion: number;
	nodeVersion: string;
	gitCommit: string;
	publicBuiltinCount: number;
	internalBuiltinCount: number;
	builtins: UpstreamBuiltinManifestEntry[];
}

export interface UpstreamBuiltinSource {
	entry: UpstreamBuiltinManifestEntry;
	source: string;
}

export type UpstreamBuiltinSourceType =
	| "bootstrap-realm"
	| "bootstrap-script"
	| "per-context-script"
	| "main-script"
	| "function"
	| "source-text-module";

export interface UpstreamBuiltinCompileSpec {
	id: string;
	filename: string;
	sourceType: UpstreamBuiltinSourceType;
	parameters: readonly string[];
}

export type UpstreamBuiltinCompileFunction = (...args: unknown[]) => unknown;

export interface UpstreamInternalLoaders {
	internalBinding: (...args: unknown[]) => unknown;
	requireBuiltin: (id: string) => unknown;
}

export interface UpstreamBuiltinsBinding {
	builtinIds: readonly string[];
	compileFunction(id: string): UpstreamBuiltinCompileFunction;
	setInternalLoaders(
		internalBinding: UpstreamInternalLoaders["internalBinding"],
		requireBuiltin: UpstreamInternalLoaders["requireBuiltin"],
	): void;
}

export type UpstreamBindingStatus = "deferred" | "implemented" | "planned";
export type UpstreamBindingExecutionModel =
	| "deferred"
	| "host-lifecycle-plus-backend"
	| "host-only";
export type UpstreamBindingPhase = "bootstrap" | "fs-first";
export type UpstreamHostResponsibility =
	| "callback-delivery"
	| "close-semantics"
	| "js-wrapper-identity"
	| "ref-unref-state";

export interface UpstreamInternalBindingDescriptor {
	name: string;
	status: UpstreamBindingStatus;
	executionModel: UpstreamBindingExecutionModel;
	requiredFor: readonly UpstreamBindingPhase[];
	hostResponsibilities: readonly UpstreamHostResponsibility[];
	notes: string;
}

export interface UpstreamInternalBindingResolverContext {
	builtinsBinding: UpstreamBuiltinsBinding;
}

export type UpstreamInternalBindingFactory = (
	context: UpstreamInternalBindingResolverContext,
) => unknown;

export interface UpstreamInternalBindingRegistration {
	descriptor: UpstreamInternalBindingDescriptor;
	createBinding?: UpstreamInternalBindingFactory;
}

export type UpstreamBootstrapPhase = "bootstrap" | "entrypoint" | "per_context";

export interface UpstreamBootstrapStep {
	phase: UpstreamBootstrapPhase;
	builtinId: string;
	description: string;
}

export interface UpstreamBootstrapPlan {
	mode: "snapshot-free";
	nodeVersion: string;
	requiredBindings: string[];
	steps: UpstreamBootstrapStep[];
}
