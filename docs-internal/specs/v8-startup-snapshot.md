# V8 Startup Snapshots: Fast Isolate Creation

## Status

Proposal — performance optimization for the V8 runtime.

## Problem

Every new session creates a fresh V8 isolate and compiles the bridge bundle from scratch:

```
create_isolate()           ~5-10ms   (V8 heap initialization)
create_context()           ~1ms
disable_wasm()             <0.1ms
register_bridge_fns()      ~1ms      (38 FunctionTemplate registrations)
run_bridge_cached()        ~3-8ms    (parse + compile + execute bridge IIFE, ~2ms on cache hit)
inject_globals()           <0.5ms
────────────────────────────────────
Total per session:         ~10-20ms  (first execution)
                           ~5-15ms   (subsequent, with BridgeCodeCache)
```

For workloads that create many short-lived sessions (e.g. parallel code evaluations), this startup cost dominates. The `BridgeCodeCache` helps on repeat executions within a session, but every new session still pays the full isolate creation + first bridge compilation cost.

## Solution

Use V8's built-in snapshot mechanism to serialize the isolate heap after the bridge code has been compiled and executed. New sessions restore from the snapshot instead of building the heap from scratch.

**Expected per-session cost after snapshot:**

```
restore_isolate_from_snapshot()   <1ms
create_context()                  <0.5ms
disable_wasm()                    <0.1ms
register_bridge_fns()             ~1ms
run_bridge_iife(code-cached)      ~0.5-1ms
inject_globals()                  <0.5ms
────────────────────────────────────
Total per session:                ~2-3ms
```

## How V8 Snapshots Work

### Creating a snapshot

In rusty_v8 (v130), snapshot creation uses `v8::Isolate::snapshot_creator()`, which returns an `OwnedIsolate` in snapshot-creation mode. You run initialization code in it, then call `create_blob()` which **consumes the isolate** and produces a `StartupData` blob.

```rust
use v8::{ExternalReference, ExternalReferences};

// External references must be 'static — V8 needs them at both
// snapshot creation and restore time
lazy_static! {
    static ref EXTERNAL_REFS: ExternalReferences = ExternalReferences::new(&[
        ExternalReference { function: sync_bridge_callback },
        ExternalReference { function: async_bridge_callback },
    ]);
}

// Create a snapshot creator isolate
let mut isolate = v8::Isolate::snapshot_creator(Some(&EXTERNAL_REFS), None);
{
    let scope = &mut v8::HandleScope::new(&mut isolate);
    let context = v8::Context::new(scope, Default::default());
    let scope = &mut v8::ContextScope::new(scope, context);

    // Run bridge IIFE — all heap state (compiled bytecode, objects) is captured
    compile_and_run(scope, &bridge_iife);

    // Mark this context as the default context in the snapshot
    scope.set_default_context(context);
}
// create_blob() consumes the isolate — it cannot be used after this
let blob: v8::StartupData = isolate
    .create_blob(v8::FunctionCodeHandling::Keep)
    .expect("snapshot creation failed");
```

**Key API details (rusty_v8 v130):**
- `v8::Isolate::snapshot_creator(external_references, params)` → `OwnedIsolate`
- `OwnedIsolate::set_default_context(context)` — must be called before `create_blob()`
- `OwnedIsolate::create_blob(FunctionCodeHandling) -> Option<StartupData>` — **consumes self**
- `FunctionCodeHandling::Keep` preserves compiled bytecode in the snapshot
- `ExternalReferences` must be `&'static` — constructed via `lazy_static!` or `OnceLock`
- There is no separate `SnapshotCreator` struct — the isolate itself acts as the snapshot creator

### Restoring from a snapshot

Pass the blob via `CreateParams` when creating a new isolate. The heap is deserialized and all objects from the snapshot are immediately available.

```rust
let params = v8::CreateParams::default()
    .snapshot_blob(blob.as_ref())       // impl Allocated<[u8]>
    .external_references(&*EXTERNAL_REFS) // impl Allocated<[intptr_t]>
    .heap_limits(0, heap_limit_bytes);

let mut isolate = v8::Isolate::new(params);
// Bridge code compiled bytecode is in the heap
// Bridge functions must be re-registered (External data is per-session)
```

## External References

### The problem

Bridge functions are V8 `FunctionTemplate` objects whose callbacks are Rust function pointers:

```rust
let template = v8::FunctionTemplate::builder(sync_bridge_callback)  // ← Rust fn pointer
    .data(external.into())
    .build(scope);
```

When V8 snapshots the heap, it serializes the FunctionTemplate. But it **cannot serialize a raw memory address** — the pointer `sync_bridge_callback` will be at a different address on every process start (ASLR).

### The solution: ExternalReferences

V8 replaces each native pointer with an **index** into an ordered array you provide. In rusty_v8, this is the `ExternalReferences` struct built from `ExternalReference` union values:

```rust
lazy_static! {
    static ref EXTERNAL_REFS: ExternalReferences = ExternalReferences::new(&[
        ExternalReference { function: sync_bridge_callback },
        ExternalReference { function: async_bridge_callback },
    ]);
}
```

**At snapshot creation:** V8 sees `sync_bridge_callback` at address `0x7f3a2b4c8000`, finds it at index 0 in `EXTERNAL_REFS`, stores `index 0` in the snapshot.

**At snapshot restore:** V8 reads `index 0` from the snapshot, looks up `EXTERNAL_REFS[0]`, gets the current address of `sync_bridge_callback` (now `0x7f9988112000` due to ASLR). The FunctionTemplate works.

### What this means for our codebase

Looking at `bridge.rs`, all 31 sync bridge functions use the same callback (`sync_bridge_callback`) and all 7 async functions use the same callback (`async_bridge_callback`). They're distinguished by the `v8::External` data attached to each FunctionTemplate, which carries the method name string.

So the external references array is small and stable — just 2 entries.

**Constraint:** The `ExternalReferences` must be `'static` and have the same entries in the same order at snapshot creation and restore. Since the snapshot is created at runtime within the same process, the array is trivially identical. The entries are explicit in source code — compiler optimizations, LTO, and link order do not affect the array contents (they only affect the addresses, which is exactly what external references solve).

### v8::External data pointers

Each bridge FunctionTemplate also carries a `v8::External` containing a raw pointer to `SyncBridgeFnData` / `AsyncBridgeFnData` (which holds the `BridgeCallContext*`, `SessionBuffers*`, and method name). These pointers are **per-session** — they point to heap allocations in the session thread.

These External values **cannot be in the snapshot** because:
1. They contain session-specific pointers (`BridgeCallContext`, `SessionBuffers`)
2. Those allocations don't exist at snapshot creation time

**Resolution: Approach A (isolate-only snapshot).** The snapshot captures the isolate heap with compiled bridge bytecode but **no FunctionTemplates registered on the global**. After restoring from the snapshot, each session:
1. Creates a fresh context
2. Registers FunctionTemplates with session-local External data (same as today)
3. Runs bridge IIFE from snapshot's cached bytecode (fast — parse/compile already done)
4. Injects per-session globals

This is simpler and safer than Approach B (snapshotting the context with FunctionTemplates and re-wiring External data post-restore), which would require walking all 38 globals and replacing their External pointers — error-prone and not worth the ~0.5-1ms savings.

## Per-Session State Injection

The snapshot captures the **shared, immutable** parts of the runtime:
- Compiled bridge bytecode (the Node.js polyfill layer, `require()`, `console`, `fs`, etc.)
- V8 built-in objects and optimized internal state

It does **not** capture per-session configuration:

| Value | Example | Why it can't be in the snapshot |
|-------|---------|--------------------------------|
| `_processConfig.cwd` | `/tmp/project-a` vs `/home/user/app` | Different working directory per session |
| `_processConfig.env` | `{ API_KEY: "aaa" }` vs `{ API_KEY: "bbb" }` | Different environment per session |
| `_processConfig.timingMitigation` | `"freeze"` vs `"none"` | Security policy per session |
| `_processConfig.frozenTimeMs` | `1679616000000` | Deterministic time anchor per session |
| `_osConfig.homedir` | `/home/alice` vs `/home/bob` | Host-dependent |
| Heap limit | 64MB vs 256MB | Resource budget per session |
| `BridgeCallContext` | IPC sender, call_id router | Session's own IPC channel |
| `SessionBuffers` | Pre-allocated ser/deser buffers | Session-local allocation |

**This is not a problem to solve** — it's how snapshots are designed to work. The current code already has this separation:

1. `create_isolate()` + bridge compilation = shared template (snapshot replaces this)
2. `inject_globals_from_payload()` + bridge fn registration = per-session (runs after restore, unchanged)

