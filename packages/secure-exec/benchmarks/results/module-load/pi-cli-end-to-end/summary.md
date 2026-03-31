# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T07:23:35.090Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1665.810 ms
- Bridge calls/iteration: 2823.333
- Warm fixed session overhead: 11.201 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 0.000 ms, residual 6.701 ms
- Dominant bridge time: `_loadPolyfill` 895.365 ms/iteration across 2727.333 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9482993.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9498709.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2382.720 ms | 2365.515 ms | 17.205 ms | 2824 | 1358.494 ms |
| 2 | 1505.775 ms | 1494.376 ms | 11.399 ms | 2823 | 752.494 ms |
| 3 | 1825.845 ms | 1814.841 ms | 11.004 ms | 2823 | 922.746 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 2365.515 ms | 2.000 ms | 6.205 ms |
| 2 | 0.000 ms | 5.000 ms | 1494.376 ms | 0.000 ms | 6.399 ms |
| 3 | 0.000 ms | 4.000 ms | 1814.841 ms | 0.000 ms | 7.004 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2727.333 | 895.365 ms | 0.328 ms | 9482993.667 |
| `_fsExists` | 55.000 | 54.831 ms | 0.997 ms | 2750.000 |
| `_resolveModule` | 21.000 | 39.418 ms | 1.877 ms | 2986.000 |
| `_networkFetchRaw` | 1.000 | 6.247 ms | 6.247 ms | 1231.000 |
| `_fsMkdir` | 1.000 | 5.601 ms | 5.601 ms | 47.000 |
| `_fsReadFile` | 5.000 | 3.439 ms | 0.688 ms | 7684.000 |
| `_fsRmdir` | 1.000 | 1.301 ms | 1.301 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.258 ms | 1.258 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.163 ms | 1.163 ms | 47.000 |
| `_fsStat` | 1.000 | 1.115 ms | 1.115 ms | 205.667 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2823.333 | 9498709.333 | 9366012.667 |
| `send:Execute` | 1.000 | 1243334.000 | 0.000 |
| `recv:BridgeCall` | 2823.333 | 611661.667 | 439671.333 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.333 | 135.333 | 30.333 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:54.085Z

- Warm wall: 1959.386 -> 1665.810 ms (-293.576 ms (-14.98%))
- Bridge calls/iteration: 5784.000 -> 2823.333 calls (-2960.667 calls (-51.19%))
- Warm fixed overhead: 9.326 -> 11.201 ms (+1.875 ms (+20.11%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.826 -> 6.701 ms (+2.875 ms (+75.14%))
- Bridge time/iteration: 975.198 -> 1011.245 ms (+36.047 ms (+3.70%))
- BridgeResponse encoded bytes/iteration: 9737453.000 -> 9498709.333 bytes (-238743.667 bytes (-2.45%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 861.924 | 895.365 | +33.441 |
| Method time | `_resolveModule` | 43.321 | 39.418 | -3.903 |
| Method time | `_networkFetchRaw` | 2.943 | 6.247 | +3.304 |
| Method bytes | `_loadPolyfill` | 9719927.000 | 9482993.667 | -236933.333 |
| Method bytes | `_resolveModule` | 4795.000 | 2986.000 | -1809.000 |
| Method bytes | `_fsStat` | 207.000 | 205.667 | -1.333 |
| Frame bytes | `recv:BridgeCall` | 971466.000 | 611661.667 | -359804.333 |
| Frame bytes | `send:BridgeResponse` | 9737453.000 | 9498709.333 | -238743.667 |
| Frame bytes | `send:Execute` | 1241953.000 | 1243334.000 | +1381.000 |

