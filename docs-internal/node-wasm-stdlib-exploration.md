# Node Stdlib -> Wasm Exploration

Date: 2026-03-30

## Scope

Goal: evaluate whether Secure Exec should replace its current Node stdlib polyfill/bridge approach with a fork of Node.js that compiles the stdlib/native binding layer to WebAssembly and targets Secure Exec's existing POSIX host bindings.

Primary local materials:

- Current Secure Exec runtime:
  - `packages/nodejs/src/execution-driver.ts`
  - `packages/core/isolate-runtime/src/inject/require-setup.ts`
  - `packages/nodejs/src/bridge-handlers.ts`
- Upstream Node.js clone:
  - `/home/nathan/misc/node`

Relevant upstream code was taken from the Node checkout in `~/misc/node`, which already vendors the exact revisions of `deps/v8`, `deps/uv`, `deps/cares`, `deps/openssl`, etc. I did not clone extra repos separately because the vendored copies are the ones actually wired into Node's bootstrap and ABI.

## Executive Summary

The good news is that the upstream boot path is now clear.

Node does not inject a "stdlib package" into V8 at `require()` time. The ownership model is:

1. host process creates a V8 isolate
2. host creates `IsolateData`
3. host creates `Environment`
4. host initializes per-context primordials
5. host runs `internal/bootstrap/realm`
6. `internal/bootstrap/realm` creates `internalBinding()`, `process.binding()`, and the builtin JS loader
7. `internal/bootstrap/realm` stores those loaders back into C++
8. host runs `internal/bootstrap/node`
9. host chooses an `internal/main/*` entrypoint and only then runs user code

The important consequence is that a "compile individual builtin modules to Wasm and load them when `require()` happens" design is not how Node is structured. The builtin loader and the binding loader come first. `require()` depends on those earlier bootstrap stages already existing.

The second important consequence is that there are really two different ideas mixed together here:

- Port POSIX-oriented Node bindings to a Wasm sidecar that targets Secure Exec's kernel ABI.
- Port Node's V8/embedder-facing binding layer itself to Wasm.

The first idea is plausible and could reduce a lot of bridge/polyfill complexity.
The second idea is much more expensive, because many Node internals are not POSIX APIs at all. They are direct V8/embedder integration points such as `module_wrap`, `contextify`, `async_wrap`, `serdes`, inspector hooks, snapshots, and per-context object-template setup.

My current recommendation is:

- Do not start with a full "fork Node and compile the stdlib to Wasm" effort.
- Start with a hybrid prototype:
  - keep the host V8 isolate
  - import upstream Node bootstrap JS nearly verbatim
  - replace Secure Exec's polyfill-based builtin loading with an `internalBinding()`-style runtime
  - implement the POSIX-ish bindings behind that runtime with a Wasm module backed by your existing kernel ABI
  - keep the V8-only bindings host-side

That gets most of the simplification without forcing a Node/V8 ABI reimplementation.

## Current Secure Exec Model

Secure Exec currently builds a custom bridge/bootstrap layer around a host-owned V8 runtime.

- `packages/nodejs/src/execution-driver.ts:149-158` warms a shared V8 runtime with assembled bridge code.
- `packages/nodejs/src/execution-driver.ts:739-752` assembles the bridge from Secure Exec-specific sources, not upstream Node bootstrap.
- `packages/nodejs/src/execution-driver.ts:1428-1446` injects console setup, custom `require` setup, fs facade setup, and dynamic-import support in post-restore code.
- `packages/core/isolate-runtime/src/inject/require-setup.ts:4510-4529` resolves builtins by asking `_loadPolyfill(...)` for JS polyfill source and then evaluating that source with `Function(...)`.
- `packages/nodejs/src/bridge-handlers.ts:3183-3218` overloads `_loadPolyfill(...)` to do two jobs:
  - return bundled stdlib polyfills
  - multiplex newer bridge dispatches via `__bd:...`
- `packages/nodejs/src/execution-driver.ts:1075-1158` constructs host bridge handlers for crypto, network, fd, timer, process-handle, stdin, module loading, and module resolution.

That means the current implementation is not just "bridge a few native calls". It is also carrying:

- builtin resolution policy
- stdlib compatibility policy
- polyfill patching
- a synthetic module loader path
- a dispatch multiplexing layer because the V8 runtime binary only exposes a fixed set of bridge globals