The flow changes from:
```
Per session (current):
  create_isolate() → create_context() → disable_wasm() → register_bridge_fns()
  → run_bridge_iife() → inject_globals() → run_user_code()

Per session (with snapshot):
  restore_from_snapshot() → create_context() → disable_wasm() → register_bridge_fns()
  → run_bridge_iife(code-cached) → inject_globals() → run_user_code()
```

Note: `disable_wasm()` must be called on every restored isolate. The `set_allow_wasm_code_generation_callback` is a per-isolate setting that is **not** captured in the snapshot.

## Bridge Code Variants

### The problem

The bridge code is **not identical across all sessions**. `NodeExecutionDriver.composeBridgeCode()` (`execution-driver.ts:170-241`) produces different output depending on:

| Parameter | Varies per... | Effect on bridge code |
|-----------|--------------|----------------------|
| `timingMitigation` | Session | Includes `applyTimingMitigationFreeze` vs `applyTimingMitigationOff` |
| `frozenTimeMs` | Execution | Injected as `__runtimeTimingMitigationConfig` literal |
| `maxTimers` | Driver instance | Injected as `globalThis._maxTimers` literal |
| `maxHandles` | Driver instance | Injected as `globalThis._maxHandles` literal |
| `initialCwd` | Driver instance | Injected in `__runtimeBridgeSetupConfig` |
| `jsonPayloadLimitBytes` | Driver instance | Injected in `__runtimeBridgeSetupConfig` |

The existing code already handles this: `composeBridgeCode()` caches bridge code within a driver instance when `timingMitigation !== "freeze"`, and skips caching for freeze mode because `frozenTimeMs` changes per execution.

### Design: per-variant snapshots

Snapshots are keyed by a **canonical hash of the bridge code string**. Since the bridge code is composed on the TypeScript side and sent to Rust via IPC, the Rust side sees it as an opaque string.

- **Non-freeze sessions** (same driver instance): Bridge code is identical across executions → one snapshot, reused for all sessions from that driver
- **Freeze sessions**: Bridge code differs per execution (`frozenTimeMs` changes) → snapshot per unique bridge code string, bounded by an LRU cache
- **Different driver instances** (different `maxTimers`/`maxHandles`): Different bridge code → different snapshot entries

In practice, most workloads use one driver instance without timing freeze, producing **one snapshot per process**. The multi-variant design handles edge cases without special-casing.

### Snapshot cache design

```rust
struct SnapshotCache {
    /// LRU cache: bridge_code_hash → snapshot blob
    entries: Vec<SnapshotEntry>,
    max_entries: usize, // default: 4
}

struct SnapshotEntry {
    bridge_hash: u64,
    blob: Arc<StartupData>,
}
```

