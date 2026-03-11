# Sandboxed Node Friction Log

## 2026-03-10

1. **[resolved]** TypeScript compilation needed sandboxing without baking compiler behavior into the core runtime.
   - Symptom: keeping TypeScript handling inside `NodeRuntime` blurred the runtime contract, risked host-memory pressure during compilation, and forced browser/runtime surfaces to inherit TypeScript-specific policy.
   - Fix: core `secure-exec` now stays JavaScript-only, while sandboxed TypeScript typecheck/compile flows move to the separate `@secure-exec/typescript` package.
   - Compatibility trade-off: callers that want TypeScript must perform an explicit compile/typecheck step before executing emitted JavaScript in the runtime.

## 2026-03-09

1. **[resolved]** Python `exec()` env overrides bypassed `permissions.env`.
   - Symptom: `PyodideRuntimeDriver` filtered constructor-level runtime env, but per-execution `exec(..., { env })` overrides were forwarded into the worker without permission filtering.
   - Fix: Python `exec()` now filters override keys through the shared `filterEnv(...)` path before applying them in the worker, matching Node runtime behavior.
   - Follow-up: keep future Python capability additions on the same host-side permission boundary so worker-facing APIs never receive unapproved capability input.

## 2026-03-03

1. **[resolved]** Python runtime contract split needed explicit cross-runtime `exec()` parity and warm-state guardrails.
   - Symptom: introducing Python execution risked mixing Node-only runtime-driver contracts into Python APIs and drifting `exec()` timeout/error semantics across runtimes.
   - Fix: split runtime-driver interfaces into Node/Python contracts, added `PythonRuntime` + `PyodideRuntimeDriver`, and enforced a shared host-facing `exec()` result contract.
   - Compatibility trade-off: `PythonRuntime` instances are intentionally warm/shared per instance; callers needing fresh interpreter state must create/terminate runtime instances explicitly.
2. **[resolved]** Python package installation/loading pathways were intentionally out-of-scope for the first Python runtime increment.
   - Symptom: enabling package installation in the same change as the core runtime-driver split would widen attack surface and blur permission policy scope.
   - Fix: Python package install/load pathways now fail deterministically with `ERR_PYTHON_PACKAGE_INSTALL_UNSUPPORTED`.
   - Follow-up: define explicit package governance and permission policy before enabling runtime package install/load capabilities.

## 2026-03-02

1. **[resolved]** Browser runtime execution was intentionally disabled during runtime-driver boundary refactor.
   - Symptom: browser entrypoints threw deterministic unsupported errors, so runtime-driver integration coverage could only exercise Node execution paths.
   - Fix: restored browser runtime through `NodeRuntime` driver composition (`createBrowserDriver` + `createBrowserRuntimeDriverFactory`), moved worker lifecycle/marshalling into browser runtime-driver implementation, and added shared node/browser runtime-contract integration suites plus browser runner wiring.

## 2026-03-01

1. **[resolved]** `NodeRuntime` constructor ownership drifted between driver and direct adapter options.
   - Symptom: runtime capability and config ownership was split across `NodeRuntime` fallbacks and `createNodeDriver`, which made permission defaults and runtime injection behavior harder to reason about.
   - Fix: `NodeRuntime` now requires a `driver`, reads `processConfig`/`osConfig` from `driver.runtime`, and no longer accepts direct constructor adapters/permissions.
   - Follow-up: a dedicated pass should continue moving remaining `isolated-vm` execution internals from `NodeRuntime` into the Node driver implementation.
2. **[resolved]** Browser runtime surface needed temporary de-scope during driver boundary refactor.
   - Symptom: maintaining Worker/browser runtime paths during Node driver ownership changes increased refactor risk and cross-runtime drift.
   - Fix: browser package exports were removed for this phase and browser entrypoints now return deterministic unsupported errors until follow-up restoration.

3. **[resolved]** Default console capture buffered unbounded host memory.
   - Symptom: runtime execution accumulated console output in host-managed `stdout`/`stderr` arrays by default, enabling memory amplification under high-volume logs.
   - Fix: runtime now drops console output by default and exposes an explicit streaming hook (`onStdio`) for host-controlled log handling.
   - Compatibility trade-off: `exec()`/`run()` no longer mirror Node stdout/stderr buffering by default; result payloads no longer expose `stdout`/`stderr` fields, so consumers that need logs must opt into hook-based streaming.
   - Migration note: switch any `result.stderr` checks to `result.errorMessage` for runtime error assertions.
