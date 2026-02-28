## Context

The secure-exec runtime currently injects multiple code strings into the isolate at runtime. Key paths include `getRequireSetupCode()` in `src/shared/require-setup.ts`, bridge wrappers in `src/bridge-loader.ts`, and related bootstrap calls in `src/index.ts` and `src/browser/worker.ts`. These sources are partly assembled through template-literal code generation, which couples runtime behavior to string construction and weakens auditability.

This change introduces a dedicated isolate-runtime source area so any code executed inside the isolate is represented as static TypeScript files with explicit build outputs.

## Goals / Non-Goals

**Goals:**
- Move isolate-injected code into `packages/secure-exec/isolate-runtime/` as static `.ts` files.
- Remove template-literal-based generated source assembly from isolate injection paths, including `getRequireSetupCode`, `getBridgeWithConfig`, and `createInitialBridgeGlobalsCode`.
- Add explicit build wiring in `packages/secure-exec/package.json` so isolate-runtime compile happens before runtime packaging/type output.
- Add turbo dependency wiring so isolate-runtime build is a first-class build dependency.
- Preserve external runtime behavior and Node-compat semantics while changing bootstrap assembly internals.

**Non-Goals:**
- Changing runtime capability surface (permissions, bridge API set, or stdlib support tiers).
- Re-architecting module resolution semantics unrelated to isolate bootstrap source placement.
- Introducing fixture-specific behavior for compatibility project matrix tests.

## Decisions

### 1. Create a dedicated isolate-runtime source subtree

**Decision:** Add `packages/secure-exec/isolate-runtime/` to hold all source that is evaluated inside the isolate (require setup, bridge bootstrap wrappers, and other injected bootstrap helpers).

**Rationale:** A single source-of-truth location makes isolate-bound code easy to review, lint, and test independently from host orchestration.

**Alternative considered:** Keep existing files in `src/` and only add conventions. Rejected because conventions alone do not prevent future drift back to ad-hoc string generation.

### 2. Compile isolate-runtime artifacts explicitly as part of package build

**Decision:** Add a dedicated `build:isolate-runtime` step in `packages/secure-exec/package.json` and make `build` depend on it.

**Rationale:** Isolate-runtime artifacts become deterministic build outputs instead of on-demand runtime-generated source.

**Alternative considered:** Runtime lazy-build fallback only. Rejected because it reintroduces nondeterministic behavior and hidden build coupling.

### 3. Make turbo aware of isolate-runtime build ordering

**Decision:** Add an explicit `build:isolate-runtime` task in `turbo.json`, then make `build` depend on it.

**Rationale:** Build graph visibility prevents stale artifact usage in incremental builds and CI.

**Alternative considered:** Depend solely on script chaining within package.json. Rejected because turbo-level ordering and caching would remain implicit.

### 4. Ban template-literal source synthesis for isolate injection

**Decision:** Replace template-literal-generated isolate source with static modules plus structured runtime data passing (for example explicit globals/JSON payloads consumed by static code).

**Rationale:** Eliminates code-construction ambiguity and improves reproducibility/security posture for isolate bootstrap logic.

**Alternative considered:** Keep template literals but constrain them with lint rules. Rejected because runtime-generated executable source remains hard to validate and review.

### 5. Load isolate-runtime through a compiled source manifest

**Decision:** Build isolate-runtime source files into `dist/isolate-runtime/**` and expose a host-consumable manifest module that maps runtime entry IDs to static source strings.

**Rationale:** Runtime loaders in `index.ts` and browser worker code can request static source by ID and evaluate it, without assembling executable text in host logic.

**Alternative considered:** Read files directly from disk at runtime. Rejected because it adds runtime filesystem coupling and complicates package portability.

## Risks / Trade-offs

- [Risk: behavior drift during migration from dynamic string assembly to static modules] -> Mitigation: preserve current execution tests and add targeted bootstrap parity tests for Node and browser paths.
- [Risk: build complexity increases with another compile step] -> Mitigation: keep the isolate-runtime build narrow and make turbo caching explicit with clear outputs.
- [Risk: hidden dynamic injection call sites remain] -> Mitigation: inventory all isolate `eval`/`context.eval`/worker bootstrap injection sites and migrate each in one change.
- [Risk: regression where future changes re-introduce template-literal injection] -> Mitigation: add CI guardrails (targeted test/lint check) that fail on executable template-literal injection in secure-exec host runtime files.

## Migration Plan

1. Inventory all isolate-injected source entry points and map each to a static file in `packages/secure-exec/isolate-runtime/`.
2. Implement `build:isolate-runtime` output generation and wire it into package and turbo build graphs.
3. Generate a manifest for compiled isolate-runtime sources and consume it from runtime loaders.
4. Refactor runtime loaders (`index.ts`, `browser/worker.ts`, `bridge-loader.ts`, `bridge-setup.ts`) to consume compiled artifacts.
5. Remove template-literal code-generation paths for isolate injection and replace runtime value interpolation with structured config channels.
6. Add automated guardrails that fail when new template-literal executable isolate injection is introduced.
7. Run runtime tests, type checks, and build checks; update friction log with migration resolution notes.

## Open Questions

- Should isolate-runtime compilation use the existing package `tsc` pipeline with a dedicated tsconfig, or a separate bundling step that emits directly consumable source strings?
- Should guardrails be implemented as a lint rule, a targeted runtime-source test, or both for strongest enforcement?
