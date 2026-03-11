# Sandboxed Node TODOs

## High level

- Review the node driver
- Plan desired minimal driver that we'll use in rivet
- Add codemode example
- Add just-bash example
- Test with
    - Pi
    - Express
    - Hono
    - ???

## Todo

- [x] Remove all `@hono/node-server` bridge integration and load it only from sandboxed `node_modules`.
  - Remove bridge module and exports (`packages/secure-exec/src/bridge/hono-node-server.ts`, `packages/secure-exec/src/bridge/index.ts`).
  - Remove `@hono/node-server` special-cases in runtime resolution/execution (`packages/secure-exec/src/index.ts`, `packages/secure-exec/src/shared/require-setup.ts`).
  - Remove `honoServe`/`honoClose` from adapter/types if no longer needed (`packages/secure-exec/src/types.ts`, `packages/secure-exec/src/shared/permissions.ts`, `packages/secure-exec/src/node/driver.ts`).

- [x] Implement Node built-in HTTP server bridging (`http.createServer`) without third-party module bridges.
  - Add server listen/close/address request-dispatch bridge hooks in runtime setup (`packages/secure-exec/src/index.ts`).
  - Implement server-side compatibility in network bridge (`packages/secure-exec/src/bridge/network.ts`).
  - Add Node driver implementation backed by `node:http` (`packages/secure-exec/src/node/driver.ts`, `packages/secure-exec/src/types.ts`, `packages/secure-exec/src/shared/permissions.ts`).

- [x] Expose host-side request path to sandbox servers via `sandbox.network.fetch(...)`.
  - Provide a NodeRuntime-level network facade and document concurrent run/fetch pattern (`packages/secure-exec/src/index.ts`, `README.md`, `examples/hono/README.md`).
  - Validate end-to-end from loader to runner (`examples/hono/loader/src/index.ts`, `examples/hono/runner/src/index.ts`).

- [x] Fix `run()` ESM semantics to match docs (return module exports/default instead of evaluation result).
  - Fix: `runESM` now returns copied entry-module namespace exports (default + named) after evaluation.
  - `packages/secure-exec/src/index.ts`, `packages/secure-exec/tests/index.test.ts`

- [x] Fix dynamic import execution semantics so imports are not eagerly evaluated before user code.
  - Fix: precompile step now resolves/compiles only; instantiate/evaluate occur on first `import()` reach.
  - `packages/secure-exec/src/index.ts`, `packages/secure-exec/tests/index.test.ts`

- [x] Remove brittle require-path hacks/monkeypatches and replace with minimal, explicit compatibility behavior.
  - Current hacks include `chalk`, `supports-color`, `tty`, `constants`, `v8`, and `util/url/path` patching.
  - `packages/secure-exec/src/shared/require-setup.ts`

- [x] Decide and enforce sandbox permission default model (allow-by-default vs deny-by-default); tighten if strict mode is desired.
  - Fixed by flipping permission checks and env filtering to deny-by-default, and by exporting explicit `allowAll*` helpers for opt-in access.
  - `packages/secure-exec/src/shared/permissions.ts`

- [x] Make console capture robust for circular objects (avoid `JSON.stringify` throw paths in logging).
  - `packages/secure-exec/src/index.ts`

- [x] Reconcile `docs/node-compatability.mdx` with current runtime behavior.
  - Fix: completed in `codify-stdlib-support-policy` (remove stale third-party bridge notes, align `http`/`https`/`http2` sections, add support tiers).

- [x] Close or explicitly codify missing `fs` APIs listed in compatibility docs.
  - Fix: completed in `codify-stdlib-support-policy` (`access`/`realpath` documented as implemented; missing APIs now use deterministic unsupported errors).

- [x] Decide `child_process.fork()` support level.
  - Fix: completed in `codify-stdlib-support-policy` (`fork` marked unsupported with deterministic `child_process.fork is not supported in sandbox` error).

- [x] Tighten crypto support policy and implementation.
  - Fix: completed in `codify-stdlib-support-policy` (explicit insecurity warning for `getRandomValues`, deterministic `crypto.subtle.*` unsupported errors, tiered policy documented).

- [x] Track unimplemented core modules from compatibility docs as explicit product decisions.
  - Fix: completed in `codify-stdlib-support-policy` (Tier 4 Deferred vs Tier 5 Unsupported classifications with rationale and runtime policy).

## Security & Hardening

- [x] Filter Python `exec(..., { env })` overrides through `permissions.env`.
  - Fix: `PyodideRuntimeDriver.exec()` now applies the shared `filterEnv(...)` gate before env overrides reach the worker, and runtime-driver tests cover both denied-by-default and explicitly-allowed cases.
  - `packages/secure-exec/src/python/driver.ts`, `packages/secure-exec/tests/runtime-driver/python.test.ts`

- [x] Bridge `crypto.getRandomValues` / `randomUUID` to host `node:crypto` instead of `Math.random()`.
  - Fix: runtime now wires host `node:crypto` references from `packages/secure-exec/src/index.ts` into the isolate and uses them in `packages/secure-exec/src/bridge/process.ts`.
  - Fail-closed contract: bridge throws deterministic `crypto.getRandomValues is not supported in sandbox` / `crypto.randomUUID is not supported in sandbox` errors when host entropy hooks are unavailable.

- [ ] Add transfer size limits on base64 file I/O across the isolate boundary.
  - `packages/secure-exec/src/index.ts` (~line 1138, `readFileBinaryRef` / `writeFileBinaryRef`)
  - No cap currently; a large file read can OOM the host process.

- [ ] Validate size before host-side `JSON.parse` calls.
  - `packages/secure-exec/src/index.ts` (10 unvalidated `JSON.parse` calls)
  - Crafted large payloads from sandbox can OOM the host process.

