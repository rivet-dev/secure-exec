# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T07:23:03.772Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1949.559 ms
- Bridge calls/iteration: 2788.000
- Warm fixed session overhead: 118.046 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 6.000 ms, ExecutionResult->Destroy 102.000 ms, residual 10.046 ms
- Dominant bridge time: `_loadPolyfill` 938.412 ms/iteration across 2718.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9466974.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9477120.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2469.744 ms | 2353.102 ms | 116.642 ms | 2788 | 1340.681 ms |
| 2 | 1989.047 ms | 1868.841 ms | 120.206 ms | 2788 | 932.814 ms |
| 3 | 1910.072 ms | 1794.186 ms | 115.886 ms | 2788 | 870.769 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 6.000 ms | 2353.102 ms | 104.000 ms | 4.642 ms |
| 2 | 0.000 ms | 8.000 ms | 1868.841 ms | 102.000 ms | 10.206 ms |
| 3 | 0.000 ms | 4.000 ms | 1794.186 ms | 102.000 ms | 9.886 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2718.000 | 938.412 ms | 0.345 ms | 9466974.000 |
| `_resolveModule` | 21.000 | 56.444 ms | 2.688 ms | 2986.000 |
| `_fsExists` | 38.000 | 43.058 ms | 1.133 ms | 1900.000 |
| `_fsReadFile` | 2.000 | 4.859 ms | 2.430 ms | 3453.000 |
| `_networkFetchRaw` | 1.000 | 4.816 ms | 4.816 ms | 1231.000 |
| `_log` | 3.000 | 0.259 ms | 0.086 ms | 141.000 |
| `_cryptoRandomUUID` | 5.000 | 0.239 ms | 0.048 ms | 435.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2788.000 | 9477120.000 | 9346084.000 |
| `send:Execute` | 1.000 | 1243116.000 | 0.000 |
| `recv:BridgeCall` | 2788.000 | 606939.000 | 437010.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:41.981Z

- Warm wall: 1294.301 -> 1949.559 ms (+655.258 ms (+50.63%))
- Bridge calls/iteration: 5747.000 -> 2788.000 calls (-2959.000 calls (-51.49%))
- Warm fixed overhead: 109.273 -> 118.046 ms (+8.773 ms (+8.03%))
- Warm Create->InjectGlobals: 1.000 -> 0.000 ms (-1.000 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.000 -> 6.000 ms (+2.000 ms (+50.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.773 -> 10.046 ms (+7.273 ms (+262.28%))
- Bridge time/iteration: 660.320 -> 1048.088 ms (+387.768 ms (+58.72%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9477120.000 bytes (-238660.000 bytes (-2.46%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 587.640 | 938.412 | +350.772 |
| Method time | `_resolveModule` | 35.275 | 56.444 | +21.169 |
| Method time | `_fsExists` | 33.169 | 43.058 | +9.889 |
| Method bytes | `_loadPolyfill` | 9703825.000 | 9466974.000 | -236851.000 |
| Method bytes | `_resolveModule` | 4795.000 | 2986.000 | -1809.000 |
| Frame bytes | `recv:BridgeCall` | 966611.000 | 606939.000 | -359672.000 |
| Frame bytes | `send:BridgeResponse` | 9715780.000 | 9477120.000 | -238660.000 |
| Frame bytes | `send:Execute` | 1241735.000 | 1243116.000 | +1381.000 |

