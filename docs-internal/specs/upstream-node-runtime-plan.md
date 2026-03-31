# Upstream Node Runtime Plan

Date: 2026-03-30

Status: Proposal

## Executive Summary

Secure Exec should pursue a Node-first architecture, not a Bun-first architecture, for replacing the current polyfill-heavy Node compatibility layer.

The recommended plan is:

1. Keep the current host-owned V8 runtime.
2. Rehost upstream Node's bootstrap and builtin module system inside Secure Exec.
3. Run a short pre-research phase to prove the risky bindings before committing to the rebuild.
4. Make upstream `fs` the first real module target after bootstrap.
5. Move POSIX-oriented binding implementations behind a Wasm backend backed by the Secure Exec kernel and compiled through the existing WasmVM path.
6. Replace the current Node implementation wholesale instead of carrying long-lived dual compatibility.

This plan explicitly does **not** start by trying to compile all of Node itself to Wasm. That would put the hardest part of the project, the V8/embedder boundary, on the critical path immediately.

Instead, we should do a small amount of pre-research, then replace the current polyfill/bootstrap architecture with an upstream-Node-shaped runtime and progressively extract the POSIX backend behind Wasm while preserving host-side ownership of the JS engine boundary.

There are three hard constraints:

1. the first prototype must vendor a **complete pinned builtin tree** for the chosen Node version, not a hand-picked subset
2. CommonJS and ESM loader bindings such as `contextify`, `modules`, and `module_wrap` are phase-1 or phase-2 blockers, not optional later polish
3. the current Rust V8 runtime will likely need new native support for parts of the bootstrap/loader path; this is not a TypeScript-only project

## Goals

- Replace the current polyfill-first Node compatibility model with an upstream-Node-shaped bootstrap and builtin loader.
- Pin the implementation to whatever upstream Node release is the current LTS at project kickoff and record the exact version in the fork and asset metadata.
- Use `fs` as the first real module-compliance target after bootstrap.
- Maximize reuse of upstream Node JS builtins such as `fs`, `net`, `http`, `https`, `stream`, `readline`, and related `internal/*` modules.
- Reuse Secure Exec's kernel and existing POSIX/Wasm investment instead of expanding the current host bridge indefinitely.
- Keep the validation measurable, with explicit kill criteria before the rebuild commits too much code.
- Preserve Secure Exec's kernel-first architecture: all sandbox I/O still routes through the kernel.

## Non-Goals

- Do not try to make all of upstream Node engine-neutral in the first phase.
- Do not try to run Node's entire current C++ runtime inside Wasm in the first phase.
- Do not replace V8 with JavaScriptCore as part of the first plan.
- Do not optimize for long-lived dual-runtime coexistence. The goal is replacement, not a permanent second runtime.
- Do not fork Bun for this workstream unless the Node plan is disproven.
- Do not target worker threads, inspector, watch mode, REPL, SEA embedding, or test-runner entrypoints in the first bring-up.

## Why Node Instead Of Bun

The short answer is that Node is easier to decompose.

Node's architecture is still in-process and V8-coupled, but the seam we need is clearer:

- bootstrap order is explicit
- `internalBinding()` is explicit
- builtin JS modules are more ordinary and more portable
- the split between JS stdlib logic and native bindings is easier to reason about

Bun is harder because its module pipeline and binding layer are much more engine-shaped:

- builtin JS uses Bun-specific preprocessing and private intrinsics
- builtins are compiled through Bun's internal registry
- many native bindings are typed directly in JavaScriptCore objects like `JSGlobalObject`, `CallFrame`, and `JSValue`

For Secure Exec's desired architecture, the useful path is:

- host-owned engine
- upstream-style JS stdlib
- replaceable binding layer
- Wasm-backed POSIX backend

That maps much better onto Node than Bun.

Supporting research:

- [docs-internal/node-wasm-stdlib-exploration.md](/home/nathan/secure-exec-5/docs-internal/node-wasm-stdlib-exploration.md)
- [docs-internal/research/comparison/edgejs-binding-architecture.md](/home/nathan/secure-exec-5/docs-internal/research/comparison/edgejs-binding-architecture.md)
- [docs-internal/research/comparison/bun-wasm-binding-feasibility.md](/home/nathan/secure-exec-5/docs-internal/research/comparison/bun-wasm-binding-feasibility.md)
- [docs-internal/research/comparison/node-vs-bun-ipc-boundary.md](/home/nathan/secure-exec-5/docs-internal/research/comparison/node-vs-bun-ipc-boundary.md)
- [docs-internal/specs/upstream-node-runtime-preflight.md](/home/nathan/secure-exec-5/docs-internal/specs/upstream-node-runtime-preflight.md)
- [docs-internal/specs/upstream-node-runtime-wasmvm-probes.md](/home/nathan/secure-exec-5/docs-internal/specs/upstream-node-runtime-wasmvm-probes.md)

## Current Secure Exec Starting Point

The current implementation is centered on a custom bootstrap, custom require path, and a growing set of bridge/polyfill handlers.

Primary current files:

- `packages/nodejs/src/execution-driver.ts`
- `packages/nodejs/src/bridge-handlers.ts`
- `packages/core/isolate-runtime/src/inject/require-setup.ts`
- `packages/nodejs/src/kernel-runtime.ts`
- `packages/nodejs/src/driver.ts`
- `packages/nodejs/src/module-access.ts`
- `packages/v8/src/runtime.ts`
- `packages/v8/src/ipc-binary.ts`

This model works, but it forces Secure Exec to own more and more Node compatibility logic directly:

- builtin resolution policy
- `require()` behavior
- polyfill patching
- host bridge surface growth
- behavior quirks for `http`, `net`, `fs`, `tty`, and friends

That is the complexity this plan is trying to retire.

## End-State Architecture

The target architecture is:

1. Secure Exec still owns the JS engine and isolate lifecycle.
2. Secure Exec boots upstream Node bootstrap JS in the same order Node expects.
3. Secure Exec exposes a Node-shaped `internalBinding()` boundary.
4. The `internalBinding()` surface is split into:
   - host-side V8/embedder bindings
   - Wasm-backed POSIX/kernel bindings
5. Upstream Node JS builtins run mostly unchanged.
6. Kernel-mediated I/O remains the source of truth.

### Ownership Model

The intended ownership chain is:

1. `NodeExecutionDriver` owns the V8 isolate and per-execution environment.
2. A new upstream bootstrap layer loads Node builtin sources and bootstraps the realm.
3. The bootstrap layer creates `internalBinding()`, builtin `require()`, and builtin module caching.
4. Host-side binding providers create JS-visible binding objects and wrapper classes.
5. POSIX-oriented binding methods delegate to a Wasm backend backed by the kernel.
6. V8-facing methods remain host-native.
7. User modules load only after `internal/bootstrap/realm` and `internal/bootstrap/node` complete.

