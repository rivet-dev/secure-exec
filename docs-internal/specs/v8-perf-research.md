# V8 Runtime Performance Research

**Date:** 2026-03-19
**Commit baseline:** ec740af (post context-snapshot)
**Hardware:** i7-12700KF, 20 cores, 62 GB RAM, Node v24.13.0, Linux 6.1.0-41-amd64

## Current Performance Baseline

After context snapshot optimization (US-052 through US-067):

| Metric | Value | Improvement from pre-snapshot |
|--------|-------|------------------------------|
| Warm start (per-session) | 2.4ms mean (p50=2.4ms) | 80% reduction from 13.75ms |
| Cold steady-state | 22ms mean | 54% reduction from 48ms |
| Cold process start | 66ms mean | 34% reduction from 100ms |

## 1. Warm Start Per-Phase Profiling

Profiling instrumented in `session.rs` with `std::time::Instant` around each phase.
Data collected over 8 warm executions of `export const x = 1;` (ESM run mode).

### Raw Timing Data

The warm start shows **bimodal behavior** — alternating between fast (~0.7ms) and slow (~1.9–2.9ms) Rust-side execution:

| Phase | Fast (ms) | Slow (ms) | % of total (slow) |
|-------|-----------|-----------|-------------------|
| context_clone | 0.49 | 1.2–2.2 | 50–75% |
| inject_globals | 0.015 | 0.054 | 2% |
| bridge_ctx_create | 0.001 | 0.002 | <1% |
| bridge_fn_replace | 0.033 | 0.15–0.17 | 5–6% |
| post_restore_script | 0.107 | 0.34–0.40 | 12–14% |
| user_code_exec | 0.025 | 0.08–0.09 | 3% |
| **total_rust_exec** | **0.70** | **1.9–2.9** | — |

Including IPC overhead (~0.3ms each way), total warm start is ~1.3ms (fast) or ~2.5ms (slow).

### Key Findings

1. **Context clone dominates** — `Context::new()` on a snapshot-restored isolate is 50–75% of total Rust execution time. This is V8's heap deserialization of the snapshot blob (~4–8MB of bridge IIFE state).

2. **Bimodal behavior** — The alternating fast/slow pattern suggests V8 internal caching (e.g., TLB, heap page reuse). On the "fast" path, V8 likely reuses recently-freed heap pages; on "slow" paths, it allocates fresh pages.

3. **Post-restore script is second largest** — At 0.1–0.4ms, compiling and running the ~200-byte post-restore config script is 12–14% of total. This could be eliminated with code caching or by moving config application to native Rust code.

4. **Bridge function replacement is small** — At 0.03–0.17ms for 38 functions, this is efficient. No further optimization needed.

5. **User code compilation is negligible** — Trivial code compiles and runs in 0.02–0.09ms. Complex code (100-iteration loop with object allocation) adds <0.05ms. V8's code caching for user code would save negligible time.

6. **IPC overhead is fixed** — ~0.3–0.5ms total for two UDS messages (InjectGlobals + Execute) and one response (ExecutionResult). This is dominated by kernel context switches (UDS sendmsg/recvmsg).

### Time Budget (Warm Start, Slow Path)

```
Total: ~2.5ms
├─ TS host prep: ~0.3ms (compose bridge code, v8.serialize, build handlers)
├─ IPC send (InjectGlobals + Execute): ~0.2ms
├─ Rust execution: ~1.9ms
│  ├─ Context clone from snapshot: ~1.2ms
│  ├─ Inject globals (V8 deser + properties): ~0.05ms
│  ├─ Bridge fn replacement (38 fns): ~0.15ms
│  ├─ Post-restore script compile+run: ~0.35ms
│  └─ User code compile+run: ~0.08ms
├─ IPC recv (ExecutionResult): ~0.1ms
└─ TS result processing: ~0.05ms
```

## 2. Evaluation: Per-Session UDS Sockets

**Current:** All sessions share one UDS connection to the Rust process. Messages are multiplexed by session_id.

**Proposed:** One UDS socket per session.

### Head-of-Line Blocking Impact

Measured by comparing trivial execution times vs. execution with concurrent large payload:
- Trivial code (no concurrent sessions): 2.4ms
- Trivial code with concurrent large read: (not measured — requires test harness)

**Analytical estimate:** A 10MB file read payload at UDS throughput (~4 GB/s on Linux) takes ~2.5ms to transmit. During this time, other sessions' small messages (~500B) are blocked behind the large frame. With 10 concurrent sessions, the p99 latency impact would be ~2.5ms × (probability of hitting head-of-line) ≈ 0.5–1ms per small request.

### FD Cost

