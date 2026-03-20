# Secure Exec TODOs

This file tracks the active implementation backlog only.
Resolved work should stay in `docs-internal/friction.md` instead of remaining here as unchecked debt.
Keep this file in sync with `docs-internal/spec-hardening.md` — when completing spec items, mark them here too.

Priority order is:
1. Security and host-protection gaps
2. Compatibility bugs and missing platform behavior
3. Maintainability and performance follow-ups
4. Examples, validation breadth, and product-shaping work

## Priority 0: Security and Host Protection

- [ ] Finish end-to-end payload guards for remaining browser/bridge paths.
  - Node isolate execution now enforces JSON/base64 payload limits, but browser worker paths and remaining bridge `JSON.parse(...)` callsites still need equivalent bounds.
  - Files: `packages/secure-exec/src/browser/worker.ts`, `packages/secure-exec/src/bridge/*.ts`

- [ ] Add global host resource budgets.
  - Bound output bytes, bridge-call rate, timer count, and child-process count so hostile workloads cannot amplify host CPU or memory usage.
  - Files: `packages/secure-exec/src/node/execution-driver.ts`, `packages/secure-exec/src/bridge/process.ts`, `packages/secure-exec/src/shared/permissions.ts`

- [ ] Cap and hard-fail child-process output buffering in sync APIs.
  - `spawnSync`/`execSync` paths still need deterministic output caps rather than unbounded accumulation.
  - Files: `packages/secure-exec/src/node/execution-driver.ts`, `packages/secure-exec/src/bridge/child-process.ts`

- [ ] Ensure child-process sessions are always cleaned up on timeout, dispose, and error paths.
  - Session-map leaks will keep host resources alive after sandbox failure paths.
  - Files: `packages/secure-exec/src/node/execution-driver.ts`

- [ ] Add request and response body limits for driver HTTP paths, including decompression.
  - The Node driver currently buffers request/response bodies and decompresses gzip/deflate without explicit caps.
  - Files: `packages/secure-exec/src/node/driver.ts`

- [ ] Fix HTTP server lifecycle leaks when executions time out or are disposed.
  - Sandbox-owned servers need deterministic teardown on all execution shutdown paths.
  - Files: `packages/secure-exec/src/execution.ts`, `packages/secure-exec/src/node/execution-driver.ts`, `packages/secure-exec/src/node/driver.ts`

- [ ] Verify timer and event-rate controls under hostile workloads.
  - Add explicit stress coverage for `setInterval`, `setImmediate`, and high-frequency event emission so abuse resistance is tested instead of assumed.
  - Files: `tests/test-suite/node/`, `tests/runtime-driver/`

- [x] Document extension attack vectors and hardening guidance. *(done — `docs-internal/attack-vectors.md` is comprehensive)*
  - Consolidate memory amplification, CPU amplification, timer/event amplification, and extension host-hook abuse paths in the internal threat model.
  - Files: `docs-internal/attack-vectors.md`

- [ ] Fix kernel FD table memory leak. *(spec-hardening.md item 1)*
  - `fdTableManager.remove(pid)` never called on process exit; every spawn leaks an FD table.
  - Files: `packages/kernel/src/process-table.ts`, `packages/kernel/src/fd-table.ts`

- [ ] Fix WasmVM 1MB SharedArrayBuffer silent truncation. *(spec-hardening.md item 2)*
  - Reads >1MB silently truncate; should return EIO.
  - Files: `packages/runtime/wasmvm/src/syscall-rpc.ts`

## Priority 1: Compatibility and API Coverage

- [ ] Fix `v8.serialize` and `v8.deserialize` to use V8 structured serialization semantics.
  - The current JSON-based behavior is observably wrong for `Map`, `Set`, `RegExp`, circular references, and other structured-clone cases.
  - Files: `packages/secure-exec/isolate-runtime/src/inject/bridge-initial-globals.ts`

