# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T05:47:29.432Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 177.165 ms
- Bridge calls/iteration: 405.000
- Warm fixed session overhead: 108.367 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 101.500 ms, residual 1.367 ms
- Dominant bridge time: `_loadPolyfill` 55.914 ms/iteration across 404.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1207852.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240834.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 424.299 ms | 309.329 ms | 114.970 ms | 405 | 141.554 ms |
| 2 | 179.343 ms | 69.743 ms | 109.600 ms | 405 | 13.565 ms |
| 3 | 174.987 ms | 67.853 ms | 107.134 ms | 405 | 12.777 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 4.000 ms | 6.000 ms | 309.329 ms | 102.000 ms | 2.970 ms |
| 2 | 1.000 ms | 5.000 ms | 69.743 ms | 102.000 ms | 1.600 ms |
| 3 | 0.000 ms | 5.000 ms | 67.853 ms | 101.000 ms | 1.134 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 404.000 | 55.914 ms | 0.138 ms | 1207852.000 |
| `_log` | 1.000 | 0.052 ms | 0.052 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1240834.000 | 0.000 |
| `send:BridgeResponse` | 405.000 | 1207899.000 | 1188864.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 405.000 | 59059.000 | 34363.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:29:26.999Z

- Warm wall: 179.459 -> 177.165 ms (-2.294 ms (-1.28%))
- Bridge calls/iteration: 405.000 -> 405.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.322 -> 108.367 ms (+1.045 ms (+0.97%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.322 -> 1.367 ms (+1.045 ms (+324.53%))
- Bridge time/iteration: 85.171 -> 55.965 ms (-29.206 ms (-34.29%))
- BridgeResponse encoded bytes/iteration: 1207899.000 -> 1207899.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 85.118 | 55.914 | -29.204 |
| Method time | `_log` | 0.053 | 0.052 | -0.001 |
| Frame bytes | `send:Ping` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `recv:Pong` | 0.000 | 38.000 | +38.000 |