### Boot Sequence We Need To Reproduce

The runtime must preserve the upstream boot shape:

1. create V8 isolate
2. create per-context primordials
3. run `internal/per_context/*`
4. run `internal/bootstrap/realm`
5. provide `internalBinding('builtins')`
6. let `realm.js` construct `BuiltinModule`, `internalBinding()`, and builtin `require()`
7. run `internal/bootstrap/node`
8. run `internal/main/*`
9. run user code

This is the central architectural fact: Node's stdlib is not something we inject after the engine is already running normal application code. The loader and binding system comes first.

### Bootstrap-Critical Binding Inventory

The runtime has to provide more than `builtins` plus `module_wrap` to get through early bootstrap.

Based on upstream `lib/internal/bootstrap/realm.js`, `lib/internal/bootstrap/node.js`, and the loader stack, the first binding inventory should explicitly plan for:

- `builtins`
- `module_wrap`
- `contextify`
- `config`
- `util`
- `process_methods`
- `uv`
- `cares_wrap`
- `credentials`
- `async_wrap`
- `trace_events`
- `timers`
- `errors`
- `buffer`
- `constants`
- `symbols`
- `modules`

This does not mean every binding must be fully feature-complete on day one.

It does mean the spec should treat these as first-order bring-up requirements, not as optional follow-on work.

The first bring-up should also be explicitly snapshot-free.

### First Bring-Up Scope

The first executable entrypoints should be narrow and explicit:

- bootstrap realm
- bootstrap node
- a simple builtin require smoke path
- one simple user entry path such as `internal/main/eval_string`

The first prototype should run in an explicit snapshot-free mode:

- do not rely on upstream Node startup snapshots
- always execute the bootstrap JS path directly during bring-up
- treat snapshot support, if we want it later, as a follow-on optimization after correctness

The first prototype should explicitly avoid bringing up:

- `internal/main/worker_thread`
- `internal/main/repl`
- `internal/main/watch_mode`
- `internal/main/test_runner`
- SEA embedding paths

These pull in additional bindings and lifecycle machinery that are not necessary to prove the core architecture.

## Pre-Research Gate

Before we commit to the full rebuild, we should run a short pre-research phase with explicit proof points.

US-001 results are recorded in [docs-internal/specs/upstream-node-runtime-preflight.md](/home/nathan/secure-exec-5/docs-internal/specs/upstream-node-runtime-preflight.md). The short version is:

- `internal/bootstrap/realm` replayed to completion with a bounded host-side `builtins` contract.
- `module_wrap`, `contextify`, minimal `uv`, and minimal `cares_wrap` probes all passed on the host side.
- `internal/bootstrap/node` is still blocked on host-native bootstrap lifecycle work, specifically `buffer` bootstrap wiring and `async_wrap` initialization state.

US-002 results are recorded in [docs-internal/specs/upstream-node-runtime-wasmvm-probes.md](/home/nathan/secure-exec-5/docs-internal/specs/upstream-node-runtime-wasmvm-probes.md). The short version is:

- the existing WasmVM path cleanly handles the narrow fs backend operations we need first: `open`, `read`, `write`, `stat`, `readdir`, and `realpath`
- TCP client/server socket operations fit the existing kernel-mediated WasmVM path
- DNS success plus expected failure paths fit the current WasmVM host-net path
- TTY raw-mode still needs WasmVM ABI plus wasi-libc plumbing before it can be probed honestly

### Purpose

- validate the riskiest upstream bindings early
- prove where WasmVM helps and where it does not
- set kill criteria before rewriting the runtime

### Pre-Research Questions To Answer

1. Can Secure Exec boot far enough to execute `internal/bootstrap/realm` and `internal/bootstrap/node` with a minimal binding set?
2. Can Secure Exec support `module_wrap` and `contextify` enough for a narrow ESM and `vm` proof?
3. Can the current runtime and kernel support the `uv` / `cares_wrap` expectations behind `net` and DNS?
4. Can the low-level backend operations we need for `fs`, sockets, DNS, and TTY be expressed cleanly as WasmVM-targeted operations?

### Host-Side Bootstrap Probes

These probes must run inside the Secure Exec host runtime, not as standalone Wasm programs:

- bootstrap probe
  - run `internal/bootstrap/realm`
  - run `internal/bootstrap/node`
- `module_wrap` probe
  - compile and execute a trivial ESM module
- `contextify` probe
  - run `node:vm` `createContext()` and `runInContext()`
- `uv` probe
  - run minimal `net.createServer().listen(0)` and `net.connect()`
- `cares_wrap` probe
  - run `dns.lookup('localhost')` and one real external lookup

### Standalone WasmVM Probes

These probes should be compiled like normal WasmVM-targeted tools and run through the existing WasmVM path:

- `fs` backend probe
  - open, read, write, stat, readdir, realpath
- socket backend probe
  - connect, listen, accept, read, write, close
- DNS backend probe
  - hostname lookup and error paths
- TTY backend probe
  - raw mode, terminal size, read/write behavior

### Important Interpretation Rule

A standalone WasmVM probe is useful for backend operations only.

It cannot prove:

- `module_wrap`
- `contextify`
- JS handle identity
- callback/event delivery semantics for `tcp_wrap` / `stream_wrap`

Those still require host-side runtime probes.

### Kill Criteria

We should stop or redesign the plan if pre-research shows any of the following:

- `module_wrap` or `contextify` require a deep V8/embedder rewrite rather than bounded runtime work
- `uv` / `cares_wrap` expectations cannot be mapped onto Secure Exec kernel semantics without broad behavior drift
- the WasmVM backend cannot express the low-level `fs` and socket operations cleanly enough to justify the extra layer
- upstream bootstrap requires patching large portions of builtin JS immediately just to start

## What We Should And Should Not Compile To Wasm

We should split the problem into three classes, not two.

### Class A: Host-Only V8 Or Embedder Layer

These are V8/embedder-facing and should remain host-owned initially:

- `module_wrap`
- `contextify`
- `async_wrap`
- `serdes`
- inspector hooks
- snapshot-related hooks
- any binding whose primary job is creating V8 objects, templates, wrappers, or module graph state

These bindings are not natural POSIX targets.

### Class B: Host-Owned Handle And Lifecycle Layer

These may use a Wasm backend later, but the JS-visible handle objects, lifecycle, and event model stay host-owned:

- `stream_wrap`
- `pipe_wrap`
- `tcp_wrap`
- `tty_wrap`
- `udp_wrap`
- `process_methods`
- `uv`
- `cares_wrap`

Reason:

- these bindings do not only perform syscalls
- they also own Node object identity, async request wrappers, ref/unref semantics, close semantics, and repeated event delivery