Your instinct is correct: this is structurally different from how upstream Node boots.

## Upstream Node Boot Sequence

### 1. Process entrypoint

- `src/node_main.cc:96-98`
  - POSIX `main()` just calls `node::Start(argc, argv)`.

### 2. Global process startup

- `src/node.cc:1567-1576`
  - Node loads snapshot data and constructs `NodeMainInstance`.
- `src/node.cc:1579-1583`
  - `Start()` delegates to `StartInternal(...)`.

### 3. V8 isolate creation

- `src/node_main_instance.cc:33-62`
  - `NodeMainInstance` creates the V8 isolate with `NewIsolate(...)`
  - then creates `IsolateData`

This is the first answer to "who owns who":

- the host executable owns the isolate
- Node wraps that isolate in `IsolateData`
- later it wraps the isolate + context in `Environment`

### 4. Environment creation

- `src/node_main_instance.cc:118-147`
  - `CreateMainEnvironment()` either:
    - deserializes a main context from the snapshot, or
    - creates a fresh `Context`
  - then calls `CreateEnvironment(...)`

- `src/api/environment.cc:441-517`
  - `CreateEnvironment(...)` allocates `Environment`
  - if using a snapshot, it restores the `Context`
  - it runs `InitializeContextRuntime(...)`
  - it calls `env->InitializeMainContext(...)`
  - if not using a snapshot, it runs `env->principal_realm()->RunBootstrapping()`

### 5. Primordials and per-context scripts

- `src/api/environment.cc:984-1045`
  - `InitializePrimordials(...)` runs:
    - `internal/per_context/primordials`
    - `internal/per_context/domexception`
    - `internal/per_context/messageport`
  - this happens before the normal `Environment` bootstrap finishes

This is important because Node already has a distinction between:

- per-context setup
- per-realm bootstrap
- per-environment / main-entry execution

### 6. Realm bootstrap

- `src/node_realm.cc:195-205`
  - `RunBootstrapping()` calls:
    - `ExecuteBootstrapper("internal/bootstrap/realm")`
    - then `BootstrapRealm()`

- `src/node_realm.cc:331-366`
  - `PrincipalRealm::BootstrapRealm()` then runs:
    - `internal/bootstrap/node`
    - optional browser-global bootstraps
    - thread/process-state switch bootstraps
    - process.env proxy setup

### 7. How builtin JS is injected

This is the key integration point.

- `src/node_builtins.cc:461-520`
  - `BuiltinLoader::CompileAndCall(...)` loads a builtin source blob, compiles it, and calls it
  - for `kBootstrapRealm` scripts it passes:
    - `process`
    - `getLinkedBinding`
    - `getInternalBinding`
    - `primordials`
  - for main/bootstrap scripts it passes:
    - `process`
    - `require`
    - `internalBinding`
    - `primordials`

So the host is not dynamically injecting a pre-built stdlib namespace into V8.
It is compiling JS builtin source into the isolate and calling it with host-provided loaders.

### 8. How `internalBinding()` is made real

- `src/node_binding.cc:30-89`
  - Node keeps an explicit registry of builtin bindings such as:
    - `fs`
    - `tcp_wrap`
    - `pipe_wrap`
    - `udp_wrap`
    - `cares_wrap`
    - `crypto`
    - `contextify`
    - `module_wrap`
    - `async_wrap`
    - `worker`
    - `serdes`
    - `v8`
    - `inspector`
    - etc.

- `src/node_binding.cc:711-716`
  - `RegisterBuiltinBindings()` explicitly registers those C++ binding entrypoints.

- `src/node_binding.h:15-18`
  - bindings are flagged as builtin, linked, or internal.

- `src/node_binding.h:47-68`
  - some bindings also have per-isolate initialization paths.

### 9. `internal/bootstrap/realm` builds the loaders in JS

- `lib/internal/bootstrap/realm.js:1-43`
  - this file explicitly documents that it bootstraps:
    - `process.binding()`
    - `process._linkedBinding()`
    - `internalBinding()`
    - `BuiltinModule`

- `lib/internal/bootstrap/realm.js:136-189`
  - it defines:
    - `process.binding(...)`
    - `process._linkedBinding(...)`
    - closure-local `internalBinding(...)`

