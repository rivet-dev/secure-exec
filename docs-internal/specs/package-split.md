# Spec: Split `secure-exec` into Core + Runtime Packages

## Status

Draft

## Motivation

The `secure-exec` package currently bundles three runtime implementations
(Node/V8, Browser/Worker, Python/Pyodide) into a single package. This means:

- Every consumer pulls `pyodide`, `esbuild`, and
  `node-stdlib-browser` as dependencies regardless of which runtime they use.
- The Node kernel adapter (`packages/runtime/node/`) depends on `secure-exec`
  just to get `NodeExecutionDriver`, pulling in Pyodide and browser code
  transitively.
- No way to ship a browser-only or Python-only bundle without dead code from
  the other runtimes.

The internal module boundaries are already clean enough to split without major
refactoring. The goal is to make the split explicit at the package level.

## Current State

```
packages/secure-exec/
├── src/
│   ├── index.ts                 # barrel: re-exports everything
│   ├── browser-runtime.ts       # barrel: browser-safe subset
│   ├── runtime.ts               # NodeRuntime facade (used by Node + Browser)
│   ├── python-runtime.ts        # PythonRuntime facade
│   ├── execution.ts             # V8 execution loop (ivm.Isolate throughout)
│   ├── isolate.ts               # V8 isolate utilities
│   ├── bridge-loader.ts         # esbuild bridge compilation
│   ├── bridge-setup.ts          # generated code loader
│   ├── esm-compiler.ts          # ESM wrapper generation (no ivm)
│   ├── module-resolver.ts       # built-in specifier normalization (no ivm)
│   ├── package-bundler.ts       # module resolution / node_modules walk (no ivm)
│   ├── polyfills.ts             # esbuild stdlib bundling
│   ├── fs-helpers.ts            # VFS utilities (no ivm)
│   ├── types.ts                 # VirtualFileSystem, SystemDriver, etc.
│   ├── runtime-driver.ts        # RuntimeDriverFactory interfaces
│   ├── shared/                  # runtime-agnostic utilities
│   │   ├── api-types.ts
│   │   ├── bridge-contract.ts
│   │   ├── permissions.ts
│   │   ├── in-memory-fs.ts
│   │   ├── console-formatter.ts
│   │   ├── esm-utils.ts         # depends on sucrase
│   │   ├── errors.ts
│   │   ├── global-exposure.ts
│   │   └── require-setup.ts
│   ├── generated/               # build artifacts
│   │   ├── isolate-runtime.ts   # used by Node + Browser
│   │   └── polyfills.ts         # used by Node + Browser
│   ├── bridge/                  # guest-side polyfills (zero ivm imports)
│   │   ├── index.ts, fs.ts, os.ts, process.ts, ...
│   ├── node/                    # V8-specific implementation
│   │   ├── execution-driver.ts  # NodeExecutionDriver (imports ivm)
│   │   ├── bridge-setup.ts      # ivm.Reference wiring
│   │   ├── esm-compiler.ts      # ivm module compilation
│   │   ├── driver.ts            # createNodeDriver, NodeFileSystem
│   │   ├── execution-lifecycle.ts
│   │   ├── isolate-bootstrap.ts
│   │   ├── module-access.ts
│   │   └── module-resolver.ts
│   ├── browser/                 # Web Worker implementation
│   │   ├── runtime-driver.ts    # BrowserRuntimeDriver
│   │   ├── driver.ts            # createBrowserDriver
│   │   ├── worker.ts            # independent execution loop (no ivm)
│   │   └── worker-protocol.ts
│   └── python/                  # Pyodide implementation
│       └── driver.ts            # PyodideRuntimeDriver
└── package.json                 # deps: v8-isolate-package, pyodide, esbuild, ...
```

### Key architectural observations

1. **`execution.ts` is V8-specific, not generic.** The `ExecutionRuntime`
   interface references V8 isolate types in nearly every method signature. Only
   `NodeExecutionDriver` implements it.

