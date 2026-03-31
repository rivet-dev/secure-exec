# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T04:43:51.984Z
Description: Loads the Pi CLI module graph, then drives Pi print-mode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 2026.762 ms
- Bridge calls/iteration: 5797.000
- Warm fixed session overhead: 109.701 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 6.500 ms, ExecutionResult->Destroy 102.500 ms, residual 0.201 ms
- Dominant bridge time: `_loadPolyfill` 1081.009 ms/iteration across 5716.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9738652.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9750510.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3047.943 ms | 2932.229 ms | 115.714 ms | 5797 | 1641.675 ms |
| 2 | 2104.576 ms | 1992.874 ms | 111.702 ms | 5797 | 962.198 ms |
| 3 | 1948.947 ms | 1841.247 ms | 107.700 ms | 5797 | 871.707 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 7.000 ms | 2932.229 ms | 105.000 ms | 1.714 ms |
| 2 | 0.000 ms | 8.000 ms | 1992.874 ms | 103.000 ms | 0.702 ms |
| 3 | 1.000 ms | 5.000 ms | 1841.247 ms | 102.000 ms | -0.300 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5716.000 | 1081.009 ms | 0.189 ms | 9738652.000 |
| `_resolveModule` | 34.000 | 38.923 ms | 1.145 ms | 4795.000 |
| `_fsExists` | 37.000 | 32.111 ms | 0.868 ms | 1850.000 |
| `_networkFetchRaw` | 1.000 | 3.064 ms | 3.064 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 3.044 ms | 1.522 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.289 ms | 0.058 ms | 435.000 |
| `_log` | 2.000 | 0.086 ms | 0.043 ms | 94.000 |

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

Baseline scenario timestamp: 2026-03-31T04:38:52.757Z

- Warm wall: 1707.913 -> 2026.762 ms (+318.849 ms (+18.67%))
- Bridge calls/iteration: 5797.000 -> 5797.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.012 -> 109.701 ms (+1.689 ms (+1.56%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 6.000 -> 6.500 ms (+0.500 ms (+8.33%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.500 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 0.512 -> 0.201 ms (-0.311 ms (-60.74%))
- Bridge time/iteration: 839.648 -> 1158.527 ms (+318.879 ms (+37.98%))
- BridgeResponse encoded bytes/iteration: 9750510.000 -> 9750510.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 766.126 | 1081.009 | +314.883 |
| Method time | `_fsReadFile` | 1.446 | 3.044 | +1.598 |
| Method time | `_fsExists` | 30.586 | 32.111 | +1.525 |

