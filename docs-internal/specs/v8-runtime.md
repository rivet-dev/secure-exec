
# V8 Runtime Spec: Replacing `isolated-vm` with Rust + rusty_v8

## Status

Draft — next priority after 0.1.0-rc.4 release.

## Problem

`isolated-vm` is in maintenance mode and has fundamental architectural issues:

1. **Uses Node's patched V8** — ABI breaks in minor Node releases, some Linux distros strip internal symbols, makes development difficult.
2. **No crash isolation** — V8 OOM crashes the host process. `onCatastrophicError` is unreliable.
3. **Node-only** — Can't work with Bun (JSC, not V8).
4. **C++ codebase** — ~11.5k LOC, difficult to maintain and extend.

## Solution

A Rust binary (`@secure-exec/v8`) that embeds V8 via `rusty_v8`, runs as a **separate process**, and communicates with the host (Node/Bun) over a Unix domain socket.

## Why Separate Process (Not In-Process Addon)

### Technical constraint: dual V8 is unsafe

Two V8 instances in one process is unsafe. V8 has process-global state:
- `V8::Initialize()` can only be called once per process
- Signal handlers (SIGSEGV for WASM trap handling) are process-global
- ICU data, platform singleton, thread-local storage for current isolate

Even with `RTLD_LOCAL` symbol isolation on Linux, these process-level resources conflict. No one has shipped napi-rs + rusty_v8 in the same process successfully.

### Security: process-level isolation

The separate process model provides defense-in-depth that the current in-process `isolated-vm` architecture cannot:

- **Crash containment** — V8 OOM or memory corruption in the sandbox kills the child process, not the host. `isolated-vm`'s `onCatastrophicError` is unreliable; process boundaries are enforced by the OS kernel.
- **FD table isolation** — the sandbox process has its own file descriptor table. Sandbox code cannot access host FDs (database connections, credential files, other sockets) even through a V8 engine bug.
- **Memory isolation** — heap corruption in the sandbox V8 cannot corrupt the host process heap. With in-process isolation, a V8 bug that writes out of bounds could overwrite host memory.
- **OS-level resource controls** — the sandbox process can be placed under cgroups (memory, CPU), seccomp filters, or namespaces. This is impossible for an in-process isolate.
- **Signal isolation** — signals delivered to the sandbox process don't affect the host.
- **Clean kill** — a hung or misbehaving isolate can be terminated via `SIGKILL`, which the OS guarantees will succeed. In-process, `terminate_execution()` is cooperative and can be defeated by native code bugs.

**Tradeoff acknowledged**: the IPC channel introduces a new attack surface (socket authentication, session binding, message integrity) that doesn't exist in the in-process model. These are addressed in the IPC Security section below.

The security model doc (`docs/security-model.mdx`) must be updated to document process isolation as a trust boundary, explaining both what it protects against and what the user remains responsible for.

### V8 version independence

- **Own V8 version** — decoupled from Node's patches, stable ABI. No more breakage on Node minor releases.
- **No stripped symbols** — some Linux distros strip Node's "internal" V8 symbols, breaking `isolated-vm`. A bundled V8 avoids this entirely.

### Runtime agnostic

- **Works with Node, Bun, or anything that can open a socket** — no dependency on the host's JS engine. Bun uses JSC (not V8), so in-process V8 isolate creation is impossible there.

### The architecture isolated-vm's author wants

Per the `isolated-vm` README roadmap, the maintainer explicitly wants to move to a multi-process architecture with a bundled V8 for exactly these reasons.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Host Process (Node.js / Bun)                                        │
│                                                                      │
│  NodeRuntime                                                         │
│    └─ NodeExecutionDriver                                            │
│         └─ V8RuntimeHandle (manages child process + UDS connection)  │
│              │                                                       │
│              │  Unix Domain Socket (length-prefixed MessagePack)      │
│              │                                                       │
└──────────────┼───────────────────────────────────────────────────────┘
               │
