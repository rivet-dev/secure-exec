# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T04:43:37.628Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1884.760 ms
- Bridge calls/iteration: 5747.000
- Warm fixed session overhead: 106.159 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 100.500 ms, residual 1.159 ms
- Dominant bridge time: `_loadPolyfill` 815.311 ms/iteration across 5664.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9703825.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9715780.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2052.604 ms | 1937.458 ms | 115.146 ms | 5747 | 1058.092 ms |
| 2 | 1972.982 ms | 1866.340 ms | 106.642 ms | 5747 | 852.608 ms |
| 3 | 1796.538 ms | 1690.863 ms | 105.675 ms | 5747 | 767.225 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 1937.458 ms | 104.000 ms | 3.146 ms |
| 2 | 0.000 ms | 5.000 ms | 1866.340 ms | 100.000 ms | 1.642 ms |
| 3 | 0.000 ms | 4.000 ms | 1690.863 ms | 101.000 ms | 0.675 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5664.000 | 815.311 ms | 0.144 ms | 9703825.000 |
| `_resolveModule` | 34.000 | 41.287 ms | 1.214 ms | 4795.000 |
| `_fsExists` | 38.000 | 30.597 ms | 0.805 ms | 1900.000 |
| `_networkFetchRaw` | 1.000 | 3.118 ms | 3.118 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 2.042 ms | 1.021 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.229 ms | 0.046 ms | 435.000 |
| `_log` | 3.000 | 0.057 ms | 0.019 ms | 141.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5747.000 | 9715780.000 | 9445671.000 |
| `send:Execute` | 1.000 | 1241735.000 | 0.000 |
| `recv:BridgeCall` | 5747.000 | 966611.000 | 616170.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T04:38:40.369Z

- Warm wall: 1669.619 -> 1884.760 ms (+215.141 ms (+12.89%))
- Bridge calls/iteration: 5747.000 -> 5747.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.471 -> 106.159 ms (-1.312 ms (-1.22%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 100.500 ms (-1.500 ms (-1.47%))
- Warm residual overhead: 0.971 -> 1.159 ms (+0.188 ms (+19.36%))
- Bridge time/iteration: 919.529 -> 892.642 ms (-26.887 ms (-2.92%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9715780.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_resolveModule` | 61.455 | 41.287 | -20.168 |
| Method time | `_loadPolyfill` | 819.873 | 815.311 | -4.562 |
| Method time | `_networkFetchRaw` | 5.244 | 3.118 | -2.126 |

