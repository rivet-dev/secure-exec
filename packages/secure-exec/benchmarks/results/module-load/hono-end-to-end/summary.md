# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T20:56:14.964Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 35.979 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.543 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.543 ms
- Dominant bridge time: `_loadPolyfill` 17.284 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 17.284 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 131.207 ms | 115.870 ms | 15.337 ms | 59 | 62.218 ms |
| 2 | 35.829 ms | 30.537 ms | 5.292 ms | 59 | 4.274 ms |
| 3 | 36.129 ms | 30.334 ms | 5.795 ms | 59 | 3.728 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 115.870 ms | 1.000 ms | 1.337 ms |
| 2 | 5.000 ms | 0.000 ms | 30.537 ms | 0.000 ms | 0.292 ms |
| 3 | 5.000 ms | 0.000 ms | 30.334 ms | 0.000 ms | 0.795 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 17.284 ms | 5.761 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 6.071 ms | 0.110 ms | 40508.667 |
| `_log` | 1.000 | 0.051 ms | 0.051 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 17.284 ms | 99859.333 | `hono`, `stream/web`, `url` |
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

Baseline scenario timestamp: 2026-03-31T20:29:32.054Z

- Warm wall: 43.049 -> 35.979 ms (-7.070 ms (-16.42%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.241 -> 5.543 ms (-0.698 ms (-11.18%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.741 -> 0.543 ms (-0.198 ms (-26.72%))
- Bridge time/iteration: 15.560 -> 23.407 ms (+7.847 ms (+50.43%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.391 -> 17.284 ms (+6.893 ms (+66.34%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.391 | 17.284 | +6.893 |
| Method time | `_bridgeDispatch` | 5.119 | 6.071 | +0.952 |
| Method time | `_log` | 0.050 | 0.051 | +0.001 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

