# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T05:29:25.657Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.

## Progress Copy Fields

- Warm wall mean: 346.978 ms
- Bridge calls/iteration: 1666.000
- Warm fixed session overhead: 107.320 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.000 ms, residual -0.180 ms
- Dominant bridge time: `_loadPolyfill` 64.109 ms/iteration across 1665.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1919343.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 1919390.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 524.241 ms | 412.526 ms | 111.715 ms | 1666 | 104.148 ms |
| 2 | 346.528 ms | 238.196 ms | 108.332 ms | 1666 | 44.700 ms |
| 3 | 347.427 ms | 241.118 ms | 106.309 ms | 1666 | 43.742 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 412.526 ms | 101.000 ms | 1.715 ms |
| 2 | 1.000 ms | 6.000 ms | 238.196 ms | 102.000 ms | -0.668 ms |
| 3 | 0.000 ms | 4.000 ms | 241.118 ms | 102.000 ms | 0.309 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 1665.000 | 64.109 ms | 0.039 ms | 1919343.000 |
| `_log` | 1.000 | 0.088 ms | 0.088 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 1666.000 | 1919390.000 | 1841088.000 |
| `send:Execute` | 1.000 | 1241574.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 1666.000 | 248999.000 | 147382.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:26:33.180Z

- Warm wall: 501.043 -> 346.978 ms (-154.065 ms (-30.75%))
- Bridge calls/iteration: 1666.000 -> 1666.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.704 -> 107.320 ms (-0.384 ms (-0.36%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.705 -> -0.180 ms (-0.885 ms (-125.53%))
- Bridge time/iteration: 109.755 -> 64.197 ms (-45.558 ms (-41.51%))
- BridgeResponse encoded bytes/iteration: 1919390.000 -> 1919390.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 109.612 | 64.109 | -45.503 |
| Method time | `_log` | 0.142 | 0.088 | -0.054 |

