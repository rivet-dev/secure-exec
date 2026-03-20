# V8 Context Snapshot: Eliminating Per-Session Bridge Compilation

## Status

Proposal — follows up on the isolate-only snapshot (v8-startup-snapshot.md, implemented US-052–057).

## Problem

The current isolate-only snapshot saves ~5-10ms of isolate creation, but the remaining per-session cost is still ~13ms:

```
Current per-execution breakdown (warm, snapshot-restored isolate):
  create_context()           ~0.5ms
  inject_globals()           ~0.5ms
  register 38 bridge fns     ~1ms
  compile bridge IIFE        ~3-5ms   ← biggest cost (code cache miss on new session)
  execute bridge IIFE        ~2-3ms   ← second biggest
  compile+run user code      ~1-2ms
  IPC round-trips             ~1-2ms
  ──────────────────────────
  Total:                     ~10-14ms
```

The bridge IIFE compilation and execution (~5-8ms) dominates. With an isolate-only snapshot, each new session creates a fresh context and recompiles the bridge from scratch (code cache is per-session, so the first execution is always a miss).

## Solution

Snapshot a **fully-initialized context** with the bridge code already compiled and executed. On restore, replace bridge function globals with session-local versions and inject per-session config. No bridge compilation or execution needed.

**Target per-execution cost:**

```
  restore context from snapshot   <0.5ms
  replace 38 bridge fn globals    ~0.5ms
  inject per-session config       ~0.5ms
  compile+run user code           ~1-2ms
  IPC round-trips                 ~1-2ms
  ──────────────────────────────
  Total:                          ~3-5ms
```

## Prerequisites

Two changes to the bridge code are required before context snapshots work:

### 1. Fix setupFsFacade: replace captured references with dynamic lookup

**Current (blocks snapshot restore):**

```javascript
// setupFsFacade captures references at setup time
var __fsFacade = {
  readFile: globalThis._fsReadFile,       // captured!
  writeFile: globalThis._fsWriteFile,     // captured!
  readFileBinary: globalThis._fsReadFileBinary, // captured!
  // ... all fs functions captured
};
__runtimeExposeCustomGlobal("_fs", __fsFacade);
```

After snapshot restore, replacing `globalThis._fsReadFile` has no effect because `_fs.readFile` still points to the old (dead) function reference from snapshot creation.

**Fix: use getter-based delegation:**

```javascript
var __fsFacade = {};
Object.defineProperties(__fsFacade, {
  readFile:      { get() { return globalThis._fsReadFile; },      enumerable: true },
  writeFile:     { get() { return globalThis._fsWriteFile; },     enumerable: true },
  readFileBinary:{ get() { return globalThis._fsReadFileBinary; },enumerable: true },
  writeFileBinary:{ get() { return globalThis._fsWriteFileBinary; },enumerable: true },
  readDir:       { get() { return globalThis._fsReadDir; },       enumerable: true },
  mkdir:         { get() { return globalThis._fsMkdir; },         enumerable: true },
  rmdir:         { get() { return globalThis._fsRmdir; },         enumerable: true },
  exists:        { get() { return globalThis._fsExists; },        enumerable: true },
  stat:          { get() { return globalThis._fsStat; },          enumerable: true },
  unlink:        { get() { return globalThis._fsUnlink; },        enumerable: true },
  rename:        { get() { return globalThis._fsRename; },        enumerable: true },
  chmod:         { get() { return globalThis._fsChmod; },         enumerable: true },
  chown:         { get() { return globalThis._fsChown; },         enumerable: true },
  link:          { get() { return globalThis._fsLink; },          enumerable: true },
  symlink:       { get() { return globalThis._fsSymlink; },       enumerable: true },
  readlink:      { get() { return globalThis._fsReadlink; },      enumerable: true },
  lstat:         { get() { return globalThis._fsLstat; },         enumerable: true },
  truncate:      { get() { return globalThis._fsTruncate; },      enumerable: true },
  utimes:        { get() { return globalThis._fsUtimes; },        enumerable: true },
});
__runtimeExposeCustomGlobal("_fs", __fsFacade);
```

Each `_fs.readFile` call now resolves `globalThis._fsReadFile` at call time. After snapshot restore, replacing the global works.

**Performance impact:** Getter delegation adds one property lookup per call. For fs operations that do real I/O + IPC, this is negligible (<0.01ms overhead on a ~50μs+ call).

### 2. Defer config-dependent setup to a post-restore init function

**Current (bakes config into closures at setup time):**

