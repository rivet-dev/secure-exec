# Edge.js Binding Architecture Research

Date: 2026-03-30

Repository clone: `/home/nathan/misc/edgejs`

## Goal

Understand how Edge.js adapted Node's internal binding/bootstrap model to use an N-API-centered architecture, and determine whether it made bindings fully pluggable or merely abstracted the engine/provider boundary.

## Executive Summary

Edge.js does not remove Node's internal binding model.

Instead, it does 4 things:

1. Makes `N-API` the mandatory runtime-facing API boundary.
2. Forbids direct `v8::...` usage inside `src/`.
3. Rebuilds Node's builtin bootstrap path around an Edge-owned module loader.
4. Routes `internalBinding(...)` resolution through a dispatch layer and callback/provider interfaces.

The important nuance is that Edge's bindings are not "completely pluggable" in the sense of arbitrary runtime-defined modules. They are pluggable at the provider/resolver layer while still preserving a fixed catalog of Node-like internal binding names such as `fs`, `tcp_wrap`, `tty_wrap`, `module_wrap`, and `contextify`.

## Primary Findings

### 1. Edge makes N-API the hard boundary

The architecture document explicitly states that `src/` must not depend on V8 headers or `v8::...` APIs. Engine-specific code is expected to live outside `src`, under the N-API provider layer.

Relevant references:

- `/home/nathan/misc/edgejs/ARCHITECTURE.md`
- `/home/nathan/misc/edgejs/CMakeLists.txt`

Key lines:

- `ARCHITECTURE.md:3-5`: Edge replaces Node while preserving `N-API` as the core interface.
- `ARCHITECTURE.md:16-24`: files in `src/` must not include V8 headers or use `v8::`.
- `CMakeLists.txt:138-156`: build-time provider selection via `EDGE_NAPI_PROVIDER`.
- `CMakeLists.txt:158-173`: hard gate that forbids V8 usage in `src`.

Interpretation:

Edge's main abstraction boundary is not "stdlib compiled to Wasm" or "stdlib decoupled from bootstrap." It is "runtime code talks to an engine-abstracted API boundary."

### 2. Edge reimplements the builtin bootstrap contract

Edge has its own builtin/module loader that reconstructs the execution model Node expects for `internal/bootstrap/*`, `internal/main/*`, per-context scripts, and ordinary builtins.

Relevant reference:

- `/home/nathan/misc/edgejs/src/edge_module_loader.cc`

Key lines:

- `edge_module_loader.cc:920-930`: builtin execution-kind classification.
- `edge_module_loader.cc:963-1055`: `BuiltinsCompileFunctionCallback`.
- `edge_module_loader.cc:3332-3402`: `GetOrCreateNativeBuiltinsBinding(...)`.
- `edge_module_loader.cc:4844-4956`: `EdgeGetInternalBinding(...)`, `EdgeRequireBuiltin(...)`, `EdgeExecuteBuiltin(...)`, `EdgeInstallModuleLoader(...)`.

The important part of `BuiltinsCompileFunctionCallback` is that Edge compiles builtin source with different wrapper signatures depending on module kind:

- `internal/bootstrap/realm` gets arguments shaped like Node's bootstrap expectations.
- per-context scripts get `exports`, `primordials`, and isolate symbols.
- bootstrap/main scripts get `process`, `require`, `internalBinding`, `primordials`.
- ordinary builtins get `exports`, `require`, `module`, `process`, `internalBinding`, `primordials`.

Interpretation:

Edge is not bypassing Node's bootstrap semantics. It is rehosting them.

### 3. Edge preserves `internalBinding(...)` as the key stdlib-native seam

Edge recreates the native `builtins` binding object, including the fields Node bootstrap depends on:

- `builtinIds`
- `natives`
- `config`
- `hasCachedBuiltins`
- `compileFunction`
- `setInternalLoaders`

Relevant reference:

- `/home/nathan/misc/edgejs/src/edge_module_loader.cc`

Key lines:

- `edge_module_loader.cc:3332-3402`

Interpretation:

This is the most relevant part for Secure Exec. It confirms that the realistic integration strategy is to provide the bootstrap contract Node expects, not to inject a custom loader after the standard library is already running.

### 4. Edge introduces a dispatch/resolver layer for internal bindings