- `lib/internal/bootstrap/realm.js:193-199`
  - it reads `builtinIds`, `compileFunction`, and `setInternalLoaders` from `internalBinding('builtins')`
  - it also reads `ModuleWrap` from `internalBinding('module_wrap')`

- `lib/internal/bootstrap/realm.js:227-409`
  - it creates `BuiltinModule`, Node's internal JS builtin loader/cache

- `lib/internal/bootstrap/realm.js:395-398`
  - builtin compilation calls the compiled wrapper with:
    - `exports`
    - `requireFn`
    - `module`
    - `process`
    - `internalBinding`
    - `primordials`

- `lib/internal/bootstrap/realm.js:471-472`
  - it calls `setInternalLoaders(internalBinding, requireBuiltin)`
  - that stores the JS loaders back into the C++ `Realm`

- `src/node_builtins.cc:826-833`
  - `SetInternalLoaders(...)` is the C++ side of that handoff

This is the exact "who binds to who" answer:

- C++ bootstraps a JS file
- that JS file builds `internalBinding` and the builtin JS loader
- then JS hands those loaders back into C++
- later C++ bootstrap scripts use those stored loaders to run the rest of Node

### 10. `internal/bootstrap/node` installs real runtime behavior

- `lib/internal/bootstrap/node.js:3-48`
  - this file documents that it runs after `internal/bootstrap/realm`

- `lib/internal/bootstrap/node.js:133-147`
  - it reads config from `internalBinding('builtins')`

- `lib/internal/bootstrap/node.js:151-170`
  - it binds `process_methods` onto `process`

- `lib/internal/bootstrap/node.js:226-242`
  - it binds async hooks and trace-event hooks through `internalBinding(...)`

This is where the JS runtime becomes recognizably "Node", but it is still built on the earlier C++/JS loader handshake.

### 11. Main script selection

- `src/node_main_instance.cc:103-110`
  - after environment setup, Node calls `LoadEnvironment(...)`
  - then it spins the event loop

- `src/api/environment.cc:562-572`
  - `LoadEnvironment(...)` initializes libuv/diagnostics/compile cache and calls `StartExecution(...)`

- `src/node.cc:320-394`
  - `StartExecution(...)` picks an `internal/main/*` entrypoint such as:
    - `internal/main/eval_string`
    - `internal/main/run_main_module`
    - `internal/main/repl`
    - etc.

- `lib/internal/main/embedding.js:3-10`
  - the embedder path is a special main script used when `LoadEnvironment()` is invoked with a callback or inline source

- `lib/internal/main/embedding.js:18-24`
  - even the embedder path still depends on `contextify` and `modules`

## What Is Actually Portable To Wasm?

There is not a single thing called "the Node stdlib".

There are three layers:

1. JS builtin modules in `lib/**`
2. C++ internal bindings exposed through `internalBinding(...)`
3. V8/embedder machinery needed to create realms, compile modules, create wrapped objects, register hooks, and manage snapshots

### Mostly POSIX-ish / kernel-facing

These are the pieces that look plausibly portable to a Wasm sidecar targeting your existing POSIX ABI:

- `fs`
  - `lib/fs.js:50-65` depends on `internalBinding('constants')` and `internalBinding('fs')`
- networking/data-plane pieces
  - `lib/net.js:61-82` depends on `uv`, `cares_wrap`, `stream_wrap`, `tcp_wrap`, `pipe_wrap`
- `os`
- `process_methods` portions that are really process/runtime state rather than V8 state
- `crypto` portions that are OpenSSL-backed and byte-oriented
- possibly `dns` via `cares_wrap`

These are hard, but conceptually they are "host ABI + buffers + handles" problems.

### V8/embedder-specific

These are the pieces that do not reduce cleanly to POSIX:

- `module_wrap`
  - `lib/internal/modules/cjs/loader.js:78`
  - `src/module_wrap.h:95-117`
  - `src/module_wrap.cc:1670-1717`
  - this wraps V8 modules directly and exposes module lifecycle/status machinery
- `contextify`
  - used for CJS compilation and `vm`-style execution
  - `lib/internal/main/embedding.js:19`
  - `lib/internal/modules/cjs/loader.js:153-155`
- `async_wrap`
  - async hooks into V8/libuv lifecycle