- Per-session UDS: 2 FDs per session (one each side)
- Default max sessions: num_cpus (20 on this machine)
- Total FD cost: 40 FDs → trivial (Linux default ulimit is 1024)
- For 100 concurrent sessions: 200 FDs → still comfortable

### Trade-offs

| Aspect | Shared socket | Per-session socket |
|--------|--------------|-------------------|
| Head-of-line blocking | Yes, large payloads block all | Eliminated |
| FD cost | 2 total | 2 × num_sessions |
| Connection setup | One-time | Per session (~0.1ms) |
| Complexity | Simpler routing | Session-to-socket mapping |
| Authentication | Once per connection | Once per socket |
| Batch module resolution | Single connection | Multiple connections |

### Recommendation: **Low priority** (P3)

Head-of-line blocking is only relevant for concurrent sessions with large payloads. Most workloads use small bridge call payloads (<1KB). The shared connection with per-session buffered writer (US-046) already eliminates serialization contention. Per-session sockets would add complexity for marginal improvement.

**When to reconsider:** If users report latency spikes under concurrent large-file workloads.

## 3. Evaluation: mmap/Shared-Memory Ring Buffer IPC

**Current:** UDS with length-prefixed binary frames. Each bridge call is a UDS sendmsg/recvmsg round-trip (~1.4μs per syscall on Linux).

**Proposed:** Shared memory region with lock-free ring buffer for bridge call data. Notification via futex or eventfd.

### Latency Estimate

| Mechanism | Per-message latency | Notes |
|-----------|-------------------|-------|
| UDS sendmsg+recvmsg | ~2.8μs (1.4μs × 2) | Kernel context switch |
| Shared memory + futex | ~0.3–0.5μs | Userspace memcpy + futex wake |
| Shared memory + spin | ~0.1–0.2μs | No kernel, but burns CPU |

For a typical execution with 0–3 bridge calls, the total IPC saving would be ~2–8μs — less than 1% of the 2.4ms warm start.

### Implementation Complexity

1. **Lock-free ring buffer** — Requires careful memory ordering (SeqCst/Acquire/Release), cache-line alignment, and wraparound handling. ~500 lines of Rust + ~300 lines of TS.

2. **Shared memory lifecycle** — `shm_open()` + `mmap()` on both sides. Must handle:
   - Crash cleanup (what if Rust process dies mid-write?)
   - Size negotiation (ring buffer size must be agreed upon)
   - Page-aligned allocation
   - CLOEXEC handling

3. **Dual transport** — Would need to keep UDS for control messages (CreateSession, DestroySession) and use shared memory only for hot-path bridge calls. Two code paths to maintain.

4. **Cross-platform** — `shm_open` works on Linux and macOS. Windows would need a different mechanism (named shared memory).

### Recommendation: **Not recommended** (P4 — avoid)

The IPC latency saving (~8μs per execution) is dwarfed by V8 context setup time (~1.5ms). The implementation complexity (lock-free sync, crash cleanup, dual transport) is substantial. The risk of subtle concurrency bugs in a security-critical path is high.

**When to reconsider:** Only if bridge call volume per execution reaches 100+ calls AND per-call latency matters (e.g., tight computation loops with frequent host callbacks).

## 4. Evaluation: V8 Code Caching for User Code

**Current:** Bridge code uses V8 code caching (US-041). User code is compiled fresh each execution.

**Measured user code compilation times:**
- Trivial code (`export const x = 1;`): 0.02–0.08ms
- Complex code (100-iteration loop with objects): 0.02–0.08ms (same — compilation is fast)
- Real-world estimate (500-line script): ~0.1–0.3ms

### Cache Hit Rate Estimate

User code caching requires a hash-to-cache lookup. For user code to benefit from caching:
- The same code must be executed multiple times
- Code cache must be stored per-session (bridge code cache is per-session already)

In typical use patterns:
- **exec()** mode: Different user code each time → cache miss rate ~100%
- **run()** with fixtures: Same code repeated → high cache hit rate
- **REPL/interactive**: Unique code each time → cache miss rate ~100%

### Implementation Cost

1. Add hash computation for user code (~0 overhead with FNV-1a)
2. Store code cache per-session alongside bridge code cache
3. Check hash on each execution, consume cache on hit
4. Generate cache on miss after compilation

~30 lines of Rust code change, reusing existing `BridgeCodeCache` pattern.

### Recommendation: **Low priority** (P3 — quick win if needed)

User code compilation is 0.02–0.08ms for typical scripts — barely measurable. Even for 500-line scripts, compilation is <0.3ms. The cache would save <0.2ms and only helps when the same code is executed repeatedly within a session.

**When to reconsider:** If users execute large scripts (1000+ lines) repeatedly within the same session and latency matters.

## 5. Additional Optimization Opportunities

