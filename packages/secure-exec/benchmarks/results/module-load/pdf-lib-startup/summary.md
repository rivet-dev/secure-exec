# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T22:12:17.517Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 117.555 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 6.139 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.139 ms
- Dominant bridge time: `_bridgeDispatch` 52.767 ms/iteration across 506.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 552106.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 11.829 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 652213.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 291.115 ms; runtime create 98.471 ms; first pass 192.644 ms; sandbox 0.000 ms; checks `pdfDocumentType`=function, `pageCount`=0, `standardFontName`=Helvetica
- Sandbox true cold start, warm snapshot disabled: total 210.397 ms; runtime create 9.781 ms; first pass 200.616 ms; sandbox 0.000 ms; checks `pdfDocumentType`=function, `pageCount`=0, `standardFontName`=Helvetica
- Sandbox new-session replay, warm snapshot enabled: cold 357.511 ms; warm 117.555 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 231.015 ms; warm 230.905 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 199.569 ms; first checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0; replay checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0
- Host same-session control: total 50.239 ms; first 50.089 ms; replay 0.147 ms; first checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0; replay checks `pdfDocumentType`=function, `standardFontName`=Helvetica, `pageCount`=0

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 357.511 ms | 341.440 ms | 16.071 ms | 514 | 132.389 ms |
| 2 | 113.083 ms | 106.107 ms | 6.976 ms | 514 | 27.597 ms |
| 3 | 122.028 ms | 116.727 ms | 5.301 ms | 514 | 34.111 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 341.440 ms | 0.000 ms | 4.071 ms |
| 2 | 6.000 ms | 0.000 ms | 106.107 ms | 0.000 ms | 0.976 ms |
| 3 | 4.000 ms | 0.000 ms | 116.727 ms | 0.000 ms | 1.301 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 506.000 | 52.767 ms | 0.104 ms | 552106.667 |
| `_loadPolyfill` | 7.000 | 11.829 ms | 1.690 ms | 100059.333 |
| `_log` | 1.000 | 0.103 ms | 0.103 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 11.829 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

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

Baseline scenario timestamp: 2026-03-31T20:56:16.125Z

- Warm wall: 230.975 -> 117.555 ms (-113.420 ms (-49.10%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.713 -> 6.139 ms (-1.574 ms (-20.41%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.712 -> 1.139 ms (-0.573 ms (-33.47%))
- Bridge time/iteration: 75.494 -> 64.699 ms (-10.795 ms (-14.30%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 12.926 -> 11.829 ms (-1.097 ms (-8.49%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 62.437 | 52.767 | -9.670 |
| Method time | `_loadPolyfill` | 12.926 | 11.829 | -1.097 |
| Method time | `_log` | 0.131 | 0.103 | -0.028 |