- [ ] Add missing `fs` APIs needed for broader Node parity.
  - Missing APIs: `cp`, `cpSync`, `glob`, `globSync`, `opendir`, `mkdtemp`, `mkdtempSync`, `statfs`, `statfsSync`, `readv`, `readvSync`, `fdatasync`, `fdatasyncSync`, `fsync`, `fsyncSync`.
  - Files: `packages/secure-exec/src/bridge/fs.ts`

- [ ] Implement deferred `fs` APIs in bridge or explicitly scope them out.
  - Deferred APIs: `chmod`, `chown`, `link`, `symlink`, `readlink`, `truncate`, `utimes`, `watch`, `watchFile`.
  - Kernel VFS already defines these in its interface; bridge needs wiring.
  - Files: `packages/secure-exec/src/bridge/fs.ts`, `docs/nodejs-compatibility.mdx`

- [ ] Add missing lower-level `http` and `https` APIs.
  - Remaining gaps include `Agent` pooling/keep-alive controls, upgrade handling, trailer headers, and socket-level events.
  - Files: `packages/secure-exec/src/bridge/network.ts`, `packages/secure-exec/src/node/driver.ts`

- [x] Add a dedicated lazy dynamic-import regression test. *(done — `tests/runtime-driver/node/index.test.ts:622`)*

- [ ] Document and verify package-manager support for `node_modules` loading behavior.
  - Add compatibility fixtures that exercise npm, pnpm, yarn, and bun layouts without sandbox-aware fixture code.
  - Files: `packages/secure-exec/tests/projects/`, `docs/nodejs-compatibility.mdx`

## Priority 2: Maintainability and Performance

- [ ] Remove remaining `@ts-nocheck` bypasses in bridge internals.
  - Current bypasses remain in `bridge/polyfills.ts`, `bridge/os.ts`, `bridge/child-process.ts`, `bridge/process.ts`, and `bridge/network.ts`.
  - Files: `packages/secure-exec/src/bridge/*.ts`

- [ ] Split `NodeExecutionDriver` into focused modules.
  - The old `index.ts` monolith has moved; the main concentration of complexity is now `packages/secure-exec/src/node/execution-driver.ts`.
  - Suggested extraction targets: isolate bootstrap, module resolution, ESM compilation, bridge setup, and execution lifecycle.

- [ ] Make ESM module reverse lookup O(1).
  - Large import graphs still risk quadratic resolver work.
  - Files: `packages/secure-exec/src/node/execution-driver.ts`

- [ ] Add resolver memoization for positive and negative lookups.
  - Avoid repeated miss probes across `require()` and `import()` paths.
  - Files: `packages/secure-exec/src/package-bundler.ts`, `packages/secure-exec/src/shared/require-setup.ts`, `packages/secure-exec/src/node/execution-driver.ts`

- [ ] Cap and cache `package.json` parsing in resolver paths.
  - Prevent repeated large-file reads and large JSON parse overhead in package resolution.
  - Files: `packages/secure-exec/src/package-bundler.ts`

- [ ] Reduce module-access lookup overhead.
  - Add prefix indexing and canonicalization memoization in module-access checks.
  - Files: `packages/secure-exec/src/node/module-access.ts`

- [ ] Replace whole-file fd sync emulation with offset-based host read/write primitives.
  - The current approach does more work than necessary and increases large-file pressure.
  - Files: `packages/secure-exec/src/bridge/fs.ts`

- [x] Replace magic `O_*` flag numbers with named constants. *(done — constants defined at module level in bridge/fs.ts)*

- [ ] Convert IO handling into a shared abstraction reusable across runtimes.
  - Shared request/response/stream/error contracts should reduce Node/browser/runtime drift.
  - Files: `packages/secure-exec/src/`, `tests/test-suite/`

- [ ] Replace WasmVM error string matching with structured error codes. *(spec-hardening.md item 15)*
  - `mapErrorToErrno()` matches on `error.message` content; should use structured `error.code`.
  - Files: `packages/runtime/wasmvm/src/kernel-worker.ts`

