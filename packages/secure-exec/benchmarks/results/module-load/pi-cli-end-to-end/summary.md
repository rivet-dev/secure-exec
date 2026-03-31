# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T20:29:57.416Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1049.009 ms
- Bridge calls/iteration: 2772.000
- Warm fixed session overhead: 9.409 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.409 ms
- Dominant bridge time: `_bridgeDispatch` 440.689 ms/iteration across 2638.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2679096.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 51.942 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3449856.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1303.528 ms | 1289.168 ms | 14.360 ms | 2772 | 686.132 ms |
| 2 | 1064.678 ms | 1054.171 ms | 10.507 ms | 2772 | 498.328 ms |
| 3 | 1033.340 ms | 1025.030 ms | 8.310 ms | 2772 | 477.414 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 1.000 ms | 1289.168 ms | 0.000 ms | 4.360 ms |
| 2 | 7.000 ms | 0.000 ms | 1054.171 ms | 0.000 ms | 3.507 ms |
| 3 | 5.000 ms | 0.000 ms | 1025.030 ms | 0.000 ms | 3.310 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2638.000 | 440.689 ms | 0.167 ms | 2679096.667 |
| `_loadPolyfill` | 71.000 | 51.942 ms | 0.732 ms | 758629.667 |
| `_fsExists` | 43.000 | 43.089 ms | 1.002 ms | 2150.000 |
| `_fsMkdir` | 1.000 | 5.442 ms | 5.442 ms | 47.000 |
| `_fsReadFile` | 5.000 | 3.403 ms | 0.681 ms | 7684.000 |
| `_networkFetchRaw` | 1.000 | 3.002 ms | 3.002 ms | 1231.000 |
| `_fsRmdir` | 1.000 | 1.437 ms | 1.437 ms | 47.000 |
| `_fsStat` | 1.000 | 1.180 ms | 1.180 ms | 205.667 |
| `_fsWriteFile` | 1.000 | 1.151 ms | 1.151 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.148 ms | 1.148 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 71.000 | 51.942 ms | 758629.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2772.000 | 3449856.000 | 3319572.000 |
| `recv:BridgeCall` | 2772.000 | 576212.000 | 402050.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 15114.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:50.007Z

- Warm wall: 1926.880 -> 1049.009 ms (-877.871 ms (-45.56%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 13.261 -> 9.409 ms (-3.852 ms (-29.05%))
- Warm Create->InjectGlobals: 5.500 -> 6.000 ms (+0.500 ms (+9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 7.760 -> 3.409 ms (-4.351 ms (-56.07%))
- Bridge time/iteration: 1010.667 -> 553.958 ms (-456.709 ms (-45.19%))
- BridgeResponse encoded bytes/iteration: 3648246.667 -> 3449856.000 bytes (-198390.667 bytes (-5.44%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 78.924 -> 51.942 ms (-26.982 ms (-34.19%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 0.000 calls (-2638.000 calls (-100.00%)); time 859.059 -> 0.000 ms (-859.059 ms (-100.00%)); response bytes 2877486.000 -> 0.000 bytes (-2877486.000 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 937.983 | 51.942 | -886.041 |
| Method time | `_bridgeDispatch` | 0.000 | 440.689 | +440.689 |
| Method time | `_fsExists` | 52.290 | 43.089 | -9.201 |
| Method bytes | `_loadPolyfill` | 3636115.667 | 758629.667 | -2877486.000 |
| Method bytes | `_bridgeDispatch` | 0.000 | 2679096.667 | +2679096.667 |
| Method bytes | `_fsStat` | 207.000 | 205.667 | -1.333 |
| Frame bytes | `send:BridgeResponse` | 3648246.667 | 3449856.000 | -198390.667 |
| Frame bytes | `recv:BridgeCall` | 586892.000 | 576212.000 | -10680.000 |
| Frame bytes | `send:Execute` | 14132.000 | 15114.000 | +982.000 |

