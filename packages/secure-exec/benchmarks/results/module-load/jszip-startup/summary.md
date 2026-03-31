# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T21:00:43.389Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 68.886 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 6.290 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 1.290 ms
- Dominant bridge time: `_loadPolyfill` 37.582 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 37.582 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 228.835 ms | 213.810 ms | 15.025 ms | 179 | 133.110 ms |
| 2 | 63.875 ms | 57.378 ms | 6.497 ms | 179 | 11.322 ms |
| 3 | 73.898 ms | 67.815 ms | 6.083 ms | 179 | 14.044 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 213.810 ms | 1.000 ms | 2.025 ms |
| 2 | 5.000 ms | 0.000 ms | 57.378 ms | 1.000 ms | 0.497 ms |
| 3 | 4.000 ms | 0.000 ms | 67.815 ms | 0.000 ms | 2.083 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 37.582 ms | 2.211 ms | 233610.000 |
| `_bridgeDispatch` | 161.000 | 15.169 ms | 0.094 ms | 176998.667 |
| `_log` | 1.000 | 0.074 ms | 0.074 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 37.582 ms | 233610.000 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 179.000 | 410655.667 | 402242.667 |
| `recv:BridgeCall` | 179.000 | 31584.000 | 20352.000 |
| `send:Execute` | 1.000 | 14302.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:29:35.437Z

- Warm wall: 72.290 -> 68.886 ms (-3.404 ms (-4.71%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.176 -> 6.290 ms (+0.114 ms (+1.85%))
- Warm Create->InjectGlobals: 5.500 -> 4.500 ms (-1.000 ms (-18.18%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.676 -> 1.290 ms (+0.614 ms (+90.83%))
- Bridge time/iteration: 51.564 -> 52.825 ms (+1.261 ms (+2.45%))
- BridgeResponse encoded bytes/iteration: 410655.667 -> 410655.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 38.119 -> 37.582 ms (-0.537 ms (-1.41%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 13.376 | 15.169 | +1.793 |
| Method time | `_loadPolyfill` | 38.119 | 37.582 | -0.537 |
| Method time | `_log` | 0.069 | 0.074 | +0.005 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

