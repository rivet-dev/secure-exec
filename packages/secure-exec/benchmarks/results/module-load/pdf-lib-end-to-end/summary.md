# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T22:51:10.673Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 243.269 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 7.503 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 2.503 ms
- Dominant bridge time: `_bridgeDispatch` 46.974 ms/iteration across 521.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 553101.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 13.209 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `url` 1.000 calls/iteration, 7.626 ms/iteration, 41826.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.403 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 653208.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 334.750 ms; runtime create 99.385 ms; first pass 235.365 ms; sandbox 0.000 ms; checks `pageCount`=5, `fieldCount`=50, `savedSize`=41186
- Sandbox true cold start, warm snapshot disabled: total 417.929 ms; runtime create 4.830 ms; first pass 413.099 ms; sandbox 0.000 ms; checks `pageCount`=5, `fieldCount`=50, `savedSize`=41186
- Sandbox new-session replay, warm snapshot enabled: cold 275.958 ms; warm 243.269 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 454.124 ms; warm 227.464 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 218.839 ms; first checks `pageCount`=5, `fieldCount`=50; replay checks `pageCount`=5, `fieldCount`=50
- Host same-session control: total 82.065 ms; first 74.601 ms; replay 7.460 ms; first checks `pageCount`=5, `fieldCount`=50; replay checks `pageCount`=5, `fieldCount`=50

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 275.958 ms | 260.492 ms | 15.466 ms | 529 | 82.684 ms |
| 2 | 188.126 ms | 180.435 ms | 7.691 ms | 529 | 31.980 ms |
| 3 | 298.413 ms | 291.097 ms | 7.316 ms | 529 | 66.118 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 1.000 ms | 260.492 ms | 1.000 ms | 1.466 ms |
| 2 | 6.000 ms | 0.000 ms | 180.435 ms | 0.000 ms | 1.691 ms |
| 3 | 4.000 ms | 0.000 ms | 291.097 ms | 0.000 ms | 3.316 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 521.000 | 46.974 ms | 0.090 ms | 553101.667 |
| `_loadPolyfill` | 7.000 | 13.209 ms | 1.887 ms | 100059.333 |
| `_log` | 1.000 | 0.077 ms | 0.077 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 7.000 | 13.209 ms | 100059.333 | 7 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `url` | 1.000 | 7.626 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.403 ms | 57983.333 |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 | 0.049 ms | 50.000 |
| real polyfill-body loads | by calls | `tslib` | 1.000 | 0.035 ms | 50.000 |
| real polyfill-body loads | by calls | `pdf-lib` | 1.000 | 0.034 ms | 50.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 7.626 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.403 ms | 57983.333 |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 | 0.049 ms | 50.000 |
| real polyfill-body loads | by time | `tslib` | 1.000 | 0.035 ms | 50.000 |
| real polyfill-body loads | by time | `pdf-lib` | 1.000 | 0.034 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.403 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 7.626 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 | 0.049 ms | 50.000 |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 | 0.035 ms | 50.000 |
| real polyfill-body loads | by response bytes | `pdf-lib` | 1.000 | 0.034 ms | 50.000 |
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

