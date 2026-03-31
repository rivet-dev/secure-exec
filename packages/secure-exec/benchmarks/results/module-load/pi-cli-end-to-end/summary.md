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
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 32.795 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 32.795 ms/iteration, 300368.667 bytes/iteration
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

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 71.000 | 87.478 ms | 758629.667 | 70 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 5.562 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 32.795 ms | 300368.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 20.965 ms | 56865.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 11.854 ms | 157798.000 |
| real polyfill-body loads | by calls | `url` | 1.000 | 8.259 ms | 41826.000 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 32.795 ms | 300368.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 20.965 ms | 56865.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 11.854 ms | 157798.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 8.259 ms | 41826.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.292 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 32.795 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 11.854 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 5.562 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.292 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 20.965 ms | 56865.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

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

Baseline scenario timestamp: 2026-03-31T22:13:30.188Z

- Warm wall: 1548.452 -> 1548.452 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 13.201 -> 13.201 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 7.202 -> 7.202 ms (0.000 ms (0.00%))
- Bridge time/iteration: 890.790 -> 890.790 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 3449856.000 -> 3449856.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 87.478 -> 87.478 ms (0.000 ms (0.00%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.562 -> 5.562 ms (0.000 ms (0.00%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.795 -> 32.795 ms (0.000 ms (0.00%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.854 -> 11.854 ms (0.000 ms (0.00%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.292 -> 6.292 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 20.965 -> 20.965 ms (0.000 ms (0.00%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.795 -> 32.795 ms (0.000 ms (0.00%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 20.965 -> 20.965 ms (0.000 ms (0.00%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.854 -> 11.854 ms (0.000 ms (0.00%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.259 -> 8.259 ms (0.000 ms (0.00%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.292 -> 6.292 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.795 -> 32.795 ms (0.000 ms (0.00%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.854 -> 11.854 ms (0.000 ms (0.00%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.562 -> 5.562 ms (0.000 ms (0.00%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.292 -> 6.292 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 20.965 -> 20.965 ms (0.000 ms (0.00%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

