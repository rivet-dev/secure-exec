# Secure Exec TODOs

This file tracks the active implementation backlog only.
Resolved work should stay in `docs-internal/friction.md` instead of remaining here as unchecked debt.
Keep this file in sync with `docs-internal/spec-hardening.md` — when completing spec items, mark them here too.

Priority order is:
1. Security and host-protection gaps
2. Compatibility bugs and missing platform behavior
3. Maintainability and performance follow-ups
4. Examples, validation breadth, and product-shaping work

---

docs-internal/proposal-kernel-consolidation.md
docs-internal/specs/custom-bindings.md
docs-internal/specs/cli-tool-e2e.md

## Proposal: Kernel-First Package Consolidation

- [ ] Migrate to kernel-first architecture — see [`docs-internal/proposal-kernel-consolidation.md`](proposal-kernel-consolidation.md)
  - Consolidate `@secure-exec/kernel` into `@secure-exec/core`, merge runtime drivers into user-facing packages, replace `NodeRuntime`/`SystemDriver` API with `createKernel()` + `kernel.mount()` + `kernel.exec()`.

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

- [ ] Run Ralph agent with OOM protection to prevent host machine lockup.
  - Sandbox tests (especially runtime-driver) can consume unbounded host memory when isolation is broken (e.g., node:vm shares host heap).
  - Use `systemd-run --user --scope -p MemoryMax=8G -p OOMScoreAdjust=900` to cap memory and ensure OOM killer targets the agent first.
  - Alternative: `ulimit -v 8388608` for virtual memory cap, or `echo 1000 > /proc/self/oom_score_adj` for OOM priority only.
  - Consider adding this to `scripts/ralph/ralph.sh` as a default wrapper.

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

## Priority 2.5: POSIX Compliance Testing

- [ ] Find and integrate a comprehensive POSIX compliance test suite.
  - Evaluate existing suites: Open POSIX Test Suite (posixtestsuite), Linux Test Project (LTP), toybox test suite, busybox test suite, or POSIX-compliant shell test suites (e.g., modernish, oil/osh test suite).
  - The suite should cover: signals, process management, file I/O, pipes, FDs, environment, exit codes, shell builtins, and core utilities.
  - Adapt the chosen suite to run inside WasmVM (may need to compile test harness to WASM or run as shell scripts through brush-shell).
  - Integrate as a CI-runnable test target that produces a compliance scorecard (pass/fail/skip counts per POSIX category).
  - Track results in `docs/posix-compatibility.md` and use regressions as P0 bugs.
  - Files: `packages/wasmvm/test/`, `native/wasmvm/c/programs/`, `docs/posix-compatibility.md`

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

## V8 Runtime Performance

See `docs-internal/specs/v8-perf-research.md` for detailed profiling data and analysis.

- [x] Replace double MessagePack encoding with V8 native serialization for bridge args/results *(done — US-034 through US-040)*
- [x] V8 startup snapshots for fast isolate creation *(done — US-052 through US-067, warm start 13.75ms → 2.4ms)*
- [x] Remove JSON double-serialization in bridge handlers *(done — US-045)*

### P1 — Quick Wins

- [ ] Code-cache the post-restore script (save 0.1–0.3ms per execution)
  - Post-restore script is compiled from source on every execution (~200 bytes, 0.1–0.4ms)
  - Reuse `BridgeCodeCache` pattern: hash the script string, consume cached bytecode on match
  - Files: `native/v8-runtime/src/session.rs`, `native/v8-runtime/src/execution.rs`

- [ ] Merge InjectGlobals into Execute message (save 0.1–0.2ms per execution)
  - Currently two IPC messages per execution: InjectGlobals + Execute
  - Include globals payload in Execute frame to save one UDS round-trip
  - Files: `native/v8-runtime/src/ipc_binary.rs`, `native/v8-runtime/src/session.rs`, `packages/v8/src/ipc-binary.ts`, `packages/v8/src/runtime.ts`

### P2 — Medium Effort

- [ ] Session context pooling (save 0.5–2.0ms per execution)
  - Pre-create pool of ready-to-execute contexts (snapshot-cloned, bridge fns replaced)
  - On execute(), pick a context from pool instead of creating one
  - Risk: context reuse may leak state — must verify complete isolation
  - Files: `native/v8-runtime/src/session.rs`