2. **The browser worker has its own execution loop.** `browser/worker.ts`
   uses `eval()` + `sucrase` to run code — it never touches the V8 isolate layer or
   `execution.ts`. It imports the bridge guest code directly via
   `import("../bridge/index.js")` rather than injecting it as text.

3. **`NodeRuntime` is a generic facade.** Despite its name, `runtime.ts` has
   zero V8 isolate imports. It accepts any `NodeRuntimeDriverFactory` and
   delegates. Both Node (`createNodeRuntimeDriverFactory`) and Browser
   (`createBrowserRuntimeDriverFactory`) plug into it.

4. **Bridge guest code is shared.** The `bridge/` directory (fs, process, os
   polyfills) has zero V8 isolate imports. Node compiles it into an IIFE
   and injects via `context.eval()`. Browser imports it as an ES module.

5. **Generated code is shared.** `generated/isolate-runtime.ts` and
   `generated/polyfills.ts` are used by both Node (`bridge-setup.ts`,
   `execution.ts`) and Browser (`worker.ts`).

6. **V8 isolate imports are fully contained to `src/node/` + `execution.ts` +
   `isolate.ts`.** No other files import the V8 isolate package.

## Target State

### Package structure

```
packages/
├── core/         # @secure-exec/core
├── secure-exec-node/         # @secure-exec/node
├── browser/      # @secure-exec/browser
├── python/       # @secure-exec/python
├── secure-exec/              # secure-exec (barrel re-export)
├── runtime/
│   ├── node/                 # @secure-exec/runtime-node (kernel adapter)
│   └── python/               # @secure-exec/runtime-python (kernel adapter)
├── kernel/                   # @secure-exec/kernel (unchanged)
├── os/                       # (unchanged)
└── ...
```

### Dependency graph

```
@secure-exec/core
├── deps: buffer, sucrase, text-encoding-utf-8, whatwg-url
├── no: v8-isolate-package, pyodide, esbuild, node-stdlib-browser

@secure-exec/node
├── deps: @secure-exec/core, v8-isolate-package, esbuild, node-stdlib-browser
├── no: pyodide

@secure-exec/browser
├── deps: @secure-exec/core
├── no: v8-isolate-package, pyodide, esbuild, node-stdlib-browser

@secure-exec/python
├── deps: @secure-exec/core, pyodide
├── no: v8-isolate-package, esbuild

secure-exec (barrel)
├── deps: @secure-exec/core, @secure-exec/node, @secure-exec/browser, @secure-exec/python

@secure-exec/runtime-node (kernel adapter)
├── deps: @secure-exec/kernel, @secure-exec/node
├── no longer: secure-exec (the full bundle)

@secure-exec/runtime-python (kernel adapter)
├── deps: @secure-exec/kernel (unchanged, already doesn't import secure-exec)
```

## What Goes Where

### `@secure-exec/core`

Types, shared utilities, bridge guest code, generated build artifacts, runtime
facades, and the module resolution / package bundler logic.

**Files:**

| File | Notes |
|------|-------|
| `types.ts` | `VirtualFileSystem`, `SystemDriver`, `Permissions`, etc. |
| `runtime-driver.ts` | `RuntimeDriverFactory`, `NodeRuntimeDriver`, `PythonRuntimeDriver` interfaces |
| `runtime.ts` | `NodeRuntime` facade class (rename export to `Runtime` + keep `NodeRuntime` alias) |
| `python-runtime.ts` | `PythonRuntime` facade class |
| `fs-helpers.ts` | VFS utilities |
| `esm-compiler.ts` | ESM wrapper generation |
| `module-resolver.ts` | built-in specifier normalization |
| `package-bundler.ts` | module resolution, node_modules walk |
| `bridge-setup.ts` | `getInitialBridgeGlobalsSetupCode()` |
| `shared/*` | all files: api-types, bridge-contract, permissions, in-memory-fs, console-formatter, esm-utils, errors, global-exposure, require-setup |
| `generated/*` | isolate-runtime.ts, polyfills.ts (build artifacts) |
| `bridge/*` | all guest-side polyfill files |
| `isolate-runtime/` | source TypeScript for generated isolate-runtime |

