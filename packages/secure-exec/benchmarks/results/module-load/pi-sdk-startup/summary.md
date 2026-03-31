# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T05:04:54.739Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1605.896 ms
- Bridge calls/iteration: 5278.000
- Warm fixed session overhead: 107.982 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 103.500 ms, residual -0.518 ms
- Dominant bridge time: `_loadPolyfill` 813.611 ms/iteration across 5240.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9354193.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9362446.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2353.815 ms | 2241.837 ms | 111.978 ms | 5278 | 1138.077 ms |
| 2 | 1542.061 ms | 1433.246 ms | 108.815 ms | 5278 | 702.915 ms |
| 3 | 1669.732 ms | 1562.583 ms | 107.149 ms | 5278 | 723.824 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2241.837 ms | 103.000 ms | 0.978 ms |
| 2 | 0.000 ms | 5.000 ms | 1433.246 ms | 104.000 ms | -0.185 ms |
| 3 | 1.000 ms | 4.000 ms | 1562.583 ms | 103.000 ms | -0.851 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5240.000 | 813.611 ms | 0.155 ms | 9354193.000 |
| `_resolveModule` | 34.000 | 40.648 ms | 1.196 ms | 4795.000 |
| `_fsExists` | 2.000 | 0.361 ms | 0.180 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.264 ms | 0.264 ms | 3311.000 |
| `_log` | 1.000 | 0.055 ms | 0.055 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5278.000 | 9362446.000 | 9114380.000 |
| `send:Execute` | 1.000 | 1240816.000 | 0.000 |
| `recv:BridgeCall` | 5278.000 | 882903.000 | 560930.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:03:31.026Z

- Warm wall: 1617.322 -> 1605.896 ms (-11.426 ms (-0.71%))
- Bridge calls/iteration: 5278.000 -> 5278.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.416 -> 107.982 ms (+0.566 ms (+0.53%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm ExecutionResult->Destroy: 102.500 -> 103.500 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 0.915 -> -0.518 ms (-1.433 ms (-156.61%))
- Bridge time/iteration: 832.306 -> 854.939 ms (+22.633 ms (+2.72%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9362446.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 785.697 | 813.611 | +27.914 |
| Method time | `_resolveModule` | 45.709 | 40.648 | -5.061 |
| Method time | `_fsReadFile` | 0.408 | 0.264 | -0.144 |

