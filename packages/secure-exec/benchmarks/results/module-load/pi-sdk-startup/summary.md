# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T05:29:35.695Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1629.538 ms
- Bridge calls/iteration: 5278.000
- Warm fixed session overhead: 107.279 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 0.279 ms
- Dominant bridge time: `_loadPolyfill` 881.464 ms/iteration across 5240.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9354193.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9362446.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2619.814 ms | 2507.281 ms | 112.533 ms | 5278 | 1326.068 ms |
| 2 | 1834.988 ms | 1726.172 ms | 108.816 ms | 5278 | 807.959 ms |
| 3 | 1424.088 ms | 1318.346 ms | 105.742 ms | 5278 | 624.799 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2507.281 ms | 103.000 ms | 1.533 ms |
| 2 | 0.000 ms | 5.000 ms | 1726.172 ms | 103.000 ms | 0.816 ms |
| 3 | 1.000 ms | 4.000 ms | 1318.346 ms | 101.000 ms | -0.258 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5240.000 | 881.464 ms | 0.168 ms | 9354193.000 |
| `_resolveModule` | 34.000 | 37.363 ms | 1.099 ms | 4795.000 |
| `_fsExists` | 2.000 | 0.396 ms | 0.198 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.275 ms | 0.275 ms | 3311.000 |
| `_log` | 1.000 | 0.110 ms | 0.110 ms | 47.000 |

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