**Build scripts (move to core):**
- `scripts/build-polyfills.mjs`
- `scripts/build-isolate-runtime.mjs`

**Exports:**

```typescript
// Facades
export { NodeRuntime, Runtime } from "./runtime.js";  // Runtime = NodeRuntime alias
export { PythonRuntime } from "./python-runtime.js";

// Types
export type { SystemDriver, VirtualFileSystem, NetworkAdapter, Permissions, ... };
export type { RuntimeDriverFactory, NodeRuntimeDriverFactory, ... };
export type { ExecOptions, ExecResult, RunResult, StdioHook, ... };

// Utilities
export { allowAll, allowAllFs, allowAllNetwork, ... } from "./shared/permissions.js";
export { createInMemoryFileSystem } from "./shared/in-memory-fs.js";

// Internal (for runtime packages)
// Exposed via package.json "exports" subpaths, NOT the main entry
// e.g. "@secure-exec/core/internals"
export { ... } from "./package-bundler.js";
export { ... } from "./bridge-loader.js";
export { ... } from "./generated/isolate-runtime.js";
export { ... } from "./generated/polyfills.js";
export { ... } from "./shared/bridge-contract.js";
// etc.
```

**Timeout constants move here:** `TIMEOUT_ERROR_MESSAGE` and
`TIMEOUT_EXIT_CODE` currently live in `isolate.ts` but are imported by
`python/driver.ts`. Extract them to `shared/constants.ts` in core.

### `@secure-exec/node`

V8-isolate-specific execution engine.

**Files:**

| File | Notes |
|------|-------|
| `execution.ts` | V8 execution loop (`executeWithRuntime`) |
| `isolate.ts` | `createIsolate`, deadline/timeout utilities |
| `bridge-loader.ts` | esbuild bridge compilation |
| `polyfills.ts` | esbuild stdlib bundling |
| `node/*` | all 8 files (execution-driver, bridge-setup, esm-compiler, driver, etc.) |

**Exports:**

```typescript
export { NodeExecutionDriver } from "./node/execution-driver.js";
export { createNodeDriver, NodeFileSystem, createDefaultNetworkAdapter } from "./node/driver.js";
export { createNodeRuntimeDriverFactory } from "./node/driver.js";
export type { NodeDriverOptions, ModuleAccessOptions, ... };
```

**Dependencies:** `@secure-exec/core`, V8 isolate package, `esbuild`,
`node-stdlib-browser`

### `@secure-exec/browser`

Web Worker-based execution.

**Files:**

| File | Notes |
|------|-------|
| `browser/*` | runtime-driver.ts, driver.ts, worker.ts, worker-protocol.ts |

Note: `browser-runtime.ts` is not needed — core already exports `NodeRuntime`
(the facade), and browser exports its driver factories. Consumers compose them
the same way they do today.

**Exports:**

```typescript
export { createBrowserDriver, createBrowserNetworkAdapter, createOpfsFileSystem } from "./driver.js";
export { createBrowserRuntimeDriverFactory } from "./runtime-driver.js";
export type { BrowserDriverOptions, BrowserRuntimeDriverFactoryOptions, ... };
```

**Dependencies:** `@secure-exec/core`

**Worker bundling note:** `browser/worker.ts` imports from core internals
(`bridge/index.js`, `generated/*`, `package-bundler`, `shared/*`). These are
resolved at bundle time (Vite/esbuild). The worker must be pre-bundled or the
consuming bundler must resolve `@secure-exec/core` subpath imports.

### `@secure-exec/python`

Pyodide-based execution.

**Files:**

