# JS vs WASM OS Layer

**Date:** 2026-03-16

## Question

Could we write the OS host layer (WASI polyfill, VFS, FD table, process manager, pipeline orchestrator) in Rust compiled to WASM instead of JavaScript? Would it have tangible performance gains?

## Current Architecture

```
┌─────────────────────────────────────┐
│  JS Host (~5,000 lines)             │
│  wasi-polyfill.ts  (1,630 lines)    │  ← intercepts WASI syscalls
│  vfs.ts            (688 lines)      │  ← in-memory filesystem
│  process.ts        (857 lines)      │  ← Worker spawning, Atomics sync
│  fd-table.ts       (398 lines)      │  ← file descriptor management
│  pipeline.ts       (292 lines)      │  ← pipeline orchestration
│  ring-buffer.ts    (190 lines)      │  ← SharedArrayBuffer IPC
│  worker-adapter.ts (188 lines)      │  ← browser/Node Worker compat
│  worker-entry.ts   (242 lines)      │  ← WASM bootstrap
│  user.ts           (175 lines)      │  ← user identity
│  wasm-os.ts        (159 lines)      │  ← public API
│  index.ts          (8 lines)        │  ← export
└──────────────┬──────────────────────┘
               │ WebAssembly imports/exports
┌──────────────▼──────────────────────┐
│  WASM Binary (8+ MB)                │
│  brush-shell (bash 5.x)             │
│  90+ Unix commands (uutils, etc.)   │
│  All computation happens here       │
└─────────────────────────────────────┘
```

## Can WASM Modules Talk Across Threads in Browsers?

Only through SharedArrayBuffer + Atomics. There is no native WASM-to-WASM IPC mechanism. Two WASM instances in separate Workers can share a `SharedArrayBuffer` and coordinate via `Atomics.wait` / `Atomics.notify` — which is exactly what we already do for inter-process pipes. There's no higher-level primitive available.

The WASM threads proposal (`--shared-memory`, `atomics`) allows a single WASM instance to spawn threads that share the same linear memory, but this is different from multi-process communication. Each of our Workers runs a separate WASM instance with its own memory.

## Why the OS Layer Stays in JavaScript

### 1. The OS layer is almost entirely browser API calls

The host layer's job is to coordinate between the WASM binary and browser/Node.js APIs. Nearly every function in the OS layer bottoms out in a JavaScript API call:

| OS layer function | Underlying JS API |
|---|---|
| Spawn a process | `new Worker()` or `worker_threads.Worker()` |
| Wait for process | `Atomics.wait()` on SharedArrayBuffer |
| Notify process | `Atomics.notify()`, `Atomics.store()` |
| Send data to Worker | `worker.postMessage()` |
| Create pipe | `new SharedArrayBuffer()` |
| Get current time | `Date.now()`, `performance.now()` |
| Get random bytes | `crypto.getRandomValues()` |
| Instantiate WASM | `WebAssembly.instantiate()` |
| Compile WASM | `WebAssembly.compile()` |

If the OS layer were in WASM, every one of these would need to call back into JavaScript via an import. You'd be trading JS→JS calls for WASM→JS FFI calls, which are strictly slower.

### 2. FFI boundary overhead kills the gains

Each call from WASM to a JS import involves:
- Argument marshaling (converting WASM i32/i64/f64 to JS values)
- Crossing the sandbox boundary (security checks, context switch)
- GC interaction (JS values may trigger garbage collection)
- Return value marshaling back to WASM

For computation-heavy work (parsing, regex, sorting), WASM is faster than JS. But the OS layer isn't computation-heavy — it's coordination. It reads a syscall number, looks up an FD, calls a browser API, and returns an errno. The overhead of crossing the FFI boundary twice per syscall would likely make a WASM OS layer *slower* than the current JS one.

### 3. What's already in WASM (the expensive stuff)

The performance-sensitive work already runs in WASM:
- Shell parsing and evaluation (brush-shell)
- Text processing (grep, sed, awk, sort, etc.)
- JSON processing (jaq)
- File content manipulation (cat, head, tail, etc.)
- All command-line argument parsing

What remains in JS is pure glue — routing syscalls to the right place, managing Worker lifecycle, serializing VFS snapshots. This is not where time is spent.

### 4. Browser APIs are not accessible from WASM

WASM has no built-in way to:
- Create threads/Workers
- Allocate SharedArrayBuffers
- Use Atomics
- Access the DOM or Web APIs
- Make network requests
- Read the system clock

All of these require JS imports. A WASM OS layer would be a Rust program that calls JS for every I/O operation — essentially the same code as today but with an extra translation layer.

## Where WASM *Would* Help

There are narrow cases where moving logic to WASM could be faster:

| Logic | Current | Benefit of WASM |
|---|---|---|
| Path resolution / normalization | JS string ops in vfs.ts | Marginal — paths are short |
| Glob pattern matching | JS regex in vfs.ts | Marginal — already fast |
| Permission bit checking | JS bitwise in vfs.ts | Negligible |
| FD table lookup | JS Map in fd-table.ts | Negligible — O(1) already |
| VFS inode traversal | JS object graph | Possible for very large filesystems |
| Snapshot serialization | JS JSON.stringify equivalent | Possible for large VFS snapshots |

None of these are bottlenecks in practice. The dominant costs are Worker spawn time (~5-10ms), Atomics.wait latency (~1ms), and WASM instantiation (~20-50ms).

## What Would Change If We Did It Anyway

If we moved the OS layer to WASM, the architecture would look like:

```
┌───────────────────────────────────────┐
│  Thin JS Shim (~500 lines)            │
│  - Worker creation                    │
│  - SharedArrayBuffer allocation       │
│  - Atomics operations                 │
│  - WebAssembly.instantiate            │
│  - Date.now / crypto.getRandomValues  │
└──────────────┬────────────────────────┘
               │ imports (JS APIs exposed to WASM)
┌──────────────▼────────────────────────┐
│  OS Layer WASM (~3,000 lines Rust)    │
│  - WASI polyfill logic                │
│  - VFS (inode tree, path resolution)  │
│  - FD table                           │
│  - Process table                      │
│  - Ring buffer protocol               │
└──────────────┬────────────────────────┘
               │ WASI imports/exports
┌──────────────▼────────────────────────┐
│  Application WASM (8+ MB)             │
│  brush-shell + multicall commands     │
└───────────────────────────────────────┘
```

This adds a layer of indirection without removing the JS dependency. The thin JS shim is still required because browser APIs are only accessible from JavaScript. The OS layer WASM would call into the JS shim for every I/O operation.

**Estimated effort:** 2-4 weeks to rewrite ~3,500 lines of TypeScript as Rust, plus design the import interface between the OS WASM and the JS shim.

**Estimated performance gain:** Negligible to negative. The bottleneck is I/O coordination (Worker spawning, Atomics, postMessage), not the OS layer logic.

## Conclusion

Keep the OS layer in JavaScript. The expensive computation is already in WASM. The OS layer is glue code that calls browser APIs — moving it to WASM adds FFI overhead without removing the JS dependency. The right optimization targets are reducing Worker spawn latency (module caching), reducing VFS snapshot size (delta snapshots), and reducing Atomics.wait contention (batched I/O) — none of which require rewriting the OS layer.

## Upcoming WASM Proposals That Could Change This

As of March 2026, several proposals are in-flight that could improve WASM-to-WASM communication and reduce dependence on JavaScript. None are ready for production use yet.

### Component Model (Phase 2–3, no browser support)

The WASM Component Model adds typed interfaces (WIT), module composition, and structured host↔guest communication. Server-side Wasmtime projects use this today. It would let WASM modules define typed imports/exports and compose without JS glue.

**Browser status:** Not supported natively by any browser. The `jco` tool (Bytecode Alliance) transpiles WASM components into core WASM + JS glue code for browser use. This adds a build step and bundle size — it's a workaround, not native support. WASI 1.0 (which depends on the Component Model) is expected late 2026 or early 2027. Browser-native Component Model support has no announced timeline.

**Impact on us:** Even if browsers shipped Component Model support, it would replace our JS import/export glue but not eliminate the need for JS entirely — Worker spawning, SharedArrayBuffer, and Atomics are still browser APIs.

### Shared-Everything Threads (Phase 1–2)

This proposal allows WASM modules to share all kinds of data between threads — shared tables, shared functions, shared globals, shared GC objects. It includes thread-local globals, sequentially consistent atomic access to shared data, and futex-like wait/notify on shared GC data.

**Browser status:** Not supported in any browser or major runtime yet. Still in early proposal stages.

**Impact on us:** This is the most relevant proposal. If it ships, it could allow multiple WASM instances (our Workers) to share memory and synchronize without going through JavaScript. We could potentially replace our SharedArrayBuffer ring buffers with native WASM shared memory + WASM-level atomics, eliminating the JS middleman for IPC. This would be a meaningful performance improvement for pipeline-heavy workloads.

**Timeline:** Years away. The `wasi-threads` proposal (a simpler predecessor) was withdrawn in August 2023 in favor of this broader approach. No browser implementation timeline announced.

### Stack Switching (Phase 3)

Allows a WASM module to manage multiple execution stacks — enabling coroutines, async/await, generators, and green threads at the WASM level. Currently no browser or runtime support despite being at phase 3.