┌──────────────┼───────────────────────────────────────────────────────┐
│  V8 Runtime Process (Rust binary)                                    │
│              │                                                       │
│  V8RuntimeServer                                                     │
│    ├─ IPC listener (UDS)                                             │
│    ├─ IsolatePool (one V8 isolate per session)                       │
│    │    ├─ Isolate A (user code, bridge globals, host fn callbacks)  │
│    │    ├─ Isolate B                                                 │
│    │    └─ ...                                                       │
│    └─ V8 Platform (single, shared across isolates)                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Process Lifecycle

1. `createNodeRuntimeDriverFactory()` spawns the Rust binary as a child process
2. Host connects over a Unix domain socket (path in tmpdir)
3. One Rust process is shared across all isolates created by that factory
4. When the factory is disposed, the child process is terminated

### Session Model

Each `exec()`/`run()` call creates a **session**:

1. Host sends `CreateSession` → Rust creates a V8 isolate + context
2. Host sends `InjectGlobals` → Rust sets config values (`_processConfig`, `_osConfig`)
3. Host sends `Execute` with bridge bundle + user code → Rust compiles and runs
4. During execution, Rust sends `BridgeCall` messages back to host for each bridge operation
5. Host processes bridge call, sends `BridgeResponse` back
6. When execution completes, Rust sends `ExecutionResult`
7. Host sends `DestroySession` → Rust destroys the isolate

### Sync-Blocking Bridge Pattern

When sandbox code calls `fs.readFileSync()`:

```
Sandbox V8        Rust Host Fn        IPC (UDS)           JS Host
   │                  │                   │                  │
   │ call readFile    │                   │                  │
   │─────────────────>│                   │                  │
   │ (V8 blocked)     │ serialize req     │                  │
   │                  │──────────────────>│ BridgeCall msg   │
   │                  │ block on read()   │─────────────────>│
   │                  │                   │                  │ await fs.readFile()
   │                  │                   │                  │ serialize response
   │                  │                   │<─────────────────│
   │                  │<──────────────────│ BridgeResponse   │
   │                  │ deserialize       │                  │
   │<─────────────────│ return to V8      │                  │
   │ continue         │                   │                  │
```

The Rust host function blocks on `socket.read()` — this is fine because:
- The sandbox V8 is single-threaded and already blocked waiting for the host function to return
- The Rust process thread is dedicated to this isolate session
- The JS host is NOT blocked — it processes the bridge call asynchronously on its event loop

### Bridge Calling Conventions

The current bridge uses three distinct `ivm.Reference` calling patterns. Each maps to a specific Rust implementation:

#### 1. Sync-blocking (replaces `applySync` and `applySyncPromise`)

Used by: all filesystem ops, `_resolveModule`, `_loadFile`, `_childProcessSpawnStart`, `_childProcessStdinWrite`, `_log`, `_error`, `_cryptoRandomFill`.

The Rust host function (registered via `v8::FunctionTemplate`) blocks on `socket.read()` and returns the value directly to V8. From V8's perspective, it's a synchronous function call. This handles both the old `applySync` (host is sync) and `applySyncPromise` (host is async) patterns identically — the Rust thread blocks regardless.

#### 2. Async Promise-returning (replaces `apply(..., { result: { promise: true } })`)

Used by: `_networkFetchRaw`, `_networkDnsLookupRaw`, `_networkHttpServerListenRaw`, `_dynamicImport`, `_loadPolyfill`, `_scheduleTimer`.

The Rust host function:
1. Creates a `v8::PromiseResolver`
2. Stores the resolver + `call_id` in a pending-promises map
3. Sends `BridgeCall` over IPC (non-blocking write)
4. Returns the `resolver.get_promise()` to V8

When the `BridgeResponse` arrives (during the session event loop), Rust resolves or rejects the promise and runs microtasks to flush the queue.