- [ ] Reduce snapshot blob size (save 0.1–0.6ms context clone time)
  - Minimize bridge IIFE state footprint: lazy-init large data structures, compact representations
  - Profile V8 heap snapshot contents to identify savings
  - Files: `packages/core/isolate-runtime/`

### P3 — When Needed

- [ ] Per-session sockets (one UDS per session instead of shared)
  - Only relevant for concurrent sessions with large payloads (head-of-line blocking)
  - Files: `native/v8-runtime/src/main.rs`, `packages/v8/src/runtime.ts`

- [ ] V8 code caching for user code (save <0.2ms, only for repeated executions)
  - User code compilation is already 0.02–0.08ms for typical scripts
  - Only helps when same code is executed repeatedly within a session
  - Files: `native/v8-runtime/src/execution.rs`

### Not Recommended

- [x] ~~mmap/shared-memory IPC~~ — Evaluated and rejected. IPC latency saving (~8μs) is dwarfed by V8 context setup (~1.5ms). Complexity and security risk too high for marginal gain.

### Other Performance Items

- [ ] Cap and cache `package.json` parsing in resolver paths
  - Prevent repeated large-file reads and large JSON parse overhead in package resolution
  - Files: `packages/nodejs/src/`, `packages/core/src/`

- [ ] Module-access prefix indexing and canonicalization memoization
  - Reduce per-lookup overhead in module-access checks
  - Files: `packages/nodejs/src/module-access.ts`

- [ ] Offset-based fd read/write primitives (replace whole-file sync emulation)
  - Current approach reads/writes entire file contents; offset-based ops reduce large-file pressure
  - Files: `packages/core/src/bridge/fs.ts`

## Custom Bindings

- [ ] Implement `SecureExec.bindings` API for exposing host functions to sandbox code.
  - Spec: `docs-internal/specs/custom-bindings.md`
  - Nested object registration on host, auto-inflated to frozen `SecureExec.bindings.*` namespace in sandbox.
  - No Rust changes needed — piggybacks on existing `bridgeHandlers` mechanism.
  - Files: `packages/core/src/runtime.ts`, `packages/nodejs/src/execution-driver.ts`, `packages/core/src/runtime-driver.ts`

## CI and Automation

- [ ] Automated rusty_v8 version update PR
  - CI job (weekly cron or manual trigger) checks for new `v8` crate releases on crates.io
  - If a newer version exists, opens a PR that bumps the `v8` version in `native/v8-runtime/Cargo.toml`, runs `cargo update -p v8`, and runs the full test suite
  - PR title: `chore(deps): bump rusty_v8 to vX.Y.Z`
  - PR body includes changelog link and diff of V8 engine version (e.g. V8 13.0 → 13.2)
  - Job fails (no PR opened) if `cargo test` or TypeScript tests fail — prevents broken updates from being proposed
  - Files: `.github/workflows/v8-update.yml`, `native/v8-runtime/Cargo.toml`

## WasmVM: Test Fixes (pre-existing on main)

- [ ] Fix kernel PTY flaky test — single large write EAGAIN.
  - test/resource-exhaustion.test.ts 'single large write (1MB+)' expects immediate EAGAIN but PTY ring buffer can accept some data before blocking.
  - Files: `packages/kernel/test/resource-exhaustion.test.ts`

- [ ] Fix Node RuntimeDriver kernel integration tests (11 of 25 failing).
  - Kernel integration tests (node -e, node -p, node script) fail — V8 runtime process spawn or session setup issues. Exploit/abuse tests return code:undefined instead of code:EACCES. Concurrent PID test returns 'err' for all spawns.
  - Files: `packages/runtime/node/test/driver.test.ts`

- [ ] Fix V8 crash isolation test timeouts.
  - crash-isolation.test.ts and process-isolation.test.ts timeout at 30s. V8 process crash detection or IPC cleanup too slow.
  - Files: `packages/v8/test/crash-isolation.test.ts`, `packages/v8/test/process-isolation.test.ts`

