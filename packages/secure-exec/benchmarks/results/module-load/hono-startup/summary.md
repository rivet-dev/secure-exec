# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T05:04:47.762Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 151.127 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 107.166 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 101.500 ms, residual 0.665 ms
- Dominant bridge time: `_loadPolyfill` 25.621 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240713.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 321.325 ms | 205.936 ms | 115.389 ms | 102 | 63.088 ms |
| 2 | 159.226 ms | 50.708 ms | 108.518 ms | 102 | 9.532 ms |
| 3 | 143.029 ms | 37.216 ms | 105.813 ms | 102 | 4.613 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 205.936 ms | 105.000 ms | 1.389 ms |
| 2 | 1.000 ms | 5.000 ms | 50.708 ms | 102.000 ms | 0.518 ms |
| 3 | 0.000 ms | 4.000 ms | 37.216 ms | 101.000 ms | 0.813 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 25.621 ms | 0.254 ms | 408083.000 |
| `_log` | 1.000 | 0.123 ms | 0.123 ms | 47.000 |

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

Baseline scenario timestamp: 2026-03-31T05:03:24.159Z

- Warm wall: 158.655 -> 151.127 ms (-7.528 ms (-4.75%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.977 -> 107.166 ms (-0.811 ms (-0.75%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 101.500 ms (-1.000 ms (-0.98%))
- Warm residual overhead: 0.478 -> 0.665 ms (+0.187 ms (+39.12%))
- Bridge time/iteration: 18.284 -> 25.744 ms (+7.460 ms (+40.80%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 18.208 | 25.621 | +7.413 |
| Method time | `_log` | 0.076 | 0.123 | +0.047 |