#### 3. Host-to-sandbox callbacks (replaces `dispatchRef.applySync()`)

Used by: child process stdout/stderr/exit dispatch, HTTP server request dispatch.

The host sends `StreamEvent` messages. The Rust session event loop receives them and calls the registered V8 dispatch function (`_childProcessDispatch`, `_httpServerDispatch`) directly.

### Session Event Loop

Each session runs a Rust event loop that multiplexes IPC and V8:

```rust
loop {
    // Poll the session socket for incoming messages
    match poll_socket(session_fd, timeout) {
        BridgeResponse { call_id, result } => {
            resolve_promise(call_id, result);
            run_microtasks();
        }
        StreamEvent { event_type, payload } => {
            dispatch_event(event_type, payload);
            run_microtasks();
        }
        TerminateExecution => {
            isolate.terminate_execution();
            break;
        }
    }
    if execution_finished() { break; }
}
```

This loop runs whenever V8 is suspended on a promise (e.g., `_waitForActiveHandles()`, `await fetch(...)`, `await import(...)`). During sync-blocking bridge calls, the event loop is NOT running — the Rust thread is blocked on `socket.read()` inside the `FunctionTemplate` callback.

### Active Handle Waiting

`_waitForActiveHandles()` returns a JS Promise. When V8 awaits it, V8 is suspended (not blocked). The session event loop takes over: polling for `StreamEvent` messages, dispatching them into V8 (which calls `_unregisterHandle`), running microtasks, and checking if the promise resolved. No deadlock.

### Streaming Operations (Child Process, HTTP Server)

```
JS Host                  IPC                    Rust Event Loop     Sandbox V8
   │                      │                      │                      │
   │ child stdout data    │                      │ (polling socket)     │ (suspended)
   │─────────────────────>│ StreamEvent msg      │                      │
   │                      │─────────────────────>│ call dispatch fn     │
   │                      │                      │─────────────────────>│
   │                      │                      │                      │ emit event
   │                      │                      │ run_microtasks()     │
```

### Dynamic Import Strategy

