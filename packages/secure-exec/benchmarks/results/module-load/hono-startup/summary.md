# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T05:47:23.753Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 149.600 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 113.206 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 1.000 ms, InjectGlobals->Execute 5.500 ms, ExecutionResult->Destroy 101.500 ms, residual 5.206 ms
- Dominant bridge time: `_loadPolyfill` 16.518 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240713.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 285.893 ms | 172.336 ms | 113.557 ms | 102 | 40.595 ms |
| 2 | 143.760 ms | 34.325 ms | 109.435 ms | 102 | 4.427 ms |
| 3 | 155.440 ms | 38.464 ms | 116.976 ms | 102 | 4.695 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 4.000 ms | 5.000 ms | 172.336 ms | 103.000 ms | 1.557 ms |
| 2 | 1.000 ms | 5.000 ms | 34.325 ms | 102.000 ms | 1.435 ms |
| 3 | 1.000 ms | 6.000 ms | 38.464 ms | 101.000 ms | 8.976 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 16.518 ms | 0.164 ms | 408083.000 |
| `_log` | 1.000 | 0.054 ms | 0.054 ms | 47.000 |

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
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:29:21.629Z

- Warm wall: 143.668 -> 149.600 ms (+5.932 ms (+4.13%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.096 -> 113.206 ms (+5.110 ms (+4.73%))
- Warm Create->InjectGlobals: 0.500 -> 1.000 ms (+0.500 ms (+100.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.596 -> 5.206 ms (+4.610 ms (+773.49%))
- Bridge time/iteration: 20.530 -> 16.572 ms (-3.958 ms (-19.28%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 20.373 | 16.518 | -3.855 |
| Method time | `_log` | 0.157 | 0.054 | -0.103 |
| Frame bytes | `send:Ping` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `recv:Pong` | 0.000 | 38.000 | +38.000 |

