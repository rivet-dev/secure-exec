# Isolate Runtime Source Inventory

This directory is the source of truth for host-injected isolate runtime code.

## Mapping

- `src/shared/require-setup.ts` -> `isolate-runtime/require-setup.ts`
- `src/bridge-setup.ts` (`createInitialBridgeGlobalsCode`) -> `isolate-runtime/bridge-initial-globals.ts`
- `src/bridge-loader.ts` bridge global attachment wrapper -> `isolate-runtime/bridge-attach.ts`
- `src/index.ts` dynamic-import setup snippet -> `isolate-runtime/setup-dynamic-import.ts`
- `src/index.ts` `_fs` facade setup snippet -> `isolate-runtime/setup-fs-facade.ts`
- `src/index.ts` CommonJS mutable globals init snippet -> `isolate-runtime/init-commonjs-module-globals.ts`
- `src/index.ts` CommonJS file globals snippet -> `isolate-runtime/set-commonjs-file-globals.ts`
- `src/index.ts` global descriptor policy snippet -> `isolate-runtime/apply-custom-global-policy.ts`
- `src/index.ts` timing mitigation snippets ->
  - `isolate-runtime/apply-timing-mitigation-off.ts`
  - `isolate-runtime/apply-timing-mitigation-freeze.ts`
- `src/index.ts` process override snippets ->
  - `isolate-runtime/override-process-env.ts`
  - `isolate-runtime/override-process-cwd.ts`
- `src/index.ts` stdin override snippet -> `isolate-runtime/set-stdin-data.ts`
- Shared global exposure helper source -> `isolate-runtime/global-exposure-helpers.ts`
- `src/execution.ts` script-result eval wrapper -> `isolate-runtime/eval-script-result.ts`

Build output:

- Compiled scripts: `dist/isolate-runtime/**`
- Generated manifest used by host runtime: `src/generated/isolate-runtime.ts`