```javascript
// bridgeInitialGlobals — captures config values
var __bridgeSetupConfig = globalThis.__runtimeBridgeSetupConfig ?? {};
var __jsonPayloadLimitBytes = __bridgeSetupConfig.jsonPayloadLimitBytes ?? 4194304;

// Used in v8.deserialize — baked in, can't change
deserialize: function(buffer) {
  if (buffer.length > __jsonPayloadLimitBytes) { throw ... }
}
```

```javascript
// applyTimingMitigationFreeze — captures frozenTimeMs
var __frozenTimeMs = globalThis.__runtimeTimingMitigationConfig.frozenTimeMs;
Date.now = () => __frozenTimeMs;  // baked in
```

**Fix: read config values lazily from globals at call time:**

```javascript
// v8.deserialize reads limit from global at call time
deserialize: function(buffer) {
  var limit = globalThis.__runtimeJsonPayloadLimitBytes ?? 4194304;
  if (buffer.length > limit) { throw ... }
}
```

```javascript
// Timing mitigation reads from global at call time
// (only applied post-restore for freeze sessions)
Date.now = function() {
  return globalThis.__runtimeFrozenTimeMs ?? __originalDateNow();
};
```

Alternatively, wrap all config-dependent setup in a deferred init:

```javascript
globalThis.__runtimeApplyConfig = function(config) {
  // Apply timing mitigation
  if (config.timingMitigation === "freeze") {
    var frozenMs = config.frozenTimeMs;
    Object.defineProperty(Date, "now", { value: () => frozenMs, ... });
    delete globalThis.SharedArrayBuffer;
  }
  // Apply payload limits
  __jsonPayloadLimitBytes = config.jsonPayloadLimitBytes ?? 4194304;
  __payloadLimitErrorCode = config.payloadLimitErrorCode ?? "ERR_SANDBOX_PAYLOAD_TOO_LARGE";
  // Clean up
  delete globalThis.__runtimeApplyConfig;
};
```

The host calls `__runtimeApplyConfig(...)` as a short script after snapshot restore, before user code.

## Bridge Function Reference Analysis

All other bridge function references use **dynamic global lookup at call time** and are safe for snapshot restore:

| Component | Functions | Pattern | Safe? |
|-----------|-----------|---------|-------|
| ivm-compat shim | All | `globalThis[keys[i]]` | Yes |
| module.ts | `_resolveModule`, `_loadFile`, `_requireFrom` | Free variables | Yes |
| process.ts | `_log`, `_error`, `_scheduleTimer`, `_cryptoRandomFill` | Free variables | Yes |
| child-process.ts | `_childProcessSpawnStart`, `_childProcessStdinWrite`, etc. | Free variables | Yes |
| network.ts | `_networkFetchRaw`, `_networkDnsLookupRaw`, etc. | Free variables | Yes |
| require setup | `_loadPolyfill`, `_loadFile`, `_resolveModule` | Free variables | Yes |
| **setupFsFacade** | `_fsReadFile`, `_fsWriteFile`, etc. | **Captured into `_fs` object** | **No — fix required** |

## Snapshot Creation Flow

### At process startup (or first WarmSnapshot)

```
1. Create snapshot_creator isolate with ExternalReferences
2. Create context
3. Register STUB bridge functions on global
   - Same names (_fsReadFile, _log, etc.)
   - Same callbacks (sync_bridge_callback, async_bridge_callback)
   - External data points to a static no-op BridgeCallContext
   - These stubs exist so the bridge IIFE can reference them at setup time
4. Inject default config globals:
   - __runtimeBridgeSetupConfig = { initialCwd: "/", ... }
   - __runtimeCustomGlobalPolicy = { hardenedGlobals: [...], mutableGlobals: [...] }
   - _maxTimers = DEFAULT_MAX_TIMERS
   - _maxHandles = DEFAULT_MAX_HANDLES
   - _processConfig = { cwd: "/", env: {}, ... }
   - _osConfig = { homedir: "/root", ... }
5. Run the STATIC bridge IIFE
   - ivm-compat shim
   - globalExposureHelpers
   - bridgeInitialGlobals (with deferred config)
   - consoleSetup
   - setupFsFacade (with getter delegation)
   - bridge bundle IIFE
   - bridge attach
   - applyTimingMitigationOff (default — freeze applied post-restore)
   - requireSetup
   - initCommonjsModuleGlobals
   - applyCustomGlobalPolicy
6. set_default_context(context)
7. create_blob(FunctionCodeHandling::Keep)
```

