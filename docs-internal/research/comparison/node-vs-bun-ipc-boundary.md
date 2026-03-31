# Node vs Bun IPC Boundary Distinction

Date: 2026-03-30

## Question

Does Node.js already have a clean IPC system for its core runtime, and how is that different from Bun?

## Short Answer

No.

Node.js does **not** already have a built-in "core runtime over IPC" architecture.

The real distinction is:

- Node has a **cleaner seam for introducing** an IPC/Wasm boundary.
- Bun has a **tighter engine-integrated runtime**, so introducing that same boundary is much harder.

So the claim is not:

- "Node already solved IPC"

The claim is:

- "Node is easier to refactor into an IPC-backed architecture than Bun."

## The Distinction

### Node

Upstream Node is still mostly in-process:

- JS stdlib calls native bindings directly inside the same runtime
- native code calls back into JS inside the same engine
- there is no stock mode where Node core runs behind IPC

But Node is easier to adapt because it has:

1. A clearer bootstrap sequence
2. A clearer `internalBinding()` seam
3. More stdlib code in ordinary JS modules under `lib/`
4. A more legible separation between:
   - JS stdlib behavior
   - native binding surface
   - engine/embedder-specific code

Relevant references:

- `/home/nathan/misc/node/lib/internal/bootstrap/realm.js`
- `/home/nathan/misc/node/src/node_builtins.cc`
- `/home/nathan/misc/node/src/node_binding.cc`
- `/home/nathan/misc/node/lib/fs.js`
- `/home/nathan/misc/node/src/node_file.cc`

Concrete example:

- JS creates an `FSReqCallback`
- JS sets `req.oncomplete = callback`
- native code does the work
- native code later invokes `req.oncomplete(...)`

That is still in-process, but it maps relatively well to an IPC design where:

- the host keeps the callback
- the backend only gets a numeric request ID
- completion comes back as data tagged with that ID

So Node does not come with IPC, but it naturally lends itself to:

- value RPC
- request IDs
- host-owned callbacks

### Bun

Bun also does not come with a generic IPC runtime architecture, but it is significantly harder to retrofit because the runtime boundary is much more engine-shaped.

Relevant references:

- `/home/nathan/misc/bun/src/js/README.md`
- `/home/nathan/misc/bun/src/bun.js/bindings/InternalModuleRegistry.cpp`
- `/home/nathan/misc/bun/src/bun.js/VirtualMachine.zig`
- `/home/nathan/misc/bun/src/bun.js/node/node_fs_binding.zig`
- `/home/nathan/misc/bun/src/napi/napi.zig`

The hard part is not only imports. Bun ties together:

- builtin module compilation
- internal module registry
- JSC-native values like `JSGlobalObject`, `CallFrame`, `JSValue`
- generated Zig/C++ classes
- Bun-specific builtin syntax and binding hooks

That means the likely IPC boundary is not:

- "call a named binding and return plain data"

It is much closer to:

- "pass around engine-shaped object handles, callbacks, promises, and class instances"

That requires a substantially fatter remote-object protocol.

## Practical Meaning

### What "Node is easier" actually means

It means Node is easier to reshape into:

1. Host-owned engine
2. Upstream-ish JS stdlib
3. IPC/Wasm-backed native substrate
4. Explicit host-side callback/handle registry

It does **not** mean:

1. Node already provides IPC for core stdlib
2. Node has already abstracted all engine-specific code
3. Node can be dropped behind Wasm without host-side work

### What "Bun is harder" actually means

It means Bun more often requires:

1. Engine-native object identity
2. Engine-native callback and promise plumbing
3. Engine-specific builtin compilation/instantiation
4. Generated runtime classes tied to the active engine

So the IPC layer would need to be more than value RPC. It would need to become a remote JS object ABI.

## Secure Exec Today

Secure Exec's current V8 bridge is already closer to the Node-shaped model than the Bun-shaped one.

Relevant references:

- `/home/nathan/secure-exec-5/packages/v8/src/runtime.ts`
- `/home/nathan/secure-exec-5/packages/v8/src/ipc-binary.ts`
- `/home/nathan/secure-exec-5/packages/nodejs/src/ivm-compat.ts`
- `/home/nathan/secure-exec-5/packages/nodejs/src/bridge/child-process.ts`
- `/home/nathan/secure-exec-5/packages/core/src/shared/bridge-contract.ts`

Current shape:

- normal bridge calls are serialized value RPC
- some long-lived resources use explicit IDs or named dispatch channels
- there is not yet a general-purpose remote object/reference system

That means Secure Exec already aligns more naturally with a Node-style "binding calls over value IPC" design than with a Bun-style "remote engine object ABI" design.

## Bottom Line

Node does not already have a clean IPC system for core runtime behavior.

It is simply easier than Bun to **build** one, because the seam you need to intercept is narrower and more explicit.

The distinction is:

- Node: no existing IPC, but a cleaner boundary for adding it
- Bun: no existing IPC, and a much messier boundary for adding it
