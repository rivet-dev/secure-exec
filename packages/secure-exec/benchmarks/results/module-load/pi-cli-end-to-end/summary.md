# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T04:18:38.419Z
Description: Loads the Pi CLI module graph, then drives Pi print-mode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 2099.842 ms
- Bridge calls/iteration: 5797.000
- Warm fixed session overhead: 107.250 ms
- Dominant bridge time: `_loadPolyfill` 1048.381 ms/iteration across 5716.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9738652.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9750510.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2705.941 ms | 2589.983 ms | 115.958 ms | 5797 | 1405.742 ms |
| 2 | 2092.796 ms | 1984.566 ms | 108.230 ms | 5797 | 982.996 ms |
| 3 | 2106.889 ms | 2000.619 ms | 106.270 ms | 5797 | 968.591 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5716.000 | 1048.381 ms | 0.183 ms | 9738652.000 |
| `_resolveModule` | 34.000 | 35.958 ms | 1.058 ms | 4795.000 |
| `_fsExists` | 37.000 | 29.430 ms | 0.795 ms | 1850.000 |
| `_networkFetchRaw` | 1.000 | 3.607 ms | 3.607 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 1.415 ms | 0.707 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.214 ms | 0.043 ms | 435.000 |
| `_log` | 2.000 | 0.104 ms | 0.052 ms | 94.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5797.000 | 9750510.000 | 9478051.000 |
| `send:Execute` | 1.000 | 1242782.000 | 0.000 |
| `recv:BridgeCall` | 5797.000 | 974499.000 | 620995.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T04:02:18.714Z

- Warm wall: 2036.938 -> 2099.842 ms (+62.904 ms (+3.09%))
- Bridge calls/iteration: 5797.000 -> 5797.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.020 -> 107.250 ms (+0.230 ms (+0.21%))
- Bridge time/iteration: 1045.575 -> 1119.110 ms (+73.535 ms (+7.03%))
- BridgeResponse encoded bytes/iteration: 9750510.000 -> 9750510.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 969.950 | 1048.381 | +78.431 |
| Method time | `_resolveModule` | 41.918 | 35.958 | -5.960 |
| Method time | `_fsExists` | 28.078 | 29.430 | +1.352 |

