## Why

Dynamic `import()` calls in sandboxed code are eagerly resolved, compiled, and **evaluated** during `precompileDynamicImports` — before user code executes. This violates Node.js semantics where `import()` is lazy: the target module should only load and evaluate when the expression is actually reached at runtime. The eager evaluation causes side effects in imported modules to fire too early, breaks conditional dynamic imports that depend on runtime state, and produces incorrect execution ordering.

## What Changes

- **Defer evaluation of dynamic imports**: Change `precompileDynamicImports` to only resolve and compile (but not instantiate or evaluate) dynamic import targets. Module evaluation should happen on-demand when `__dynamicImport()` is actually called from user code.
- **Make `__dynamicImport` async-capable**: Replace the current synchronous cache lookup with an async path that can instantiate and evaluate modules on first access, returning a Promise as the real `import()` does.
- **Remove eager `module.evaluate()` and `module.instantiate()` from precompilation**: The precompile step should only populate the module compilation cache (`esmModuleCache`), not the namespace cache (`dynamicImportCache`).

## Capabilities

### New Capabilities

- `lazy-dynamic-import`: Deferred evaluation semantics for sandboxed `import()` calls — modules compile ahead of time but evaluate only when the import expression executes.

### Modified Capabilities

- `runtime-execution-model`: The execution pipeline changes evaluation ordering for dynamic imports, affecting the async execution guarantees of `exec` and `run`.

## Impact

- `packages/sandboxed-node/src/index.ts` — `precompileDynamicImports`, `setupDynamicImport`, and the `dynamicImportCache` usage all change.
- Existing tests relying on dynamic import behavior may need updates to validate lazy evaluation ordering.
- No API surface changes — `exec()` and `run()` signatures remain the same.
