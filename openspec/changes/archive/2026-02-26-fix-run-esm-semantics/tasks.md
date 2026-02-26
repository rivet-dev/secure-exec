## 1. Fix ESM run() return value

- [x] 1.1 Change `runESM()` to evaluate the module, then return `entryModule.namespace.copy()` instead of the `evaluate()` result
- [x] 1.2 Update the `run()` JSDoc comment to clarify ESM returns the namespace object (with `default` and named exports)

## 2. Tests

- [x] 2.1 Add test: ESM `run()` with `export default` returns `{ default: value }`
- [x] 2.2 Add test: ESM `run()` with named exports returns object with named properties
- [x] 2.3 Add test: ESM `run()` with mixed default + named exports returns both

## 3. Docs

- [x] 3.1 Record ESM semantics completion in this change's OpenSpec tasks/spec deltas and link any remaining follow-up as new OpenSpec changes
  - Follow-up OpenSpec changes: none identified at completion time.