- [ ] Investigate filesystem permission enforcement interaction with host OS.
  - WasmVM per-command permission tiers (US-018/019) enforce fd_open/fd_write restrictions inside the WASM sandbox, but need to verify how these interact with host filesystem permissions when the driver reads binaries from `commandDirs`. Specifically: can a malicious WASM binary influence the host-side file reads, and does the permission tier correctly propagate through the WorkerInitData → kernel-worker.ts chain under all error paths?
  - Files: `packages/runtime/wasmvm/src/kernel-worker.ts`, `packages/runtime/wasmvm/src/driver.ts`

## Priority 3: Examples, Validation Breadth, and Product Direction

- [ ] Investigate: https://x.com/jaywyawhare/status/2033488305191616875
  - Flagged for review — tweet content could not be fetched (requires JS).

- [ ] CLI tool E2E validation: Pi, Claude Code, and OpenCode inside sandbox.
  - Prove that real-world AI coding agents boot and produce output in secure-exec.
  - Spec: `docs-internal/specs/cli-tool-e2e.md`
  - Phases: Pi headless → Pi interactive/PTY → OpenCode headless (binary spawn + SDK) → OpenCode interactive/PTY → Claude Code headless → Claude Code interactive/PTY
  - OpenCode is a Bun binary (hardest) — tests the child_process spawn path and SDK HTTP/SSE client path (not in-VM execution); done before Claude Code to front-load risk
  - Prerequisite bridge gaps: controllable `isTTY`, `setRawMode()` under PTY, HTTPS client verification, Stream Transform/PassThrough, SSE/EventSource client

- [x] Review the Node driver against the intended long-term runtime contract. *(done — `.agent/contracts/node-runtime.md` and `node-bridge.md` exist)*

- [x] Define the minimal driver surface needed for Rivet integration. *(done — `RuntimeDriver` interface in `packages/kernel/src/types.ts`)*

- [ ] Add a codemode example.
  - Provide a focused example that demonstrates secure-exec usage in a realistic tool flow.
  - Files: `examples/`

- [x] Add a just-bash example. *(done — `examples/just-bash/`)*

- [ ] Expand framework and environment validation. *(spec-hardening.md items 33-35)*
  - Express fixture, Fastify fixture, pnpm/bun layout fixtures.
  - Files: `packages/secure-exec/tests/projects/`

## Spec-Hardening Cross-References (items 29-42)

Items below are tracked in detail in `docs-internal/spec-hardening.md`. Kept here for backlog visibility.

- [ ] Global host resource budgets (maxOutputBytes, maxTimers, maxChildProcesses, maxBridgeCalls) *(spec item 29)*
- [ ] Child-process output buffering caps (execSync/spawnSync maxBuffer enforcement) *(spec item 30)*
- [ ] Missing fs APIs in bridge (cp, glob, opendir, mkdtemp, statfs, readv, fdatasync, fsync) *(spec item 31)*
- [ ] Wire deferred fs APIs through bridge (chmod, chown, symlink, readlink, link, truncate, utimes) *(spec item 32)*
- [ ] Express project-matrix fixture *(spec item 33)*
- [ ] Fastify project-matrix fixture *(spec item 34)*
- [ ] Package manager layout fixtures (pnpm, bun) *(spec item 35)*
- [ ] Remove @ts-nocheck from 5 bridge files *(spec item 36)*
- [ ] Fix v8.serialize/deserialize structured clone semantics *(spec item 37)*
- [ ] HTTP Agent pooling, upgrade, and trailer APIs *(spec item 38)*
- [ ] Codemod example *(spec item 39)*
- [ ] Split NodeExecutionDriver into focused modules *(spec item 40)*
- [ ] ESM module reverse lookup O(1) *(spec item 41)*
- [ ] Resolver memoization *(spec item 42)*
