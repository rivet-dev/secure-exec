## Context

`NodeProcess.run()` has two code paths: CJS and ESM. The CJS path correctly returns `module.exports` after script evaluation. The ESM path calls `entryModule.evaluate({ promise: true })` and returns its result, which is the last expression value - typically `undefined` for ESM modules that only declare exports.

The `isolated-vm` library provides `module.namespace` on a compiled/evaluated ESM module, which returns a `Reference` to the module's namespace object containing all exported bindings (both named and default).

## Goals / Non-Goals

**Goals:**
- ESM `run()` returns the module namespace (all exports) after evaluation, not the evaluate() return value.
- Symmetric behavior: CJS returns `module.exports`, ESM returns the namespace object with `default` and named exports.
- Test coverage for ESM export retrieval.

**Non-Goals:**
- Changing `exec()` behavior (exec does not use exports).
- Changing CJS `run()` behavior.
- Auto-unwrapping the default export (callers access `exports.default` explicitly).

## Decisions

### Return full namespace, not just `default`

**Decision:** Return the entire ESM namespace object (`{ default, ...namedExports }`) rather than unwrapping `default`.

**Rationale:** This preserves all exported bindings and matches the semantics of `import * as ns`. CJS `module.exports` can be any shape; the ESM equivalent is the namespace. Callers who want just the default can access `.default`. Unwrapping would lose named exports and create an asymmetry where mixed-export modules behave differently.

**Alternative considered:** Return `namespace.default ?? namespace`. Rejected because it silently discards named exports and makes the return type unpredictable.

### Materialize namespace to a plain object for value transfer

**Decision:** Evaluate the module, bind `entryModule.namespace` into isolate scope, then return `Object.fromEntries(Object.entries(namespace))` with `{ copy: true }` so the host receives a plain object.

**Rationale:** `isolated-vm` cannot directly clone module namespace exotic objects (`[object Module] could not be cloned`). Converting the namespace to a plain object inside the isolate preserves export bindings and uses the same host transfer mechanism already used by the CJS path.

## Risks / Trade-offs

- **[Serialization limits]** Plain-object copy still deep-copies exported values. Functions and class instances won't transfer meaningfully (they become `{}` or throw). This matches the existing CJS behavior where `module.exports` is also copied out via `context.eval(..., { copy: true })`. No mitigation needed - this is inherent to the isolate boundary.
- **[Return shape change]** Callers that previously received `undefined` from ESM `run()` will now receive a namespace object. This is the intended fix, but any code accidentally relying on `undefined` will see a behavior change.
