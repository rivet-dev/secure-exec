# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T04:43:44.364Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1924.517 ms
- Bridge calls/iteration: 5336.000
- Warm fixed session overhead: 107.356 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.500 ms, residual 0.356 ms
- Dominant bridge time: `_loadPolyfill` 897.458 ms/iteration across 5247.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9370068.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9381015.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2406.396 ms | 2291.732 ms | 114.664 ms | 5336 | 1228.403 ms |
| 2 | 2004.928 ms | 1896.983 ms | 107.945 ms | 5336 | 946.716 ms |
| 3 | 1844.106 ms | 1737.339 ms | 106.767 ms | 5336 | 818.012 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 2291.732 ms | 105.000 ms | 0.664 ms |
| 2 | 0.000 ms | 5.000 ms | 1896.983 ms | 103.000 ms | -0.055 ms |
| 3 | 0.000 ms | 4.000 ms | 1737.339 ms | 102.000 ms | 0.767 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5247.000 | 897.458 ms | 0.171 ms | 9370068.000 |
| `_fsExists` | 44.000 | 42.802 ms | 0.973 ms | 2200.000 |
| `_resolveModule` | 34.000 | 39.630 ms | 1.166 ms | 4795.000 |
| `_fsMkdir` | 1.000 | 7.181 ms | 7.181 ms | 47.000 |
| `_fsReadFile` | 2.000 | 1.828 ms | 0.914 ms | 3364.000 |
| `_fsWriteFile` | 1.000 | 1.727 ms | 1.727 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.692 ms | 1.692 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.576 ms | 1.576 ms | 47.000 |
| `_fsStat` | 1.000 | 1.531 ms | 1.531 ms | 206.333 |
| `_fsReadDir` | 1.000 | 1.184 ms | 1.184 ms | 53.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5336.000 | 9381015.333 | 9130223.333 |
| `send:Execute` | 1.000 | 1240994.000 | 0.000 |
| `recv:BridgeCall` | 5336.000 | 893538.000 | 568233.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T04:38:46.573Z

- Warm wall: 1800.466 -> 1924.517 ms (+124.051 ms (+6.89%))
- Bridge calls/iteration: 5336.000 -> 5336.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.912 -> 107.356 ms (-0.556 ms (-0.52%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 0.911 -> 0.356 ms (-0.555 ms (-60.92%))
- Bridge time/iteration: 885.364 -> 997.710 ms (+112.346 ms (+12.69%))
- BridgeResponse encoded bytes/iteration: 9381015.333 -> 9381015.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 778.226 | 897.458 | +119.232 |
| Method time | `_resolveModule` | 52.773 | 39.630 | -13.143 |
| Method time | `_fsMkdir` | 4.771 | 7.181 | +2.410 |