4. **[resolved]** Node module loading depended on allowlist projection setup and split filesystem paths.
   - Symptom: sandbox `node_modules` availability varied by `moduleAccess.allowPackages` setup and base filesystem mount location, which added resolver complexity and setup fragility.
   - Fix: Node driver now always composes a read-only `/app/node_modules` overlay from `<cwd>/node_modules`, even without a base filesystem adapter. Overlay reads are canonical-path scoped to `<cwd>/node_modules`; writes/mutations remain denied; `.node` native addons are rejected.
   - Compatibility trade-off: allowlist-scoped dependency visibility was removed in favor of scoped full-overlay readability under `<cwd>/node_modules`; callers needing stricter package-level exposure must enforce it outside runtime for now.
5. TODO: document extension attack vectors and hardening guidance.
   - Symptom: extension-oriented threat scenarios are not documented as a consolidated runtime/bridge/driver risk model.
   - Next step: add extension-focused vectors and mitigations to `docs-internal/attack-vectors.md`, including memory amplification/buffering abuse, CPU amplification, timer/event-rate amplification, and extension host-hook abuse paths.

## 2026-02-28

1. **[resolved]** Reusing host `node_modules` lacked a bounded runtime contract.
   - Symptom: loading workspace dependencies required ad-hoc filesystem setup, and direct host filesystem use risked widening module trust boundaries.
   - Fix: initially added driver `moduleAccess` projection (`cwd` + explicit `allowPackages`) with dependency-closure discovery; later superseded by always-on scoped `/app/node_modules` overlay rooted at `<cwd>/node_modules`.
   - Compatibility note: this path targets `node_modules` installs and intentionally fails closed on out-of-scope symlink/canonical-path resolution.
2. **[resolved]** Isolate bootstrap code relied on runtime template-string assembly.
   - Symptom: helper paths like `getRequireSetupCode`, bridge bootstrap wrappers, and inline `context.eval` setup snippets were assembled in host runtime files, which made isolate-executed code harder to audit and easier to regress.
   - Fix: moved host-injected isolate scripts into static sources under `packages/secure-exec/isolate-runtime/`, added `build:isolate-runtime` to compile them into `dist/isolate-runtime/**` and generate `src/generated/isolate-runtime.ts`, and updated Node/browser runtime loaders to consume these static artifacts via manifest IDs.

2. **[resolved]** Bridge/global type contracts drifted across host wiring, bridge modules, and isolate-runtime declarations.
   - Symptom: host injection keys, bridge global declarations, and isolate-runtime global types were defined ad hoc in multiple files, leaving boundary typing inconsistent and prone to regressions.
   - Fix: added canonical shared bridge contract definitions in `packages/secure-exec/src/shared/bridge-contract.ts`, migrated bridge modules and `src/index.ts` wiring to shared keys/types, coupled isolate-runtime declarations to shared types via type-only imports, and added `packages/secure-exec/tests/bridge-registry-policy.test.ts` to enforce key/type registry consistency.

## 2026-02-27

1. **[resolved]** Runtime CPU budget enforcement was not wired end-to-end.
   - Symptom: option-level timeout helpers existed, but execution paths still risked unbounded loops or post-timeout state reuse.
   - Fix: added/standardized `cpuTimeLimitMs` support, enforced shared execution deadlines across CJS/ESM/dynamic-import/active-handle paths, normalized timeout contract (`code: 124`, `CPU time limit exceeded`), and recycled isolate state after timeout.

2. **[resolved]** Runtime timing side-channel hardening needed a security-first default.
   - Symptom: sandboxed code observed advancing clocks by default, which increased timing side-channel signal quality.
   - Fix: `timingMitigation` now defaults to `"freeze"` and keeps `"off"` as a compatibility opt-out; frozen mode hardens `Date.now()`, `performance.now()`, and process timing helpers while removing `SharedArrayBuffer`.

3. **[resolved]** Security model contract was fragmented across internal notes.
   - Symptom: threat model and trust-boundary assumptions were not published in one canonical docs page.
   - Fix: added canonical docs page `docs/security-model.mdx` and docs navigation entry in `docs/docs.json`; comparison guidance now references this page.

4. **[resolved]** Active-handle bridge lifecycle hooks were mutable from sandboxed code.
   - Symptom: sandbox code could overwrite `_registerHandle`, `_unregisterHandle`, or `_waitForActiveHandles` on `globalThis`, weakening execution completion guarantees.
   - Fix: active-handle lifecycle globals are now installed with non-writable/non-configurable descriptors via `Object.defineProperty` in `packages/secure-exec/src/bridge/active-handles.ts`, with regression coverage in runtime tests.

