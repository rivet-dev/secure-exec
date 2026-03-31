# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T07:22:33.627Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1693.028 ms
- Bridge calls/iteration: 2548.000
- Warm fixed session overhead: 115.200 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 101.000 ms, residual 9.200 ms
- Dominant bridge time: `_loadPolyfill` 878.447 ms/iteration across 2523.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9136395.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9142839.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2258.488 ms | 2136.103 ms | 122.385 ms | 2548 | 1216.725 ms |
| 2 | 1758.455 ms | 1641.039 ms | 117.416 ms | 2548 | 812.357 ms |
| 3 | 1627.601 ms | 1514.617 ms | 112.984 ms | 2548 | 742.226 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2136.103 ms | 103.000 ms | 11.385 ms |
| 2 | 1.000 ms | 5.000 ms | 1641.039 ms | 102.000 ms | 9.416 ms |
| 3 | 0.000 ms | 4.000 ms | 1514.617 ms | 100.000 ms | 8.984 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2523.000 | 878.447 ms | 0.348 ms | 9136395.000 |
| `_resolveModule` | 21.000 | 44.611 ms | 2.124 ms | 2986.000 |
| `_fsExists` | 2.000 | 0.409 ms | 0.204 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.256 ms | 0.256 ms | 3311.000 |
| `_log` | 1.000 | 0.046 ms | 0.046 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2548.000 | 9142839.000 | 9023083.000 |
| `send:Execute` | 1.000 | 1242197.000 | 0.000 |
| `recv:BridgeCall` | 2548.000 | 552317.000 | 396887.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:36.879Z

- Warm wall: 1441.818 -> 1693.028 ms (+251.210 ms (+17.42%))
- Bridge calls/iteration: 5278.000 -> 2548.000 calls (-2730.000 calls (-51.72%))
- Warm fixed overhead: 112.577 -> 115.200 ms (+2.623 ms (+2.33%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 6.577 -> 9.200 ms (+2.623 ms (+39.88%))
- Bridge time/iteration: 655.910 -> 923.769 ms (+267.859 ms (+40.84%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9142839.000 bytes (-219607.000 bytes (-2.35%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 614.728 | 878.447 | +263.719 |
| Method time | `_resolveModule` | 40.399 | 44.611 | +4.212 |
| Method time | `_fsReadFile` | 0.327 | 0.256 | -0.071 |
| Method bytes | `_loadPolyfill` | 9354193.000 | 9136395.000 | -217798.000 |
| Method bytes | `_resolveModule` | 4795.000 | 2986.000 | -1809.000 |
| Frame bytes | `recv:BridgeCall` | 882903.000 | 552317.000 | -330586.000 |
| Frame bytes | `send:BridgeResponse` | 9362446.000 | 9142839.000 | -219607.000 |
| Frame bytes | `send:Execute` | 1240816.000 | 1242197.000 | +1381.000 |

