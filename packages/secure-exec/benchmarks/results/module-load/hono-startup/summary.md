# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T05:29:21.629Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 143.668 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 108.096 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.000 ms, residual 0.596 ms
- Dominant bridge time: `_loadPolyfill` 20.373 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240713.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 305.508 ms | 190.958 ms | 114.550 ms | 102 | 52.669 ms |
| 2 | 145.973 ms | 36.939 ms | 109.034 ms | 102 | 4.791 ms |
| 3 | 141.363 ms | 34.206 ms | 107.157 ms | 102 | 4.130 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 190.958 ms | 104.000 ms | 2.550 ms |
| 2 | 0.000 ms | 6.000 ms | 36.939 ms | 102.000 ms | 1.034 ms |
| 3 | 1.000 ms | 4.000 ms | 34.206 ms | 102.000 ms | 0.157 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 20.373 ms | 0.202 ms | 408083.000 |
| `_log` | 1.000 | 0.157 ms | 0.157 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1240713.000 | 0.000 |
| `send:BridgeResponse` | 102.000 | 408130.000 | 403336.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 102.000 | 15407.000 | 9194.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:26:28.665Z

- Warm wall: 144.133 -> 143.668 ms (-0.465 ms (-0.32%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.197 -> 108.096 ms (-0.101 ms (-0.09%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.697 -> 0.596 ms (-0.101 ms (-14.49%))
- Bridge time/iteration: 17.115 -> 20.530 ms (+3.415 ms (+19.95%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 17.042 | 20.373 | +3.331 |
| Method time | `_log` | 0.073 | 0.157 | +0.084 |

