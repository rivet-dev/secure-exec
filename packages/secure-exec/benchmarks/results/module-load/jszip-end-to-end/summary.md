# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T05:29:29.401Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 588.452 ms
- Bridge calls/iteration: 519.000
- Warm fixed session overhead: 107.377 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.000 ms, residual 0.378 ms
- Dominant bridge time: `_loadPolyfill` 80.144 ms/iteration across 518.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1214493.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1242293.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 832.404 ms | 719.794 ms | 112.610 ms | 519 | 170.648 ms |
| 2 | 589.857 ms | 481.195 ms | 108.662 ms | 519 | 36.370 ms |
| 3 | 587.047 ms | 480.954 ms | 106.093 ms | 519 | 34.044 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 6.000 ms | 719.794 ms | 103.000 ms | 1.610 ms |
| 2 | 0.000 ms | 6.000 ms | 481.195 ms | 102.000 ms | 0.662 ms |
| 3 | 0.000 ms | 4.000 ms | 480.954 ms | 102.000 ms | 0.093 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 518.000 | 80.144 ms | 0.155 ms | 1214493.000 |
| `_log` | 1.000 | 0.210 ms | 0.210 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1242293.000 | 0.000 |
| `send:BridgeResponse` | 519.000 | 1214540.000 | 1190147.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 519.000 | 70230.000 | 38580.000 |
| `send:StreamEvent` | 74.000 | 4321.000 | 991.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

