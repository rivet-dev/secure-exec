# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T22:12:14.681Z
Description: Loads Hono, builds an app, serves a request, and reads the response.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 37.440 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.484 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.984 ms
- Dominant bridge time: `_loadPolyfill` 11.844 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 11.844 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 143.220 ms; runtime create 107.649 ms; first pass 35.571 ms; sandbox 0.000 ms; checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Sandbox true cold start, warm snapshot disabled: total 126.328 ms; runtime create 2.978 ms; first pass 123.350 ms; sandbox 0.000 ms; checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Sandbox new-session replay, warm snapshot enabled: cold 101.774 ms; warm 37.440 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 124.082 ms; warm 32.519 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 36.245 ms; first checks `status`=200, `body`={"ok":true,"framework":"hono"}; replay checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Host same-session control: total 24.213 ms; first 23.868 ms; replay 0.343 ms; first checks `status`=200, `body`={"ok":true,"framework":"hono"}; replay checks `status`=200, `body`={"ok":true,"framework":"hono"}

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 101.774 ms | 85.667 ms | 16.107 ms | 59 | 43.572 ms |
| 2 | 36.591 ms | 30.950 ms | 5.641 ms | 59 | 3.954 ms |
| 3 | 38.289 ms | 32.962 ms | 5.327 ms | 59 | 4.893 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 85.667 ms | 1.000 ms | 3.107 ms |
| 2 | 5.000 ms | 0.000 ms | 30.950 ms | 0.000 ms | 0.641 ms |
| 3 | 4.000 ms | 0.000 ms | 32.962 ms | 0.000 ms | 1.327 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 11.844 ms | 3.948 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 5.567 ms | 0.101 ms | 40508.667 |
| `_log` | 1.000 | 0.062 ms | 0.062 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 11.844 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 140415.000 | 137642.000 |
| `send:Execute` | 1.000 | 14298.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10752.000 | 7052.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:56:14.964Z

- Warm wall: 35.979 -> 37.440 ms (+1.461 ms (+4.06%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.543 -> 5.484 ms (-0.059 ms (-1.06%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.543 -> 0.984 ms (+0.441 ms (+81.22%))
- Bridge time/iteration: 23.407 -> 17.473 ms (-5.934 ms (-25.35%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.284 -> 11.844 ms (-5.440 ms (-31.47%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 17.284 | 11.844 | -5.440 |
| Method time | `_bridgeDispatch` | 6.071 | 5.567 | -0.504 |
| Method time | `_log` | 0.051 | 0.062 | +0.011 |

