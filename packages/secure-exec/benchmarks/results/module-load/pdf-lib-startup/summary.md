# pdf-lib Startup

Scenario: `pdf-lib-startup`
Kind: `startup`
Generated: 2026-03-31T23:33:26.567Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 137.542 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 6.181 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.181 ms
- Warm wall stability: median 137.542 ms; min/max 115.320 ms / 159.764 ms; stddev 22.222 ms; range 44.444 ms
- Warm execute stability: median 131.361 ms; min/max 109.913 ms / 152.808 ms; stddev 21.447 ms; range 42.895 ms
- Host runtime resources: peak RSS 210.695 MiB; peak heap 50.391 MiB; heap limit usage 1.175%; CPU user/system/total 0.875 s / 0.168 s / 1.044 s
- Dominant bridge time: `_bridgeDispatch` 51.118 ms/iteration across 506.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 552106.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 10.132 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.399 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.399 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 652213.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 271.157 ms; runtime create 101.771 ms; first pass 169.386 ms; sandbox 0.000 ms; checks `pdfDocumentType`=function, `pageCount`=0, `standardFontName`=Helvetica
- Sandbox true cold start, warm snapshot disabled: total 311.461 ms; runtime create 4.515 ms; first pass 306.946 ms; sandbox 0.000 ms; checks `pdfDocumentType`=function, `pageCount`=0, `standardFontName`=Helvetica
- Sandbox new-session replay, warm snapshot enabled: cold 325.082 ms; warm 137.542 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 265.502 ms; warm 144.569 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 159.259 ms; first checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0; replay checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0
- Host same-session control: total 49.299 ms; first 49.154 ms; replay 0.143 ms; first checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0; replay checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 325.082 ms | 307.031 ms | 18.051 ms | 514 | 112.062 ms |
| 2 | 159.764 ms | 152.808 ms | 6.956 ms | 514 | 43.911 ms |
| 3 | 115.320 ms | 109.913 ms | 5.407 ms | 514 | 28.204 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 14.000 ms | 1.000 ms | 307.031 ms | 2.000 ms | 1.051 ms |
| 2 | 6.000 ms | 0.000 ms | 152.808 ms | 0.000 ms | 0.956 ms |
| 3 | 4.000 ms | 0.000 ms | 109.913 ms | 0.000 ms | 1.407 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 115.320 ms | 137.542 ms | 137.542 ms | 159.764 ms | 22.222 ms | 44.444 ms |
| Warm execute | 2 | 109.913 ms | 131.361 ms | 131.361 ms | 152.808 ms | 21.447 ms | 42.895 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 210.695 MiB |
| Peak heap used | 50.391 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.175% |
| CPU user | 0.875 s |
| CPU system | 0.168 s |
| CPU total | 1.044 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 506.000 | 51.118 ms | 0.101 ms | 552106.667 |
| `_loadPolyfill` | 7.000 | 10.132 ms | 1.447 ms | 100059.333 |
| `_log` | 1.000 | 0.142 ms | 0.142 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 7.000 | 10.132 ms | 100059.333 | 7 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.399 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.580 ms | 41826.000 |
| real polyfill-body loads | by calls | `pdf-lib` | 1.000 | 0.040 ms | 50.000 |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 | 0.032 ms | 50.000 |
| real polyfill-body loads | by calls | `pako` | 1.000 | 0.032 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.399 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.580 ms | 41826.000 |
| real polyfill-body loads | by time | `pdf-lib` | 1.000 | 0.040 ms | 50.000 |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 | 0.032 ms | 50.000 |
| real polyfill-body loads | by time | `pako` | 1.000 | 0.032 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.399 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.580 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `pdf-lib` | 1.000 | 0.040 ms | 50.000 |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 | 0.032 ms | 50.000 |
| real polyfill-body loads | by response bytes | `pako` | 1.000 | 0.032 ms | 50.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 514.000 | 652213.000 | 628055.000 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `recv:BridgeCall` | 514.000 | 101179.000 | 68822.000 |
| `send:Execute` | 1.000 | 14303.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:44.892Z

- Warm wall: 122.178 -> 137.542 ms (+15.364 ms (+12.57%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.839 -> 6.181 ms (-0.658 ms (-9.62%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.340 -> 1.181 ms (-0.159 ms (-11.87%))
- Bridge time/iteration: 45.695 -> 61.392 ms (+15.697 ms (+34.35%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 122.178 -> 137.542 ms (+15.364 ms (+12.57%))
- Warm wall stddev: 3.680 -> 22.222 ms (+18.542 ms (+503.86%))
- Warm execute median: 115.339 -> 131.361 ms (+16.022 ms (+13.89%))
- Warm execute stddev: 3.807 -> 21.447 ms (+17.640 ms (+463.36%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 11.267 -> 10.132 ms (-1.135 ms (-10.07%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.976 -> 5.399 ms (-0.577 ms (-9.65%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.153 -> 4.580 ms (-0.573 ms (-11.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.039 -> 0.025 ms (-0.014 ms (-35.90%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.976 -> 5.399 ms (-0.577 ms (-9.65%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.153 -> 4.580 ms (-0.573 ms (-11.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.039 -> 0.025 ms (-0.014 ms (-35.90%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.976 -> 5.399 ms (-0.577 ms (-9.65%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.153 -> 4.580 ms (-0.573 ms (-11.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.039 -> 0.025 ms (-0.014 ms (-35.90%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 34.338 | 51.118 | +16.780 |
| Method time | `_loadPolyfill` | 11.267 | 10.132 | -1.135 |
| Method time | `_log` | 0.090 | 0.142 | +0.052 |