- [ ] Fix crossterm vendor patch auto-apply in patch-vendor.sh.
  - `patch -R --dry-run` gives false positives for patches that add new files. Forward-apply check should run first.
  - Files: `native/wasmvm/scripts/patch-vendor.sh`

- [ ] Fix C parity test WASM exit code 17 for non-patched programs.
  - All C programs compiled against patched wasi-libc import host_user.isatty. Verify host_user imports are provided correctly for C-built WASM binaries and isatty signature matches between C sysroot patch and kernel-worker.ts.
  - Files: `packages/wasmvm/src/kernel-worker.ts`, `native/wasmvm/c/Makefile`, `native/wasmvm/patches/wasi-libc/`

- [ ] Fix secure-exec main test suite failures from build cascade.
  - UpgradeSocket bridge refs fix (already committed) should resolve most failures. Verify after rebuild. Remaining failures may be Node runtime driver issues (above) or missing pyodide.
  - Files: `packages/core/src/shared/bridge-contract.ts`

## WasmVM: GNU Make (real upstream, not reimplementation)

- [ ] Vendor real GNU make — download, configure, and patch for WASM.
  - Previous clean-room reimplementation was deleted (violated Tool Integration Policy). Must compile real GNU make to wasm32-wasip1.

- [ ] make basic test suite.
  - Tests proving make can execute basic Makefiles with variables, recipes, and dependencies.

- [ ] make advanced test suite.
  - Tests for pattern rules, includes, conditionals, shell functions, and error handling.

## WasmVM: Git (real upstream, not reimplementation)

- [ ] Vendor real git source and compile for WASM.
  - Previous clean-room reimplementation (2925 lines) was deleted (violated Tool Integration Policy). Must compile real git (likely via libgit2 or actual git source) to wasm32-wasip1.

- [ ] git local commands — init, add, commit, status, log, diff.
  - Core porcelain commands compiled for WASM.

- [ ] git local test suite — filesystem operations.

- [ ] git branching — branch, checkout, merge, tag + test suite.

- [ ] git remote commands — clone, fetch, push, pull (HTTP/HTTPS via libcurl).

- [ ] git remote test suite — network operations.

## WasmVM: Codex (rivet-dev/codex fork)

- [ ] Delete fake codex stubs and fork real codex-rs to rivet-dev/codex.
  - Existing `native/wasmvm/crates/commands/codex/` and `codex-exec/` are fake stubs that print "agent loop is under development". Delete them. Fork `openai/codex` to `rivet-dev/codex`.

- [ ] Add WASI cfg gates to codex-rs fork — core dependencies.
  - Gate tokio process/signal/rt-multi-thread, portable-pty, reqwest, landlock/seccompiler behind `cfg(not(target_os = "wasi"))`.

- [ ] Add WASI cfg gates to codex-rs fork — spawn and exec.
  - Replace `tokio::process::Command` with `host_process_spawn` from wasi-ext on WASI.

- [ ] Add WASI cfg gates to codex-rs fork — PTY and unified exec.
  - Replace `portable-pty` with host_process PTY support on WASI.

- [ ] Add WASI HTTP client to codex-rs fork replacing reqwest.
  - Build HTTP client on host_net TCP/TLS imports for API calls.

- [ ] Stub codex-network-proxy and codex-otel in the fork for WASI.
  - No-op implementations for network proxy and telemetry on WASI.

- [ ] Build real codex-exec WASM binary from fork (headless mode).
  - The binary MUST be the real codex-exec from the fork. Verify --help shows clap-derived output with 'resume' subcommand.

- [ ] Headless codex-exec integration tests with real agent.
  - Verify real agent loop, clap-generated --help, not a hand-written placeholder.

- [ ] Build real codex TUI WASM binary from fork.
  - Real codex-cli with complex TUI layout (model selection, conversation history, tool calls), not a simple ratatui demo.

- [ ] TUI codex integration tests with real agent.
  - Verify real codex UI elements, not "Welcome to Codex on WasmVM" placeholder.

- [ ] Update docs for real codex WasmVM integration.
  - Document rivet-dev/codex fork as Tier 3 in native/wasmvm/CLAUDE.md with all WASI patches.

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
