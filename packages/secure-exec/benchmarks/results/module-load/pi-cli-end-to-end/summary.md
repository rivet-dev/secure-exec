# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T22:52:39.891Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1898.294 ms
- Bridge calls/iteration: 2772.000
- Warm fixed session overhead: 10.689 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 7.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.689 ms
- Dominant bridge time: `_bridgeDispatch` 951.271 ms/iteration across 2638.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2679096.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 58.042 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 16.287 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 16.287 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3449855.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2383.372 ms; runtime create 239.548 ms; first pass 2143.824 ms; mock requests 1; checks `responseSeen`=true
- Sandbox true cold start, warm snapshot disabled: total 2360.165 ms; runtime create 4.679 ms; first pass 2355.486 ms; mock requests 1; checks `responseSeen`=true
- Sandbox new-session replay, warm snapshot enabled: cold 2382.929 ms; warm 1898.294 ms; mock requests mean 1.000
- Sandbox new-session replay, warm snapshot disabled: cold 2370.255 ms; warm 1756.481 ms; mock requests mean 1.000
- Sandbox same-session replay: total 2084.733 ms; mock requests 2; first checks `completed`=true; replay checks `completed`=true
- Host same-session control: total 382.569 ms; first 378.516 ms; replay 4.051 ms; mock requests 2; first checks `completed`=true; replay checks `completed`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2382.929 ms | 2369.053 ms | 13.876 ms | 2772 | 1307.918 ms |
| 2 | 2056.117 ms | 2045.152 ms | 10.965 ms | 2772 | 1102.264 ms |
| 3 | 1740.472 ms | 1730.059 ms | 10.413 ms | 2772 | 861.379 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2369.053 ms | 1.000 ms | 3.876 ms |
| 2 | 7.000 ms | 0.000 ms | 2045.152 ms | 0.000 ms | 3.965 ms |
| 3 | 7.000 ms | 0.000 ms | 1730.059 ms | 0.000 ms | 3.413 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2638.000 | 951.271 ms | 0.361 ms | 2679096.667 |
| `_fsExists` | 43.000 | 59.256 ms | 1.378 ms | 2150.000 |
| `_loadPolyfill` | 71.000 | 58.042 ms | 0.817 ms | 758629.667 |
| `_fsMkdir` | 1.000 | 7.499 ms | 7.499 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 3.926 ms | 3.926 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 3.149 ms | 0.630 ms | 7684.000 |
| `_fsWriteFile` | 1.000 | 1.532 ms | 1.532 ms | 47.000 |
| `_fsStat` | 1.000 | 1.370 ms | 1.370 ms | 205.000 |
| `_fsChmod` | 1.000 | 1.342 ms | 1.342 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.269 ms | 1.269 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 71.000 | 58.042 ms | 758629.667 | 70 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 5.420 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 16.287 ms | 300368.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 11.772 ms | 56865.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 9.256 ms | 157798.000 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.536 ms | 82604.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 16.287 ms | 300368.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 11.772 ms | 56865.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 9.256 ms | 157798.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.536 ms | 82604.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 6.226 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 16.287 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 9.256 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 5.420 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.536 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 11.772 ms | 56865.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2772.000 | 3449855.333 | 3319571.333 |
| `recv:BridgeCall` | 2772.000 | 576212.000 | 402050.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 15114.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

