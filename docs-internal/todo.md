# Secure Exec TODOs

This file tracks the active implementation backlog only.
Resolved work should stay in OpenSpec archives and `docs-internal/friction.md` instead of remaining here as unchecked debt.

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

- [ ] Document extension attack vectors and hardening guidance.
  - Consolidate memory amplification, CPU amplification, timer/event amplification, and extension host-hook abuse paths in the internal threat model.
  - Files: `docs-internal/attack-vectors.md`

## Priority 1: Compatibility and API Coverage

- [ ] Fix `v8.serialize` and `v8.deserialize` to use V8 structured serialization semantics.
  - The current JSON-based behavior is observably wrong for `Map`, `Set`, `RegExp`, circular references, and other structured-clone cases.
  - Files: `packages/secure-exec/isolate-runtime/src/inject/bridge-initial-globals.ts`

- [ ] Add missing `fs` APIs needed for broader Node parity.
  - Missing APIs: `cp`, `cpSync`, `glob`, `globSync`, `opendir`, `mkdtemp`, `mkdtempSync`, `statfs`, `statfsSync`, `readv`, `readvSync`, `fdatasync`, `fdatasyncSync`, `fsync`, `fsyncSync`.
  - Files: `packages/secure-exec/src/bridge/fs.ts`

- [ ] Implement deferred `fs` APIs or explicitly keep them out of scope with stronger compatibility guidance.
  - Deferred APIs: `chmod`, `chown`, `link`, `symlink`, `readlink`, `truncate`, `utimes`, `watch`, `watchFile`.
  - Files: `packages/secure-exec/src/bridge/fs.ts`, `docs/node-compatability.mdx`

- [ ] Add missing lower-level `http` and `https` APIs.
  - Remaining gaps include `Agent` pooling/keep-alive controls, upgrade handling, trailer headers, and socket-level events.
  - Files: `packages/secure-exec/src/bridge/network.ts`, `packages/secure-exec/src/node/driver.ts`

- [ ] Add a dedicated lazy dynamic-import regression test.
  - Top-level-await plus `import()` ordering still has a tracked edge case and needs explicit coverage.
  - Files: `packages/secure-exec/tests/`

- [ ] Document and verify package-manager support for `node_modules` loading behavior.
  - Add compatibility fixtures that exercise npm, pnpm, yarn, and bun layouts without sandbox-aware fixture code.
  - Files: `packages/secure-exec/tests/projects/`, `docs/node-compatability.mdx`

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

- [ ] Replace magic `O_*` flag numbers with named constants.
  - Hardcoded flag values are difficult to audit and easy to misuse.
  - Files: `packages/secure-exec/src/bridge/fs.ts`

- [ ] Convert IO handling into a shared abstraction reusable across runtimes.
  - Shared request/response/stream/error contracts should reduce Node/browser/runtime drift.
  - Files: `packages/secure-exec/src/`, `tests/test-suite/`

## Priority 3: Examples, Validation Breadth, and Product Direction

- [ ] Review the Node driver against the intended long-term runtime contract.
  - Use the current architecture docs and glossary terms to decide what stays driver-owned versus runtime-owned.
  - Files: `docs-internal/arch/overview.md`, `docs-internal/glossary.md`, `packages/secure-exec/src/node/`

- [ ] Define the minimal driver surface needed for Rivet integration.
  - This should turn the high-level “minimal driver” idea into a concrete API checklist.
  - Files: `docs-internal/arch/overview.md`, `packages/secure-exec/src/types.ts`

- [ ] Add a codemode example.
  - Provide a focused example that demonstrates secure-exec usage in a realistic tool flow.
  - Files: `examples/`

- [ ] Add a just-bash example.
  - Show the smallest useful command-execution integration without broader framework scaffolding.
  - Files: `examples/`

- [ ] Expand framework and environment validation.
  - Add or maintain black-box coverage for projects using Pi, Express, Hono, and other representative package stacks.
  - Files: `packages/secure-exec/tests/projects/`