**Why SipHash instead of FNV-1a:** The hash is used for cache identity, not security. However, FNV-1a has poor collision resistance on similar inputs. SipHash (Rust's default `HashMap` hasher) is a better fit — fast, well-distributed, and available in std. The existing `BridgeCodeCache` FNV-1a implementation stays for V8 code caching; snapshot caching uses `std::hash::DefaultHasher` (SipHash).

## Snapshot Lifecycle

### Creation timing: eager warm-up on module load

The default bridge code (non-freeze, default budgets) is known at module load time — `composeBridgeCode("none", 0)` produces it deterministically. Rather than waiting for the first Execute, the host sends it to the Rust process immediately after connection as a **warm-up message**, so the snapshot is ready before any session is created.

```
Module load (@secure-exec/node imported):
  1. getSharedV8Runtime() spawns Rust process, connects, authenticates
  2. Host composes default bridge code (timingMitigation="none", default budgets)
  3. Host sends WarmSnapshot { bridge_code } message
  4. Rust main thread creates snapshot (~20ms, runs concurrently with host setup)
  5. Snapshot is cached and ready

First session Execute arrives:
  1. Hash bridge_code → H1
  2. Cache hit (warm-up already created it) → clone Arc
  3. Create session isolate from blob (<1ms)
```

This eliminates the cold-start penalty on the first session entirely. The ~20ms snapshot creation overlaps with host-side setup (driver construction, permission wiring, etc.) that happens between module load and the first `exec()`/`run()` call.

**IPC protocol addition:**

```
Host → Rust:

WarmSnapshot {
  bridge_code: string,   // default bridge code to pre-snapshot
}
```

The Rust main thread handles `WarmSnapshot` synchronously on the connection handler — it does not need a session thread. This is a fire-and-forget optimization: the host sends it and continues without waiting for a response. The snapshot is available by the time the first session's Execute message arrives.

**Disabling warm-up:** Set `SECURE_EXEC_NO_SNAPSHOT_WARMUP=1` to skip eager snapshot creation. Useful for:
- Tests that need deterministic startup timing
- Environments where the process is short-lived and may never create a session
- Debugging snapshot-related issues

When disabled, snapshots are created lazily on first Execute (same as the fallback path).

### Host-side changes

**File: `packages/secure-exec-v8/src/runtime.ts`**

After `ipcClient.authenticate()`, send the warm-up message:

```typescript
// Send warm-up snapshot request (fire-and-forget)
if (process.env.SECURE_EXEC_NO_SNAPSHOT_WARMUP !== "1") {
  const defaultBridgeCode = composeBridgeCodeForWarmup();
  client.send({ type: "WarmSnapshot", bridgeCode: defaultBridgeCode });
}
```

**File: `packages/secure-exec-node/src/execution-driver.ts`**

Export a `composeBridgeCodeForWarmup()` function that produces the default (non-freeze) bridge code with default budgets. This is the same code as `composeBridgeCode("none", 0)` but without driver-instance-specific config. If the actual session's bridge code matches (cache hit), no re-creation needed. If it differs (different budgets, freeze mode), a new snapshot variant is created lazily.

### Rust-side changes

**File: `crates/v8-runtime/src/main.rs`**

Handle `WarmSnapshot` in the connection handler (main thread, not a session thread):

```rust
BinaryFrame::WarmSnapshot { bridge_code } => {
    snapshot_cache.get_or_create(&bridge_code);
    // No response — fire-and-forget
}
```

### Fallback: lazy creation on Execute

If warm-up is disabled or the Execute arrives with a different bridge code variant (cache miss), the snapshot is created lazily on the session thread, same as before. The cache mutex ensures only one thread creates the snapshot for a given variant.

```
Execute arrives with bridge_code B2 (cache miss):
  1. Hash B2 → H2
  2. Cache miss → create snapshot (~20ms, holds mutex)
  3. Store (H2, Arc::new(blob)) in cache
  4. Create session isolate from blob
  5. Proceed with normal session flow
```

### Concurrency: first-session thundering herd

If N sessions arrive simultaneously before any snapshot exists (warm-up disabled or different variant), they all need the snapshot. The snapshot cache is behind a `Mutex`. The first thread to acquire the lock creates the snapshot; remaining threads block on the mutex and find the cache populated when they acquire it.

```rust
pub struct SnapshotCache {
    inner: Mutex<SnapshotCacheInner>,
}

impl SnapshotCache {
    /// Get or create a snapshot for the given bridge code.
    /// Thread-safe: concurrent callers block on mutex; only one creates the snapshot.
    pub fn get_or_create(&self, bridge_code: &str) -> Arc<StartupData> {
        let mut cache = self.inner.lock().unwrap();
        let hash = siphash(bridge_code);

        // Check cache
        if let Some(entry) = cache.find(hash) {
            return Arc::clone(&entry.blob);
        }

        // Cache miss — create snapshot (holds lock, blocks other sessions)
        // This is ~20ms one-time cost; acceptable because it only happens once per variant
        let blob = create_snapshot(bridge_code);
        let arc = Arc::new(blob);
        cache.insert(hash, Arc::clone(&arc));
        arc
    }
}
```

The ~20ms lock hold time is acceptable: it happens once per bridge code variant (typically once per process lifetime), and the alternative (no snapshot) costs ~15ms per session anyway.

### Snapshot invalidation

Snapshots are never invalidated within a process. Each bridge code variant gets its own snapshot entry. If a new bridge code string arrives (different hash), it creates a new snapshot without affecting existing ones. In-flight sessions using an older snapshot continue unaffected — their `Arc<StartupData>` keeps the blob alive.

The LRU cache evicts the oldest entry when `max_entries` is reached. Evicted blobs are dropped only when all sessions holding an `Arc` to them are destroyed.

### Memory: Arc<StartupData> safety

`v8::StartupData` owns its data (`Deref<Target = [u8]>`). Wrapping it in `Arc` for shared read-only access across threads is safe:
- `StartupData` is `Send` (owned data, no interior mutability)
- `Arc<StartupData>` is `Send + Sync` (immutable shared reference)
- `CreateParams::snapshot_blob()` takes `impl Allocated<[u8]>` — it reads from the slice during isolate creation, does not retain a pointer after `Isolate::new()` returns
- Each session thread clones the `Arc`, creating a new strong reference. The blob is dropped when the last `Arc` is dropped.

No pinning or mmap is needed — V8 copies the snapshot data into the isolate during creation, it does not hold a reference to the original blob after initialization.

## Security Hardening Post-Restore

Snapshot restore creates a "blank" isolate with pre-compiled bytecode in its heap. All security hardening must be re-applied per session:

| Hardening | Captured in snapshot? | Action after restore |
|-----------|----------------------|---------------------|
| WASM disable (`set_allow_wasm_code_generation_callback`) | No (per-isolate callback) | Call `disable_wasm()` before any code execution |
| SharedArrayBuffer removal | Depends on bridge variant | Bridge IIFE's `applyTimingMitigationFreeze` runs per-context and removes it |
| Context freezing (`_processConfig`, `_osConfig` as frozen props) | No (per-session values) | `inject_globals_from_payload()` after context creation (unchanged) |
| Bridge function data pointers | No (per-session pointers) | `register_sync_bridge_fns()` / `register_async_bridge_fns()` per context (unchanged) |

Since we use Approach A (isolate-only snapshot, fresh context per session), all context-level hardening runs exactly as it does today. The only new requirement is ensuring `disable_wasm()` is called on every restored isolate — same as the current code does on every fresh isolate (`session.rs:252`).

**SharedArrayBuffer and timing mitigation:** The bridge code itself includes either `applyTimingMitigationFreeze` or `applyTimingMitigationOff` depending on the session's `timingMitigation` setting. Since the bridge IIFE runs per context (Approach A), SharedArrayBuffer removal happens per-context just like today. Different timing mitigation settings produce different bridge code → different snapshot variants (see "Bridge Code Variants" above).

## Interaction with BridgeCodeCache

The existing `BridgeCodeCache` (`execution.rs:17-22`) stores V8 compiled bytecode (`UnboundScript::create_code_cache()`) for re-use across executions within a session.

With snapshots:
- **Snapshot captures compiled bytecode** in the heap via `FunctionCodeHandling::Keep`
- **BridgeCodeCache still helps** because the snapshot provides compiled bytecode for the isolate, but each new *context* within a restored isolate still needs to compile the bridge script. V8 code cache accelerates this compilation (~0.5ms vs ~3ms without cache).
- **Net effect:** Snapshot handles isolate creation; BridgeCodeCache handles per-context bridge compilation. They complement each other — neither makes the other redundant.

## Implementation Plan

### Phase 1: External references

**File: `crates/v8-runtime/src/bridge.rs`**

Add the static external references:

```rust
use v8::{ExternalReference, ExternalReferences};
use std::sync::OnceLock;

/// External references for V8 snapshot serialization.
/// Maps function pointer indices in the snapshot to current addresses.
/// Must be identical at snapshot creation and restore time.
pub fn external_refs() -> &'static ExternalReferences {
    static REFS: OnceLock<ExternalReferences> = OnceLock::new();
    REFS.get_or_init(|| {
        ExternalReferences::new(&[
            ExternalReference { function: sync_bridge_callback },
            ExternalReference { function: async_bridge_callback },
        ])
    })
}
```

### Phase 2: Snapshot creation and restore

**File: `crates/v8-runtime/src/snapshot.rs` (new)**

```rust
use std::sync::{Arc, Mutex};
use v8::{FunctionCodeHandling, StartupData};

use crate::bridge::external_refs;
use crate::isolate::init_v8_platform;

/// Create a V8 startup snapshot with the given bridge code pre-compiled.
///
/// Consumes a temporary isolate. The returned StartupData contains the
/// serialized V8 heap with compiled bytecode.
pub fn create_snapshot(bridge_code: &str) -> StartupData {
    init_v8_platform();

    let mut isolate = v8::Isolate::snapshot_creator(Some(external_refs()), None);
    {
        let scope = &mut v8::HandleScope::new(&mut isolate);
        let context = v8::Context::new(scope, Default::default());
        let scope = &mut v8::ContextScope::new(scope, context);

        // Compile and run bridge code — bytecode is captured in snapshot
        let source = v8::String::new(scope, bridge_code).unwrap();
        let script = v8::Script::compile(scope, source, None)
            .expect("bridge code compilation failed during snapshot");
        script.run(scope);

        scope.set_default_context(context);
    }
    isolate
        .create_blob(FunctionCodeHandling::Keep)
        .expect("V8 snapshot creation failed")
}

/// Create a V8 isolate restored from a snapshot blob.
pub fn create_isolate_from_snapshot(
    blob: &[u8],
    heap_limit_mb: Option<u32>,
) -> v8::OwnedIsolate {
    init_v8_platform();

    let mut params = v8::CreateParams::default()
        .snapshot_blob(blob)
        .external_references(&**external_refs());
    if let Some(limit) = heap_limit_mb {
        let limit_bytes = (limit as usize) * 1024 * 1024;
        params = params.heap_limits(0, limit_bytes);
    }
    v8::Isolate::new(params)
}

/// Thread-safe snapshot cache keyed by bridge code hash.
///
/// Lazily creates snapshots on first encounter of each bridge code variant.
/// Concurrent callers for the same variant block on the mutex; only one
/// creates the snapshot.
pub struct SnapshotCache {
    inner: Mutex<Vec<CacheEntry>>,
    max_entries: usize,
}

struct CacheEntry {
    bridge_hash: u64,
    blob: Arc<StartupData>,
}

impl SnapshotCache {
    pub fn new(max_entries: usize) -> Self {
        SnapshotCache {
            inner: Mutex::new(Vec::new()),
            max_entries,
        }
    }

    /// Get or create a snapshot for the given bridge code.
    pub fn get_or_create(&self, bridge_code: &str) -> Arc<StartupData> {
        let mut cache = self.inner.lock().unwrap();
        let hash = siphash(bridge_code);

        // Cache hit
        if let Some(entry) = cache.iter().find(|e| e.bridge_hash == hash) {
            return Arc::clone(&entry.blob);
        }

        // Cache miss — create snapshot (holds lock)
        let blob = create_snapshot(bridge_code);
        let arc = Arc::new(blob);

        // LRU eviction
        if cache.len() >= self.max_entries {
            cache.remove(0);
        }
        cache.push(CacheEntry {
            bridge_hash: hash,
            blob: Arc::clone(&arc),
        });

        arc
    }
}

fn siphash(s: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}
```

### Phase 3: Session thread changes

**File: `crates/v8-runtime/src/session.rs`**

`SessionManager` owns a `SnapshotCache` (created with `max_entries: 4`).

The session thread changes from:

```rust
// Current
let mut iso = isolate::create_isolate(heap_limit_mb);
execution::disable_wasm(&mut iso);
```

To:

```rust
// With snapshot — snapshot_cache is passed to session_thread
let mut iso = if !bridge_code.is_empty() {
    let blob = snapshot_cache.get_or_create(&bridge_code);
    snapshot::create_isolate_from_snapshot(&blob, heap_limit_mb)
} else {
    isolate::create_isolate(heap_limit_mb)
};
execution::disable_wasm(&mut iso); // Must re-apply after restore
```

The rest of the session flow is unchanged: `create_context()`, `register_bridge_fns()`, `run_bridge_cached()`, `inject_globals_from_payload()`.

**Snapshot availability:** In the default (warm-up enabled) path, the snapshot is already in the cache when the first Execute arrives — created during module load via `WarmSnapshot`. The session thread just does a cache hit and restores from the blob. If warm-up is disabled or the bridge code differs from the warm-up variant, the session thread creates the snapshot lazily on first Execute.

**Revised flow:** Move isolate creation from session startup to first Execute:

```
CreateSession → spawn thread, acquire concurrency slot, wait for commands
Execute(bridge_code, user_code) →
  if no isolate yet:
    blob = snapshot_cache.get_or_create(bridge_code)  // cache hit if warm-up ran
    isolate = create_isolate_from_snapshot(blob, heap_limit_mb)
    disable_wasm(isolate)
  create_context()
  register_bridge_fns()
  run_bridge_iife(bridge_code)  // from code cache if snapshot has bytecode
  inject_globals()
  execute_user_code()
```

### Phase 4: Tests

**File: `crates/v8-runtime/src/snapshot.rs` (tests)**

1. **Snapshot creation:** `create_snapshot()` returns a non-empty `StartupData`
2. **Snapshot restore:** Isolate from snapshot executes code that references bridge globals
3. **Heap limits:** Restored isolate respects `heap_limit_mb`
4. **Multiple variants:** Different bridge code strings produce different snapshots; correct one is returned on cache hit
5. **Concurrent creation:** Multiple threads calling `get_or_create()` with same bridge code — only one snapshot is created
6. **LRU eviction:** Cache at `max_entries` evicts oldest entry
7. **WASM disabled after restore:** `WebAssembly.compile()` throws after `disable_wasm()` on restored isolate
8. **External references survive:** FunctionTemplates registered on restored isolate correctly dispatch to Rust callbacks
9. **Session isolation:** Snapshot from session A does not leak state to session B (fresh context per session)
10. **Eager warm-up:** `WarmSnapshot` message creates snapshot before any session; first Execute is a cache hit
11. **Warm-up disabled:** `SECURE_EXEC_NO_SNAPSHOT_WARMUP=1` skips eager creation; first Execute creates snapshot lazily

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Snapshot blob memory (~2-10MB per variant) | Low | LRU cache with max 4 entries. Negligible vs V8 isolate heap (64-256MB). Enforce 50MB max blob size, reject if exceeded. |
| Snapshot creation failure | Medium | Fall back to `create_isolate()` (no snapshot). Log warning. All tests must pass with and without snapshots. |
| `ExternalReferences` must be `'static` | Low | `OnceLock`-initialized. Entries are source-defined, stable within a binary. |
| Bridge code changes mid-process | Low | Different hash → different snapshot entry. In-flight sessions unaffected (Arc keeps old blob alive). |
| WASM disable not in snapshot | Medium | `disable_wasm()` called after every restore, same code path as today (`session.rs:252`). Test verifies. |
| Mutex contention on first session | Low | Lock held for ~20ms during snapshot creation (once per variant). Subsequent sessions find cache populated. |
| `v8::CreateParams::snapshot_blob()` + `heap_limits()` interaction | Low | Needs empirical verification. If incompatible, set heap limits post-creation via `set_heap_limit()`. |

## Performance Expectations

| Metric | Current | With snapshot | Savings |
|--------|---------|---------------|---------|
| Isolate creation (first session, warm-up) | ~15-20ms | ~2-3ms (snapshot already created during module load) | ~12-17ms |
| Isolate creation (first session, no warm-up) | ~15-20ms | ~20ms (create snapshot) + ~2-3ms (restore + setup) | Net ~0ms (one-time cost) |
| Isolate creation (subsequent) | ~15-20ms | ~2-3ms (restore + context + bridge cached + register) | ~12-17ms per session |
| Memory overhead | 0 | ~2-10MB per variant (max 4 variants = 8-40MB) | Acceptable |
| Code complexity | — | ~400-500 LOC (snapshot.rs + session changes + tests) | Moderate |

The win is proportional to session creation volume. For a workload creating 100 sessions, this saves ~1.2-1.7 seconds of cumulative startup time.

## Decisions Made (from adversarial review)

1. **Approach A (isolate-only snapshot), not Approach B (context snapshot).** Avoids External data re-wiring complexity. Bridge IIFE still runs per context from code cache, but all context-level security hardening (SharedArrayBuffer removal, global freezing, bridge fn registration) runs exactly as today. Simpler, safer.

2. **Per-variant snapshots, not per-process singleton.** Bridge code varies by timing mitigation, maxTimers, maxHandles, etc. One snapshot can't serve all variants. LRU cache handles this with bounded memory.

3. **Eager warm-up on module load, lazy fallback on Execute.** The host sends a `WarmSnapshot` message with the default bridge code immediately after connection, so the snapshot is ready before any session. Disabled via `SECURE_EXEC_NO_SNAPSHOT_WARMUP=1`. Sessions with different bridge code variants (freeze mode, different budgets) fall back to lazy creation on first Execute.

4. **SipHash for cache keys, not FNV-1a.** Better collision resistance on similar inputs. FNV-1a remains in `BridgeCodeCache` for V8 code caching (existing code, not worth changing).

5. **`disable_wasm()` re-applied after every restore.** Not captured in snapshot. Tested explicitly.

6. **Max snapshot blob size: 50MB.** Reject snapshot creation if blob exceeds this. Prevents resource exhaustion from malicious or degenerate bridge code.

7. **`BridgeCodeCache` kept.** Complements snapshots — snapshot handles isolate creation, code cache handles per-context bridge compilation. Neither makes the other redundant.