### Class C: Wasm Backend Operations

These are the bottom-half operations that are realistic Wasm targets:

- fd and filesystem operations behind `fs`
- socket open/connect/listen/read/write/close operations
- tty and terminal state operations
- DNS helper operations where we can express them as backend requests
- process and environment helpers that already map to Secure Exec kernel facilities
- low-level readiness helpers only if the host still owns the public handle lifecycle

Important nuance:

- the host side still has to create the JS-visible binding objects
- the host side remains the source of truth for handle identity and callback delivery
- the Wasm side implements backend operations only

That means the boundary is:

`upstream JS builtin -> host binding shim -> Wasm backend -> Secure Exec kernel`

not:

`upstream JS builtin -> Wasm directly manipulating V8`

## Recommended Fork Strategy

We should fork Node, but keep the first implementation path as fork-minimal as possible.

### Fork Repository

Create a fork in the `rivet-dev` org:

- `rivet-dev/secure-exec-node`

Recommended branch strategy:

- `upstream/<current-lts-at-kickoff>`
- `secure-exec/main`
- feature branches rebased onto `secure-exec/main`

Recommended remote layout in local checkout:

- `origin` -> `rivet-dev/secure-exec-node`
- `upstream` -> `nodejs/node`

### Principle

The fork should initially exist for:

- patch hygiene
- reproducible exports of builtin assets
- optional build and introspection helpers
- later targeted C++ changes if the host/binding seam needs to be externalized more cleanly

The fork should **not** become the first place we do product integration. Product integration should live in this repo.

## What We Need To Modify In Node

### Phase 0: No Critical C++ Modifications Required

For the first serious prototype, we should assume **zero required upstream C++ behavior changes**.

The prototype should try to consume Node's existing JS bootstrap and builtin files, then implement the expected bootstrap contract in Secure Exec.

That means the first required Node fork changes should be limited to helper tooling such as:

- exporting builtin manifests
- exporting the exact builtin source set we want to vendor
- optionally exporting metadata about builtin classifications

### Phase 1+: Minimal Planned Fork Changes

If the bootstrap prototype proves the concept, then the fork should add small, explicit extension seams instead of broad rewrites.

Likely fork changes:

1. `tools/secure_exec/export_bootstrap_assets.*`
   - export builtin source blobs and manifest data
   - record exact builtin IDs and bootstrap categories
2. optional build target for bootstrap-only asset generation
   - useful for CI and deterministic sync into this repo
3. optional external binding-provider seam
   - if we need Node's binding registry classified more explicitly
4. optional snapshot-free bootstrap build mode
   - helpful for debugging and deterministic Secure Exec bring-up

### Changes We Should Avoid Early

Avoid early changes to:

- `lib/http.js`
- `lib/net.js`
- `lib/readline.js`
- `lib/fs.js`
- `lib/internal/*`

If those modules fail, that should be treated as a binding/runtime gap first, not as a reason to patch the builtins immediately.

## Relevant Node Files

These are the primary upstream files we will rely on or inspect repeatedly.

### Boot Ownership And Environment

- `/home/nathan/misc/node/src/node_main.cc`
- `/home/nathan/misc/node/src/node.cc`
- `/home/nathan/misc/node/src/node_main_instance.cc`
- `/home/nathan/misc/node/src/api/environment.cc`
- `/home/nathan/misc/node/src/node_realm.cc`

### Builtin Loading And Binding Registration

- `/home/nathan/misc/node/src/node_builtins.cc`
- `/home/nathan/misc/node/src/node_binding.cc`
- `/home/nathan/misc/node/src/node_binding.h`

### JS Bootstrap

- `/home/nathan/misc/node/lib/internal/per_context/primordials.js`
- `/home/nathan/misc/node/lib/internal/per_context/domexception.js`
- `/home/nathan/misc/node/lib/internal/per_context/messageport.js`
- `/home/nathan/misc/node/lib/internal/bootstrap/realm.js`
- `/home/nathan/misc/node/lib/internal/bootstrap/node.js`
- `/home/nathan/misc/node/lib/internal/main/*.js`

### Compatibility Targets

- `/home/nathan/misc/node/lib/fs.js`
- `/home/nathan/misc/node/lib/net.js`
- `/home/nathan/misc/node/lib/http.js`
- `/home/nathan/misc/node/lib/https.js`
- `/home/nathan/misc/node/lib/readline.js`
- `/home/nathan/misc/node/lib/internal/fs/*`
- `/home/nathan/misc/node/lib/internal/tty.js`
- `/home/nathan/misc/node/lib/internal/socketaddress.js`

## How We Should Import This Into Secure Exec

We should **not** vendor the entire Node repository into this monorepo as the first step.

That would create a large update surface without proving we need it.

### Recommended Import Model

Keep three layers:

1. Node fork lives as its own repository.
2. Secure Exec vendors only the specific bootstrap and builtin assets it needs.
3. Secure Exec owns the host-side runtime integration and binding providers.

Important refinement:

- in practice, "the specific assets it needs" should mean the full pinned builtin JS tree for the selected Node version, not a manually curated small subset
- bootstrap and loader internals pull transitive `internal/*` dependencies aggressively, so hand-picking files will create brittle sync churn

### US-003 Pinned Asset Baseline

As of 2026-03-30, the current Node LTS line is `v24` (`Krypton`), and this workstream is pinned to:

- Node version: `v24.14.1`
- release date: `2026-03-24`
- upstream commit: `d89bb1b482fa09245c4f2cbb3b5b6a70bea6deaf`
- upstream repo: `https://github.com/nodejs/node`
- expected fork: `https://github.com/rivet-dev/secure-exec-node`

The checked-in asset metadata lives in:

- `packages/nodejs/assets/upstream-node/VERSION.json`
- `packages/nodejs/assets/upstream-node/builtin-manifest.json`

The initial export from that pinned release contains:

- `352` builtin `.js` assets total
- `73` public builtins under `packages/nodejs/assets/upstream-node/lib/**`
- `279` internal builtins under `packages/nodejs/assets/upstream-node/internal/**`
- no `deps/**` export for the `v24.14.1` baseline because the pinned builtin tree did not require one for this phase

### Proposed Layout In This Repo

Add a new upstream runtime subtree under `packages/nodejs/`:

- `packages/nodejs/src/upstream/`
- `packages/nodejs/assets/upstream-node/`
- `packages/nodejs/test/upstream/`

Recommended asset layout:

- `packages/nodejs/assets/upstream-node/VERSION.json`
- `packages/nodejs/assets/upstream-node/builtin-manifest.json`
- `packages/nodejs/assets/upstream-node/lib/**`
- `packages/nodejs/assets/upstream-node/internal/**`
- `packages/nodejs/assets/upstream-node/deps/**` only if truly required

