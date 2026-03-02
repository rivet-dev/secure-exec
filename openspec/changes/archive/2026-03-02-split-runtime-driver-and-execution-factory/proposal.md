## Why

`RuntimeDriver` currently mixes two responsibilities: capability/config data and execution-engine construction via `runtimeHooks`. This coupling leaks Node execution concerns into generic driver typing and makes alternate runtimes harder to add or reason about.

## What Changes

- Remove execution-construction hooks from `RuntimeDriver`.
- Introduce a separate execution-factory contract for constructing `RuntimeExecutionDriver` instances.
- Update `NodeRuntime` construction to require both a capability driver and an execution factory/provider.
- Keep runtime/process/os config sourced from the driver and injected into execution construction.
- Preserve deny-by-default behavior for omitted adapters/permissions.
- Update Node driver assembly so Node-specific execution construction is owned by Node factory code rather than generic driver hooks.
- Update internal architecture docs to reflect the split.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `node-runtime`: Runtime construction contract changes from hook-based execution creation on `RuntimeDriver` to explicit execution-factory wiring while preserving runtime behavior.

## Impact

- Affected code:
  - `packages/secure-exec/src/runtime-driver.ts`
  - `packages/secure-exec/src/index.ts`
  - `packages/secure-exec/src/node/driver.ts`
  - `packages/secure-exec/src/node/execution-driver.ts`
  - related tests and docs
- API impact:
  - **BREAKING**: `NodeRuntime` constructor options and runtime-driver typing change.
- Dependencies:
  - No new external dependencies expected.
