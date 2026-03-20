# V8 Process Isolation: Configurable Runtime Topology

## Status

Proposal — extends the V8 runtime implementation.

## Problem

All `NodeRuntime` instances currently share a single Rust V8 child process via a module-level singleton (`getSharedV8Runtime()` in `execution-driver.ts`). Each runtime gets its own V8 session (separate isolate on a separate OS thread), but they all live in the same OS process.

This means:

1. **Crash blast radius** — V8 OOM, segfault, or panic in any session kills ALL sessions across ALL `NodeRuntime` instances simultaneously.
2. **No resource partitioning** — `maxSessions` is per-process, not per-tenant. There's no way to give different tenants different process-level budgets.
3. **No fault domain control** — a multi-tenant host cannot isolate Tenant A's executions from Tenant B's at the process level.

Sessions within a process have separate V8 heaps, but a V8 engine bug, native code exploit, or catastrophic OOM in one session can take down the process and all co-located sessions.

## Design

### API

Instead of a boolean `processIsolation` flag, expose `V8Runtime` as a first-class handle that can be passed to the runtime driver:

```typescript
import { createV8Runtime } from "@secure-exec/v8";
import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "@secure-exec/node";

// Default — global shared process (current behavior, no change)
const rt1 = new NodeRuntime({
  systemDriver: createNodeDriver(),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
});

// Explicit process — two runtimes share a dedicated process
const tenantProcess = await createV8Runtime({ maxSessions: 10 });
const rt2 = new NodeRuntime({
  systemDriver: createNodeDriver(),
  runtimeDriverFactory: createNodeRuntimeDriverFactory({ v8Runtime: tenantProcess }),
});
const rt3 = new NodeRuntime({
  systemDriver: createNodeDriver(),
  runtimeDriverFactory: createNodeRuntimeDriverFactory({ v8Runtime: tenantProcess }),
});
// rt2 and rt3 share tenantProcess, isolated from rt1's global process

// Maximum isolation — one process per runtime
const isolatedProcess = await createV8Runtime();
const rt4 = new NodeRuntime({
  systemDriver: createNodeDriver(),
  runtimeDriverFactory: createNodeRuntimeDriverFactory({ v8Runtime: isolatedProcess }),
});
```

### Topology examples

```
Shared (default):
  NodeRuntime A ─┐
  NodeRuntime B ─┤── Global V8 Process (sessions: A1, B1, C1)
  NodeRuntime C ─┘

Per-tenant:
  NodeRuntime A ─┐── Tenant 1 Process (sessions: A1, B1)
  NodeRuntime B ─┘
  NodeRuntime C ──── Tenant 2 Process (sessions: C1)

Per-runtime:
  NodeRuntime A ──── Process A (session: A1)
  NodeRuntime B ──── Process B (session: B1)
```

### Interface changes

#### `createNodeRuntimeDriverFactory`

Add an optional `v8Runtime` field to the factory options:

```typescript
interface NodeRuntimeDriverFactoryOptions {
  /** V8 runtime process to use for sessions.
   *  If omitted, uses the global shared process (current behavior). */
  v8Runtime?: V8Runtime;
}

function createNodeRuntimeDriverFactory(
  options?: NodeRuntimeDriverFactoryOptions
): NodeRuntimeDriverFactory;
```

#### `NodeExecutionDriver`

The execution driver currently calls `getSharedV8Runtime()` unconditionally. Change it to accept an optional `V8Runtime` from the factory:

```typescript
// Current
async function getSharedV8Runtime(): Promise<V8Runtime> { ... }

// New — the factory passes v8Runtime through to the driver
class NodeExecutionDriver {
  private v8RuntimeOverride: V8Runtime | null;

  constructor(options: NodeExecutionDriverOptions) {
    this.v8RuntimeOverride = options.v8Runtime ?? null;
  }

  private async getV8Runtime(): Promise<V8Runtime> {
    return this.v8RuntimeOverride ?? getSharedV8Runtime();
  }
}
```

#### Lifecycle

- `createV8Runtime()` already spawns a new child process. No changes needed.
- The caller owns the `V8Runtime` handle and is responsible for calling `dispose()` when done.
- The global shared runtime is disposed automatically on process exit (existing behavior).
- If a passed-in `V8Runtime` is disposed while sessions are active, those sessions receive `ERR_V8_PROCESS_CRASH` errors (existing crash path).

### What does NOT change

- `createV8Runtime()` API — already supports `maxSessions`, `binaryPath` options.
- `V8Session` API — sessions are unaware of which process they're in.
- Bridge handler routing — unchanged, works per-session.
- IPC wire format — unchanged.
- Default behavior — omitting `v8Runtime` uses the global singleton, fully backward compatible.

## Documentation

A new documentation page `docs/process-isolation.mdx` should be added covering:

1. **What process isolation means** — separate OS process, separate memory space, separate FD table, separate crash domain.
2. **When to use it** — multi-tenant hosting, untrusted code from different security domains, workloads with high OOM risk.
3. **Topology options** — shared (default), per-tenant, per-runtime, with code examples for each.
4. **Trade-offs** — each process costs ~30-50MB RSS + one UDS connection. Shared process is more memory-efficient; isolated processes are safer.
5. **Resource limits** — `maxSessions` is per-process. Show how to combine process isolation with session limits.
6. **Crash behavior** — what happens when an isolated process dies (only its sessions are affected, not others).

This page belongs in the main docs navigation (not experimental), since process isolation is a core security feature of the Node runtime.

## Implementation plan

1. Add `v8Runtime` option to `NodeRuntimeDriverFactoryOptions`
2. Thread `v8Runtime` from factory → `NodeExecutionDriver` constructor → `getV8Runtime()` method
3. Keep `getSharedV8Runtime()` as the fallback when no override is provided
4. Add integration tests: two isolated processes, crash in one doesn't affect the other
5. Add `docs/process-isolation.mdx` documentation page
6. Update `docs/runtimes/node.mdx` to cross-reference the process isolation page
