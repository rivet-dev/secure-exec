# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T05:29:26.999Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 179.459 ms
- Bridge calls/iteration: 405.000
- Warm fixed session overhead: 107.322 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.000 ms, residual 0.322 ms
- Dominant bridge time: `_loadPolyfill` 85.118 ms/iteration across 404.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1207852.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240834.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 561.239 ms | 448.640 ms | 112.599 ms | 405 | 228.762 ms |
| 2 | 185.330 ms | 77.384 ms | 107.946 ms | 405 | 15.861 ms |
| 3 | 173.589 ms | 66.890 ms | 106.699 ms | 405 | 10.890 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 448.640 ms | 102.000 ms | 2.599 ms |
| 2 | 0.000 ms | 6.000 ms | 77.384 ms | 102.000 ms | -0.054 ms |
| 3 | 0.000 ms | 4.000 ms | 66.890 ms | 102.000 ms | 0.699 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 404.000 | 85.118 ms | 0.211 ms | 1207852.000 |
| `_log` | 1.000 | 0.053 ms | 0.053 ms | 47.000 |

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
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:26:34.452Z

- Warm wall: 205.767 -> 179.459 ms (-26.308 ms (-12.79%))
- Bridge calls/iteration: 405.000 -> 405.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.606 -> 107.322 ms (-0.284 ms (-0.26%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.606 -> 0.322 ms (-0.284 ms (-46.87%))
- Bridge time/iteration: 50.993 -> 85.171 ms (+34.178 ms (+67.03%))
- BridgeResponse encoded bytes/iteration: 1207899.000 -> 1207899.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 50.935 | 85.118 | +34.183 |
| Method time | `_log` | 0.058 | 0.053 | -0.005 |

