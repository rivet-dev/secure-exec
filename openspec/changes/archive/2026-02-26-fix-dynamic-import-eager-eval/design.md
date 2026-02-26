## Context

`NodeProcess.executeInternal` currently handles dynamic `import()` in three phases:

1. **Transform**: `transformDynamicImport` rewrites `import(...)` → `__dynamicImport(...)` since `isolated-vm` doesn't support native `import()` in scripts.
2. **Precompile**: `precompileDynamicImports` extracts all string-literal specifiers, then for each: resolves the path, compiles an `ivm.Module`, instantiates it (resolving its full dependency tree), evaluates it, and caches the resulting namespace in `dynamicImportCache`.
3. **Bridge**: `setupDynamicImport` creates a **synchronous** `__dynamicImport` function that looks up the pre-cached namespace and returns it wrapped in a `Promise`.

The problem is step 2: evaluating modules eagerly causes side effects to execute before user code, violates conditional import semantics, and produces wrong execution ordering.

`isolated-vm` constraints are the root cause of this design — `Module.evaluate()` is async and cannot be called from a synchronous reference callback. The original precompile approach worked around this by front-loading all evaluation.

## Goals / Non-Goals

**Goals:**
- Dynamic imports evaluate lazily — only when `import()` is actually reached during user code execution
- Side effects in dynamically-imported modules fire in correct order relative to user code
- Conditional dynamic imports (`if (x) import("y")`) skip evaluation of unused branches
- Preserve the existing deadlock-avoidance guarantee (no `async` host callbacks from synchronous isolate code)

**Non-Goals:**
- Supporting truly dynamic specifiers (computed `import(variable)`) — these already fall back to `require()` and that behavior is unchanged
- Changing static ESM `import` statement behavior (only dynamic `import()` is affected)
- Performance optimization of module compilation

## Decisions

### Decision 1: Two-phase precompile (compile only) + async on-demand evaluate

**Choice**: Split the current `precompileDynamicImports` into compile-only (ahead of time) and evaluate-on-demand (at call time).

**Rationale**: The precompile step still serves a purpose — it resolves and compiles modules upfront to avoid deadlocks from calling async host functions during synchronous isolate execution. But evaluation (which triggers side effects) must be deferred.

**Alternative considered**: Fully lazy (no precompilation). Rejected because `isolated-vm` module compilation is async and calling it from within isolate execution creates reentrancy/deadlock issues.

### Decision 2: Async `__dynamicImport` via `ivm.Reference` with `{ result: { promise: true } }`

**Choice**: Replace the synchronous `_dynamicImport` reference with an async one that instantiates and evaluates the module on first call, using `isolated-vm`'s promise transfer mechanism.

**Rationale**: The current synchronous approach requires pre-evaluation. By making the reference async, we can call `module.instantiate()` and `module.evaluate()` at call time. `isolated-vm` supports returning promises from host references via `{ result: { promise: true } }`, which the isolate awaits naturally since `import()` already returns a Promise in user code.

**Alternative considered**: Keep synchronous reference, queue evaluation requests. Rejected — adds complexity and still requires a secondary async resolution mechanism.

### Decision 3: Keep `dynamicImportCache` as a namespace cache for already-evaluated modules

**Choice**: Retain the cache but populate it lazily on first `__dynamicImport` call rather than during precompilation.

**Rationale**: Avoids re-evaluating modules that are imported multiple times. Second `import("x")` should return the same module namespace without re-running side effects, matching Node.js semantics.

## Risks / Trade-offs

- **[Risk] Deadlock from async module operations during isolate execution** → Mitigated by keeping compilation in precompile phase; only instantiate+evaluate is deferred to the async reference callback which runs on the host event loop.
- **[Risk] Slower first dynamic import** → Module compilation is still precomputed. Only instantiation + evaluation happen on demand, which is a small fraction of total cost. Acceptable trade-off for correctness.
- **[Risk] `require()` fallback may mask failures** → The existing fallback to `require()` when a module isn't in the ESM cache remains. With lazy evaluation, the cache starts empty for unresolved specifiers. Behavior is unchanged for computed specifiers but now `require()` fallback also covers the case where precompilation was skipped (e.g., specifier not statically extractable).
