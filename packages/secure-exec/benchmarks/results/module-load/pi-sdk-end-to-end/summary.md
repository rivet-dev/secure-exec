# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T04:18:24.133Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 2062.543 ms
- Bridge calls/iteration: 5747.000
- Warm fixed session overhead: 106.510 ms
- Dominant bridge time: `_loadPolyfill` 968.389 ms/iteration across 5664.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9703825.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9715780.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2685.426 ms | 2569.297 ms | 116.129 ms | 5747 | 1384.199 ms |
| 2 | 2090.401 ms | 1983.226 ms | 107.175 ms | 5747 | 927.002 ms |
| 3 | 2034.686 ms | 1928.842 ms | 105.844 ms | 5747 | 832.342 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5664.000 | 968.389 ms | 0.171 ms | 9703825.000 |
| `_resolveModule` | 34.000 | 41.488 ms | 1.220 ms | 4795.000 |
| `_fsExists` | 38.000 | 28.566 ms | 0.752 ms | 1900.000 |
| `_networkFetchRaw` | 1.000 | 6.162 ms | 6.162 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 2.889 ms | 1.445 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.216 ms | 0.043 ms | 435.000 |
| `_log` | 3.000 | 0.137 ms | 0.046 ms | 141.000 |

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

Baseline scenario timestamp: 2026-03-31T04:02:05.028Z

- Warm wall: 2004.673 -> 2062.543 ms (+57.870 ms (+2.89%))
- Bridge calls/iteration: 5747.000 -> 5747.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 105.947 -> 106.510 ms (+0.563 ms (+0.53%))
- Bridge time/iteration: 1046.459 -> 1047.848 ms (+1.389 ms (+0.13%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9715780.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_fsExists` | 36.854 | 28.566 | -8.288 |
| Method time | `_loadPolyfill` | 962.518 | 968.389 | +5.871 |
| Method time | `_networkFetchRaw` | 3.014 | 6.162 | +3.148 |

