# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T05:29:22.634Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 158.059 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 107.936 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 101.500 ms, residual 0.936 ms
- Dominant bridge time: `_loadPolyfill` 18.976 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240830.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 281.582 ms | 167.196 ms | 114.386 ms | 102 | 42.083 ms |
| 2 | 152.528 ms | 43.727 ms | 108.801 ms | 102 | 6.520 ms |
| 3 | 163.590 ms | 56.519 ms | 107.071 ms | 102 | 8.487 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 167.196 ms | 104.000 ms | 1.386 ms |
| 2 | 1.000 ms | 5.000 ms | 43.727 ms | 102.000 ms | 0.801 ms |
| 3 | 0.000 ms | 5.000 ms | 56.519 ms | 101.000 ms | 1.071 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 18.976 ms | 0.188 ms | 408083.000 |
| `_log` | 1.000 | 0.054 ms | 0.054 ms | 47.000 |

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

Baseline scenario timestamp: 2026-03-31T05:26:29.694Z

- Warm wall: 147.534 -> 158.059 ms (+10.525 ms (+7.13%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.888 -> 107.936 ms (+0.048 ms (+0.04%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.388 -> 0.936 ms (+0.548 ms (+141.24%))
- Bridge time/iteration: 23.426 -> 19.030 ms (-4.396 ms (-18.77%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 23.347 | 18.976 | -4.371 |
| Method time | `_log` | 0.080 | 0.054 | -0.026 |

