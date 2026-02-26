## 1. Refactor Precompilation to Compile-Only

- [x] 1.1 Strip `module.instantiate()`, `module.evaluate()`, and `dynamicImportCache` population from `precompileDynamicImports` — it should only call `compileESMModule` to warm the `esmModuleCache`
- [x] 1.2 Verify `precompileDynamicImports` no longer triggers any module side effects (no console output, no global mutations)

## 2. Make `__dynamicImport` Async with On-Demand Evaluation

- [x] 2.1 Replace the synchronous `_dynamicImport` `ivm.Reference` in `setupDynamicImport` with an async reference that resolves the specifier, instantiates, and evaluates the module on first call
- [x] 2.2 Use `ivm`'s `{ result: { promise: true } }` option so the isolate receives a proper Promise from the host reference
- [x] 2.3 Populate `dynamicImportCache` on first evaluation so repeated `import()` of the same module returns the cached namespace without re-evaluation

## 3. Update In-Isolate `__dynamicImport` Glue

- [x] 3.1 Rewrite the `context.eval` block in `setupDynamicImport` to call the new async reference and return the resulting Promise directly (remove the synchronous `applySync` path)
- [x] 3.2 Keep the `require()` fallback for computed/non-precompiled specifiers

## 4. Tests

- [x] 4.1 Add test: side effects in dynamically imported module execute only when `import()` is reached, in correct order relative to surrounding user code
- [x] 4.2 Add test: conditional `import()` in an untaken branch does not evaluate the target module
- [x] 4.3 Add test: repeated `import()` of the same module returns identical namespace and evaluates once
- [x] 4.4 Add test: `import()` of non-existent module rejects with a descriptive error
- [x] 4.5 Run existing test suite to confirm no regressions

## 5. Docs and Tracking

- [x] 5.1 Record completion in this change's OpenSpec tasks/spec deltas and link any remaining follow-up work as new OpenSpec changes