Bindings are resolved through a registry and callback structure rather than by scattering direct V8-specific logic throughout the runtime.

Relevant references:

- `/home/nathan/misc/edgejs/src/internal_binding/dispatch.h`
- `/home/nathan/misc/edgejs/src/internal_binding/dispatch.cc`

Key lines:

- `dispatch.h:10-24`: `ResolveCallbacks` callback surface.
- `dispatch.cc:81-143`: static resolver registry for binding names.
- `dispatch.cc:147-153`: `Resolve(...)` dispatch entrypoint.

The callback surface includes dedicated hooks for:

- builtins
- task queue
- errors
- trace events
- general binding resolution
- special resolution for `uv`, `contextify`, `modules`, and `options`

Interpretation:

This is Edge's real pluggability mechanism. The runtime does not become fully generic, but binding lookup becomes centralized and provider-driven.

### 5. Edge still carries engine-specific capabilities, just behind the boundary

Edge uses `unofficial_napi_*` helpers for capabilities that are still fundamentally engine/embedder sensitive, such as:

- compile function
- run script
- make context
- process microtasks
- terminate execution
- serdes support

Relevant reference:

- `/home/nathan/misc/edgejs/src/edge_module_loader.cc`

Representative lines:

- `edge_module_loader.cc:1040`
- `edge_module_loader.cc:1494`
- `edge_module_loader.cc:2972`
- `edge_module_loader.cc:3155`
- `edge_module_loader.cc:3236`
- `edge_module_loader.cc:3279`
- `edge_module_loader.cc:3323`

Interpretation:

Edge did not eliminate engine coupling. It pushed it behind a provider boundary so the rest of the runtime can stop talking to V8 directly.

## Concrete Examples

### Builtins binding normalization

Relevant reference:

- `/home/nathan/misc/edgejs/src/internal_binding/binding_builtins.cc`

Key lines:

- `binding_builtins.cc:163-171`

This file resolves the builtins binding through callback-provided machinery and then normalizes the binding surface through N-API-visible helpers.

### Contextify binding adaptation

Relevant reference:

- `/home/nathan/misc/edgejs/src/internal_binding/binding_contextify.cc`

Key lines:

- `binding_contextify.cc:71-78`

This file shows the pattern clearly: Edge does not inline direct V8 wiring in the general runtime path. Instead it delegates to callback-provided support for contextify and then patches compatibility behavior through the abstracted binding layer.

## What Edge Did Not Do

Edge did not:

- make all Node bindings arbitrary runtime plugins
- remove the need for a host/runtime bootstrap owner
- remove the need for engine-specific capabilities like context creation and script compilation
- prove that Node core can be made Wasm-native simply by recompiling the standard library

Instead, Edge preserved the Node bootstrap contract and internal binding names while abstracting the engine/provider implementation.

## Implications for Secure Exec

Edge's architecture supports the earlier conclusion from the Node bootstrap research:

1. The realistic target is not "compile all of Node to Wasm first."
2. The realistic target is "rehost the Node bootstrap contract and internal binding surface."
3. POSIX-oriented bindings can likely sit behind a custom backend boundary, including a Wasm-backed one.
4. V8/embedder-sensitive bindings should remain host-side initially.

Most relevant carryover ideas for Secure Exec:

- implement an Edge-style `builtins` binding surface
- centralize `internalBinding(...)` resolution through one registry
- separate engine-facing bindings from POSIX/kernel-facing bindings
- make the backend/provider layer swappable without rewriting bootstrap JS

## Recommended Next Step

Use these findings to draft a Secure Exec design note for:

- builtin source registry
- `compileFunction(id)` and `setInternalLoaders(...)`
- internal binding registry
- host-side binding group
- Wasm-backed binding group

That design should explicitly classify bindings into:

- V8/embedder-owned: `module_wrap`, `contextify`, async/embedder state
- kernel/POSIX-owned: `fs`, `tty_wrap`, socket/process bindings where practical

## Bottom Line

Edge did not turn Node's standard library into a free-floating portable unit.

It made the runtime boot contract and binding lookup explicit, then moved engine-specific behavior behind an N-API/provider boundary. That is useful for Secure Exec because it suggests a path to replace ad hoc polyfills with a structured bootstrap and binding registry, without pretending the V8 boundary disappears.
