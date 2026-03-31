# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T22:51:05.703Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 174.310 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 7.675 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 2.675 ms
- Dominant bridge time: `_bridgeDispatch` 53.398 ms/iteration across 506.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 552106.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 11.535 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `url` 1.000 calls/iteration, 5.774 ms/iteration, 41826.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.582 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 652213.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 254.172 ms; runtime create 98.721 ms; first pass 155.451 ms; sandbox 0.000 ms; checks `pdfDocumentType`=function, `pageCount`=0, `standardFontName`=Helvetica
- Sandbox true cold start, warm snapshot disabled: total 262.140 ms; runtime create 4.956 ms; first pass 257.184 ms; sandbox 0.000 ms; checks `pdfDocumentType`=function, `pageCount`=0, `standardFontName`=Helvetica
- Sandbox new-session replay, warm snapshot enabled: cold 267.280 ms; warm 174.310 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 457.529 ms; warm 108.619 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 234.997 ms; first checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0; replay checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0
- Host same-session control: total 52.675 ms; first 52.518 ms; replay 0.154 ms; first checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0; replay checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 267.280 ms | 250.936 ms | 16.344 ms | 514 | 99.956 ms |
| 2 | 233.829 ms | 223.658 ms | 10.171 ms | 514 | 65.612 ms |
| 3 | 114.790 ms | 109.612 ms | 5.178 ms | 514 | 29.462 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 250.936 ms | 0.000 ms | 3.344 ms |
| 2 | 6.000 ms | 0.000 ms | 223.658 ms | 0.000 ms | 4.171 ms |
| 3 | 4.000 ms | 0.000 ms | 109.612 ms | 0.000 ms | 1.178 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 506.000 | 53.398 ms | 0.106 ms | 552106.667 |
| `_loadPolyfill` | 7.000 | 11.535 ms | 1.648 ms | 100059.333 |
| `_log` | 1.000 | 0.078 ms | 0.078 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 7.000 | 11.535 ms | 100059.333 | 7 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.774 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.582 ms | 57983.333 |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 | 0.053 ms | 50.000 |
| real polyfill-body loads | by calls | `pdf-lib` | 1.000 | 0.044 ms | 50.000 |
| real polyfill-body loads | by calls | `tslib` | 1.000 | 0.029 ms | 50.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.774 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.582 ms | 57983.333 |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 | 0.053 ms | 50.000 |
| real polyfill-body loads | by time | `pdf-lib` | 1.000 | 0.044 ms | 50.000 |
| real polyfill-body loads | by time | `tslib` | 1.000 | 0.029 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.582 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.774 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 | 0.053 ms | 50.000 |
| real polyfill-body loads | by response bytes | `pdf-lib` | 1.000 | 0.044 ms | 50.000 |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 | 0.029 ms | 50.000 |
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

Baseline scenario timestamp: 2026-03-31T22:34:41.441Z

- Warm wall: 113.751 -> 174.310 ms (+60.559 ms (+53.24%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.317 -> 7.675 ms (+1.358 ms (+21.50%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.318 -> 2.675 ms (+1.357 ms (+102.96%))
- Bridge time/iteration: 41.401 -> 65.010 ms (+23.609 ms (+57.02%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.996 -> 11.535 ms (+0.539 ms (+4.90%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.689 -> 5.582 ms (-0.107 ms (-1.88%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.176 -> 5.774 ms (+0.598 ms (+11.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.027 -> 0.053 ms (+0.026 ms (+96.30%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.015 -> 0.029 ms (+0.014 ms (+93.33%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.176 -> 5.774 ms (+0.598 ms (+11.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.689 -> 5.582 ms (-0.107 ms (-1.88%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.027 -> 0.053 ms (+0.026 ms (+96.30%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.015 -> 0.029 ms (+0.014 ms (+93.33%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.689 -> 5.582 ms (-0.107 ms (-1.88%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.176 -> 5.774 ms (+0.598 ms (+11.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.027 -> 0.053 ms (+0.026 ms (+96.30%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.015 -> 0.029 ms (+0.014 ms (+93.33%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 30.329 | 53.398 | +23.069 |
| Method time | `_loadPolyfill` | 10.996 | 11.535 | +0.539 |
| Method time | `_log` | 0.076 | 0.078 | +0.002 |