The bridge IIFE runs once during snapshot creation. All infrastructure (require, console, fs facade, module system, custom globals) is set up. The context captures this fully-initialized state.

### Per-execution restore

```
1. Create isolate from snapshot blob
2. Get default context (bridge already executed, infrastructure ready)
3. disable_wasm() on isolate
4. REPLACE bridge function globals:
   - For each of the 38 bridge function names:
     global.set(scope, name, new_function_with_session_external_data)
   - This overwrites the stubs from snapshot creation
   - Bridge closures pick up the new functions via global lookup
5. Inject per-session config:
   - _processConfig = { cwd, env, timingMitigation, frozenTimeMs }
   - _osConfig = { homedir, tmpdir, platform, arch }
6. Run post-restore config script (if needed):
   - __runtimeApplyConfig({ timingMitigation, frozenTimeMs, ... })
   - Applies timing mitigation freeze (if enabled)
   - Sets payload limits
7. Run user code
```

No bridge IIFE compilation. No bridge IIFE execution. Just replace globals and go.

## Stub Bridge Functions for Snapshot

During snapshot creation, bridge functions need to exist on the global so the bridge IIFE can reference them (e.g., the ivm-compat shim does `globalThis[keys[i]]`). But they don't need to actually work — they're stubs.

```rust
/// Create a no-op BridgeCallContext for snapshot stub functions.
/// sync_call/async_send always return Err — but they're never called
/// during snapshot creation (bridge IIFE only sets up closures, doesn't call bridge fns).
fn create_stub_bridge_ctx() -> BridgeCallContext {
    // No-op context — panics if actually called
    BridgeCallContext::stub()
}
```

The stubs use the same `sync_bridge_callback` / `async_bridge_callback` via ExternalReferences (required for snapshot serialization), but their External data points to a static stub context. The bridge IIFE's setup code references these functions but doesn't call them — it just wraps them in closures.

**Key invariant:** The bridge IIFE must not CALL any bridge function during setup. It only creates closures/wrappers. Calls happen when user code runs. If any bridge function is called during IIFE setup (e.g., `_loadPolyfill`), that call must be moved to post-restore.

### _loadPolyfill exception

`_loadPolyfill` is called during require setup to load Node.js polyfills. This is a setup-time call, not a user-code call. Options:

1. **Move polyfill loading to post-restore** — run a short init script after restore that calls `_loadPolyfill` for each needed polyfill
2. **Inline polyfill source in bridge IIFE** — embed the polyfill code directly instead of loading via bridge call
3. **Pre-load polyfills into the snapshot** — load them during snapshot creation via a real (non-stub) `_loadPolyfill` that reads from the filesystem

Option 1 is simplest. The post-restore init script already exists for config application; add polyfill loading to it.

## Context vs Isolate Snapshot

The current implementation (US-052–057) snapshots the **isolate** — compiled bytecode lives in the heap, but no context is snapshotted. Each session creates a fresh context.

This spec changes to snapshotting a **context**:

```rust
// Snapshot creation
let mut isolate = v8::Isolate::snapshot_creator(Some(external_refs()), None);
{
    let scope = &mut v8::HandleScope::new(&mut isolate);
    let context = v8::Context::new(scope, Default::default());
    let scope = &mut v8::ContextScope::new(scope, context);

    // Register stubs, inject defaults, run bridge IIFE
    register_stub_bridge_fns(scope, &SYNC_BRIDGE_FNS, &ASYNC_BRIDGE_FNS);
    inject_snapshot_defaults(scope);
    run_bridge_iife(scope, &bridge_code);

    // Snapshot THIS context (with bridge state)
    scope.set_default_context(context);
}
let blob = isolate.create_blob(FunctionCodeHandling::Keep).unwrap();
```

```rust
// Restore — get the pre-initialized context instead of creating fresh
let mut isolate = create_isolate_from_snapshot(&blob, heap_limit_mb);
let scope = &mut v8::HandleScope::new(&mut isolate);
let context = scope.get_current_context(); // from snapshot, bridge already set up

// Replace stubs with real bridge functions
replace_bridge_fns(scope, &bridge_ctx, &session_buffers, &SYNC_BRIDGE_FNS, &ASYNC_BRIDGE_FNS);

// Inject session config
inject_globals_from_payload(scope, payload);

// Run post-restore init (timing mitigation, polyfill loading)
run_post_restore_init(scope, &config_script);

// Run user code — no bridge IIFE needed
run_user_code(scope, &user_code);
```

### Getting the default context after restore