- `serdes`, `heap_utils`, `internal_only_v8`, `v8`
  - direct V8-facing facilities
- `inspector`, `trace_events`, `profiler`
- `worker`
  - because workers are isolate/thread/runtime ownership, not POSIX only
- `mksnapshot`
  - snapshot generation/deserialization is deeply tied to V8 heap state

These are where a pure "compile bindings to Wasm" story breaks down, because the binding API itself is carrying V8 object templates, internal fields, function templates, module objects, callbacks, and snapshot references.

## Why A Full Wasm Fork Is Harder Than It Sounds

### 1. The JS builtins are not standalone

Upstream JS builtins assume that the following already exist before they run:

- `internalBinding`
- `BuiltinModule`
- `primordials`
- `process`
- sometimes `ModuleWrap`

So there is no clean point where you can say "when someone does `require('fs')`, now load the Wasm version of stdlib".

By the time `require('fs')` happens, Node has already booted through earlier loaders that were not optional.

### 2. The real hard boundary is not POSIX, it is V8

If you fork Node and compile a large chunk of its C++ bindings to Wasm, you still need to answer:

- how does Wasm create or manipulate V8 `FunctionTemplate`s?
- how does Wasm create wrapped JS objects with V8 internal fields?
- how does Wasm participate in `ModuleWrap` and module evaluation?
- how does Wasm plug into promise hooks / async hooks?
- how does Wasm participate in inspector/profiler/stack trace integration?
- how does Wasm interact with startup snapshots and external-reference registration?

If the answer is "marshal those through the host", then the expensive part of the project becomes a new host/Wasm ABI for V8 embedder operations.

That is not obviously simpler than the current bridge unless the scope is kept tight.

### 3. A per-module Wasm import model does not match Node's bootstrap

The architecture that best matches upstream Node is:

- boot a Node-compatible runtime once per session
- expose `internalBinding(...)`
- expose a builtin loader
- run the bootstrap scripts
- then use that runtime for `require()` / `import()`

The architecture that does not match Node well is:

- keep today's custom loader
- compile random builtin modules or third-party modules to Wasm one at a time during `require()`

That second model could exist for some special modules later, but it should not be the foundation of a Node-compat port.

## Proposal

### Recommendation

Build a hybrid prototype, not a full fork-first port.

### Target architecture

1. Keep the host-owned V8 isolate.
2. Vendor upstream Node bootstrap JS in a controlled form:
   - `internal/per_context/*`
   - `internal/bootstrap/realm`
   - selected `internal/bootstrap/*`
   - enough `internal/modules/*` to drive real builtin loading
3. Replace Secure Exec's polyfill-first builtin resolution with an upstream-shaped loader:
   - `internalBinding(name)`
   - `BuiltinModule`
   - builtin source table / compile function
4. Implement POSIX-ish bindings behind `internalBinding(...)` using a Wasm module that targets Secure Exec's kernel ABI.
5. Keep V8-only bindings host-side initially:
   - `module_wrap`
   - `contextify`
   - `async_wrap`
   - inspector/profiler/trace hooks
   - snapshot-specific pieces
6. Only after that works, decide whether any host-side V8 bindings are worth moving behind a more formal ABI.

### Why this is the right first cut

- It removes the polyfill-first design.
- It aligns bootstrap order with upstream Node.
- It lets you reuse far more upstream JS logic verbatim.
- It leverages your existing POSIX kernel work where it actually helps.
- It avoids pretending that `module_wrap`/`contextify` are POSIX problems.

### Concrete phase plan

#### Phase 0: bootstrap spike

Goal: prove that Secure Exec can execute upstream-style bootstrap JS without the current polyfill loader.

Deliverables:

- a minimal `internalBinding()` host shim
- builtin source table for a tiny bootstrap subset
- successful execution of:
  - `internal/per_context/primordials`
  - `internal/bootstrap/realm`

Exit criteria:

- `BuiltinModule` exists
- `internalBinding('builtins')` works
- `setInternalLoaders(...)` round-trip works

#### Phase 1: upstream-shaped builtin loading

Goal: load selected real builtins without `node-stdlib-browser`.

Deliverables:

- `path`, `events`, `buffer`, `util`, `fs`, `os`
- real builtin source compilation instead of polyfill source eval

Exit criteria:

- `require('node:fs')` resolves through the upstream-shaped builtin loader
- no `_loadPolyfill('fs')` path involved

#### Phase 2: Wasm POSIX binding runtime

Goal: move POSIX-ish binding implementations behind a Wasm ABI.

Candidate first bindings:

- `fs`
- `constants`
- `os`
- selected `process_methods`
- some network path

Design:

- one Wasm "binding runtime" module, not a separate Wasm blob per builtin
- host exports Secure Exec kernel syscalls / POSIX ABI
- Wasm exports binding entrypoints consumed by the `internalBinding()` shim

Exit criteria:

- upstream `lib/fs.js` can run against the Wasm-backed binding layer

#### Phase 3: module/runtime parity work

Goal: support the pieces of Node needed for real package execution.

Likely still host-side:

- `module_wrap`
- `contextify`
- `async_wrap`

This is where you decide whether the hybrid split is already good enough.

My expectation is that it will be.

## Answer To "Are We Loading V8 Then Dynamically Loading Wasm Bindings On `require()`?"

For a Node-shaped implementation, that should not be the primary model.

The correct high-level model is:

1. host starts V8
2. host creates a Node-compatible environment/realm
3. bootstrap JS installs `internalBinding` and the builtin loader
4. those loaders become the base runtime
5. later `require()` uses that already-booted runtime

If Wasm is introduced, the best place for it is behind `internalBinding(...)`, not as a late replacement for Node's bootstrap loader.

So the better mental model is:

- V8 starts first.
- bootstrap runs first.
- Wasm-backed bindings are available during bootstrap as part of `internalBinding(...)`.
- later `require()` consumes the runtime that bootstrap already established.

Not:

- `require('fs')` -> compile/load a fresh standalone Wasm stdlib fragment

## Answer To "Can We Also Use This To Import Arbitrary Modules By Cross-Compiling Them To Wasm?"

Potentially, but that is a separate project.

Reasons:

- Most npm packages are JS, not C/C++/Rust libraries with a clean POSIX ABI.
- Upstream Node builtin loading is not a template for arbitrary package-to-Wasm conversion.
- A package-to-Wasm story needs:
  - source-language restrictions
  - build-tool integration
  - ABI definitions
  - package metadata / loader policy
  - interop semantics for JS <-> Wasm objects

That can be a useful adjunct system later, but it should not drive the Node bootstrap architecture.

If you want both:

- use an upstream-shaped Node bootstrap/runtime architecture for builtins
- add an optional package compilation/import pipeline later for a constrained class of modules

## Biggest Risks

1. Underestimating V8-specific bindings

The POSIX bindings are not the main architectural blocker. `module_wrap`, `contextify`, `async_wrap`, and snapshot/bootstrap ownership are.

2. Recreating a second bridge under a new name

If the Wasm module still has to RPC every V8-facing action back to the host, you may end up with a more complicated bridge rather than a simpler one.

3. Boot order mismatch

A design centered on late `require()`-time Wasm loading will fight upstream Node's actual bootstrap order.

4. Snapshot assumptions

Upstream Node leans heavily on startup snapshots. Even if you disable snapshots in the prototype, you need to design with that mismatch in mind.

## Recommended Next Steps

1. Build a tiny proof of concept that runs upstream `internal/bootstrap/realm` in Secure Exec.
2. Implement a minimal `internalBinding('builtins')` and `internalBinding('module_wrap')` host shim sufficient for that bootstrap.
3. Replace one real builtin path end to end, preferably `fs`, using upstream `lib/fs.js`.
4. Only after that, design a Wasm ABI for the POSIX-ish binding subset.
5. Do not commit to a full Node fork until the Phase 0 + Phase 1 spike proves that the hybrid architecture is materially simpler than the current bridge.

## Bottom Line

Compiling "the Node stdlib" to Wasm is not one problem. It is at least two:

- a POSIX binding portability problem
- a V8/embedder integration problem

Secure Exec already has strong answers for the first problem.
It does not yet have a cheap answer for the second.

So the practical path is:

- stop emulating Node with browser polyfills
- adopt upstream Node's bootstrap shape
- put Wasm behind the POSIX-ish `internalBinding(...)` modules
- leave the V8-specific bindings host-side unless the prototype proves they are worth moving

That is the version of this idea that looks technically sound.
