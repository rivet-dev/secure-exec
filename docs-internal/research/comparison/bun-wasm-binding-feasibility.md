# Bun Wasm Binding Feasibility Research

Date: 2026-03-30

Repository clone: `/home/nathan/misc/bun`

## Goal

Evaluate how feasible it would be to compile Bun's standard library and binding layer to WebAssembly, then bind that Wasm to a host-owned JavaScript runtime, either:

- V8 owned by Secure Exec, or
- JavaScriptCore owned by Secure Exec

The key question is whether Bun's bindings are generic enough to survive a WebAssembly boundary, or whether they are tightly coupled to Bun's current engine and host runtime.

## Executive Summary

My conclusion is:

- Compiling selected Bun backend logic to Wasm is plausible.
- Compiling Bun's "standard library" wholesale into a generic Wasm component and then binding it to a host V8 runtime is not easy.
- If the host runtime is JavaScriptCore instead of V8, reuse becomes more plausible, but Bun still is not structured as a runtime-neutral Wasm library.

Confidence levels:

- V8 host + Bun stdlib/bindings in Wasm: `2/10`
- JSC host + selective Bun reuse with host-side JSC glue: `5/10`
- Reusing only Bun's JS `node:*` modules while replacing the native substrate: `6/10`

The core reason is that Bun's runtime is deeply organized around:

1. JavaScriptCore types such as `JSGlobalObject`, `CallFrame`, and `JSValue`
2. a custom builtin module compiler/registry
3. code-generated Zig/C++ bindings for JavaScriptCore-backed classes
4. Bun-specific JS preprocessor syntax such as `$zig`, `$newZigFunction`, and private builtin intrinsics

That is not a generic runtime boundary.

## Primary Findings

### 1. Bun's runtime is explicitly JavaScriptCore-native

Bun's own docs and source organization make this explicit.

Relevant references:

- `/home/nathan/misc/bun/docs/project/license.mdx`
- `/home/nathan/misc/bun/src/bun.zig`
- `/home/nathan/misc/bun/src/bun.js/jsc.zig`
- `/home/nathan/misc/bun/src/bun.js/VirtualMachine.zig`

Key lines:

- `license.mdx:10-20`: Bun statically links JavaScriptCore and builds C++ bindings for it.
- `bun.zig:719-725`: `bun.jsc` is the runtime binding layer for JavaScriptCore primitives.
- `VirtualMachine.zig:1-5`: the VM is the shared global state for one JS instance.
- `VirtualMachine.zig:27-58`: the VM directly owns `global`, `jsc_vm`, module loader, timers, event loop, and runtime state.
- `jsc.zig:1-2`: the file describes itself as bindings to JavaScriptCore and other JS primitives.

Interpretation:

Bun is not an engine-neutral runtime with an abstract backend. It is a JavaScriptCore-native runtime whose core types and ownership model are centered on JSC.

### 2. Bun's builtins are not ordinary JS modules

Bun's `src/js` modules are not standard ESM or standard CommonJS. They are preprocessed Bun builtins compiled into the runtime.

Relevant references:

- `/home/nathan/misc/bun/src/js/README.md`
- `/home/nathan/misc/bun/src/bun.js/bindings/InternalModuleRegistry.h`
- `/home/nathan/misc/bun/src/bun.js/bindings/InternalModuleRegistry.cpp`

Key lines:

- `src/js/README.md:10`: modules are assigned numeric IDs and inlined into a lazily initialized array.
- `src/js/README.md:14-39`: the `$` prefix exposes private names and JSC intrinsics; literal `require(...)` calls are rewritten into internal module registry lookups.
- `src/js/README.md:49-66`: builtin modules are preprocessed into wrapped functions and are not real ESM.
- `src/js/README.md:96-119`: preprocessing rewrites `$` intrinsics, `require(string)`, and `export default`, then inlines the result into C++ headers loaded with `createBuiltin`.
- `InternalModuleRegistry.h:12-20`: the internal module registry is an array of lazily initialized modules backed by JS and native sources.
- `InternalModuleRegistry.cpp:32-74`: Bun compiles builtin source with JavaScriptCore `createBuiltin` and runs it as a module factory.
- `InternalModuleRegistry.cpp:162-189`: modules are lazy-loaded by numeric ID and cached in internal fields.

Interpretation:

Even Bun's JS layer is not portable source code in the Node sense. It depends on Bun's own builtin compiler, module preprocessing, and JSC builtin execution path.

### 3. Many `node:*` modules are JS, but they call Bun-native entrypoints

There is real JS in `src/js/node`, and some of it is fairly high-level. However, those modules often call directly into Bun-specific native hooks.

Relevant references:

- `/home/nathan/misc/bun/src/js/node/fs.promises.ts`
- `/home/nathan/misc/bun/src/js/node/fs.ts`
- `/home/nathan/misc/bun/src/js/node/net.ts`
- `/home/nathan/misc/bun/src/js/node/readline.ts`
- `/home/nathan/misc/bun/src/js/node/http.ts`
- `/home/nathan/misc/bun/src/js/node/_http_server.ts`