When an isolate is created from a snapshot that used `set_default_context()`, the default context is available via `scope.get_current_context()` inside a `HandleScope`. No new context creation needed.

## Implementation Plan

### Phase 1: Fix setupFsFacade (prerequisite)

**File: `packages/secure-exec-core/isolate-runtime/src/inject/setup-fs-facade.ts`**

Replace direct property assignment with getter-based delegation. Every `_fs.xxx` property becomes a getter that looks up `globalThis._fsXxx` at call time.

**Tests:** All existing fs tests must pass unchanged. The getter pattern is transparent to callers.

### Phase 2: Defer config-dependent setup (prerequisite)

**File: `packages/secure-exec-core/isolate-runtime/src/inject/bridge-initial-globals.ts`**
**File: `packages/secure-exec-core/isolate-runtime/src/inject/apply-timing-mitigation-freeze.ts`**

1. Make `__jsonPayloadLimitBytes` and `__payloadLimitErrorCode` read from globals at call time instead of capturing at setup
2. Add `globalThis.__runtimeApplyConfig(config)` function that applies timing mitigation and config values post-restore
3. Change timing mitigation to be deferrable — always include both code paths, apply based on config value

**Tests:** All existing tests must pass. Timing mitigation tests must verify freeze works when applied via `__runtimeApplyConfig`.

### Phase 3: Compose static bridge code

**File: `packages/secure-exec-node/src/execution-driver.ts`**

Split `composeBridgeCode()` into:
- `composeStaticBridgeCode()` — the bridge IIFE without any per-session config literals. Used for snapshot creation. Identical across all sessions/drivers.
- `composePostRestoreScript(timingMitigation, frozenTimeMs, config)` — short script that calls `__runtimeApplyConfig(...)` and loads polyfills. Run after snapshot restore.

### Phase 4: Add stub bridge context

**File: `crates/v8-runtime/src/bridge.rs`**

Add `BridgeCallContext::stub()` — a no-op context that panics if `sync_call` or `async_send` is called. Used during snapshot creation.

Add `register_stub_bridge_fns(scope, sync_fns, async_fns)` — registers all 38 bridge functions with stub External data.

### Phase 5: Context snapshot creation

**File: `crates/v8-runtime/src/snapshot.rs`**

Update `create_snapshot()` to:
1. Register stub bridge functions
2. Inject default config globals
3. Run the static bridge IIFE
4. `set_default_context(context)` — snapshot the fully-initialized context
5. `create_blob(FunctionCodeHandling::Keep)`

### Phase 6: Context restore in session thread

**File: `crates/v8-runtime/src/session.rs`**

On Execute, instead of:
```
create_context() → register_bridge_fns() → run_bridge_iife()
```

Do:
```
get default context from snapshot → replace_bridge_fns() → inject_globals() → run_post_restore_script()
```

Add `replace_bridge_fns(scope, ctx, buffers, sync_fns, async_fns)` — overwrites the stub globals with real session-local bridge functions.

### Phase 7: Post-restore init script

**File: `packages/secure-exec-v8/src/runtime.ts`**

Add a `postRestoreScript` field to the Execute message (or compose it on the Rust side from config). This short script:
- Calls `__runtimeApplyConfig(...)` with session config
- Loads polyfills via `_loadPolyfill()`
- Sets CJS module globals if needed

### Phase 8: Benchmark baseline (before)

**Must be completed before any code changes in Phases 1–7.**

Run `packages/secure-exec/benchmarks/quick-bench.ts` (or the full `run-benchmarks.sh`) and record the baseline numbers. These are the "before" measurements against the current isolate-only snapshot implementation.

```
npx tsx benchmarks/quick-bench.ts 2>&1
```

Record for each run:
- Cold start (ms) — new NodeRuntime + first run()
- Warm start (ms) — second run() on same runtime (= per-session cost)

Save results to `packages/secure-exec/benchmarks/results/context_snapshot_before.json` with hardware info and commit hash.

**Current baseline (2026-03-19, isolate-only snapshot):**
```
  run 1: cold=95.4ms  warm=15.8ms   ← process cold-start
  run 2: cold=47.0ms  warm=13.1ms   ← steady state
  run 3: cold=46.9ms  warm=13.9ms
  run 4: cold=56.4ms  warm=13.8ms
  run 5: cold=66.6ms  warm=12.8ms
```

Target: warm start drops from ~13ms to ~3-5ms.

### Phase 9: Tests