**Impact on us:** Would let brush-shell's async runtime (tokio single-threaded) work more naturally in WASM. Currently brush-shell uses `block_on()` to bridge async→sync. With stack switching, the WASM module could yield and resume without JS involvement. Could also eliminate the `spawn_blocking` crash that Ralph is patching right now — WASM could just switch stacks instead of spawning a thread.

**Timeline:** Phase 3 but no implementations yet. Could be years.

### JSPI — JavaScript Promise Integration (Shipped!)

Allows synchronous WASM code to call async JavaScript APIs. WASM calls a Promise-returning JS function and gets suspended; when the Promise resolves, WASM resumes with the result. From WASM's perspective it looks synchronous; from JS's perspective it looks like normal Promise usage.

**Browser status:** Shipped in Chrome 137 and Firefox 139. Safari implementing as part of Interop 2026.

**Impact on us:** This is the one proposal that's actually usable today. It could simplify our `Atomics.wait` blocking pattern — instead of blocking on a SharedArrayBuffer, WASM could call an async JS function that resolves when data is ready. However, our current approach works and JSPI adds complexity (wrapping imports/exports). Worth evaluating for specific hot paths like stdin reads or process waiting.

### Multi-Memory (Phase 5, Shipped)

Allows a single WASM module to have multiple memory blocks. One memory can be private while another is shared externally.

**Browser status:** Shipped in Chrome and Firefox. Safari still pending.

**Impact on us:** Minimal. We already use separate WASM instances per Worker with separate memories. Multi-memory would let a single instance keep private data separate from shared IPC buffers, but our architecture doesn't need this.

### Module Linking (Inactive, absorbed into Component Model)

Would have allowed WASM modules to import/export other modules and instances. Work moved to the Component Model repo. Could become active again if there's renewed interest.

**Impact on us:** Would have been very useful — direct WASM-to-WASM calls without JS. But it's inactive.

### Summary: What Changes and When

| Proposal | Status | Browser ETA | Impact on wasmVM |
|----------|--------|-------------|----------------|
| Component Model | Phase 2–3 | Late 2027+ (native) | Would clean up host↔guest interface, but JS still needed |
| Shared-Everything Threads | Phase 1–2 | 2028+ | **High** — could enable WASM-native IPC, eliminate JS for pipes |
| Stack Switching | Phase 3 | 2027+ | **Medium** — better async in WASM, eliminate spawn_blocking hacks |
| JSPI | **Shipped** | Now (Chrome, Firefox) | **Low-Medium** — alternative to Atomics.wait for async I/O |
| Multi-Memory | **Shipped** | Now (Chrome, Firefox) | Low |
| Module Linking | Inactive | N/A | Would have been high impact, but absorbed into Component Model |

**Bottom line:** Nothing shipping in the next 1-2 years fundamentally changes our architecture. JSPI is available now but doesn't eliminate the need for JS. Shared-Everything Threads is the one to watch — if it ships, it could enable a pure-WASM OS layer with WASM-native IPC. But that's 2028+ at the earliest.

## Comparison: Server-Side Wasmtime Projects

Projects that use Wasmtime (server-only) don't have this problem because Wasmtime IS the host runtime. Their OS layer is native Rust code running in the same process as the WASM engine — no FFI boundary, no JS shim. They call Wasmtime APIs directly from Rust.

We can't do this because our host runtime must be JavaScript to run in browsers. This is the fundamental trade-off of targeting browser + Node.js instead of server-only.

## Sources

- [The State of WebAssembly – 2025 and 2026](https://platform.uno/blog/the-state-of-webassembly-2025-2026/)
- [WASI and the WebAssembly Component Model: Current Status](https://eunomia.dev/blog/2025/02/16/wasi-and-the-webassembly-component-model-current-status/)
- [Shared-Everything Threads Proposal](https://github.com/WebAssembly/shared-everything-threads/blob/main/proposals/shared-everything-threads/Overview.md)
- [Stack Switching Proposal](https://github.com/WebAssembly/stack-switching/blob/main/proposals/stack-switching/Explainer.md)
- [JSPI - V8 Blog](https://v8.dev/blog/jspi)
- [Announcing Interop 2026 (WebKit/Safari JSPI)](https://webkit.org/blog/17818/announcing-interop-2026/)
- [jco - Bytecode Alliance](https://github.com/bytecodealliance/jco)
- [The States of WebAssembly (Jan 2026)](https://webassembly.org/news/2026-01-21-states-of-webassembly/)
- [WASI 1.0 - The New Stack](https://thenewstack.io/wasi-1-0-you-wont-know-when-webassembly-is-everywhere-in-2026/)
