# Upstream Node Runtime Preflight

Date: 2026-03-30

Host probe runner: `packages/nodejs/scripts/run-upstream-node-preflight.mjs`

Host Node used for this capture: `v24.13.0`

## Scope

This note records the US-001 preflight probes for the riskiest upstream Node bootstrap bindings.

The harness intentionally uses the running host Node binary's builtin source via `process.binding('natives')` plus `--expose-internals` instead of vendoring a partial upstream tree. That keeps this story focused on architecture-shape validation only.

Pinned asset sync and full upstream builtin vendoring remain US-003 work.

## Results

| Probe | Result | Notes |
| --- | --- | --- |
| `internal/bootstrap/realm` | Pass | Replayed to completion with an explicit `builtins` binding that supplies `builtinIds`, `compileFunction`, and `setInternalLoaders`, plus host `module_wrap` / `errors` bindings. |
| `internal/bootstrap/node` | Blocked | With a mutable process shim and a no-op `buffer.setBufferPrototype` shim, replay aborts in native `async_wrap.setupHooks()` because the environment never initialized async hook state. |
| `module_wrap` | Pass | `internalBinding('module_wrap').ModuleWrap` compiled, linked, instantiated, and evaluated a trivial ESM graph. |
| `contextify` | Pass | `node:vm createContext()` / `runInContext()` worked and the host `contextify` binding exposed `makeContext` / `compileFunction`. |
| `uv` net path | Pass | `net.createServer().listen(0)` plus `net.connect()` round-tripped `ping` / `pong` on the host runtime. |
| `cares_wrap` DNS path | Pass | `dns.lookup('localhost')` succeeded and `cares_wrap` exposed `getaddrinfo`-style entrypoints. |

## Concrete Bootstrap Findings

### `internal/bootstrap/realm`

The replayed `realm` source did not need the entire runtime. The minimum explicit surface that mattered in this probe was:

- `internalBinding('builtins')`
  - `builtinIds`
  - `compileFunction(id)`
  - `setInternalLoaders(internalBinding, requireBuiltin)`
- `internalBinding('module_wrap')`
- `internalBinding('errors')`

`realm` also immediately compiles `internal/errors`, which in turn compiles `internal/assert` and reads `internalBinding('util')`. That means the first bootstrap contract is already broader than just `builtins` plus `module_wrap`, but it is still a bounded host-side problem.

### `internal/bootstrap/node`

The first replay blocker was not Wasm or POSIX-related. It is still on the host/native bootstrap seam:

1. A plain object is not a valid fake `process` because `setupProcessObject()` mutates the prototype *above* `process`, not `process` itself. The probe needed a mutable placeholder prototype.
2. `internalBinding('buffer')` needs `setBufferPrototype()` during `setupBuffer()`.
3. After that shim, replay reaches `internalBinding('async_wrap').setupHooks(nativeHooks)` and the host process aborts with:

```text
Assertion failed: env->async_hooks_init_function().IsEmpty()
```

That assertion means a replacement runtime cannot treat `async_wrap` as a late JS-only detail. It needs explicit host/runtime lifecycle support before `internal/bootstrap/node` can run to completion.

## Interpretation

This preflight does **not** disprove the Node-first plan.

What it does show is:

- `module_wrap`, `contextify`, minimal `uv`, and minimal `cares_wrap` are all viable host-owned seams.
- `internal/bootstrap/realm` is reachable with a bounded `builtins` contract.
- `internal/bootstrap/node` needs real host-native bootstrap work for `buffer` and `async_wrap` state before a snapshot-free bring-up can succeed.

That is still aligned with the intended architecture:

- keep V8/embedder and lifecycle-sensitive bindings on the host
- move POSIX-ish bottom-half work behind the Wasm-backed backend later
- do not pretend bootstrap can be finished from TypeScript alone

## Immediate Follow-On Implications

- US-003 should pin the upstream Node version and vendor the full builtin tree.
- US-005 and US-007 should treat `builtins`, `module_wrap`, `buffer`, and `async_wrap` as first-class bring-up surfaces, not incidental follow-up work.
- Any future bootstrap replay probes should stay isolated in child host Node processes because `bootstrap/node` can abort the process on native assertions.