5. **[resolved]** Unbounded isolate-boundary payload parsing and base64 transfer could OOM the host.
   - Symptom: isolate-originated JSON payloads and base64 file-transfer strings were accepted without host-side size checks, so crafted oversized payloads could force large allocations before runtime validation.
   - Fix: added deterministic payload guards in `packages/secure-exec/src/index.ts` for base64 file transfer (`readFileBinaryRef`/`writeFileBinaryRef`) and all host-side isolate-originated JSON parsing paths; overflow now fails with `ERR_SANDBOX_PAYLOAD_TOO_LARGE` instead of process-fatal behavior. Limits now support bounded host configuration for compatibility tuning without allowing disablement.

6. **[resolved]** `crypto.getRandomValues()` / `crypto.randomUUID()` used weak randomness fallback.
   - Symptom: bridge crypto polyfill generated entropy with `Math.random()`, creating silent security risk and non-Node randomness semantics.
   - Fix: bridge now delegates randomness to host `node:crypto` (`randomFillSync` / `randomUUID`) via isolate bridge hooks and fails closed with deterministic `crypto.<api> is not supported in sandbox` errors when host entropy is unavailable.

7. **[resolved]** Filesystem metadata helpers used content-probing and rename emulation.
   - Symptom: helper `stat()` and `exists()` could read file contents (`O(file size)`), `readDirWithTypes()` used per-entry probe loops, and `rename` used copy-write-delete fallback with crash-window risk.
   - Fix: `VirtualFileSystem` now exposes metadata-native `stat`, typed `readDirWithTypes`, and driver `rename`; runtime/worker/package resolver paths now use these APIs directly, and OPFS rename now returns explicit `ENOSYS` instead of silent non-atomic emulation.

8. **[resolved]** Custom bridge/runtime globals had inconsistent descriptor hardening.
   - Symptom: runtime-owned global bindings were exposed through mixed assignment patterns, letting sandbox code overwrite control-plane globals in some paths.
   - Fix: custom global exposure now uses shared helper policy in `packages/secure-exec/src/shared/global-exposure.ts` with hardened defaults (`writable: false`, `configurable: false`), plus explicit mutable runtime-state allowlist entries. Node stdlib globals remain compatibility-oriented and are not force-frozen by this policy.

9. **[resolved]** Isolate-runtime source layout and typing contracts were hard to maintain.
   - Symptom: isolate inject scripts were kept in a flat directory with repetitive `globalThis as Record<string, unknown>` casts, making global contracts harder to audit and weakening type safety.
   - Fix: moved inject sources to `packages/secure-exec/isolate-runtime/src/inject/`, moved shared helpers/contracts to `packages/secure-exec/isolate-runtime/src/common/`, updated isolate-runtime build manifest generation for `src/inject` entrypoints with bundled shared modules, and added dedicated isolate-runtime typecheck coverage via `tsconfig.isolate-runtime.json`.

10. TODO: convert IO handling to a generalized implementation reusable across runtimes.
   - Symptom: runtime-specific IO paths are still implemented separately, which increases duplication and behavior drift risk between Node and browser runtime surfaces.
   - Next step: define a shared IO abstraction (request/response/stream/error contracts) and migrate runtime-specific adapters to that interface with parity tests across runtimes.

11. TODO: verify timer and event-rate controls for runtime abuse resistance.
   - Symptom: control-plane limits for `setInterval`, `setImmediate`, and high-frequency event emission are not explicitly validated end-to-end, which risks starvation/DoS behavior under hostile workloads.
   - Next step: add dedicated stress/regression coverage that asserts bounded scheduling/event throughput and deterministic failure behavior when limits are exceeded.

12. TODO: remove temporary `@ts-nocheck` bypasses in bridge/browser internals.
   - Symptom: type/build/test green status currently depends on file-level `@ts-nocheck` in bridge/browser modules, which suppresses useful type-safety guarantees.
   - Next step: replace each bypass with concrete type fixes and keep `pnpm check-types`, `pnpm build`, and `pnpm test` passing without `@ts-nocheck`.

## 2026-02-26

1. **[resolved]** Bridging `@hono/node-server` violated strict sandbox boundary policy.
   - Symptom: third-party module behavior was injected via bridge instead of coming from sandboxed `node_modules`.
   - Fix: removed `@hono/node-server` bridge completely; replaced with built-in Node `http.createServer` bridge (`NetworkAdapter.httpServerListen/httpServerClose`) and kept framework code in sandboxed `node_modules`.

2. **[resolved]** Needed host-driven verification path for sandbox HTTP servers.
   - Symptom: Hono runner self-tested using in-sandbox `fetch`, which did not verify host-to-sandbox request path.
   - Fix: added host-side `NodeRuntime.network.fetch(...)` facade and updated `examples/hono/loader` to issue requests and terminate from loader.

3. **[resolved]** Bridge bundle could go stale when non-entry bridge files changed.
   - Symptom: runtime still used old `dist/bridge.js` behavior (for example `http.createServer` still throwing) after editing `src/bridge/network.ts`.
   - Fix: bridge loader now rebuilds when any file under `src/bridge/` is newer than `dist/bridge.js`, not just when `index.ts` changes.