Important rule:

- vendor the full pinned builtin JS tree required by the selected Node version
- do not start by cherry-picking a few hand-selected builtin files
- the export script should decide the exact tree, not manual copy/paste

Recommended source layout:

- `packages/nodejs/src/upstream/bootstrap-loader.ts`
- `packages/nodejs/src/upstream/builtin-registry.ts`
- `packages/nodejs/src/upstream/internal-binding-registry.ts`
- `packages/nodejs/src/upstream/host-bindings/`
- `packages/nodejs/src/upstream/wasm-bindings/`
- `packages/nodejs/src/upstream/runtime-driver.ts`

### Sync Workflow

Add a sync script in this repo, for example:

- `scripts/sync-node-upstream-assets.ts`

The checked-in implementation now works like this:

1. prepare a local checkout of `rivet-dev/secure-exec-node`
2. configure remotes as:
   - `origin` -> `rivet-dev/secure-exec-node`
   - `upstream` -> `nodejs/node`
3. make sure the pinned ref `d89bb1b482fa09245c4f2cbb3b5b6a70bea6deaf` is present in the local checkout
4. run `pnpm sync:node-upstream-assets --source /path/to/secure-exec-node`
5. run `pnpm check:node-upstream-assets --source /path/to/secure-exec-node`

Important implementation detail:

- the sync script reads files from the pinned git ref, not from the working tree, so a dirty checkout cannot silently skew the exported asset set
- the script fails if the local checkout does not contain the pinned commit, if bootstrap-critical builtin files are missing, or if `--check` detects drift in the committed asset tree

This gives us deterministic updates without forcing the whole fork into the monorepo.

## Secure Exec Code We Will Need To Add Or Replace

### New Code

Add a new upstream runtime implementation as the replacement workstream.

Likely new files:

- `packages/nodejs/src/upstream/runtime-driver.ts`
- `packages/nodejs/src/upstream/bootstrap-loader.ts`
- `packages/nodejs/src/upstream/builtin-registry.ts`
- `packages/nodejs/src/upstream/internal-binding-registry.ts`
- `packages/nodejs/src/upstream/host-bindings/*.ts`
- `packages/nodejs/src/upstream/wasm-bindings/*.ts`
- `packages/nodejs/src/upstream/callback-registry.ts`
- `packages/nodejs/src/upstream/asset-loader.ts`

As of the US-004 scaffold, the initial responsibilities are intentionally narrow:

- `asset-loader.ts` reads the pinned vendored asset metadata plus builtin source files from `packages/nodejs/assets/upstream-node/**`
- `builtin-registry.ts` now mirrors Node's builtin wrapper categories, exposes the `internalBinding('builtins')` surface (`builtinIds`, `compileFunction`, `setInternalLoaders`), and stores loader state plus cached builtin exports for later bootstrap bring-up
- `internal-binding-registry.ts` tracks explicit planned binding descriptors so the bring-up surface stays visible instead of implicit
- `bootstrap-loader.ts` only builds a snapshot-free bring-up plan over vendored assets; it does not execute bootstrap yet
- `runtime-driver.ts` currently aggregates the scaffold plus builtin runtime state for internal experimentation and is intentionally not wired into the public `NodeRuntime` path yet

### Existing Files We Will Touch

- `packages/nodejs/src/execution-driver.ts`
- `packages/nodejs/src/kernel-runtime.ts`
- `packages/nodejs/src/driver.ts`
- `packages/nodejs/src/module-access.ts`
- `packages/v8/src/runtime.ts`
- `packages/core/isolate-runtime/src/inject/require-setup.ts`
- `packages/nodejs/src/bridge-handlers.ts`
- `native/v8-runtime/src/session.rs`

Likely native runtime touch points:

- module compilation support for upstream loader expectations
- callback and async hook plumbing needed by bootstrap-critical bindings
- possible new host-function exposure for loader/runtime state that cannot be expressed through the current bridge globals alone

### Strong Recommendation

Do not start by editing the current `require-setup.ts` into a half-upstream, half-polyfill hybrid.

Instead:

- add a distinct upstream runtime path
- use the current implementation only as reference material during pre-research
- once bootstrap plus `fs` first-light exists, replace aggressively instead of maintaining two active product paths

## Proposed Runtime Shape Inside Secure Exec

### Runtime Modes

Do not optimize the public API around long-lived dual modes.

The simplest plan is:

- use a short-lived pre-research harness for bootstrap probes
- then replace the main Node runtime implementation in place
- avoid building permanent public `legacy` versus `upstream-node` product modes

### Recommended Choice

Keep the public `NodeRuntime` shape unified.

Recommended split:

- pre-research harnesses may use internal experimental entrypoints
- the shipped runtime should converge back to one `NodeRuntime` path as quickly as possible
- once bootstrap plus `fs` works, stop investing in the old runtime and replace it rather than carrying two product surfaces

## Wasm Backend Plan

The Wasm backend should be a private runtime component, not a top-level command runtime.

### What It Is

It is a backend service module for Node bindings.

It is **not**:

- a shell command
- a replacement for the whole Node runtime
- a public runtime driver mounted on `PATH`

### What The Wasm Backend Owns

The backend should implement bottom-half POSIX-like operations needed by Node internal bindings:

- open/read/write/close/stat/readdir/realpath
- filesystem operations behind `fs`
- pipe/socket/tty backend operations
- tty/raw-mode operations
- socket open/connect/listen/read/write/close
- DNS helpers if needed
- process and environment helpers that already map to Secure Exec kernel facilities

### What The Host Shim Owns

The host shim still owns:

- JS-visible object construction
- callback registry and callback invocation
- handle identity and ref/unref state
- close semantics and finalizer behavior
- argument validation
- error translation to Node-compatible JS errors
- V8 object lifetime and wrapper classes

## Handle And Event Model

The host must own the public handle model.

### Host Responsibilities

- allocate handle IDs and one-shot request IDs
- own ref/unref state
- own close state and finalizer behavior
- own JS-visible wrapper objects
- invoke JS callbacks and emit JS events
- maintain any `AsyncWrap`-relevant identity that cannot leave the engine boundary

### Backend Responsibilities

- execute backend operations
- return one-shot completions for request IDs
- emit backend events tagged with handle IDs
- never own JS object identity
- never own the authoritative lifecycle state for public handles

### Event Classes

We should model at least two event families:

1. one-shot request completions
   - `fs` request finished
   - connect finished
   - write finished
   - shutdown finished
2. long-lived handle events
   - readable data
   - incoming connection
   - datagram receive
   - timeout or readiness notifications
   - close notifications

Callbacks should never cross as executable JS functions.

The backend sees IDs and serialized payloads only.

