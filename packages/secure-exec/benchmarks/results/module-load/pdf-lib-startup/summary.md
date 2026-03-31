# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T05:47:26.381Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 314.083 ms
- Bridge calls/iteration: 1651.000
- Warm fixed session overhead: 108.981 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 101.500 ms, residual 2.481 ms
- Dominant bridge time: `_loadPolyfill` 64.567 ms/iteration across 1650.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1918473.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 1918520.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 451.111 ms | 337.645 ms | 113.466 ms | 1651 | 97.218 ms |
| 2 | 270.404 ms | 161.023 ms | 109.381 ms | 1651 | 42.155 ms |
| 3 | 357.763 ms | 249.183 ms | 108.580 ms | 1651 | 54.727 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 337.645 ms | 102.000 ms | 2.466 ms |
| 2 | 0.000 ms | 6.000 ms | 161.023 ms | 102.000 ms | 1.381 ms |
| 3 | 0.000 ms | 4.000 ms | 249.183 ms | 101.000 ms | 3.580 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 1650.000 | 64.567 ms | 0.039 ms | 1918473.000 |
| `_log` | 1.000 | 0.133 ms | 0.133 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 1651.000 | 1918520.000 | 1840923.000 |
| `send:Execute` | 1.000 | 1240835.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 1651.000 | 247553.000 | 146851.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:26.381Z

- Warm wall: 314.083 -> 314.083 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 1651.000 -> 1651.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.981 -> 108.981 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.481 -> 2.481 ms (0.000 ms (0.00%))
- Bridge time/iteration: 64.700 -> 64.700 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1918520.000 -> 1918520.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

