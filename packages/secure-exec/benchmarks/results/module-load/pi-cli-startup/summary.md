# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T07:23:21.380Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1827.171 ms
- Bridge calls/iteration: 2604.000
- Warm fixed session overhead: 117.846 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 10.846 ms
- Dominant bridge time: `_loadPolyfill` 921.631 ms/iteration across 2528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9152170.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9161307.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2346.987 ms | 2223.045 ms | 123.942 ms | 2604 | 1293.634 ms |
| 2 | 1904.910 ms | 1786.591 ms | 118.319 ms | 2604 | 970.803 ms |
| 3 | 1749.431 ms | 1632.059 ms | 117.372 ms | 2604 | 851.758 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 6.000 ms | 2223.045 ms | 104.000 ms | 11.942 ms |
| 2 | 1.000 ms | 5.000 ms | 1786.591 ms | 101.000 ms | 11.319 ms |
| 3 | 0.000 ms | 4.000 ms | 1632.059 ms | 103.000 ms | 10.372 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2528.000 | 921.631 ms | 0.365 ms | 9152170.000 |
| `_fsExists` | 44.000 | 54.846 ms | 1.246 ms | 2200.000 |
| `_resolveModule` | 21.000 | 49.533 ms | 2.359 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 4.276 ms | 4.276 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.656 ms | 1.656 ms | 47.000 |
| `_fsReadFile` | 2.000 | 1.564 ms | 0.782 ms | 3364.000 |
| `_fsRmdir` | 1.000 | 1.491 ms | 1.491 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.284 ms | 1.284 ms | 47.000 |
| `_fsStat` | 1.000 | 1.215 ms | 1.215 ms | 205.667 |
| `_fsUtimes` | 1.000 | 0.876 ms | 0.876 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2604.000 | 9161307.667 | 9038919.667 |
| `send:Execute` | 1.000 | 1242375.000 | 0.000 |
| `recv:BridgeCall` | 2604.000 | 562788.000 | 404148.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:47.445Z

- Warm wall: 1735.594 -> 1827.171 ms (+91.577 ms (+5.28%))
- Bridge calls/iteration: 5336.000 -> 2604.000 calls (-2732.000 calls (-51.20%))
- Warm fixed overhead: 111.233 -> 117.846 ms (+6.613 ms (+5.95%))
- Warm Create->InjectGlobals: 1.000 -> 0.500 ms (-0.500 ms (-50.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 3.232 -> 10.846 ms (+7.614 ms (+235.58%))
- Bridge time/iteration: 740.932 -> 1038.732 ms (+297.800 ms (+40.19%))
- BridgeResponse encoded bytes/iteration: 9381016.000 -> 9161307.667 bytes (-219708.333 bytes (-2.34%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 636.155 | 921.631 | +285.476 |
| Method time | `_resolveModule` | 43.380 | 49.533 | +6.153 |
| Method time | `_fsExists` | 48.806 | 54.846 | +6.040 |
| Method bytes | `_loadPolyfill` | 9370068.000 | 9152170.000 | -217898.000 |
| Method bytes | `_resolveModule` | 4795.000 | 2986.000 | -1809.000 |
| Method bytes | `_fsStat` | 207.000 | 205.667 | -1.333 |
| Frame bytes | `recv:BridgeCall` | 893538.000 | 562788.000 | -330750.000 |
| Frame bytes | `send:BridgeResponse` | 9381016.000 | 9161307.667 | -219708.333 |
| Frame bytes | `send:Execute` | 1240994.000 | 1242375.000 | +1381.000 |

