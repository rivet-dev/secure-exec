# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T20:29:35.437Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 72.290 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 6.176 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.676 ms
- Dominant bridge time: `_loadPolyfill` 38.119 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 38.119 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 212.934 ms | 198.251 ms | 14.683 ms | 179 | 128.250 ms |
| 2 | 61.841 ms | 55.084 ms | 6.757 ms | 179 | 11.005 ms |
| 3 | 82.739 ms | 77.143 ms | 5.596 ms | 179 | 15.438 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 198.251 ms | 0.000 ms | 1.683 ms |
| 2 | 6.000 ms | 0.000 ms | 55.084 ms | 0.000 ms | 0.757 ms |
| 3 | 5.000 ms | 0.000 ms | 77.143 ms | 0.000 ms | 0.596 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 38.119 ms | 2.242 ms | 233610.000 |
| `_bridgeDispatch` | 161.000 | 13.376 ms | 0.083 ms | 176998.667 |
| `_log` | 1.000 | 0.069 ms | 0.069 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 38.119 ms | 233610.000 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 179.000 | 410655.667 | 402242.667 |
| `recv:BridgeCall` | 179.000 | 31584.000 | 20352.000 |
| `send:Execute` | 1.000 | 14302.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:23.425Z

- Warm wall: 169.488 -> 72.290 ms (-97.198 ms (-57.35%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.156 -> 6.176 ms (-102.980 ms (-94.34%))
- Warm Create->InjectGlobals: 4.500 -> 5.500 ms (+1.000 ms (+22.22%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 0.000 ms (-101.500 ms (-100.00%))
- Warm residual overhead: 2.656 -> 0.676 ms (-1.980 ms (-74.55%))
- Bridge time/iteration: 53.999 -> 51.564 ms (-2.435 ms (-4.51%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 410655.667 bytes (-10962.000 bytes (-2.60%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 35.764 -> 38.119 ms (+2.355 ms (+6.58%)); response bytes 233549.333 -> 233610.000 bytes (+60.667 bytes (+0.03%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 0.000 calls (-161.000 calls (-100.00%)); time 18.094 -> 0.000 ms (-18.094 ms (-100.00%)); response bytes 188021.333 -> 0.000 bytes (-188021.333 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 53.858 | 38.119 | -15.739 |
| Method time | `_bridgeDispatch` | 0.000 | 13.376 | +13.376 |
| Method time | `_log` | 0.141 | 0.069 | -0.072 |
| Method bytes | `_loadPolyfill` | 421570.667 | 233610.000 | -187960.667 |
| Method bytes | `_bridgeDispatch` | 0.000 | 176998.667 | +176998.667 |
| Frame bytes | `send:BridgeResponse` | 421617.667 | 410655.667 | -10962.000 |
| Frame bytes | `send:Execute` | 13320.000 | 14302.000 | +982.000 |
| Frame bytes | `recv:BridgeCall` | 32171.000 | 31584.000 | -587.000 |