1. **Getter facade:** `_fs.readFile` resolves to the current global, not a stale reference
2. **Config deferral:** `__runtimeApplyConfig` correctly applies timing freeze, payload limits
3. **Context snapshot:** Restored context has bridge infrastructure (require, console, fs) working
4. **Bridge replacement:** Replacing stub functions on restored context correctly dispatches to Rust callbacks
5. **Timing mitigation:** Freeze applied via post-restore script correctly freezes Date.now and removes SharedArrayBuffer
6. **Polyfill loading:** Polyfills loaded via post-restore script work correctly
7. **Full round-trip:** exec() and run() produce correct results on snapshot-restored context
8. **No regression:** All existing test suites pass

### Phase 10: Benchmark verification (after)

Run the same benchmark from Phase 8 and compare against the baseline.

```
npx tsx benchmarks/quick-bench.ts 2>&1
```

Save results to `packages/secure-exec/benchmarks/results/context_snapshot_after.json`.

**Verification criteria:**
- Warm start (per-session cost) must be **< 6ms** (down from ~13ms)
- Cold start must not regress (should stay ~47-67ms steady state or improve)
- All existing test suites still pass

If warm start does not improve by at least 40%, investigate with per-phase timing (add `performance.now()` instrumentation to the session thread to identify where time is spent).

**Report format (committed alongside code):**

```
packages/secure-exec/benchmarks/results/context_snapshot_comparison.md

## Context Snapshot Performance Comparison

| Metric         | Before (isolate snapshot) | After (context snapshot) | Change |
|----------------|--------------------------|--------------------------|--------|
| Warm mean      | XX.Xms                   | X.Xms                    | -XX%   |
| Warm p50       | XX.Xms                   | X.Xms                    | -XX%   |
| Cold mean      | XX.Xms                   | XX.Xms                   | ±X%    |

Hardware: [cpu, cores, ram, node version]
Commit before: [hash]
Commit after: [hash]
```

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bridge IIFE calls a bridge function at setup time (not just wrapping) | High | Audit all setup paths. Known case: `_loadPolyfill` — defer to post-restore. |
| Getter-based fs facade introduces subtle timing differences | Low | Getters resolve synchronously from the same global scope. Transparent to callers. |
| Config deferral changes observable behavior | Medium | Test timing mitigation, payload limits, and process.uptime() carefully. |
| Default context from snapshot differs from fresh context | Medium | Test that bridge state (require cache, module registry, etc.) is clean on restore. |
| Snapshot captures mutable state that should be fresh per session | High | Audit all mutable module-level state in bridge code. require cache, module registry, timer state must be reset post-restore. |

## Performance Expectations

| Metric | Current (isolate snapshot) | With context snapshot | Savings |
|--------|---------------------------|---------------------|---------|
| Per-session cold (new session) | ~13ms | ~3-5ms | ~8-10ms |
| Bridge IIFE compilation | ~3-5ms | 0ms | ~3-5ms |
| Bridge IIFE execution | ~2-3ms | 0ms | ~2-3ms |
| Bridge fn registration | ~1ms | ~0.5ms (replacement) | ~0.5ms |
| Post-restore init script | 0ms | ~0.5ms | -0.5ms |

For 100 sessions, cumulative savings: ~800ms–1000ms.

## Mutable State Reset

The snapshot captures the context after bridge IIFE execution. Any mutable state set during that execution persists across restores. State that must be clean per session:

| State | Location | Reset strategy |
|-------|----------|----------------|
| Module cache (`require.cache`) | module.ts | Clear in post-restore script |
| Module registry (ESM) | execution.rs `MODULE_RESOLVE_STATE` | Already thread-local, fresh per session |
| Timer state | process.ts | Already reset via bridge — `_maxTimers` counter |
| Handle count | bridge | Already reset via bridge — `_maxHandles` counter |
| `process.exitCode` | process.ts | Reset in post-restore script |
| `_processStartTime` | process.ts | Reset to `Date.now()` in post-restore script |

The post-restore init script handles all JS-side resets. Rust-side state (PendingPromises, BridgeCallContext, etc.) is already per-session.

## Open Questions

1. **_loadPolyfill at setup time:** How many polyfills are loaded during bridge IIFE setup? If it's just a few, inlining them in the IIFE is simpler than deferring. If many, deferring to post-restore is better.

2. **Bridge code truly static?** After extracting all config, is the bridge IIFE byte-for-byte identical across all sessions/drivers? If yes, one snapshot per process. If no, need to identify remaining differences.

3. **Require cache pollution:** Does the bridge IIFE populate `require.cache` with anything that should NOT persist across sessions? If so, the post-restore script must clear specific entries.
