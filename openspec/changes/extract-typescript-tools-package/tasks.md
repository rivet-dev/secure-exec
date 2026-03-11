## 1. Core Runtime Cleanup

- [x] 1.1 Remove TypeScript-specific runtime APIs and types from `packages/secure-exec` so `NodeRuntime` and browser runtime targets execute JavaScript only.
- [x] 1.2 Remove the browser runtime TypeScript path and restore browser/playground TypeScript transpilation outside the core runtime.
- [x] 1.3 Add Node/browser runtime-driver regression tests proving TypeScript-only syntax fails through normal JavaScript execution.

## 2. Companion Package

- [x] 2.1 Add `packages/secure-exec-typescript` with `createTypeScriptTools(...)`, published as `@secure-exec/typescript`.
- [x] 2.2 Implement `typecheckProject(...)` and `compileProject(...)` using the TypeScript compiler API inside a dedicated sandbox runtime.
- [x] 2.3 Implement `typecheckSource(...)` and `compileSource(...)` for single-source string workflows.
- [x] 2.4 Add integration coverage for project compile/typecheck, source compile/typecheck, and deterministic compiler memory-limit failures.

## 3. Docs And Specs

- [x] 3.1 Update docs to describe the JS-only core runtime and the companion `@secure-exec/typescript` package.
- [x] 3.2 Update architecture/friction notes for the extracted compiler sandbox design.
- [x] 3.3 Update OpenSpec baselines and add the new `typescript-tools` capability.

## 4. Validation

- [x] 4.1 Run `pnpm install` if needed to refresh workspace links for the new package.
- [x] 4.2 Run `pnpm --filter secure-exec check-types`.
- [x] 4.3 Run `pnpm --filter @secure-exec/typescript check-types`.
- [x] 4.4 Run targeted secure-exec runtime coverage:
  - `pnpm --filter secure-exec exec vitest run tests/runtime-driver/node/runtime.test.ts`
  - `pnpm --filter secure-exec exec vitest run --config vitest.browser.config.ts tests/runtime-driver/browser/runtime.test.ts`
  - `pnpm --filter secure-exec exec vitest run tests/test-suite/node.test.ts`
  - `pnpm --filter secure-exec exec vitest run --config vitest.browser.config.ts tests/test-suite/node.test.ts`
- [x] 4.5 Run `pnpm --filter @secure-exec/typescript exec vitest run tests/typescript-tools.integration.test.ts`.
- [x] 4.6 Run `pnpm --filter playground exec vitest run tests/server.behavior.test.ts`.
- [x] 4.7 Run `pnpm turbo build --filter @secure-exec/typescript`.