4. **[resolved]** `@hono/node-server` path failed with `400` due `http2` runtime assumptions.
   - Symptom: requests reached the sandbox server but responded `400`; root cause was `instanceof http2.Http2ServerRequest` checks throwing when `http2` constructors were undefined.
   - Fix: added built-in `http2` compatibility stubs (`Http2ServerRequest`/`Http2ServerResponse`) and routed `require('http2')` / ESM `import 'http2'` to that stub module.

5. **[resolved]** Direct cloning of ESM module namespace objects failed in `isolated-vm`.
   - Symptom: using `entryModule.namespace.copy()` for `run()` exports failed with `[object Module] could not be cloned`.
   - Fix: after ESM evaluation, bind the namespace in isolate scope and copy `Object.fromEntries(Object.entries(namespace))` to the host.

6. **[resolved]** Project-matrix fixture installs were repeated on every run.
   - Symptom: compatibility fixtures paid repeated `copy + pnpm install` cost even when fixture inputs were unchanged.
   - Fix: added persistent fixture install cache under `packages/secure-exec/.cache/project-matrix/` keyed by fixture/toolchain/runtime factors with `.ready` marker semantics. Repeated `test:project-matrix` runs now reuse prepared installs.

7. TODO: follow up on lazy dynamic-import edge cases in ESM execution.
   - Symptom: `filePath: "/entry.mjs"` with top-level `await import("./mod.mjs")` can log pre-import output and imported-module side effects but miss post-await statements.
   - Next step: add a dedicated ESM top-level-await + dynamic-import regression test.

7. **[resolved]** Dynamic import error/fallback path masked ESM failures behind CJS-style wrappers.
   - Symptom: ESM compile/evaluation failures could be rethrown as generic dynamic-import errors, and fallback namespace construction could throw for primitive/null CommonJS exports.
   - Fix: dynamic import now preserves original ESM failure messages, restricts require fallback to explicit `.cjs`/`.json` specifiers, and constructs safe fallback namespaces with `default` for primitive/null exports.

## 2026-02-25

1. **[resolved]** Package resolution for `node_modules` was too limited.
   - Symptom: packages with `exports` maps and `.mjs/.cjs` entrypoints (including modern ESM-first packages) were not reliably resolvable.
   - Fix: expanded `package-bundler` resolution logic to support `exports` condition keys, extension probing for `.mjs/.cjs`, and import-vs-require mode preference.

2. **[resolved]** `http.createServer()` path was blocked in the sandbox runtime.
   - Symptom: server-oriented frameworks could not boot; existing bridge intentionally threw for `http.createServer`.
   - Fix: introduced a bridged `@hono/node-server` runtime module inside the isolate plus host-side `NetworkAdapter.honoServe/honoClose`, backed by real `@hono/node-server` in the Node driver.

3. **[resolved]** Workspace layout originally only matched one-level examples.
   - Symptom: nested `examples/hono/loader` and `examples/hono/runner` packages were not included in the pnpm workspace.
   - Fix: added `examples/*/*` to workspace globs.

4. **[resolved]** `require('fs')` depended on `globalThis.bridge`, but bridge loading did not publish the bridge object globally.
   - Symptom: `fs` resolved to `{}` and `readFileSync` was missing.
   - Fix: updated bridge loader wrappers to assign `globalThis.bridge = bridge` during bridge initialization.

5. **[resolved]** Relative import resolution in package directories preferred directories over sibling files.
   - Symptom: requests like `require('./request')` failed when both `request/` and `request.js` existed.
   - Fix: changed resolver order to match Node behavior: file + extension probes run before directory index/package resolution.

6. ESM + top-level await in this runtime path can return early for long async waits.
   - Symptom: module evaluation could finish before awaited async work (timers/network) completed.
   - Mitigation for example: runner switched to CJS async-IIFE, which `exec()` already awaits reliably.

7. `secure-exec` package build currently fails due to broad pre-existing type errors in bridge/browser files.
   - Symptom: importing `secure-exec` from `dist/` in example loader was not reliable in this workspace state.
   - Mitigation for example: loader imports `packages/secure-exec/src/index.ts` directly so the end-to-end example can run without a successful package build.
   - Note: 32+ type errors remain across child-process, network, os, process, and polyfills bridge files (as of 2026-02-25).

8. **[resolved]** Workspace-linked `node_modules` in the runner package caused environment coupling.
   - Symptom: runner execution could be influenced by workspace layout and local symlinked install topology.
   - Fix: loader now copies runner sources into a fresh temp directory and runs `pnpm install --ignore-workspace` there before sandbox execution.
