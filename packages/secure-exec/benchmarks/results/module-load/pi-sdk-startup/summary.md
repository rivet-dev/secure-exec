# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T04:43:31.372Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1645.959 ms
- Bridge calls/iteration: 5278.000
- Warm fixed session overhead: 107.634 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.000 ms, ExecutionResult->Destroy 102.500 ms, residual 0.634 ms
- Dominant bridge time: `_loadPolyfill` 836.082 ms/iteration across 5240.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9354193.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9362446.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2394.653 ms | 2280.603 ms | 114.050 ms | 5278 | 1216.083 ms |
| 2 | 1610.251 ms | 1502.086 ms | 108.165 ms | 5278 | 671.184 ms |
| 3 | 1681.667 ms | 1574.564 ms | 107.103 ms | 5278 | 750.086 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 2280.603 ms | 104.000 ms | 1.050 ms |
| 2 | 1.000 ms | 4.000 ms | 1502.086 ms | 102.000 ms | 1.165 ms |
| 3 | 0.000 ms | 4.000 ms | 1574.564 ms | 103.000 ms | 0.103 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5240.000 | 836.082 ms | 0.160 ms | 9354193.000 |
| `_resolveModule` | 34.000 | 41.841 ms | 1.231 ms | 4795.000 |
| `_fsReadFile` | 1.000 | 0.592 ms | 0.592 ms | 3311.000 |
| `_fsExists` | 2.000 | 0.537 ms | 0.269 ms | 100.000 |
| `_log` | 1.000 | 0.066 ms | 0.066 ms | 47.000 |

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

Baseline scenario timestamp: 2026-03-31T04:38:34.103Z

- Warm wall: 1747.363 -> 1645.959 ms (-101.404 ms (-5.80%))
- Bridge calls/iteration: 5278.000 -> 5278.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 106.775 -> 107.634 ms (+0.859 ms (+0.80%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.000 -> 4.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 0.275 -> 0.634 ms (+0.359 ms (+130.54%))
- Bridge time/iteration: 965.190 -> 879.118 ms (-86.072 ms (-8.92%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9362446.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 926.751 | 836.082 | -90.669 |
| Method time | `_resolveModule` | 37.316 | 41.841 | +4.525 |
| Method time | `_log` | 0.194 | 0.066 | -0.128 |

