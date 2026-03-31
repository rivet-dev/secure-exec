# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T04:43:25.240Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 146.134 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 107.780 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.000 ms, residual 0.280 ms
- Dominant bridge time: `_loadPolyfill` 17.628 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240830.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 279.186 ms | 165.092 ms | 114.094 ms | 102 | 42.627 ms |
| 2 | 143.614 ms | 35.638 ms | 107.976 ms | 102 | 4.379 ms |
| 3 | 148.654 ms | 41.070 ms | 107.584 ms | 102 | 6.006 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 165.092 ms | 105.000 ms | 1.094 ms |
| 2 | 0.000 ms | 6.000 ms | 35.638 ms | 101.000 ms | 0.976 ms |
| 3 | 1.000 ms | 4.000 ms | 41.070 ms | 103.000 ms | -0.416 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 17.628 ms | 0.175 ms | 408083.000 |
| `_log` | 1.000 | 0.043 ms | 0.043 ms | 47.000 |

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

Baseline scenario timestamp: 2026-03-31T04:38:27.531Z

- Warm wall: 145.766 -> 146.134 ms (+0.368 ms (+0.25%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.660 -> 107.780 ms (+0.120 ms (+0.11%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.161 -> 0.280 ms (+0.119 ms (+73.91%))
- Bridge time/iteration: 21.043 -> 17.671 ms (-3.372 ms (-16.02%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 20.887 | 17.628 | -3.259 |
| Method time | `_log` | 0.156 | 0.043 | -0.113 |

