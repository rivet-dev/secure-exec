# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T21:00:44.283Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 79.804 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 6.676 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.175 ms
- Dominant bridge time: `_loadPolyfill` 33.071 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 33.071 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 217.796 ms | 202.739 ms | 15.057 ms | 182 | 116.213 ms |
| 2 | 85.089 ms | 76.968 ms | 8.121 ms | 182 | 12.770 ms |
| 3 | 74.519 ms | 69.289 ms | 5.230 ms | 182 | 10.167 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 202.739 ms | 0.000 ms | 3.057 ms |
| 2 | 7.000 ms | 0.000 ms | 76.968 ms | 0.000 ms | 1.121 ms |
| 3 | 4.000 ms | 0.000 ms | 69.289 ms | 0.000 ms | 1.230 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 33.071 ms | 1.945 ms | 233610.000 |
| `_bridgeDispatch` | 164.000 | 13.212 ms | 0.081 ms | 177197.667 |
| `_log` | 1.000 | 0.101 ms | 0.101 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 33.071 ms | 233610.000 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 182.000 | 410854.667 | 402300.667 |
| `recv:BridgeCall` | 182.000 | 31859.000 | 20438.000 |
| `send:Execute` | 1.000 | 15833.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:StreamEvent` | 1.000 | 58.000 | 13.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:29:36.447Z

- Warm wall: 77.776 -> 79.804 ms (+2.028 ms (+2.61%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.130 -> 6.676 ms (+0.546 ms (+8.91%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.630 -> 1.175 ms (+0.545 ms (+86.51%))
- Bridge time/iteration: 65.932 -> 46.383 ms (-19.549 ms (-29.65%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 43.727 -> 33.071 ms (-10.656 ms (-24.37%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 43.727 | 33.071 | -10.656 |
| Method time | `_bridgeDispatch` | 22.101 | 13.212 | -8.889 |
| Method time | `_log` | 0.104 | 0.101 | -0.003 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