## How We Should Handle Wasm Mounts

### Core Decision

Do **not** mount the Node binding backend as a user-visible command runtime.

It should be compiled as a normal WasmVM-targeted artifact and invoked internally by the Node runtime.

### Recommended Product Path

Use the existing WasmVM path as the primary design.

That means:

- the backend is compiled like a normal WasmVM/WASIX-targeted tool or module
- the backend uses the existing WasmVM worker/import pipeline where possible
- the Node runtime instantiates and talks to that backend internally
- the backend is not exposed as a user-facing shell command unless we later have a concrete reason to do that

This keeps the design aligned with the existing WebAssembly VM instead of introducing a special one-off loader path.

### Packaging Rule

The Node runtime may still package the backend bytes alongside vendored upstream assets, but the execution model should be "normal WasmVM artifact invoked internally," not "special private host implementation."

### Relationship To WasmVM

We should reuse WasmVM ideas and infrastructure where it helps:

- asset packaging conventions
- import-module conventions
- host syscall plumbing
- worker orchestration patterns if needed

But we should **not** force the Node binding backend to masquerade as a normal Wasm command in `commandDirs`.

The Node backend is a service sidecar, not a CLI binary.

## Backend ABI Plan

We need one explicit backend ABI instead of ad hoc bridge methods.

### Recommended ABI Shape

Define a small, versioned, operation-oriented ABI for Node binding backends.

Suggested initial operation groups:

- `fs.*`
- `tty.*`
- `pipe.*`
- `tcp.*`
- `udp.*` later
- `process.*`
- `os.*`

Each operation should:

- take plain serialized input
- return plain serialized output
- never require remote JS object handles
- use request/subscription IDs for async behavior

### Import Module Strategy

We have two realistic choices:

1. reuse existing `wasi-ext` imports where the semantics already fit
2. introduce a `host_node` import module for Node-specific operations that do not map cleanly onto POSIX libc calls

Recommendation:

- reuse `host_process`, `host_user`, and `host_net` where possible
- add `host_node` only for genuinely Node-specific backend operations

Important caveat:

- the current `wasi-ext` surface does not cover everything we need
- filesystem operations, readiness/event integration, timers, and DNS/channel behavior are not solved purely by current imports
- `uv` and `cares_wrap` need explicit classification in the host-lifecycle layer and cannot be hand-waved as simple syscall reuse

That keeps the backend close to the kernel while being honest that a pure `wasi-ext` reuse story is incomplete.

## First Bring-Up Scope Exclusions

These surfaces should be explicitly out of scope for the first end-to-end bring-up:

- `worker_threads`
- inspector
- REPL
- watch mode
- snapshot optimization

They can be revisited after the bootstrap, module loading, `fs`, `net`, `http`, and `readline` path is working.

## Detailed Phases

## Phase 0: Pre-Research And Go/No-Go

### Objective

Prove the risky assumptions before we commit to the rebuild.

### Work

1. pin the project to the Node release that is the current LTS at kickoff
2. run the host-side bootstrap probes from the pre-research gate:
   - `internal/bootstrap/realm`
   - `internal/bootstrap/node`
   - `module_wrap`
   - `contextify`
   - `uv`
   - `cares_wrap`
3. compile and run the standalone WasmVM backend probes:
   - `fs`
   - socket I/O
   - DNS
   - TTY
4. document exactly which bootstrap-critical bindings are blockers versus later work
5. record explicit kill criteria outcomes before any large runtime rewrite starts

### Exit Criteria

- we know whether `module_wrap` / `contextify` are bounded or a design blocker
- we know whether the low-level backend operations fit the existing WasmVM path
- we have a concrete `fs`-first implementation scope
- we have a go/no-go decision recorded

## Phase 1: Fork, Asset Export, And Scaffolding

### Deliverables

- `rivet-dev/secure-exec-node` fork created
- pinned upstream version chosen
- sync script in this repo
- asset export script in the fork
- new upstream runtime directory scaffold in `packages/nodejs/src/upstream/`

### Work

1. create the Node fork
2. add helper export tooling in the fork
3. add the Secure Exec sync script
4. add version-pinning metadata
5. land empty runtime scaffolding and asset-loader wiring in this repo

### Exit Criteria

- a single command refreshes vendored Node assets from a pinned fork commit
- the asset bundle is deterministic and reviewable

## Phase 2: Bootstrap-Only Prototype

### Objective

Prove that Secure Exec can boot upstream Node JS bootstrap code far enough to obtain:

- primordials
- `internalBinding()`
- builtin `require()`
- builtin cache
- the minimum bootstrap-critical binding set needed for a narrow user entrypoint

### Work

1. load vendored per-context scripts
2. load vendored `internal/bootstrap/realm.js`
3. implement `internalBinding('builtins')`
4. implement `compileFunction(id)`
5. implement `setInternalLoaders(...)`
6. store the resulting builtin loaders in runtime state
7. stub or implement the bootstrap-critical bindings required by `bootstrap/node.js`
8. load `internal/bootstrap/node.js`
9. run a narrow `internal/main/*` path such as `eval_string`

### Scope Discipline

At this phase, do not move anything to Wasm yet.

Use host-side stubbed or current-bridge-backed implementations just to prove bootstrap viability.

Assume snapshot-free bring-up.

At this phase, do not promise:

- worker threads
- inspector
- watch mode
- REPL
- full user ESM parity

### Current Bring-Up Notes

