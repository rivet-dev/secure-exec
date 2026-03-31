# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T05:05:14.882Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1749.175 ms
- Bridge calls/iteration: 5784.000
- Warm fixed session overhead: 5.340 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 0.000 ms, residual 0.840 ms
- Dominant bridge time: `_loadPolyfill` 826.220 ms/iteration across 5675.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9719927.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9737452.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2304.387 ms | 2292.902 ms | 11.485 ms | 5784 | 1210.045 ms |
| 2 | 1451.774 ms | 1445.606 ms | 6.168 ms | 5784 | 660.906 ms |
| 3 | 2046.576 ms | 2042.064 ms | 4.512 ms | 5784 | 918.141 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 4.000 ms | 6.000 ms | 2292.902 ms | 0.000 ms | 1.485 ms |
| 2 | 0.000 ms | 5.000 ms | 1445.606 ms | 0.000 ms | 1.168 ms |
| 3 | 0.000 ms | 4.000 ms | 2042.064 ms | 0.000 ms | 0.512 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5675.000 | 826.220 ms | 0.146 ms | 9719927.000 |
| `_fsExists` | 55.000 | 50.170 ms | 0.912 ms | 2750.000 |
| `_resolveModule` | 34.000 | 33.848 ms | 0.996 ms | 4795.000 |
| `_fsMkdir` | 1.000 | 5.689 ms | 5.689 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 3.227 ms | 3.227 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 3.161 ms | 0.632 ms | 7684.000 |
| `_fsUtimes` | 1.000 | 1.724 ms | 1.724 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.430 ms | 1.430 ms | 47.000 |
| `_fsStat` | 1.000 | 1.362 ms | 1.362 ms | 206.333 |
| `_fsChmod` | 1.000 | 1.356 ms | 1.356 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5784.000 | 9737452.333 | 9465604.333 |
| `send:Execute` | 1.000 | 1241953.000 | 0.000 |
| `recv:BridgeCall` | 5784.000 | 971466.000 | 618862.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:03:49.855Z

- Warm wall: 1734.487 -> 1749.175 ms (+14.688 ms (+0.85%))
- Bridge calls/iteration: 5784.000 -> 5784.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.563 -> 5.340 ms (-0.223 ms (-4.01%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.064 -> 0.840 ms (+0.776 ms (+1212.50%))
- Bridge time/iteration: 966.936 -> 929.697 ms (-37.239 ms (-3.85%))
- BridgeResponse encoded bytes/iteration: 9737452.333 -> 9737452.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 862.442 | 826.220 | -36.222 |
| Method time | `_fsExists` | 51.562 | 50.170 | -1.392 |
| Method time | `_resolveModule` | 35.151 | 33.848 | -1.303 |

