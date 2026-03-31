# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T05:47:47.445Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1735.594 ms
- Bridge calls/iteration: 5336.000
- Warm fixed session overhead: 111.233 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 1.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.500 ms, residual 3.232 ms
- Dominant bridge time: `_loadPolyfill` 636.155 ms/iteration across 5247.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9370068.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9381016.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1612.736 ms | 1497.074 ms | 115.662 ms | 5336 | 809.873 ms |
| 2 | 1465.604 ms | 1354.089 ms | 111.515 ms | 5336 | 635.270 ms |
| 3 | 2005.584 ms | 1894.634 ms | 110.950 ms | 5336 | 777.654 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 7.000 ms | 1497.074 ms | 102.000 ms | 3.662 ms |
| 2 | 1.000 ms | 5.000 ms | 1354.089 ms | 102.000 ms | 3.515 ms |
| 3 | 1.000 ms | 4.000 ms | 1894.634 ms | 103.000 ms | 2.950 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5247.000 | 636.155 ms | 0.121 ms | 9370068.000 |
| `_fsExists` | 44.000 | 48.806 ms | 1.109 ms | 2200.000 |
| `_resolveModule` | 34.000 | 43.380 ms | 1.276 ms | 4795.000 |
| `_fsMkdir` | 1.000 | 4.709 ms | 4.709 ms | 47.000 |
| `_fsReadFile` | 2.000 | 1.610 ms | 0.805 ms | 3364.000 |
| `_fsRmdir` | 1.000 | 1.319 ms | 1.319 ms | 47.000 |
| `_fsStat` | 1.000 | 1.310 ms | 1.310 ms | 207.000 |
| `_fsWriteFile` | 1.000 | 1.223 ms | 1.223 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.175 ms | 1.175 ms | 47.000 |
| `_fsChmod` | 1.000 | 0.941 ms | 0.941 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5336.000 | 9381016.000 | 9130224.000 |
| `send:Execute` | 1.000 | 1240994.000 | 0.000 |
| `recv:BridgeCall` | 5336.000 | 893538.000 | 568233.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:29:47.535Z

- Warm wall: 1948.524 -> 1735.594 ms (-212.930 ms (-10.93%))
- Bridge calls/iteration: 5336.000 -> 5336.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.761 -> 111.233 ms (+3.472 ms (+3.22%))
- Warm Create->InjectGlobals: 1.000 -> 1.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: -0.239 -> 3.232 ms (+3.471 ms (-1452.30%))
- Bridge time/iteration: 1103.810 -> 740.932 ms (-362.878 ms (-32.88%))
- BridgeResponse encoded bytes/iteration: 9381016.000 -> 9381016.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 994.653 | 636.155 | -358.498 |
| Method time | `_fsExists` | 53.465 | 48.806 | -4.659 |
| Method time | `_fsMkdir` | 5.104 | 4.709 | -0.395 |
| Frame bytes | `send:Ping` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `recv:Pong` | 0.000 | 38.000 | +38.000 |

