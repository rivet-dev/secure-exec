# Architecture Overview

```
NodeRuntime  →  RuntimeDriver + RuntimeExecutionDriverFactory  →  NodeExecutionDriver
  (API)          (capability/config + execution wiring)           (isolated-vm engine)
```

## NodeRuntime

`src/index.ts`

Public API. Thin facade — delegates everything to the execution driver.

- `run(code)` — execute as module, get exports back
- `exec(code)` — execute as script, get exit code + stdout/stderr
- `dispose()` / `terminate()`
- Requires both:
  - `driver` for runtime capabilities/config
  - `executionFactory` for execution-driver construction

## RuntimeDriver

`src/runtime-driver.ts` (re-exported from `src/types.ts`)

Config object that bundles what the sandbox can access. Deny-by-default.

- `filesystem` — VFS adapter
- `network` — fetch, DNS, HTTP
- `commandExecutor` — child processes
- `permissions` — per-adapter allow/deny checks

## RuntimeExecutionDriverFactory

Factory abstraction for constructing execution drivers from normalized runtime options.

- `createExecutionDriver(options)` — returns a `RuntimeExecutionDriver`

### createNodeDriver()

`src/node/driver.ts`

Factory that builds a `RuntimeDriver` with Node-native adapters.

- Wraps filesystem in `ModuleAccessFileSystem` (read-only `node_modules` overlay)
- Optionally wires up network and command executor

### createNodeExecutionFactory()

`src/node/driver.ts`

Factory that builds a Node-backed `RuntimeExecutionDriverFactory`.

- Constructs `NodeExecutionDriver` instances
- Owns optional Node-specific isolate creation hook

## NodeExecutionDriver

`src/node/execution-driver.ts`

The engine. Owns the `isolated-vm` isolate and bridges host capabilities in.

- Creates contexts, compiles ESM/CJS, runs code
- Bridges fs, network, child_process, crypto, timers into the isolate via `ivm.Reference`
- Caches compiled modules and resolved formats per isolate
- Enforces payload size limits on bridge transfers

## ModuleAccessFileSystem

`src/node/module-access.ts`

Filesystem overlay that makes host `node_modules` available read-only at `/root/node_modules`.

- Blocks `.node` native addons
- Prevents symlink escapes (resolves pnpm virtual-store paths)
- Non-module paths fall through to base VFS

## Permissions

`src/shared/permissions.ts`

Wraps each adapter with allow/deny checks before calls reach the host.

- `wrapFileSystem()`, `wrapNetworkAdapter()`, `wrapCommandExecutor()`
- Missing adapters get deny-all stubs
