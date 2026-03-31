# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T05:05:01.606Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1991.222 ms
- Bridge calls/iteration: 5747.000
- Warm fixed session overhead: 107.215 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 0.715 ms
- Dominant bridge time: `_loadPolyfill` 935.682 ms/iteration across 5664.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9703825.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9715780.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2452.657 ms | 2340.373 ms | 112.284 ms | 5747 | 1225.062 ms |
| 2 | 2092.403 ms | 1984.717 ms | 107.686 ms | 5747 | 948.787 ms |
| 3 | 1890.041 ms | 1783.298 ms | 106.743 ms | 5747 | 853.568 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2340.373 ms | 102.000 ms | 2.284 ms |
| 2 | 0.000 ms | 5.000 ms | 1984.717 ms | 102.000 ms | 0.686 ms |
| 3 | 0.000 ms | 4.000 ms | 1783.298 ms | 102.000 ms | 0.743 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5664.000 | 935.682 ms | 0.165 ms | 9703825.000 |
| `_resolveModule` | 34.000 | 35.902 ms | 1.056 ms | 4795.000 |
| `_fsExists` | 38.000 | 32.122 ms | 0.845 ms | 1900.000 |
| `_networkFetchRaw` | 1.000 | 2.836 ms | 2.836 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 2.230 ms | 1.115 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.281 ms | 0.056 ms | 435.000 |
| `_log` | 3.000 | 0.086 ms | 0.029 ms | 141.000 |

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

Baseline scenario timestamp: 2026-03-31T05:03:37.458Z

- Warm wall: 1870.868 -> 1991.222 ms (+120.354 ms (+6.43%))
- Bridge calls/iteration: 5747.000 -> 5747.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.290 -> 107.215 ms (-0.075 ms (-0.07%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.290 -> 0.715 ms (+0.425 ms (+146.55%))
- Bridge time/iteration: 879.758 -> 1009.139 ms (+129.381 ms (+14.71%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9715780.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 800.693 | 935.682 | +134.989 |
| Method time | `_resolveModule` | 43.090 | 35.902 | -7.188 |
| Method time | `_fsExists` | 28.883 | 32.122 | +3.239 |

