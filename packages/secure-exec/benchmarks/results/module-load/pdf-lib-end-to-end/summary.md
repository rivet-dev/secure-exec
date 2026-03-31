# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:33:31.618Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 256.817 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 7.571 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 0.000 ms, residual 2.071 ms
- Warm wall stability: median 256.817 ms; min/max 185.627 ms / 328.007 ms; stddev 71.190 ms; range 142.380 ms
- Warm execute stability: median 249.246 ms; min/max 178.403 ms / 320.089 ms; stddev 70.843 ms; range 141.686 ms
- Host runtime resources: peak RSS 207.223 MiB; peak heap 46.093 MiB; heap limit usage 1.075%; CPU user/system/total 0.803 s / 0.191 s / 0.994 s
- Dominant bridge time: `_bridgeDispatch` 47.334 ms/iteration across 521.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 553101.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 11.109 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.917 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.917 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 653208.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 383.380 ms; runtime create 100.166 ms; first pass 283.214 ms; sandbox 0.000 ms; checks `pageCount`=5, `fieldCount`=50, `savedSize`=41186
- Sandbox true cold start, warm snapshot disabled: total 541.959 ms; runtime create 5.129 ms; first pass 536.830 ms; sandbox 0.000 ms; checks `pageCount`=5, `fieldCount`=50, `savedSize`=41186
- Sandbox new-session replay, warm snapshot enabled: cold 250.839 ms; warm 256.817 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 376.090 ms; warm 168.483 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 273.334 ms; first checks `pageCount`=5, `fieldCount`=50; replay checks `pageCount`=5, `fieldCount`=50
- Host same-session control: total 75.166 ms; first 67.558 ms; replay 7.605 ms; first checks `pageCount`=5, `fieldCount`=50; replay checks `pageCount`=5, `fieldCount`=50

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 250.839 ms | 235.605 ms | 15.234 ms | 529 | 73.711 ms |
| 2 | 328.007 ms | 320.089 ms | 7.918 ms | 529 | 73.439 ms |
| 3 | 185.627 ms | 178.403 ms | 7.224 ms | 529 | 28.534 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 235.605 ms | 1.000 ms | 2.234 ms |
| 2 | 6.000 ms | 0.000 ms | 320.089 ms | 0.000 ms | 1.918 ms |
| 3 | 4.000 ms | 1.000 ms | 178.403 ms | 0.000 ms | 2.224 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 185.627 ms | 256.817 ms | 256.817 ms | 328.007 ms | 71.190 ms | 142.380 ms |
| Warm execute | 2 | 178.403 ms | 249.246 ms | 249.246 ms | 320.089 ms | 70.843 ms | 141.686 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 207.223 MiB |
| Peak heap used | 46.093 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.075% |
| CPU user | 0.803 s |
| CPU system | 0.191 s |
| CPU total | 0.994 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 521.000 | 47.334 ms | 0.091 ms | 553101.667 |
| `_loadPolyfill` | 7.000 | 11.109 ms | 1.587 ms | 100059.333 |
| `_log` | 1.000 | 0.118 ms | 0.118 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 7.000 | 11.109 ms | 100059.333 | 7 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.917 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.054 ms | 41826.000 |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 | 0.035 ms | 50.000 |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 | 0.029 ms | 50.000 |
| real polyfill-body loads | by calls | `pdf-lib` | 1.000 | 0.027 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.917 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.054 ms | 41826.000 |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 | 0.035 ms | 50.000 |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 | 0.029 ms | 50.000 |
| real polyfill-body loads | by time | `pdf-lib` | 1.000 | 0.027 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.917 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.054 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 | 0.035 ms | 50.000 |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 | 0.029 ms | 50.000 |
| real polyfill-body loads | by response bytes | `pdf-lib` | 1.000 | 0.027 ms | 50.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 529.000 | 653208.000 | 628345.000 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `recv:BridgeCall` | 529.000 | 102565.000 | 69263.000 |
| `send:Execute` | 1.000 | 15042.000 | 0.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:49.239Z

- Warm wall: 179.726 -> 256.817 ms (+77.091 ms (+42.89%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.691 -> 7.571 ms (+0.880 ms (+13.15%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.190 -> 2.071 ms (+0.881 ms (+74.03%))
- Bridge time/iteration: 44.157 -> 58.561 ms (+14.404 ms (+32.62%))
- BridgeResponse encoded bytes/iteration: 653208.000 -> 653208.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 179.726 -> 256.817 ms (+77.091 ms (+42.89%))
- Warm wall stddev: 5.803 -> 71.190 ms (+65.387 ms (+1126.78%))
- Warm execute median: 173.036 -> 249.246 ms (+76.210 ms (+44.04%))
- Warm execute stddev: 5.166 -> 70.843 ms (+65.677 ms (+1271.33%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.908 -> 11.109 ms (+0.201 ms (+1.84%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.699 -> 5.917 ms (+0.218 ms (+3.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.086 -> 5.054 ms (-0.032 ms (-0.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.026 -> 0.035 ms (+0.009 ms (+34.62%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.024 -> 0.029 ms (+0.005 ms (+20.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.699 -> 5.917 ms (+0.218 ms (+3.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.086 -> 5.054 ms (-0.032 ms (-0.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.026 -> 0.035 ms (+0.009 ms (+34.62%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.024 -> 0.029 ms (+0.005 ms (+20.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.699 -> 5.917 ms (+0.218 ms (+3.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.086 -> 5.054 ms (-0.032 ms (-0.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.026 -> 0.035 ms (+0.009 ms (+34.62%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.024 -> 0.029 ms (+0.005 ms (+20.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 33.189 | 47.334 | +14.145 |
| Method time | `_loadPolyfill` | 10.908 | 11.109 | +0.201 |
| Method time | `_log` | 0.060 | 0.118 | +0.058 |