Continue using the existing `import()` → `__dynamicImport()` rewrite strategy. The bridge rewrites `import()` calls to `__dynamicImport()` which is an async bridge call (convention #2 above). This avoids the complexity of implementing `HostImportModuleDynamicallyCallback` and maintains compatibility with the current bridge bundle.

For static `import` statements in ESM: use V8's `v8::Module` API with `ResolveModuleCallback`. The callback is synchronous — the Rust host function blocks on IPC to resolve and load the module source, creates a `v8::Module` from it, and returns it. Same sync-blocking pattern as convention #1.

### V8 Context Setup

The Rust side creates a V8 context with the following hardening:

- **Remove `SharedArrayBuffer`** from the global when `timing_mitigation` is `"freeze"` (required by timing mitigation contract)
- **Disable WebAssembly compilation** via `v8::Isolate::SetAllowWasmCodeGenerationCallback` returning false
- **Install `_processConfig` and `_osConfig`** as frozen, non-writable, non-configurable properties
- **Register all bridge functions** via `v8::FunctionTemplate::New()` — these are local V8 calls in the Rust process, not IPC round-trips

### Threading Model

- **One OS thread per active session.** Each thread owns its `v8::Isolate` and holds the `v8::Locker` for its lifetime.
- **Main thread** runs the IPC listener, accepts connections, dispatches messages to session threads via channels (`crossbeam::channel`).
- **Session thread** runs the session event loop (above) and all V8 execution for that session.
- **Max concurrency** configurable (default: `num_cpus`). Excess sessions are queued.
- **V8 Platform** is shared across all threads (`v8::Platform` is thread-safe via `SharedRef`).
- **Timeout thread** per session (spawned on `Execute`, joined on completion). Calls `v8::Isolate::terminate_execution()` AND closes the session socket to unblock any `socket.read()` in a sync-blocking bridge call.

### Error Serialization

Errors crossing the IPC boundary use structured objects, not plain strings:

```
ExecutionResult {
  session_id: u32,
  code: i32,
  exports: bytes | null,
  error: {
    type: string,         // "TypeError", "SyntaxError", "Error", etc.
    message: string,
    stack: string,        // full stack trace
    code: string?,        // e.g. "ERR_MODULE_NOT_FOUND"
  } | null,
}
```

The Rust side extracts error info from `v8::TryCatch`: `exception->ToDetailString()` for message, `v8::Exception::GetStackTrace()` for stack, constructor name for type.

`ProcessExitError` is detected by a sentinel property (`_isProcessExit: true, code: N`) on the error object, not regex matching.

### Resource Budgets

`CreateSession` carries resource budgets:

```
CreateSession {
  session_id: u128,       // 128-bit nonce
  heap_limit_mb: u32?,
  cpu_time_limit_ms: u32?,
  max_output_bytes: u32?, // enforced on Rust side for Log messages
}
```

Other budgets (`maxBridgeCalls`, `maxTimers`, `maxHandles`, payload limits) continue to be enforced on the host side (for `maxBridgeCalls`) and bridge side (for `maxTimers`, `maxHandles`) as they are today. Only budgets that need Rust-side enforcement are in the protocol.

## IPC Security

The separate process model trades in-process simplicity for IPC-channel attack surface. These mitigations are required:

1. **Socket path** — Use `mkdtemp` + 128-bit random suffix. Set `0700` perms via `fchmod` after `bind()`, before `listen()`. Alternatively, pass socket FD via inherited stdin to eliminate filesystem TOCTOU entirely.
2. **Connection authentication** — Host passes a one-time token to the Rust process via environment variable. First message on any connection must present this token. Reject unauthenticated connections.
3. **Session binding** — Sessions are bound to the connection that created them. A connection can only interact with its own sessions. Use 128-bit nonces for session IDs, not sequential u32.
4. **call_id integrity** — Strict pending-call map on Rust side. Remove entry on first response. Reject duplicate responses. Validate responding connection matches the one that received the BridgeCall.
5. **Message size limits** — Reject any length prefix above 64MB at the framing layer. Close connection on any framing or deserialization error (no skip-and-continue).
6. **Deserialization safety** — Enforce recursion depth limits in MessagePack parsing. Fuzz the parser with `cargo-fuzz`.
7. **Bridge code integrity** — Embed the bridge bundle hash in the Rust binary. Verify before execution. Or ship bridge code inside the Rust binary itself.
8. **FD hygiene** — Rust process closes all inherited FDs except stdin/stdout/stderr and the IPC socket on startup. All new FDs use `CLOEXEC`.

### Security model documentation

The `docs/security-model.mdx` must be updated to document:

- **Process isolation as a trust boundary** — the V8 runtime runs in a separate process with its own FD table, memory space, and signal handlers.
- **What process isolation protects against** — V8 OOM, heap corruption, FD leakage, signal interference, uncontrolled resource consumption (via cgroups).
- **What process isolation does NOT protect against** — IPC-level attacks require the mitigations above. The host process remains the outer trust boundary. Internet-facing workloads still need a hardened host environment.
- **IPC channel trust model** — the socket is authenticated, session-bound, and size-limited. The channel is trusted once authenticated but not encrypted (same-host communication).

## IPC Protocol

### Transport

**Unix domain socket** (or named pipe on Windows).

- ~1.4μs kernel round-trip latency (p50)
- ~2-5μs end-to-end in Node.js with serialization
- Sufficient for bridge calls where real I/O dominates

### Wire Format

**Length-prefixed MessagePack.**

Each message is:
```
[4 bytes: payload length (u32 big-endian)] [N bytes: MessagePack payload]
```

MessagePack is:
- 2-5x faster to serialize/deserialize than JSON
- Compact binary format, handles binary data natively (no base64)
- Mature libraries: `rmp-serde` (Rust), `@msgpack/msgpack` (JS)
- No schema needed (self-describing), no codegen, no backwards compat burden

### Message Types

#### Host → Rust

```
CreateSession {
  session_id: u32,
  heap_limit_mb: u32?,
  cpu_time_limit_ms: u32?,
}

DestroySession {
  session_id: u32,
}

Execute {
  session_id: u32,
  bridge_code: string,     // compiled bridge bundle (IIFE)
  user_code: string,       // user code to execute
  file_path: string?,      // virtual file path for ESM detection
  mode: "exec" | "run",
}

InjectGlobals {
  session_id: u32,
  process_config: { cwd, env, timing_mitigation, frozen_time_ms },
  os_config: { homedir, tmpdir, platform, arch },
}

BridgeResponse {
  call_id: u32,
  result: bytes | null,    // MessagePack-encoded result
  error: string | null,    // error message if failed
}

StreamEvent {
  session_id: u32,
  event_type: string,      // "child_stdout", "child_stderr", "child_exit", "http_request"
  payload: bytes,          // MessagePack-encoded event data
}

TerminateExecution {
  session_id: u32,
}
```

#### Rust → Host

```
BridgeCall {
  call_id: u32,
  session_id: u32,
  method: string,          // "_fsReadFile", "_childProcessSpawnStart", etc.
  args: bytes,             // MessagePack-encoded arguments
}

ExecutionResult {
  session_id: u32,
  code: i32,               // exit code
  exports: bytes | null,   // MessagePack-encoded module exports (for "run" mode)
  error: string | null,
}

Log {
  session_id: u32,
  channel: "stdout" | "stderr",
  message: string,
}

StreamCallback {
  session_id: u32,
  callback_type: string,   // "child_dispatch", "http_server_dispatch"
  payload: bytes,
}
```

### Binary Data Transfer

MessagePack handles binary data natively as `bin` format. No more base64 encoding for file reads/writes. This is a significant improvement — the current bridge uses base64 for all binary transfers, adding ~33% overhead.

## Rust Crate Structure

```
crates/v8-runtime/
├── Cargo.toml
├── src/
│   ├── main.rs              # Binary entry point, UDS listener
│   ├── ipc.rs               # Message framing, serialization
│   ├── isolate.rs           # V8 isolate lifecycle (create, destroy, configure)
│   ├── execution.rs         # Script compilation, execution, module loading
│   ├── bridge.rs            # Host function injection (v8::FunctionTemplate)
│   ├── host_call.rs         # Sync-blocking bridge call over IPC
│   ├── timeout.rs           # CPU timeout enforcement (separate thread)
│   └── stream.rs            # Async event dispatch (child process, HTTP)
├── build.rs                 # napi-rs / rusty_v8 build config
└── npm/                     # Platform-specific npm packages for prebuilt binaries
    ├── linux-x64-gnu/
    ├── linux-arm64-gnu/
    ├── darwin-x64/
    ├── darwin-arm64/
    └── win32-x64/
```

### Key Dependencies

```toml
[dependencies]
v8 = "130"                    # rusty_v8 - V8 bindings
rmp-serde = "1"               # MessagePack serialization
serde = { version = "1", features = ["derive"] }
```

### Estimated LOC

| Component | LOC | Notes |
|-----------|-----|-------|
| `main.rs` | ~150 | Process setup, UDS listener, signal handling |
| `ipc.rs` | ~250 | Length-prefixed framing, message types, auth handshake |
| `isolate.rs` | ~500 | V8 isolate create/destroy, heap limits, context setup, global stripping |
| `execution.rs` | ~500 | Script compile, ESM/CJS module handling, eval |
| `bridge.rs` | ~400 | v8::FunctionTemplate injection, sync + async + callback conventions |
| `event_loop.rs` | ~250 | Session event loop: poll socket, dispatch events, pump microtasks |
| `host_call.rs` | ~150 | Sync-blocking: serialize call, write to socket, block on read |
| `promise.rs` | ~150 | Async bridge calls: PromiseResolver management, pending-call map |
| `timeout.rs` | ~120 | Timer thread, terminate_execution() + socket close |
| `error.rs` | ~100 | Structured error extraction from v8::TryCatch |
| **Total** | **~2,570** | |

## NPM Package Structure

```
packages/secure-exec-v8/
├── package.json              # @secure-exec/v8
├── src/
│   └── index.ts              # JS wrapper: spawn process, manage sessions, IPC
├── scripts/
│   └── postinstall.js        # Download prebuilt binary for current platform
└── bin/                      # Prebuilt binary location (populated by postinstall)
```

The JS wrapper (`index.ts`) provides:
- `createV8Runtime()` — spawns the Rust process, returns a handle
- `V8Runtime.createSession(options)` — creates an isolate session
- `V8Session.execute(code, bridgeHandlers)` — runs code with bridge callbacks
- `V8Session.destroy()` — cleanup
- `V8Runtime.dispose()` — kills the child process

## Host-Side Changes

### `@secure-exec/node` changes

`NodeExecutionDriver` replaces `isolated-vm` usage with `@secure-exec/v8`:

```typescript
// Before (isolated-vm)
import ivm from "isolated-vm";
const isolate = new ivm.Isolate({ memoryLimit: 128 });
const context = await isolate.createContext();
const jail = context.global;
await jail.set("_fsReadFile", new ivm.Reference(async (path) => { ... }));
const script = await isolate.compileScript(code);
await script.run(context);

// After (@secure-exec/v8)
import { createV8Runtime } from "@secure-exec/v8";
const runtime = createV8Runtime();
const session = runtime.createSession({ heapLimitMb: 128 });
const result = await session.execute(code, {
  _fsReadFile: async (path: string) => { ... },
  _childProcessSpawnStart: (cmd, argsJson, optsJson) => { ... },
  // ... all bridge handlers
});
session.destroy();
```

### `@secure-exec/core` bridge changes

The bridge bundle JS that runs inside the isolate changes minimally:
- Replace `_ref.applySync(undefined, [args])` with direct function calls (the Rust side injects real JS functions via `v8::FunctionTemplate`)
- Replace `_ref.applySyncPromise(undefined, [args])` with the same — from V8's perspective, the host function is synchronous (Rust blocks on IPC internally)
- Replace `_ref.apply(undefined, [args], { result: { promise: true } })` with Promise-returning functions
- Remove all `ivm.Reference` type annotations from `bridge-contract.ts`

The bridge globals keep the same names (`_fsReadFile`, `_childProcessSpawnStart`, etc.) but their types simplify from `BridgeApplySyncPromiseRef<[string], string>` to plain `(path: string) => string`.

## Prebuilt Binary Distribution

Following the established pattern (esbuild, swc, turbo):

1. Main package `@secure-exec/v8` has `optionalDependencies` for each platform
2. Platform packages: `@secure-exec/v8-linux-x64-gnu`, `@secure-exec/v8-darwin-arm64`, etc.
3. Each platform package contains the prebuilt Rust binary
4. JS loader in main package detects platform and loads the correct binary

### CI Build Matrix

```yaml
strategy:
  matrix:
    include:
      - target: x86_64-unknown-linux-gnu
        os: ubuntu-latest
      - target: aarch64-unknown-linux-gnu
        os: ubuntu-latest  # cross-compile
      - target: x86_64-apple-darwin
        os: macos-13
      - target: aarch64-apple-darwin
        os: macos-14
      - target: x86_64-pc-windows-msvc
        os: windows-latest
```

Each CI job:
1. Install Rust toolchain
2. `cargo build --release` (rusty_v8 downloads prebuilt V8 static lib)
3. Strip binary
4. Package into npm platform package
5. Publish

Expected binary size: ~40-60MB per platform (V8 is large).

## Migration Plan

### Phase 1: Build the Rust binary
- Implement `crates/v8-runtime/` with IPC protocol
- Basic isolate lifecycle: create, execute script, destroy
- Host function injection for sync bridge calls

### Phase 2: Build the JS wrapper
- `packages/secure-exec-v8/` with process management and IPC client
- Session abstraction matching what `NodeExecutionDriver` needs

### Phase 3: Swap execution driver
- Update `NodeExecutionDriver` to use `@secure-exec/v8` instead of `isolated-vm`
- Update `bridge-contract.ts` — remove `ivm.Reference` types, use plain function types
- Update bridge bundle — replace `.applySync()` / `.applySyncPromise()` with direct calls

### Phase 4: Update bridge bundle
- Remove base64 encoding for binary transfers (MessagePack handles binary natively)
- Simplify bridge global types

### Phase 5: CI and distribution
- Add Rust build to CI matrix
- Set up platform-specific npm package publishing
- Remove `isolated-vm` dependency

### Phase 6: Validate
- All existing tests pass
- Benchmark IPC overhead vs isolated-vm Reference overhead
- Verify Bun compatibility
- Verify crash isolation (OOM in sandbox doesn't kill host)

## Performance Expectations

| Operation | isolated-vm | @secure-exec/v8 (UDS) | Notes |
|-----------|-------------|----------------------|-------|
| Bridge call overhead | ~26ns (in-process) | ~2-5μs (IPC) | 100x slower but still sub-ms |
| `fs.readFileSync` (1KB) | ~50μs total | ~52μs total | IPC overhead negligible vs I/O |
| `process.cwd()` | ~26ns | ~2-5μs | Injected at session creation to avoid bridge call |
| Isolate creation | ~5ms | ~10-20ms without snapshot, <1ms with | V8 snapshot recommended |
| Binary transfer 1MB | ~1.3MB (base64) | ~1MB (native binary) | No base64 overhead |
| Process cold-start | N/A | ~50-200ms (one-time) | V8 Platform init, paid once per factory |
| Module resolution (50 modules) | ~50μs | ~100-350μs | Same sync-blocking pattern; cached after first load |

Notes:
- MessagePack on the JS side (`@msgpack/msgpack`) is ~1.2-1.8x faster than JSON, not 2-5x. The real win is native binary format (no base64).
- Binary transfers involve multiple memory copies (JS encode → kernel → Rust decode → V8 heap). Not zero-copy, but eliminates the 33% base64 bloat.
- For hot-path scalar reads (`process.cwd`, `process.env`), inject as V8 values at session creation instead of bridge calls.
- V8 startup snapshot (`v8::V8::CreateSnapshotDataBlob`) pre-compiles bridge code and reduces isolate creation to <1ms. Recommended.

## Open Questions

1. **Process pooling** — Should we support multiple Rust processes for parallelism, or is one sufficient? One process with multiple isolate threads is simpler. OOM in one isolate kills all co-resident sessions (strictly better than isolated-vm which kills the host). Document as accepted tradeoff with option for process-per-session in future.
2. **Warm isolate reuse** — Default to fresh isolate per session (security-first). Warm reuse is opt-in, same-tenant only, requires full context reset. Performance gain: skip isolate creation (~10ms). Security cost: shared V8 heap between executions.
3. **Windows** — Scope to Phase 2. Phase 1 uses `AF_UNIX` sockets (available on Windows 10 1803+ and all Linux/macOS). Avoids named pipe complexity.
4. **Inspector/debugger** — Not for initial release.
5. **One socket per session vs shared socket** — One socket per session avoids head-of-line blocking where a large payload (10MB file read) stalls all other sessions. UDS creation is cheap. Recommended for Phase 1.