Key lines:

- `fs.promises.ts:4`: `node:fs/promises` gets its binding via `$zig("node_fs_binding.zig", "createBinding")`
- `fs.ts:13-16`: `node:fs` explicitly states that `fs` comes from `node_fs_binding.zig` and also reads `$processBindingConstants`
- `net.ts:41-56`: `node:net` uses `process.binding("uv")`, `$zig(...)`, and `$newZigFunction(...)`
- `readline.ts:44`: `node:readline` uses `$newZigFunction("string.zig", "String.jsGetStringWidth", 1)`
- `http.ts:9`: `node:http` depends on `internal/http`
- `_http_server.ts:60-61`: the HTTP server path calls `$newZigFunction("node_http_binding.zig", ...)` and cluster helpers

Interpretation:

Some high-level JS modules are reusable in principle, but they are not self-contained. They expect Bun-specific private syntax and Bun-native binding entrypoints.

### 4. Bun's native bindings are typed directly in JSC objects

The native binding layer is not expressed as a generic ABI. It is written as Zig functions that take and return JSC types.

Relevant references:

- `/home/nathan/misc/bun/docs/project/bindgen.mdx`
- `/home/nathan/misc/bun/docs/project/contributing.mdx`
- `/home/nathan/misc/bun/src/bun.js/node/node_fs_binding.zig`
- `/home/nathan/misc/bun/src/bun.js/node/node_http_binding.zig`
- `/home/nathan/misc/bun/src/bun.js/node/node.classes.ts`

Key lines:

- `bindgen.mdx:8-18`: Bun's bindgen scans `*.bind.ts` and generates JS/native glue.
- `bindgen.mdx:24-37`: the example binding function signature takes `*jsc.JSGlobalObject` and returns JS-facing values.
- `bindgen.mdx:65-68`: JS files obtain native handles via `$bindgenFn(...)`.
- `contributing.mdx:205-209`: Bun generates Zig and C++ bindings for JavaScriptCore classes and bundles builtin modules/functions into the binary.
- `node_fs_binding.zig:1-2`: the binding surface is typed as functions over `*jsc.JSGlobalObject`, `*jsc.CallFrame`, and `jsc.JSValue`
- `node_fs_binding.zig:84-90`: the FS binding class is generated through `jsc.Codegen`
- `node_fs_binding.zig:203-209`: `createBinding` constructs and returns a JS-visible binding object for the current global object
- `node_http_binding.zig:1-40`: HTTP helpers also directly consume and return JSC values
- `node.classes.ts:1-2`: class definitions are fed through Bun's code generator

Interpretation:

This is the opposite of a runtime-neutral Wasm ABI. The binding signatures are designed around JSC object graphs and Bun's class generator.

### 5. Bun's N-API is for addon compatibility, not for core runtime abstraction

Bun does implement N-API, but its implementation is itself layered on top of JSC. It is not the internal abstraction layer for Bun core.

Relevant references:

- `/home/nathan/misc/bun/src/napi/napi.zig`
- `/home/nathan/misc/bun/src/bun.js/bindings/napi.cpp`

Key lines:

- `napi.zig:7-8`: `NapiEnv.toJS()` returns `*jsc.JSGlobalObject`
- `napi.zig:126-131`: `napi_callback_info` is `*jsc.CallFrame`, and `napi_value` maps directly to `jsc.JSValue`
- `napi.cpp:1-18`: the implementation includes Bun headers plus `JavaScriptCore/...`
- `napi.cpp:82-150`: the N-API preamble and operations are implemented against JSC runtime state

Interpretation:

Bun's N-API layer helps Bun run native addons. It does not mean Bun core bindings have already been abstracted away from JSC.

### 6. Browser polyfills are irrelevant to runtime reuse

Bun has `src/node-fallbacks`, but those are only for `bun build --target=browser`, not Bun's actual runtime.

Relevant reference:

- `/home/nathan/misc/bun/src/node-fallbacks/README.md`

Key lines:

- `node-fallbacks/README.md:7-10`: these files are not used by Bun's runtime

Interpretation:

They do not help with a Wasm-hosted Bun runtime plan.

## What the Boot Model Looks Like

At a high level, Bun boots like this:

1. `VirtualMachine` owns the per-instance runtime state, including:
   - `JSGlobalObject`
   - JSC VM
   - module loader
   - event loop
   - timers
   - node/fs/runtime state
2. Builtin JS modules are bundled into the runtime and given numeric module IDs.
3. `InternalModuleRegistry` lazy-loads a builtin module by numeric ID.
4. For JS builtins, Bun compiles the builtin source with JavaScriptCore `createBuiltin(...)`.
5. JS modules call native Zig/C++ bindings via Bun-private mechanisms such as:
   - `$zig(...)`
   - `$newZigFunction(...)`
   - `process.binding(...)`
6. Those native bindings operate directly on `JSGlobalObject`, `CallFrame`, and `JSValue`.

This means the ownership chain is:

`JSC VM/global` -> `VirtualMachine` -> `InternalModuleRegistry` / builtin source -> JS module -> JSC-typed Zig/C++ binding

There is no engine-neutral seam in the middle where a Wasm component can simply be dropped in.

## Feasibility by Architecture

### Option A: Host V8 + Bun stdlib/bindings compiled to Wasm

This is the least plausible option.

Main blockers:

1. Bun's JS builtin syntax is not portable as-is.
   - It depends on `$` intrinsics and Bun's builtin preprocessor.
2. Bun's builtin loader is JSC-specific.
   - It uses `createBuiltin(...)` and `InternalModuleRegistry`.
3. Bun's core native signatures are JSC-specific.
   - `JSGlobalObject`
   - `CallFrame`
   - `JSValue`
4. Bun's generated classes are JSC-specific.
5. N-API does not save this.
   - Bun uses N-API for addon compatibility, but Bun core is not built on a generic N-API/provider abstraction the way Edge tries to be.

What would be required:

- replace Bun's builtin compiler/registry with an engine-neutral loader
- strip or emulate Bun's `$` intrinsics and preprocessor
- replace all JSC-typed binding entrypoints with a host/Wasm ABI
- build a JS value handle model for exceptions, promises, objects, classes, GC roots, and callbacks
- rework generated classes so they target that ABI instead of JSC

This is not "compile the stdlib to Wasm." It is "fork Bun's runtime architecture."

### Option B: Host JavaScriptCore + Bun backend pieces compiled to Wasm

This is more plausible, but still not simple.

Why it improves:

- Bun's builtin compiler and JSC assumptions could remain host-side.
- Generated classes and binding stubs could continue targeting JSC.
- More of Bun's current JS modules could remain intact.

What still remains hard:

- the Wasm boundary still cannot own `JSGlobalObject`, `CallFrame`, or `JSValue`
- host trampolines would still be required for every native binding
- class construction, object identity, GC lifetimes, finalization, and async callbacks remain engine-owned
- a significant amount of Bun's "native stdlib" is really "engine-integrated runtime code," not just OS-facing code

In this model, Wasm would be a backend for selected operations, not the place where Bun's core binding layer lives.

### Option C: Reuse selected Bun JS modules, replace the substrate

This is the most realistic reuse strategy.

Candidate modules:

- parts of `node:http`
- parts of `node:readline`
- portions of `node:fs`
- portions of `node:stream`

But only after:

- removing Bun-private syntax
- replacing Bun-native calls
- replacing `process.binding(...)` dependencies
- providing equivalent internal modules/constants

This would be adaptation work, not direct compilation.

## What a Wasm-Friendly Split Would Actually Look Like

If Bun were to be adapted toward a Wasm backend, the right split would be:

1. Host-owned engine layer
   - V8 or JSC
   - owns contexts, JS values, classes, promises, exceptions, microtasks
2. Host-owned builtin/module loader
   - source registry
   - module compilation
   - internal module resolution
3. Wasm backend layer
   - POSIX/kernel-facing operations
   - filesystem
   - sockets
   - DNS helpers
   - compression/crypto helpers where practical
4. JS stdlib layer
   - higher-level JS behavior

That is not how Bun is currently factored.

## Comparison to Edge.js

Compared to Edge:

- Edge tries to centralize runtime code behind an N-API/provider boundary.
- Bun centralizes much less behind a generic provider boundary.
- Bun is more deeply integrated with its engine through custom builtins, codegen, and JSC object plumbing.

So if the question is "which repo looks closer to a Wasm-backend architecture with a host-owned engine boundary?", the answer is:

- Edge is structurally closer.
- Bun is structurally faster/more integrated, but less portable at the binding seam.

## Recommendation

Do not treat Bun as a candidate for "compile the standard library to Wasm and bind it to our own V8 runtime."

If Bun is interesting at all, it is for one of these narrower paths:

1. Adopt JavaScriptCore as the host engine and selectively borrow Bun runtime ideas.
2. Reuse selected Bun JS `node:*` modules after adaptation.
3. Borrow Bun's performance-oriented implementation ideas for native subsystems, not its runtime boundary.

For Secure Exec specifically:

- Bun is not a cleaner path than the Node-shaped bootstrap work.
- If the goal is a generic Wasm-bound native substrate, Bun's current architecture does not give that to us.
- If the goal is standards/Node compatibility with a kernel-backed runtime, Bun is more useful as reference material than as a portability base.

## Bottom Line

Bun's bindings are not generic in the way required for a clean Wasm boundary.

They are tightly coupled to:

- JavaScriptCore object types
- Bun's builtin preprocessor
- Bun's internal module registry
- Bun's generated Zig/C++ class/binding system

That means Bun is not an "easy compile-to-Wasm stdlib" candidate.

The most practical conclusion is:

- V8 host + Bun-Wasm core: not attractive
- JSC host + selective Bun reuse: somewhat plausible
- Bun as direct foundation for Secure Exec's generic binding architecture: low fit