- [x] Make bridge globals non-writable on `globalThis`.
  - Fix: active-handle lifecycle globals now install via `Object.defineProperty` with `writable: false` and `configurable: false`, preventing sandbox overwrite of `_registerHandle` / `_unregisterHandle` / `_waitForActiveHandles`.
  - `packages/secure-exec/src/bridge/active-handles.ts`, `packages/secure-exec/tests/index.test.ts`

- [ ] Remove default host-side console buffering; drop logs by default and expose optional streaming hook.
  - `packages/secure-exec/src/index.ts`, `packages/secure-exec/src/execution.ts`

- [ ] Add global host resource budgets (output bytes, bridge-call rate, timer count, child-process count).
  - `packages/secure-exec/src/index.ts`, `packages/secure-exec/src/bridge/process.ts`, `packages/secure-exec/src/shared/permissions.ts`

- [ ] Cap and hard-fail child-process output buffering in sync APIs.
  - `packages/secure-exec/src/index.ts` (`spawnSyncRef` / `execSyncRef`)

- [ ] Ensure child-process sessions are always cleaned up on timeout/dispose/error paths.
  - `packages/secure-exec/src/index.ts` (`sessions` map in child-process bridge)

- [ ] Add request/response body limits for driver HTTP paths (including decompression).
  - `packages/secure-exec/src/node/driver.ts` (`httpServerListen`, `fetch`, `httpRequest`)

- [ ] Fix HTTP server lifecycle leaks when executions time out or are disposed.
  - `packages/secure-exec/src/execution.ts`, `packages/secure-exec/src/index.ts`, `packages/secure-exec/src/node/driver.ts`

## API Coverage Gaps

- [ ] Add missing `fs` APIs: `cp`, `cpSync`, `glob`, `globSync`, `opendir`, `mkdtemp`, `mkdtempSync`, `statfs`, `statfsSync`, `readv`, `readvSync`, `fdatasync`, `fdatasyncSync`, `fsync`, `fsyncSync`.
  - `packages/secure-exec/src/bridge/fs.ts`
  - Goal: full `node:fs` coverage for core file operations.

- [ ] Implement deferred `fs` APIs: `chmod`, `chown`, `link`, `symlink`, `readlink`, `truncate`, `utimes`, `watch`, `watchFile`.
  - `packages/secure-exec/src/bridge/fs.ts`
  - Currently throw deterministic unsupported errors.

- [ ] Add missing `http`/`https` APIs: connection pooling (`Agent`), keep-alive tuning, WebSocket upgrade, trailer headers, socket-level events.
  - `packages/secure-exec/src/bridge/network.ts`
  - Current implementation is fetch-based and fully buffered with no socket-level control.

- [ ] Fix `v8.serialize`/`v8.deserialize` to use V8 structured serialization instead of `JSON.stringify`/`JSON.parse`.
  - `packages/secure-exec/isolate-runtime/src/inject/bridge-initial-globals.ts` (~line 51)
  - Bug: current implementation silently produces JSON instead of V8 binary format. Code depending on structured clone semantics (`Map`, `Set`, `RegExp`, circular refs) will get wrong results.

## Performance & Correctness

- [ ] Add `stat` and `exists` methods to `VirtualFileSystem` interface.
  - `packages/secure-exec/src/types.ts`, `packages/secure-exec/src/fs-helpers.ts`
  - Current `stat()` and `exists()` read entire file contents; O(file size) when should be O(1). Also a DoS vector via large files.

- [ ] Split `index.ts` into focused modules.
  - `packages/secure-exec/src/index.ts` (1,956 lines and growing)
  - Extract: `isolate.ts`, `module-resolver.ts`, `esm-compiler.ts`, `bridge-setup.ts`, `execution.ts`.

- [ ] Replace magic O_* flag numbers with named constants.
  - `packages/secure-exec/src/bridge/fs.ts` (~line 690)
  - Hardcoded integers (577, 578, 1089, etc.) are Linux-specific and undocumented.

- [ ] Fix `readDirWithTypes` N+1 I/O pattern.
  - `packages/secure-exec/src/fs-helpers.ts` (~line 112)
  - Calls `readDir` per entry to check if directory; add `readDirWithTypes` or `stat` to `VirtualFileSystem`.

- [ ] Make `rename` atomic or document limitation.
  - `packages/secure-exec/src/fs-helpers.ts` (lines 90-92)
  - Currently read + write + delete; crash between steps can duplicate or lose data.

- [ ] Make ESM module reverse-lookup O(1) to avoid O(n^2) resolver work on large import graphs.
  - `packages/secure-exec/src/index.ts` (ESM resolver / module cache lookup)

- [ ] Add resolver memoization (positive + negative) to avoid repeated miss probes across `require()`/`import()`.
  - `packages/secure-exec/src/package-bundler.ts`, `packages/secure-exec/src/shared/require-setup.ts`, `packages/secure-exec/src/index.ts`

- [ ] Document and verify package manager support for `node_modules` loading behavior.
  - Cover expected resolver behavior and known caveats for npm, pnpm, yarn, and bun installs.
  - Add/maintain compatibility fixtures that exercise transitive dependency loading across supported package manager layouts.

- [ ] Cap and cache `package.json` parsing in resolver paths.
  - `packages/secure-exec/src/package-bundler.ts`

- [ ] Reduce module-access lookup overhead (prefix index + canonicalization memoization).
  - `packages/secure-exec/src/node/module-access.ts`

- [ ] Replace whole-file fd sync emulation with offset-based host read/write primitives.
  - `packages/secure-exec/src/bridge/fs.ts`