- the current US-006 bring-up executes vendored `internal/per_context/*`, `internal/bootstrap/realm`, `internal/bootstrap/node`, and `internal/main/eval_string` inside a dedicated host Node child started with `--expose-internals`
- the minimum proven shim set is: `internalBinding('builtins')`, host `buffer` plus `setBufferPrototype()` no-op, host `async_wrap` plus `setupHooks()` no-op, host `trace_events` plus `setTraceCategoryStateUpdateHandler()` no-op, and a typed `internal/options` shim for the eval-string entrypoint
- scope remains intentionally narrow: vendored `internal/*` bootstrap assets run through the new loader path, but public builtins touched by the `eval_string` smoke path still fall back to host `node:` modules until fs-first-light replaces that fallback with real module support
- US-007 adds a real host binding inventory under `packages/nodejs/src/upstream/host-bindings/` and `internal-binding-registry.ts`; each binding now records its execution model (`host-only`, `host-lifecycle-plus-backend`, or `deferred`), the phases that need it (`bootstrap` or `fs-first`), and which host-owned responsibilities must not move into the backend later
- the currently wired host shims are intentionally narrow: `builtins`, `config`, `util` bootstrap constants/private symbols, `credentials`, `errors`, `buffer`, `constants`, `symbols`, `timers`, `async_wrap`, `trace_events`, and a minimal `uv` errno surface
- `module_wrap`, `contextify`, `process_methods`, `cares_wrap`, and `modules` remain explicit planned entries rather than implicit gaps, while `fs`, `fs_dir`, and `fs_event_wrap` are marked deferred for the fs-first story with host-owned callback/wrapper/close semantics called out directly in the notes
- US-008 keeps that same isolated-child bring-up path but now allows selected public builtins to stay vendored; the current first-light set is only `require('fs')`, backed by vendored `lib/fs.js` plus vendored `internal/fs/*` dependencies, while other public builtins like `path`, `os`, `buffer`, and `module` still fall back to host `node:` modules
- the explicit fs v1 subset is `open`, `read`, `write`, `close`, `stat`, `readdir`, and `realpath` in both sync and callback styles; `fs.promises`, streams, directory handles, watchers, and `fs_event_wrap` remain deferred to later parity stories
- US-009 moves the fs first-light bottom half behind a packaged WasmVM artifact: `native/wasmvm/c/programs/node_fs_backend.c` compiles through the normal WasmVM C toolchain, the packaged binary lives at `packages/nodejs/assets/upstream-node-backend/node_fs_backend`, and the host `internalBinding('fs')` shim in `packages/nodejs/scripts/upstream-node-fs-binding.mjs` calls it through ABI v1 JSON requests for `open`, `read`, `write`, `stat`, `lstat`, `readdir`, and `realpath` while keeping callback delivery, public fd allocation, and close semantics on the host side
- US-010 extends that same backend-backed binding to vendored `fs.promises` and the realistic path-based stream subset: `binding.openFileHandle()`, promise-mode `read`/`writeBuffer`/`writeString`/`readBuffers`/`writeBuffers`, and promise-mode `stat`/`lstat`/`readdir`/`realpath` now route through the same host-owned fd table and Wasm backend operations as the sync/callback first-light path
- vendored `fs.promises` and stream loading still imports `internal/fs/watchers` even though `fs.watch()` itself remains deferred, so the bootstrap runner now wraps host `internalBinding('fs_event_wrap').FSEvent` in a fresh subclass before the vendored watcher module defines its legacy `owner` alias; without that shim, `fs.promises` and `createReadStream()` fail during module initialization before any actual watch API is used
- focused replacement-runtime parity coverage now includes conformance-derived scenarios from vendored `test-filehandle-close.js`, `test-fs-filehandle-use-after-close.js`, `test-fs-promises-readfile-with-fd.js`, `test-fs-readv-promises.js`, and `test-fs-writev-promises.js`, plus exact host-vs-upstream validation snapshots for the implemented subset
- path-based `fs.createReadStream()` / `fs.createWriteStream()` are now in-scope for the replacement runtime, but `FileHandle.createReadStream()` / `readableWebStream()` still hit a backend `fread` gap and remain explicitly deferred alongside watchers and directory-handle work
- US-012 keeps plain synchronous `node -e` bring-up on `internal/main/eval_string`, but async payloads that opt into `process.__secureExecDone()` now run in a post-bootstrap CommonJS wrapper because the reduced host child was exiting before vm-context timer/socket callbacks could drain; that preserves the scoped bootstrap proof while making replacement-runtime async module smoke tests possible
- vendored `require('net')` now uses upstream `lib/net.js` for the public module boundary, but the async first-light path compiles that public builtin in the host context with host-owned `tcp_wrap` / `stream_wrap` / `pipe_wrap` / `uv` / `cares_wrap` dependencies so loopback listen/connect/read/write/close behavior, handle identity, and `ref()` / `unref()` state remain on the host side until the backend split grows real socket bottom-half coverage
- host `tcp_wrap.TCP.prototype.owner` is already non-configurable in the exposed-internals child, so the replacement runner must hand vendored `net` a subclassed `TCP` constructor before `lib/net.js` defines its legacy `owner` alias; otherwise module initialization fails before any socket work starts
- US-013 extends that same host-context strategy to the HTTP family: async first-light now host-context compiles vendored `http`, `https`, `_http_agent`, `_http_client`, `_http_common`, `_http_incoming`, `_http_outgoing`, `_http_server`, and vendored `internal/http` so the pinned upstream JS does not mix with host helpers that are missing Node 22 APIs such as `internal/http.getGlobalAgent()`
- focused HTTP parity now covers isolated-child, standalone `NodeRuntime`, and kernel-mounted header-level `http` client/server round-trips, exact raw HTTP response bytes against a host Node control server for a representative `http.createServer()` response, and `https` module resolution through the replacement runtime with host `tls` still delegated
- US-015 adds a real file-entry path on the replacement runtime: standalone `NodeRuntime` and kernel-mounted `node <file>` executions now stage only the entry file's relative module closure plus the nearest `package.json` metadata into a temporary host worktree, instead of snapshotting an entire VFS subtree that can drag unrelated fixtures such as unsupported native addons into the loader path
- the helper child now exposes a host-backed `internalBinding('modules')` shim with `getNearestParentPackageJSON()` layered onto the host `modules` binding so vendored `internal/modules/package_json_reader` can resolve relative CommonJS test files that call `require('../common')`
- file-backed CommonJS loading continues through the vendored `internal/modules/cjs/loader`, but its loader-phase `internalBinding('fs')` calls stay on the host binding instead of the fs first-light backend shim; that keeps module resolution honest while the vendored/public `fs` parity story remains scoped to the dedicated fs-first-light path
- package-json-aware ESM entry files now execute from real file paths on the replacement runtime through the helper-child file-entry path, with relative `import` resolution and `"type": "module"` package detection covered in focused standalone tests
- targeted vendored node-conformance coverage now includes `test-path-isabsolute.js` through the real runner harness, and its stale `expectations.json` entry was removed after the file stopped failing in `internal/modules/package_json_reader`

### Exit Criteria

- Secure Exec can run upstream `internal/bootstrap/realm`
- `setInternalLoaders(...)` round-trips successfully
- builtin `require('events')`, `require('path')`, and `require('fs')` resolve through the new builtin path
- `internal/bootstrap/node.js` completes for the scoped bring-up path
- the same bootstrap proof passes in:
  - standalone `NodeRuntime`
  - kernel-mounted runtime driver mode

## Phase 3: Host Binding Provider

### Objective

Replace the current broad polyfill loader with a Node-shaped host binding registry.

### Work

1. add `internal-binding-registry.ts`
2. classify bindings into host-only vs backend-capable
3. implement host-only bindings first:
   - `builtins`
   - `module_wrap`
   - `contextify`
   - `modules`
   - `errors`
   - `timers`
   - `buffer`
   - `util`
   - `config`
   - `process_methods`
   - `credentials`
   - `async_wrap`
   - `trace_events`
   - `symbols`
   - required process/config bindings
