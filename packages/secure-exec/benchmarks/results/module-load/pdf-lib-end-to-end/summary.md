# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T20:29:34.584Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.

## Progress Copy Fields

- Warm wall mean: 297.079 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 7.191 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 2.691 ms
- Dominant bridge time: `_bridgeDispatch` 60.207 ms/iteration across 521.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 553101.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 9.867 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 653208.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 264.052 ms | 248.334 ms | 15.718 ms | 529 | 74.063 ms |
| 2 | 243.787 ms | 235.140 ms | 8.647 ms | 529 | 48.378 ms |
| 3 | 350.371 ms | 344.637 ms | 5.734 ms | 529 | 88.295 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 248.334 ms | 1.000 ms | 2.718 ms |
| 2 | 5.000 ms | 0.000 ms | 235.140 ms | 0.000 ms | 3.647 ms |
| 3 | 4.000 ms | 0.000 ms | 344.637 ms | 0.000 ms | 1.734 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 521.000 | 60.207 ms | 0.116 ms | 553101.667 |
| `_loadPolyfill` | 7.000 | 9.867 ms | 1.410 ms | 100059.333 |
| `_log` | 1.000 | 0.171 ms | 0.171 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 9.867 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 529.000 | 653208.000 | 628345.000 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `recv:BridgeCall` | 529.000 | 102565.000 | 69263.000 |
| `send:Execute` | 1.000 | 15042.000 | 0.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:22.232Z

- Warm wall: 362.870 -> 297.079 ms (-65.791 ms (-18.13%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.424 -> 7.191 ms (-104.233 ms (-93.55%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 0.000 ms (-102.500 ms (-100.00%))
- Warm residual overhead: 3.924 -> 2.691 ms (-1.233 ms (-31.42%))
- Bridge time/iteration: 59.917 -> 70.245 ms (+10.328 ms (+17.24%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 653208.000 bytes (-29790.000 bytes (-4.36%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.038 -> 9.867 ms (-0.171 ms (-1.70%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 0.000 calls (-521.000 calls (-100.00%)); time 49.754 -> 0.000 ms (-49.754 ms (-100.00%)); response bytes 582891.667 -> 0.000 bytes (-582891.667 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 0.000 | 60.207 | +60.207 |
| Method time | `_loadPolyfill` | 59.792 | 9.867 | -49.925 |
| Method time | `_log` | 0.125 | 0.171 | +0.046 |
| Method bytes | `_loadPolyfill` | 682951.000 | 100059.333 | -582891.667 |
| Method bytes | `_bridgeDispatch` | 0.000 | 553101.667 | +553101.667 |
| Frame bytes | `send:BridgeResponse` | 682998.000 | 653208.000 | -29790.000 |
| Frame bytes | `recv:BridgeCall` | 104588.000 | 102565.000 | -2023.000 |
| Frame bytes | `send:Execute` | 14060.000 | 15042.000 | +982.000 |

