## Why

`NodeProcess.run()` documents that it returns "module exports/default" for ESM code, but the implementation returns the evaluation result from `entryModule.evaluate()` instead. This means ESM callers get `undefined` (or the last expression value) rather than the module's exported bindings, breaking the symmetry with CJS where `module.exports` is correctly returned.

## What Changes

- Fix `runESM()` to return the module namespace (exported bindings) after evaluation by materializing a plain object from `entryModule.namespace` instead of returning the `evaluate()` result.
- Update the `run()` doc comment to clarify the ESM return shape (namespace object with `default` and named exports).
- Add test coverage for ESM `run()` return values (default export, named exports, mixed).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-execution-model`: `run()` ESM path must return module namespace exports instead of evaluation result.

## Impact

- `packages/sandboxed-node/src/index.ts` - `runESM()` and `run()` doc comment.
- `packages/sandboxed-node/tests/index.test.ts` - new ESM `run()` tests.
- No API shape changes (`RunResult<T>` is unchanged); callers that previously received `undefined` from ESM `run()` will now receive the actual exports.
