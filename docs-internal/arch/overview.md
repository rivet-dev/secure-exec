# Architecture Overview

```
NodeRuntime | PythonRuntime | createTypeScriptTools
  → SystemDriver + NodeRuntimeDriverFactory | PythonRuntimeDriverFactory | compiler SystemDriver + NodeRuntimeDriverFactory
  → NodeExecutionDriver (node target) | BrowserRuntimeDriver + Worker runtime (browser target) | PyodideRuntimeDriver + Worker runtime (python target) | compiler NodeRuntime sandbox
```

## NodeRuntime / PythonRuntime

`src/runtime.ts`, `src/python-runtime.ts`

Public APIs. Thin facades that delegate orchestration to runtime drivers.

- `NodeRuntime.run(code)` — execute JS module, get exports back
- `PythonRuntime.run(code)` — execute Python and return structured value/global wrapper
- `exec(code)` — execute as script, get exit code/error contract
- `dispose()` / `terminate()`
- Requires both:
  - `systemDriver` for runtime capabilities/config
  - runtime-driver factory for runtime-driver construction

## TypeScript Tools

`packages/secure-exec-typescript/src/index.ts`

Optional companion package for sandboxed TypeScript compiler work (`@secure-exec/typescript`).

- `createTypeScriptTools(...)` — build project/source compile and typecheck helpers
- Uses a dedicated `NodeRuntime` compiler sandbox per request
- Keeps TypeScript compiler execution out of the core runtime path

## SystemDriver

`src/runtime-driver.ts` (re-exported from `src/types.ts`)

Config object that bundles what the sandbox can access. Deny-by-default.

- `filesystem` — VFS adapter
- `network` — fetch, DNS, HTTP
- `commandExecutor` — child processes
- `permissions` — per-adapter allow/deny checks

## NodeRuntimeDriverFactory / PythonRuntimeDriverFactory

Factory abstraction for constructing runtime drivers from normalized runtime options.

- `createRuntimeDriver(options)` — returns a `RuntimeDriver`

### createNodeDriver()

`src/node/driver.ts`

Factory that builds a `SystemDriver` with Node-native adapters.

- Wraps filesystem in `ModuleAccessFileSystem` (read-only `node_modules` overlay)
- Optionally wires up network and command executor

### createNodeRuntimeDriverFactory()

`src/node/driver.ts`

Factory that builds a Node-backed `RuntimeDriverFactory`.

- Constructs `NodeExecutionDriver` instances
- Owns optional Node-specific isolate creation hook

### createBrowserDriver()

`src/browser/driver.ts`

Factory that builds a browser `SystemDriver` with browser-native adapters.

- Uses OPFS or in-memory filesystem adapters
- Uses fetch-backed network adapter with deterministic `ENOSYS` for unsupported DNS/server paths
- Applies permission wrappers before returning the driver

### createBrowserRuntimeDriverFactory()

`src/browser/runtime-driver.ts`

Factory that builds a browser-backed `RuntimeDriverFactory`.

- Validates and rejects Node-only runtime options
- Constructs `BrowserRuntimeDriver` instances
- Owns worker URL/runtime-driver creation options

### createPyodideRuntimeDriverFactory()

`src/python/driver.ts`

Factory that builds a Python-backed `PythonRuntimeDriverFactory`.

- Constructs `PyodideRuntimeDriver` instances
- Owns Pyodide worker bootstrap and runtime-driver creation options

## NodeExecutionDriver

`src/node/execution-driver.ts`

The engine. Owns the `isolated-vm` isolate and bridges host capabilities in.

- Creates contexts, compiles ESM/CJS, runs code
- Bridges fs, network, child_process, crypto, timers into the isolate via `ivm.Reference`
- Caches compiled modules and resolved formats per isolate
- Enforces payload size limits on bridge transfers

## BrowserRuntimeDriver

`src/browser/runtime-driver.ts`

Browser execution driver that owns worker lifecycle and message marshalling.

- Spawns and manages the browser runtime worker
- Dispatches `run`/`exec` requests and correlates responses by request ID
- Streams optional stdio events to host hooks without runtime-managed output buffering
- Exposes the configured browser network adapter through `NodeRuntime.network`

## Browser Worker Runtime

`src/browser/worker.ts`

Worker-side runtime implementation used by the browser runtime driver.

- Initializes browser bridge globals and runtime config from worker init payload
- Executes transformed CJS/ESM user code and returns runtime-contract results
- Uses permission-aware filesystem/network adapters in the worker context
- Preserves deterministic unsupported-operation contracts (for example DNS gaps)

## PyodideRuntimeDriver

`src/python/driver.ts`

Python execution driver that owns a Node worker running Pyodide.

- Loads Pyodide once per runtime instance and keeps interpreter state warm across runs
- Dispatches `run`/`exec` requests and correlates responses by request ID
- Streams stdio events to host hooks without runtime-managed output buffering
- Uses worker-to-host RPC for permission-wrapped filesystem/network access through `SystemDriver`
- Restarts worker state on execution timeout to preserve deterministic recovery behavior

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