4. implement backend-capable bindings initially on the host using current bridge/kernel paths:
   - `fs`
   - `os`
   - `tty_wrap`
   - `stream_wrap`
   - `pipe_wrap`
   - `tcp_wrap`
5. make `http` and `readline` run through upstream JS builtins against those bindings

Current readline/PTY first-light keeps vendored `readline` / `readline/promises` on the replacement runtime, but live PTY sessions stay attached to the helper child process's real stdin/stdout while `stdin.setRawMode()` toggles are sent back to the kernel PTY over IPC. That preserves the real kernel line discipline for `kernel.openShell()` instead of faking terminal input inside the bootstrap runner.

### Exit Criteria

- upstream `http` server/client round-trips in Secure Exec
- upstream `readline` works in PTY-backed tests
- the new runtime can run real user modules with `require()` and `import()`
- the same behaviors pass in:
  - standalone `NodeRuntime`
  - kernel-mounted runtime driver mode

## Phase 4: Wasm Backend Extraction

### Objective

Move the POSIX backend out of the host binding implementations and behind a Wasm sidecar.

### Work

1. define ABI version 1 for backend calls
2. create a new backend crate or module for Node POSIX operations
3. route host binding shims through the new Wasm backend
4. keep JS object construction and callback invocation on the host
5. add request/subscription registries for async completions
6. integrate the backend with kernel-owned resources

### Exit Criteria

- `fs`, `tty`, and basic `net` operations can run entirely through the Wasm backend
- `http` and `readline` still pass the same higher-level tests
- raw bridge/polyfill code shrinks instead of growing

## Phase 5: Module Loading, Network, And TTY Parity

### Objective

Drive real compatibility coverage on the important user-facing APIs.

### Work

1. finish and harden CommonJS and ESM loading against upstream builtin expectations
2. bring `http`, `https`, `net`, and `readline` to real parity targets
3. validate `tty` raw mode, signals, and terminal geometry
4. validate socket semantics and backpressure through kernel routing
5. measure bridge-call reductions and correctness improvements

### Exit Criteria

- vendored Node conformance coverage for these areas improves materially
- project-matrix packages depending on `http`, `net`, `fs`, and `readline` pass
- kernel-mediated tests remain the source of truth for completion claims

## Phase 6: Replacement And Cleanup

### Objective

Replace the current runtime implementation wholesale once bootstrap plus `fs` and the early blocker probes are solid enough.

### Work

1. remove the polyfill-first bootstrap path from the active implementation
2. make the upstream bootstrap path the canonical Node runtime
3. preserve only the minimum historical reference material needed in git history or working notes
4. update docs and internal architecture notes to reflect the new runtime shape
5. instrument boot latency, memory, and request/callback counts on the replacement runtime

Current in-tree status:

- public `createNodeRuntimeDriverFactory()` and `createNodeRuntime()` now route to the vendored upstream bootstrap + `fs` first-light wrappers
- the historical bridge/bootstrap path remains only behind internal `createLegacyNodeRuntimeDriverFactory()` and `createLegacyNodeRuntime()` escape hatches so follow-on `net` / `http` work can diff behavior without keeping the legacy path as the product surface

### Exit Criteria

- the replacement runtime is the only active Node implementation in-tree
- bootstrap plus `fs` and early blocker probes are green on the new path
- the codebase no longer carries the old bootstrap path as a maintained product surface

## Phase 7: Hardening And Follow-On Modules

### Objective

Go module by module after `fs`, hardening the new runtime and expanding compatibility deliberately.

### Work

1. finish `fs` parity beyond the first-light subset
2. bring up the next target modules one by one:
   - `net`
   - `http`
   - `https`
   - `readline`
3. keep tightening CommonJS, ESM, TTY, socket, and DNS behavior
4. update docs and compatibility tables as the new runtime becomes the source of truth
5. decide later whether any previously out-of-scope modules deserve follow-on work

### Explicit Rule

The module bring-up order is:

- bootstrap
- `fs`
- then one module at a time

Do not broaden scope faster than the tests can prove behavior.

## Testing Strategy

The test strategy is as important as the implementation plan.

### 0. Pre-Research Probes

Run the explicit pre-research probes before the rebuild:

- host-side bootstrap probes for:
  - `internal/bootstrap/realm`
  - `internal/bootstrap/node`
  - `module_wrap`
  - `contextify`
  - `uv`
  - `cares_wrap`
- standalone WasmVM probes for:
  - `fs`
  - socket I/O
  - DNS
  - TTY

### 1. Bootstrap Smoke Tests

Add focused tests for:

- `internal/bootstrap/realm` execution
- `setInternalLoaders(...)`
- builtin compilation and caching
- `require('events')`
- `require('path')`
- `require('fs')`

### 2. Node Conformance Tests

Reuse the vendored Node conformance suite in:

- `packages/secure-exec/tests/node-conformance/`

Use the existing harness against the replacement runtime and keep host Node as the external control path.

Any change to compatibility expectations must also regenerate the existing report outputs:

- `packages/secure-exec/tests/node-conformance/conformance-report.json`
- `docs/nodejs-conformance-report.mdx`

### 3. Project-Matrix Tests

Use real black-box packages in:

- `packages/secure-exec/tests/projects/`

Add fixtures that stress:

- `http`
- `https`
- `net`
- `readline`
- `stream`
- `fs`

The fixture must stay sandbox-blind and must be compared against host Node.

### 4. Kernel Integration Tests

Because the architecture is kernel-first, we need kernel-level proofs for:

- loopback HTTP server/client behavior
- PTY raw mode and signal delivery
- child process and pipe behavior
- socket lifecycle
- cross-runtime interactions with Wasm commands

Existing useful anchors:

- `packages/nodejs/test/kernel-runtime.test.ts`
- `packages/secure-exec/tests/kernel/cross-runtime-network.test.ts`
- `packages/secure-exec/tests/kernel/cross-runtime-pipes.test.ts`
- `packages/nodejs/test/http-server.test.ts`

### 5. Wire-Level Differential Tests

For protocol-sensitive behavior:

- capture raw HTTP bytes
- compare Secure Exec upstream runtime vs host Node

This is required to avoid passing same-code-path loopback tests while still being semantically wrong.

### 6. Performance And Resource Tests

Track:

- bootstrap latency
- memory usage
- bridge call counts
- backend call counts
- active handle behavior

This project is meant to reduce runtime complexity, not merely move it around.

## Concrete Work Breakdown By Repo Area

### Node Fork

Owns:

- upstream source tracking
- asset export helpers
- optional extension seams if later required

### `packages/nodejs`

Owns:

- upstream runtime implementation
- binding registry
- host binding shims
- integration of the replacement runtime into the main Node surface

### `packages/v8`

Owns:

