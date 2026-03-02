## 1. Type and API Surface Split

- [x] 1.1 Remove `runtimeHooks` from `RuntimeDriver` and define a dedicated runtime execution factory/provider contract in `runtime-driver.ts`.
- [x] 1.2 Update `NodeRuntimeOptions` and `NodeRuntime` construction to require both `driver` (capabilities/config) and execution factory/provider.
- [x] 1.3 Update exports and re-exported types so consumers can use the new contracts without importing internal paths.

## 2. Node Implementation Wiring

- [x] 2.1 Refactor Node driver assembly to return pure capability/config driver data and separate Node execution factory wiring.
- [x] 2.2 Update Node execution-driver options/types to consume the new construction contract instead of `driver.runtimeHooks`.
- [x] 2.3 Remove obsolete hook-based wiring and keep runtime process/os config injection behavior unchanged.

## 3. Validation and Docs

- [x] 3.1 Update tests to cover the new constructor/factory wiring and preserve deny-by-default semantics.
- [x] 3.2 Update architecture documentation to describe the split between capability driver and execution factory.
- [x] 3.3 Run targeted typecheck/tests and mark tasks complete.
