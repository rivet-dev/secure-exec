# pdf-lib Startup

Scenario: `pdf-lib-startup`
Kind: `startup`
Generated: 2026-03-31T23:09:44.892Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 122.178 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 6.839 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 0.000 ms, residual 1.340 ms
- Dominant bridge time: `_bridgeDispatch` 34.338 ms/iteration across 506.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 552106.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 11.267 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.976 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.976 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 652213.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 275.410 ms; runtime create 100.705 ms; first pass 174.705 ms; sandbox 0.000 ms; checks `pdfDocumentType`=function, `pageCount`=0, `standardFontName`=Helvetica
- Sandbox true cold start, warm snapshot disabled: total 258.795 ms; runtime create 5.305 ms; first pass 253.490 ms; sandbox 0.000 ms; checks `pdfDocumentType`=function, `pageCount`=0, `standardFontName`=Helvetica
- Sandbox new-session replay, warm snapshot enabled: cold 190.180 ms; warm 122.178 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 255.036 ms; warm 101.367 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 163.561 ms; first checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0; replay checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0
- Host same-session control: total 50.031 ms; first 49.887 ms; replay 0.141 ms; first checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0; replay checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 190.180 ms | 175.218 ms | 14.962 ms | 514 | 74.853 ms |
| 2 | 125.858 ms | 119.146 ms | 6.712 ms | 514 | 32.302 ms |
| 3 | 118.498 ms | 111.531 ms | 6.967 ms | 514 | 29.929 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 1.000 ms | 175.218 ms | 0.000 ms | 1.962 ms |
| 2 | 6.000 ms | 0.000 ms | 119.146 ms | 0.000 ms | 0.712 ms |
| 3 | 4.000 ms | 1.000 ms | 111.531 ms | 0.000 ms | 1.967 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 506.000 | 34.338 ms | 0.068 ms | 552106.667 |
| `_loadPolyfill` | 7.000 | 11.267 ms | 1.610 ms | 100059.333 |
| `_log` | 1.000 | 0.090 ms | 0.090 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 7.000 | 11.267 ms | 100059.333 | 7 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.976 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.153 ms | 41826.000 |
| real polyfill-body loads | by calls | `pdf-lib` | 1.000 | 0.046 ms | 50.000 |
| real polyfill-body loads | by calls | `tslib` | 1.000 | 0.039 ms | 50.000 |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 | 0.022 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.976 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.153 ms | 41826.000 |
| real polyfill-body loads | by time | `pdf-lib` | 1.000 | 0.046 ms | 50.000 |
| real polyfill-body loads | by time | `tslib` | 1.000 | 0.039 ms | 50.000 |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 | 0.022 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.976 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.153 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `pdf-lib` | 1.000 | 0.046 ms | 50.000 |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 | 0.039 ms | 50.000 |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 | 0.022 ms | 50.000 |
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

Baseline scenario timestamp: 2026-03-31T22:51:05.703Z

- Warm wall: 174.310 -> 122.178 ms (-52.132 ms (-29.91%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.675 -> 6.839 ms (-0.836 ms (-10.89%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.675 -> 1.340 ms (-1.335 ms (-49.91%))
- Bridge time/iteration: 65.010 -> 45.695 ms (-19.315 ms (-29.71%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 11.535 -> 11.267 ms (-0.268 ms (-2.32%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.582 -> 5.976 ms (+0.394 ms (+7.06%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.774 -> 5.153 ms (-0.621 ms (-10.76%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.053 -> 0.022 ms (-0.031 ms (-58.49%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.016 ms (-0.013 ms (-44.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.039 ms (+0.010 ms (+34.48%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.774 -> 5.153 ms (-0.621 ms (-10.76%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.582 -> 5.976 ms (+0.394 ms (+7.06%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.053 -> 0.022 ms (-0.031 ms (-58.49%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.016 ms (-0.013 ms (-44.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.039 ms (+0.010 ms (+34.48%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.582 -> 5.976 ms (+0.394 ms (+7.06%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.774 -> 5.153 ms (-0.621 ms (-10.76%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.053 -> 0.022 ms (-0.031 ms (-58.49%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.016 ms (-0.013 ms (-44.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.039 ms (+0.010 ms (+34.48%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 53.398 | 34.338 | -19.060 |
| Method time | `_loadPolyfill` | 11.535 | 11.267 | -0.268 |
| Method time | `_log` | 0.078 | 0.090 | +0.012 |

