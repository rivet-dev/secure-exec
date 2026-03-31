# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T05:47:31.678Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 552.962 ms
- Bridge calls/iteration: 519.000
- Warm fixed session overhead: 108.426 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 1.426 ms
- Dominant bridge time: `_loadPolyfill` 45.999 ms/iteration across 518.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1214493.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1242365.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 738.519 ms | 625.133 ms | 113.386 ms | 519 | 103.295 ms |
| 2 | 554.284 ms | 444.744 ms | 109.540 ms | 519 | 17.372 ms |
| 3 | 551.639 ms | 444.327 ms | 107.312 ms | 519 | 17.583 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 625.133 ms | 101.000 ms | 3.386 ms |
| 2 | 1.000 ms | 5.000 ms | 444.744 ms | 102.000 ms | 1.540 ms |
| 3 | 0.000 ms | 4.000 ms | 444.327 ms | 102.000 ms | 1.312 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 518.000 | 45.999 ms | 0.089 ms | 1214493.000 |
| `_log` | 1.000 | 0.084 ms | 0.084 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1242365.000 | 0.000 |
| `send:BridgeResponse` | 519.000 | 1214540.000 | 1190147.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 519.000 | 70253.000 | 38603.000 |
| `send:StreamEvent` | 74.000 | 4321.000 | 991.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:29:29.401Z

- Warm wall: 588.452 -> 552.962 ms (-35.490 ms (-6.03%))
- Bridge calls/iteration: 519.000 -> 519.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.377 -> 108.426 ms (+1.049 ms (+0.98%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.378 -> 1.426 ms (+1.048 ms (+277.25%))
- Bridge time/iteration: 80.354 -> 46.083 ms (-34.271 ms (-42.65%))
- BridgeResponse encoded bytes/iteration: 1214540.000 -> 1214540.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 80.144 | 45.999 | -34.145 |
| Method time | `_log` | 0.210 | 0.084 | -0.126 |
| Frame bytes | `send:Execute` | 1242293.000 | 1242365.000 | +72.000 |
| Frame bytes | `send:Ping` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `recv:Pong` | 0.000 | 38.000 | +38.000 |

