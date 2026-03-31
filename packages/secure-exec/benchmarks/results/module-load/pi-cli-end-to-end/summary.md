# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T22:13:30.188Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1548.452 ms
- Bridge calls/iteration: 2772.000
- Warm fixed session overhead: 13.201 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 7.202 ms
- Dominant bridge time: `_bridgeDispatch` 725.989 ms/iteration across 2638.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2679096.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 87.478 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3449856.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2135.625 ms; runtime create 108.708 ms; first pass 2026.917 ms; mock requests 1; checks `responseSeen`=true
- Sandbox true cold start, warm snapshot disabled: total 1789.730 ms; runtime create 4.472 ms; first pass 1785.258 ms; mock requests 1; checks `responseSeen`=true
- Sandbox new-session replay, warm snapshot enabled: cold 2061.192 ms; warm 1548.452 ms; mock requests mean 1.000
- Sandbox new-session replay, warm snapshot disabled: cold 1450.736 ms; warm 1661.832 ms; mock requests mean 1.000
- Sandbox same-session replay: total 1850.802 ms; mock requests 2; first checks `completed`=true; replay checks `completed`=true
- Host same-session control: total 380.825 ms; first 374.901 ms; replay 5.917 ms; mock requests 2; first checks `completed`=true; replay checks `completed`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2061.192 ms | 2045.852 ms | 15.340 ms | 2772 | 1125.290 ms |
| 2 | 1473.838 ms | 1459.289 ms | 14.549 ms | 2772 | 713.266 ms |
| 3 | 1623.066 ms | 1611.212 ms | 11.854 ms | 2772 | 833.813 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2045.852 ms | 1.000 ms | 5.340 ms |
| 2 | 6.000 ms | 0.000 ms | 1459.289 ms | 1.000 ms | 7.549 ms |
| 3 | 5.000 ms | 0.000 ms | 1611.212 ms | 0.000 ms | 6.854 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2638.000 | 725.989 ms | 0.275 ms | 2679096.667 |
| `_loadPolyfill` | 71.000 | 87.478 ms | 1.232 ms | 758629.667 |
| `_fsExists` | 43.000 | 58.704 ms | 1.365 ms | 2150.000 |
| `_fsMkdir` | 1.000 | 4.627 ms | 4.627 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 4.249 ms | 4.249 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 2.814 ms | 0.563 ms | 7684.000 |
| `_fsUtimes` | 1.000 | 1.435 ms | 1.435 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.376 ms | 1.376 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.266 ms | 1.266 ms | 47.000 |
| `_fsStat` | 1.000 | 1.107 ms | 1.107 ms | 205.667 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 71.000 | 87.478 ms | 758629.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
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
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T21:01:07.511Z

- Warm wall: 1754.015 -> 1548.452 ms (-205.563 ms (-11.72%))
- Bridge calls/iteration: 2772.333 -> 2772.000 calls (-0.333 calls (-0.01%))
- Warm fixed overhead: 13.227 -> 13.201 ms (-0.026 ms (-0.20%))
- Warm Create->InjectGlobals: 6.500 -> 5.500 ms (-1.000 ms (-15.38%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 6.226 -> 7.202 ms (+0.976 ms (+15.68%))
- Bridge time/iteration: 971.184 -> 890.790 ms (-80.394 ms (-8.28%))
- BridgeResponse encoded bytes/iteration: 3449878.667 -> 3449856.000 bytes (-22.667 bytes (-0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 80.413 -> 87.478 ms (+7.065 ms (+8.79%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 823.737 | 725.989 | -97.748 |
| Method time | `_fsExists` | 45.285 | 58.704 | +13.419 |
| Method time | `_loadPolyfill` | 80.413 | 87.478 | +7.065 |
| Method bytes | `_bridgeDispatch` | 2679118.667 | 2679096.667 | -22.000 |
| Method bytes | `_fsStat` | 206.333 | 205.667 | -0.666 |
| Frame bytes | `recv:BridgeCall` | 576242.667 | 576212.000 | -30.667 |
| Frame bytes | `send:BridgeResponse` | 3449878.667 | 3449856.000 | -22.667 |
| Frame bytes | `send:StreamEvent` | 135.333 | 116.000 | -19.333 |