### 5a. Merge InjectGlobals into Execute (Quick Win — P1)

**Current:** Two IPC messages per execution: InjectGlobals + Execute. The InjectGlobals payload is sent as a separate message even though it's immediately consumed by the Execute handler.

**Proposed:** Include the globals payload in the Execute message itself. Saves one UDS round-trip (~1.4μs) and one message decode/encode cycle.

**Estimated saving:** ~0.1–0.2ms (IPC overhead + framing)
**Complexity:** Low — wire format change + remove separate InjectGlobals handling in session thread.

### 5b. Code-Cache the Post-Restore Script (Quick Win — P1)

**Current:** The ~200-byte post-restore script is compiled from source on every execution (0.1–0.4ms). It changes only when `timingMitigation` or `maxTimers`/`maxHandles` change.

**Proposed:** Apply the same V8 code caching used for bridge code to the post-restore script. Hash the script string, consume cached bytecode on match.

**Estimated saving:** ~0.1–0.3ms (compilation time)
**Complexity:** Very low — reuse `BridgeCodeCache` pattern for post-restore script.

### 5c. Session Pooling (Medium Effort — P2)

**Current:** Each execution creates a fresh context clone from the snapshot. Context cloning is the dominant cost (0.5–2.2ms).

**Proposed:** Pre-create a pool of ready-to-execute contexts (snapshot-cloned, bridge functions replaced, globals injected). On execute(), pick a context from the pool instead of creating one.

**Estimated saving:** ~0.5–2.0ms (context clone + bridge fn replacement)
**Complexity:** Medium — requires context lifecycle management, pool sizing, and cleanup between reuse. Must ensure complete isolation between pooled uses (no state leakage).

**Risk:** Context reuse may leak state between executions if cleanup is incomplete. Must verify that all mutable state (global variables, closures, WeakMaps) is properly reset.

### 5d. Reduce Context Clone Size (Medium Effort — P2)

**Current:** The snapshot blob includes the entire bridge IIFE's initialized state (~4–8MB of V8 heap). Every `Context::new()` deserializes this entire blob.

**Proposed:** Minimize the bridge IIFE's state footprint:
- Lazy-initialize large data structures (e.g., polyfill tables)
- Use more compact representations for bridge infrastructure
- Remove unused bridge code branches

**Estimated saving:** 10–30% reduction in context clone time (0.1–0.6ms)
**Complexity:** Medium — requires profiling V8 heap snapshot contents and refactoring bridge code.

### 5e. Batch InjectGlobals + Execute into a Single IPC Frame (Quick Win — P1)

Same as 5a, but also batch the `postRestoreScript` field to avoid a separate compilation step. Alternatively, move the post-restore config application to Rust-native code (inject globals directly via V8 C++ API instead of compiling+running a JS script).

## 6. Priority Summary

| # | Optimization | Estimated Saving | Effort | Priority |
|---|-------------|------------------|--------|----------|
| 5b | Code-cache post-restore script | 0.1–0.3ms | Very low | **P1 — do now** |
| 5a | Merge InjectGlobals into Execute | 0.1–0.2ms | Low | **P1 — do now** |
| 5c | Session pooling | 0.5–2.0ms | Medium | **P2 — do next** |
| 5d | Reduce snapshot blob size | 0.1–0.6ms | Medium | **P2 — do next** |
| 4 | User code caching | <0.2ms | Very low | P3 — when needed |
| 2 | Per-session sockets | Latency variance | Medium | P3 — when needed |
| 3 | Shared memory IPC | ~8μs | High | P4 — avoid |

### Cumulative Impact Estimate

Implementing P1 items: warm start ~2.4ms → ~2.0ms (~17% improvement)
Implementing P1 + P2 items: warm start ~2.4ms → ~0.5–1.0ms (~60–80% improvement)

Session pooling (5c) is the largest single opportunity but requires the most careful implementation. The P1 quick wins should be done first as they're low-risk.

## 7. Bimodal Behavior Investigation

The alternating fast/slow pattern in warm execution deserves further investigation:

- **Hypothesis 1: V8 GC** — Garbage collection between executions may trigger full heap walks. On the "fast" path, recent memory is reusable; on "slow" paths, GC runs.
- **Hypothesis 2: TLB pressure** — Context cloning touches many V8 heap pages. TLB misses on cold pages add latency.
- **Hypothesis 3: Memory allocator** — `jemalloc` or the system allocator may batch-free pages periodically.

To investigate: add `--trace-gc` V8 flag to the isolate and correlate GC events with timing.

## Appendix: Profiling Script

The profiling script and raw data are in `packages/secure-exec/benchmarks/profile-warm-path.ts`.
Rust-side instrumentation was added temporarily to `session.rs` (reverted after data collection).
