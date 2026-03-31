# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T05:04:48.741Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 142.192 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 107.334 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 101.500 ms, residual 0.834 ms
- Dominant bridge time: `_loadPolyfill` 18.455 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240830.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 285.306 ms | 171.815 ms | 113.491 ms | 102 | 46.732 ms |
| 2 | 143.635 ms | 35.743 ms | 107.892 ms | 102 | 4.641 ms |
| 3 | 140.750 ms | 33.974 ms | 106.776 ms | 102 | 4.161 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 6.000 ms | 171.815 ms | 103.000 ms | 2.491 ms |
| 2 | 0.000 ms | 5.000 ms | 35.743 ms | 102.000 ms | 0.892 ms |
| 3 | 0.000 ms | 5.000 ms | 33.974 ms | 101.000 ms | 0.776 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 18.455 ms | 0.183 ms | 408083.000 |
| `_log` | 1.000 | 0.056 ms | 0.056 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1240830.000 | 0.000 |
| `send:BridgeResponse` | 102.000 | 408130.000 | 403336.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 102.000 | 15421.000 | 9208.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:03:25.171Z

- Warm wall: 145.863 -> 142.192 ms (-3.671 ms (-2.52%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.204 -> 107.334 ms (-0.870 ms (-0.80%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 101.500 ms (-1.000 ms (-0.98%))
- Warm residual overhead: 0.705 -> 0.834 ms (+0.129 ms (+18.30%))
- Bridge time/iteration: 21.852 -> 18.511 ms (-3.341 ms (-15.29%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 21.799 | 18.455 | -3.344 |
| Method time | `_log` | 0.053 | 0.056 | +0.003 |