- any additional runtime support needed for loader callbacks or host interaction
- but should stay generic and not absorb Node-specific policy

### `native/v8-runtime`

Owns:

- any Rust/V8 session support needed for upstream bootstrap and module compilation
- host-function registration that must exist below the TypeScript bridge layer
- async callback/runtime plumbing that cannot be faked safely in JS

### `packages/wasmvm` And `native/wasmvm`

Owns:

- reusable Wasm runtime infrastructure
- import plumbing
- optional shared backend ABI support

### `packages/core`

Owns:

- kernel semantics
- socket, process, tty, fd, filesystem, and permission behavior

The upstream runtime should consume kernel behavior, not work around it.

## Questions And Unknowns

### Bootstrap Unknowns

- How much of `module_wrap` is required before real ESM user modules work?
- How much of `contextify` is required just to boot common builtins?
- Does the current Rust V8 runtime expose enough hooks for the bootstrap path without native changes?
- Which `bootstrap/node.js` bindings are mandatory for the first narrow entrypoint versus later runtime modes?

### Binding Unknowns

- Which exact internal bindings are mandatory for `http`, `net`, and `readline` in the selected Node version?
- How much `uv` behavior is assumed by upstream JS builtins versus the public binding names?
- Which error and validation paths live in JS versus native bindings?
- Can the existing Secure Exec process/timer/socket tables satisfy early bootstrap expectations for `process_methods`, `timers`, and async hooks without semantic drift?

### Wasm Unknowns

- Should the backend target `wasm32-wasip1` plus `wasi-ext`, or a more custom target?
- Which backend operations map cleanly to existing imports, and which need a new `host_node` module?
- Do we need one Wasm instance per Node execution, per runtime process, or per kernel-mounted driver?

### Packaging Unknowns

- How large will the vendored builtin asset set be once we include all required internal files?
- How frequently can we realistically rebase the Node fork while preserving Secure Exec-specific tooling?
- Do we need generated manifests checked into this repo, or only generated during build/sync?

### Product Unknowns

- What proof threshold is sufficient to commit fully to the replacement runtime after pre-research and `fs` first-light?
- Which packages should be the mandatory project-matrix gates before we broaden beyond `fs` into `net`, `http`, and `readline`?
- Should the replacement runtime stay marked experimental until Wasm backend extraction is complete?

## Risks

### Risk: We Underestimate Host-Side V8 Work

Mitigation:

- keep the first phase focused on bootstrap-only viability
- do not promise Wasm migration of V8-facing bindings

### Risk: We Patch Upstream Builtins Too Early

Mitigation:

- treat builtin failures as binding/runtime gaps first
- require justification before patching vendored builtin JS

### Risk: We Recreate Another Ad Hoc Bridge

Mitigation:

- define a versioned backend ABI early
- keep callback passing handle-based
- keep host/object lifetime logic centralized

### Risk: We Delete The Old Runtime Before The New One Is Trustworthy

Mitigation:

- do not remove the old implementation until the pre-research gate is complete and bootstrap plus `fs` first-light are green on the replacement path

## Resources To Keep Open While Doing The Work

### Secure Exec Architecture And Contracts

- [docs-internal/arch/overview.md](/home/nathan/secure-exec-5/docs-internal/arch/overview.md)
- [docs-internal/glossary.md](/home/nathan/secure-exec-5/docs-internal/glossary.md)
- [.agent/contracts/node-runtime.md](/home/nathan/secure-exec-5/.agent/contracts/node-runtime.md)
- [.agent/contracts/node-bridge.md](/home/nathan/secure-exec-5/.agent/contracts/node-bridge.md)
- [.agent/contracts/node-stdlib.md](/home/nathan/secure-exec-5/.agent/contracts/node-stdlib.md)

### Secure Exec Implementation Files

- [execution-driver.ts](/home/nathan/secure-exec-5/packages/nodejs/src/execution-driver.ts)
- [bridge-handlers.ts](/home/nathan/secure-exec-5/packages/nodejs/src/bridge-handlers.ts)
- [require-setup.ts](/home/nathan/secure-exec-5/packages/core/isolate-runtime/src/inject/require-setup.ts)
- [kernel-runtime.ts](/home/nathan/secure-exec-5/packages/nodejs/src/kernel-runtime.ts)
- [driver.ts](/home/nathan/secure-exec-5/packages/nodejs/src/driver.ts)
- [module-access.ts](/home/nathan/secure-exec-5/packages/nodejs/src/module-access.ts)
- [runtime.ts](/home/nathan/secure-exec-5/packages/v8/src/runtime.ts)
- [driver.ts](/home/nathan/secure-exec-5/packages/wasmvm/src/driver.ts)

### Prior Research

- [docs-internal/node-wasm-stdlib-exploration.md](/home/nathan/secure-exec-5/docs-internal/node-wasm-stdlib-exploration.md)
- [edgejs-binding-architecture.md](/home/nathan/secure-exec-5/docs-internal/research/comparison/edgejs-binding-architecture.md)
- [bun-wasm-binding-feasibility.md](/home/nathan/secure-exec-5/docs-internal/research/comparison/bun-wasm-binding-feasibility.md)
- [node-vs-bun-ipc-boundary.md](/home/nathan/secure-exec-5/docs-internal/research/comparison/node-vs-bun-ipc-boundary.md)

### Upstream Node

- [/home/nathan/misc/node/src/node_main_instance.cc](/home/nathan/misc/node/src/node_main_instance.cc)
- [/home/nathan/misc/node/src/api/environment.cc](/home/nathan/misc/node/src/api/environment.cc)
- [/home/nathan/misc/node/src/node_realm.cc](/home/nathan/misc/node/src/node_realm.cc)
- [/home/nathan/misc/node/src/node_builtins.cc](/home/nathan/misc/node/src/node_builtins.cc)
- [/home/nathan/misc/node/src/node_binding.cc](/home/nathan/misc/node/src/node_binding.cc)
- [/home/nathan/misc/node/lib/internal/bootstrap/realm.js](/home/nathan/misc/node/lib/internal/bootstrap/realm.js)
- [/home/nathan/misc/node/lib/internal/bootstrap/node.js](/home/nathan/misc/node/lib/internal/bootstrap/node.js)

## Final Recommendation

Proceed with a Node-first, fork-minimal, pre-research-gated replacement plan.

The implementation order should be:

1. run the pre-research probes
2. pin current LTS and fork/export assets
3. prove upstream bootstrap in Secure Exec
4. make upstream `fs` the first real module target
5. replace the current bootstrap/builtin path with a Node-shaped binding registry
6. extract POSIX-oriented bindings behind a WasmVM-targeted backend
7. continue module by module from there

That is the highest-probability path to reducing complexity while still proving the risky assumptions early.
