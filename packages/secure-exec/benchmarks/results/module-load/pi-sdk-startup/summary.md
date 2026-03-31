# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T05:47:36.879Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1441.818 ms
- Bridge calls/iteration: 5278.000
- Warm fixed session overhead: 112.577 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.000 ms, ExecutionResult->Destroy 101.500 ms, residual 6.577 ms
- Dominant bridge time: `_loadPolyfill` 614.728 ms/iteration across 5240.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9354193.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9362446.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1873.818 ms | 1756.753 ms | 117.065 ms | 5278 | 851.054 ms |
| 2 | 1495.442 ms | 1381.851 ms | 113.591 ms | 5278 | 584.120 ms |
| 3 | 1388.194 ms | 1276.631 ms | 111.563 ms | 5278 | 532.555 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 1756.753 ms | 102.000 ms | 6.065 ms |
| 2 | 1.000 ms | 4.000 ms | 1381.851 ms | 102.000 ms | 6.591 ms |
| 3 | 0.000 ms | 4.000 ms | 1276.631 ms | 101.000 ms | 6.563 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5240.000 | 614.728 ms | 0.117 ms | 9354193.000 |
| `_resolveModule` | 34.000 | 40.399 ms | 1.188 ms | 4795.000 |
| `_fsExists` | 2.000 | 0.403 ms | 0.201 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.327 ms | 0.327 ms | 3311.000 |
| `_log` | 1.000 | 0.053 ms | 0.053 ms | 47.000 |

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
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:29:35.695Z

- Warm wall: 1629.538 -> 1441.818 ms (-187.720 ms (-11.52%))
- Bridge calls/iteration: 5278.000 -> 5278.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.279 -> 112.577 ms (+5.298 ms (+4.94%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.000 ms (-0.500 ms (-11.11%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.279 -> 6.577 ms (+6.298 ms (+2257.35%))
- Bridge time/iteration: 919.609 -> 655.910 ms (-263.699 ms (-28.68%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9362446.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 881.464 | 614.728 | -266.736 |
| Method time | `_resolveModule` | 37.363 | 40.399 | +3.036 |
| Method time | `_log` | 0.110 | 0.053 | -0.057 |
| Frame bytes | `send:Ping` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `recv:Pong` | 0.000 | 38.000 | +38.000 |