| File | Notes |
|------|-------|
| `python/driver.ts` | `PyodideRuntimeDriver` |

**Exports:**

```typescript
export { createPyodideRuntimeDriverFactory, PyodideRuntimeDriver } from "./driver.js";
```

**Dependencies:** `@secure-exec/core`, `pyodide`

**Change:** Replace `import { TIMEOUT_ERROR_MESSAGE, TIMEOUT_EXIT_CODE } from
"../isolate.js"` with import from `@secure-exec/core/constants` (or
`@secure-exec/core`).

### `secure-exec` (barrel)

Backward-compatible re-export package. All existing `import { ... } from
"secure-exec"` statements continue to work unchanged.

```typescript
// Core
export * from "@secure-exec/core";

// Node
export * from "@secure-exec/node";

// Browser (subpath export)
// package.json: "./browser" → "@secure-exec/browser" + core re-exports

// Python
export { PythonRuntime } from "@secure-exec/core";
export { createPyodideRuntimeDriverFactory, PyodideRuntimeDriver } from "@secure-exec/python";
```

**`package.json` exports:**

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./browser": "./dist/browser-runtime.js"
  }
}
```

The `./browser` subpath re-exports from `@secure-exec/core` +
`@secure-exec/browser` to preserve the existing `import { ... } from
"secure-exec/browser"` path.

## Build Pipeline

### Current

```
secure-exec:
  1. build:polyfills        → generated/polyfills.ts
  2. build:isolate-runtime   → generated/isolate-runtime.ts
  3. build:bridge            → dist/bridge.js (IIFE)
  4. tsc                     → dist/**
```

### Target

```
@secure-exec/core:
  1. build:polyfills          → generated/polyfills.ts
  2. build:isolate-runtime    → generated/isolate-runtime.ts
  3. tsc                      → dist/**

@secure-exec/node:        (depends on core)
  1. build:bridge             → dist/bridge.js (IIFE from core's bridge/ source)
  2. tsc                      → dist/**

@secure-exec/browser:     (depends on core)
  1. tsc                      → dist/**

@secure-exec/python:      (depends on core)
  1. tsc                      → dist/**

secure-exec:              (depends on all above)
  1. tsc                      → dist/**
```

**Turbo pipeline** ensures `core` builds before the runtime packages, and the
barrel builds last.

**Bridge compilation for Node:** The Node package's `build:bridge` step
compiles `@secure-exec/core`'s bridge source into an IIFE. It can reference
core's source via a workspace-relative path or core can export the bridge
entry path.

## Test Strategy

### Tests stay in `secure-exec`

Per the `runtime-driver-test-suite-structure` contract, shared test suites
must remain centralized. The barrel `secure-exec` package keeps the full test
directory:

```
packages/secure-exec/tests/
├── test-suite/              # shared suites (unchanged)
├── runtime-driver/          # driver-specific tests (unchanged)
├── kernel/                  # cross-runtime integration (unchanged)
├── project-matrix.test.ts   # compatibility fixtures (unchanged)
└── test-utils.ts            # helper factories (unchanged)
```

Test imports change from `../../src/index.js` to the appropriate package:

```typescript
// Before
import { NodeRuntime, createNodeDriver, ... } from "../../src/index.js";

// After — tests can import from the barrel (no change needed)
import { NodeRuntime, createNodeDriver, ... } from "secure-exec";
```

Since the barrel re-exports everything, **most test imports need zero
changes.** Tests that import internal modules (e.g.,
`../../src/shared/global-exposure.js`) would import from
`@secure-exec/core/internals` or similar subpath.

### Runtime-specific test dependencies

Test configs already separate targets:

- `vitest.config.ts` — default (Node tests)
- `vitest.browser.config.ts` — browser tests

These continue to work. The only change is that `devDependencies` in the
barrel's `package.json` must include all runtime packages.

## Consumer Migration

### `packages/runtime/node/` (kernel adapter)

```diff
- import { NodeExecutionDriver, createNodeDriver, allowAllChildProcess } from "secure-exec";
- import type { CommandExecutor, VirtualFileSystem } from "secure-exec";
+ import { NodeExecutionDriver, createNodeDriver } from "@secure-exec/node";
+ import { allowAllChildProcess } from "@secure-exec/core";
+ import type { CommandExecutor, VirtualFileSystem } from "@secure-exec/core";
```

Or: continue importing from `secure-exec` barrel (no change needed, just
heavier dependency).

### `packages/typescript/`

```diff
- import { NodeRuntime } from "secure-exec";
- import type { NodeRuntimeDriverFactory, SystemDriver } from "secure-exec";
+ import { NodeRuntime } from "@secure-exec/core";
+ import type { NodeRuntimeDriverFactory, SystemDriver } from "@secure-exec/core";
```

### `packages/playground/`

```diff
- import { NodeRuntime, allowAll, createBrowserDriver, ... } from "secure-exec/browser";
+ import { NodeRuntime, allowAll } from "@secure-exec/core";
+ import { createBrowserDriver, createBrowserRuntimeDriverFactory } from "@secure-exec/browser";
```

Or: continue importing from `secure-exec/browser` barrel (no change needed).

### External consumers

No breaking changes. `import { ... } from "secure-exec"` continues to work.
Consumers can optionally switch to fine-grained imports to reduce bundle
size.

## Migration Phases

### Phase 1: Extract `@secure-exec/core`

1. Create `packages/core/` with the shared files.
2. Move build scripts (`build-polyfills`, `build-isolate-runtime`).
3. Move `shared/`, `bridge/`, `generated/`, `isolate-runtime/`, types,
   facades, and module resolution code.
4. Extract timeout constants from `isolate.ts` to `shared/constants.ts`.
5. Set up `package.json` with `exports` map including internal subpaths.
6. Update turbo pipeline: core builds before secure-exec.
7. Have `secure-exec` depend on `@secure-exec/core` and re-export.
8. Verify all tests pass with no import changes (tests still use secure-exec
   barrel).

### Phase 2: Extract `@secure-exec/node`

1. Create `packages/secure-exec-node/`.
2. Move `execution.ts`, `isolate.ts`, `bridge-loader.ts`, `polyfills.ts`,
   and `node/`.
3. Set up `build:bridge` step that compiles core's bridge source.
4. Have `secure-exec` depend on `@secure-exec/node` and re-export.
5. Optionally update `packages/runtime/node/` to depend on
   `@secure-exec/node` instead of `secure-exec`.
6. Verify all Node tests pass.

### Phase 3: Extract `@secure-exec/browser`

1. Create `packages/browser/`.
2. Move `browser/`.
3. Update worker.ts imports to use `@secure-exec/core` subpaths.
4. Have `secure-exec` depend on `@secure-exec/browser` and re-export via
   `./browser` subpath.
5. Verify browser tests pass.

### Phase 4: Extract `@secure-exec/python`

1. Create `packages/python/`.
2. Move `python/` and `python-runtime.ts`.
3. Update import of timeout constants to use `@secure-exec/core`.
4. Have `secure-exec` depend on `@secure-exec/python` and re-export.
5. Verify Python tests pass.

### Phase 5: Cleanup

1. The `secure-exec` package becomes a thin barrel with no source code of its
   own (just re-exports + test directory).
2. Update docs pages per CLAUDE.md doc requirements.
3. Update `docs-internal/arch/overview.md` with new package map.
4. Update relevant contracts if any behavioral boundaries changed.

## Subpath Exports Design

`@secure-exec/core` needs to expose internal modules for the runtime packages
without making them part of the public API. Use `package.json` exports with a
convention:

```json
{
  "name": "@secure-exec/core",
  "exports": {
    ".": "./dist/index.js",
    "./internal/bridge-loader": "./dist/bridge-loader.js",
    "./internal/generated/isolate-runtime": "./dist/generated/isolate-runtime.js",
    "./internal/generated/polyfills": "./dist/generated/polyfills.js",
    "./internal/package-bundler": "./dist/package-bundler.js",
    "./internal/shared/*": "./dist/shared/*.js"
  }
}
```

The `internal/` prefix signals that these are not part of the stable public
API. Runtime packages (`@secure-exec/node`, `@secure-exec/browser`) can
import from them, but external consumers should not.

## Risks and Open Questions

### Bridge compilation for Node

The Node package needs to compile core's bridge source into an IIFE bundle.
Options:

1. **Core exports the bridge entry path** — Node's build script resolves it
   via `require.resolve("@secure-exec/core/internal/bridge")` and runs
   esbuild on it.
2. **Core pre-builds the IIFE** — Core's build step produces `dist/bridge.js`
   and exports it. Node just reads the file.
3. **Core exports the raw source string** — A function
   `getRawBridgeCode()` that returns the compiled IIFE. Node calls it at
   runtime (current approach, no change needed).

Option 3 is simplest — `bridge-loader.ts` stays in core, and Node imports
`getRawBridgeCode()` from core. The auto-compilation-on-demand behavior
(esbuild at dev time) stays in core too. **This is the recommended approach.**

### Browser worker bundling

The browser worker imports many core internals (`bridge/index.js`,
`generated/*`, `package-bundler`, `shared/*`). Today these are resolved as
relative imports within the same package. After the split, they become
cross-package imports from `@secure-exec/core`.

This works for bundlers (Vite, esbuild, webpack) which resolve workspace
dependencies. But it changes the worker's import graph to cross package
boundaries, which may affect tree-shaking or bundling strategies.

**Mitigation:** The browser worker is already expected to be bundled before
deployment. The import path change is transparent to bundlers.

### NodeRuntime naming

`NodeRuntime` is the facade class used by both Node and Browser. Its name is
misleading for browser consumers. Options:

1. **Keep `NodeRuntime` name** — it's the established API. Add a `Runtime`
   alias in core for new consumers.
2. **Rename to `Runtime`** — breaking change. Add `NodeRuntime` as deprecated
   alias.
3. **Keep as-is** — it's a facade over `NodeRuntimeDriver`, and the browser
   driver implements that interface. The name reflects the *interface*, not the
   *implementation*.

**Recommendation:** Option 1. Export both `Runtime` and `NodeRuntime` from
core. Document `Runtime` as the preferred name going forward. No breaking
change.

### Test file internal imports

A few test files import internal modules directly (e.g.,
`../../src/shared/global-exposure.js`). After the split, these paths break.
Options:

1. **Re-export needed internals from the barrel** — e.g., add
   `HARDENED_NODE_CUSTOM_GLOBALS` to the secure-exec barrel's exports.
2. **Import from core's internal subpath** — tests use
   `@secure-exec/core/internal/shared/global-exposure`.
3. **Restructure the test** — move the assertion to not need the internal
   import.

**Recommendation:** Option 1 where possible, option 2 as fallback.

### Monorepo package count

This adds 3 new packages (`core`, `node`, `browser`, `python` — 4 total, but
`python` could be deferred). More packages means more turbo task nodes and
slightly more CI overhead.

**Mitigation:** Turbo caches aggressively. The core package changes
infrequently. Runtime packages only rebuild when their own code changes.

## Contracts Affected

The following contracts should be reviewed and potentially updated:

- **`node-runtime`** — references `packages/secure-exec/isolate-runtime/src/`.
  Update path to `packages/core/isolate-runtime/src/`.
- **`isolate-runtime-source-architecture`** — same path update.
- **`compatibility-governance`** — may need to document the new package
  structure. The fixture matrix is unaffected (fixtures are black-box Node
  projects).
- **`runtime-driver-test-suite-structure`** — confirm tests stay in the
  barrel package. No structural change needed.
