# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T05:29:24.028Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 283.235 ms
- Bridge calls/iteration: 1651.000
- Warm fixed session overhead: 107.558 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.500 ms, ExecutionResult->Destroy 102.000 ms, residual 0.058 ms
- Dominant bridge time: `_loadPolyfill` 63.188 ms/iteration across 1650.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1918473.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 1918520.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 444.597 ms | 332.130 ms | 112.467 ms | 1651 | 99.800 ms |
| 2 | 287.311 ms | 178.027 ms | 109.284 ms | 1651 | 45.441 ms |
| 3 | 279.158 ms | 173.326 ms | 105.832 ms | 1651 | 44.577 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 332.130 ms | 102.000 ms | 1.467 ms |
| 2 | 0.000 ms | 7.000 ms | 178.027 ms | 102.000 ms | 0.284 ms |
| 3 | 0.000 ms | 4.000 ms | 173.326 ms | 102.000 ms | -0.168 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 1650.000 | 63.188 ms | 0.038 ms | 1918473.000 |
| `_log` | 1.000 | 0.085 ms | 0.085 ms | 47.000 |

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
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:26:31.135Z

- Warm wall: 280.452 -> 283.235 ms (+2.783 ms (+0.99%))
- Bridge calls/iteration: 1651.000 -> 1651.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.194 -> 107.558 ms (+0.364 ms (+0.34%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.194 -> 0.058 ms (-0.136 ms (-70.10%))
- Bridge time/iteration: 67.254 -> 63.273 ms (-3.981 ms (-5.92%))
- BridgeResponse encoded bytes/iteration: 1918520.000 -> 1918520.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 67.157 | 63.188 | -3.969 |
| Method time | `_log` | 0.097 | 0.085 | -0.012 |

