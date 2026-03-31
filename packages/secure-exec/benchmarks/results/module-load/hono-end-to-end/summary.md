# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T20:29:32.054Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 43.049 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 6.241 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.741 ms
- Dominant bridge time: `_loadPolyfill` 10.391 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 10.391 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 81.768 ms | 66.782 ms | 14.986 ms | 59 | 35.842 ms |
| 2 | 43.094 ms | 37.325 ms | 5.769 ms | 59 | 6.434 ms |
| 3 | 43.004 ms | 36.291 ms | 6.713 ms | 59 | 4.403 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 66.782 ms | 0.000 ms | 2.986 ms |
| 2 | 5.000 ms | 0.000 ms | 37.325 ms | 0.000 ms | 0.769 ms |
| 3 | 6.000 ms | 0.000 ms | 36.291 ms | 0.000 ms | 0.713 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 10.391 ms | 3.464 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 5.119 ms | 0.093 ms | 40508.667 |
| `_log` | 1.000 | 0.050 ms | 0.050 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 10.391 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 140415.000 | 137642.000 |
| `send:Execute` | 1.000 | 14298.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10752.000 | 7052.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:19.098Z

- Warm wall: 139.728 -> 43.049 ms (-96.679 ms (-69.19%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.456 -> 6.241 ms (-103.215 ms (-94.30%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 0.000 ms (-102.500 ms (-100.00%))
- Warm residual overhead: 1.456 -> 0.741 ms (-0.715 ms (-49.11%))
- Bridge time/iteration: 17.021 -> 15.560 ms (-1.461 ms (-8.58%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 140415.000 bytes (-3456.000 bytes (-2.40%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.759 -> 10.391 ms (-0.368 ms (-3.42%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 0.000 calls (-55.000 calls (-100.00%)); time 6.160 -> 0.000 ms (-6.160 ms (-100.00%)); response bytes 43964.667 -> 0.000 bytes (-43964.667 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 16.919 | 10.391 | -6.528 |
| Method time | `_bridgeDispatch` | 0.000 | 5.119 | +5.119 |
| Method time | `_log` | 0.102 | 0.050 | -0.052 |
| Method bytes | `_loadPolyfill` | 143824.000 | 99859.333 | -43964.667 |
| Method bytes | `_bridgeDispatch` | 0.000 | 40508.667 | +40508.667 |
| Frame bytes | `send:BridgeResponse` | 143871.000 | 140415.000 | -3456.000 |
| Frame bytes | `send:Execute` | 13316.000 | 14298.000 | +982.000 |
| Frame bytes | `recv:BridgeCall` | 10962.000 | 10752.000 | -210.000 |

