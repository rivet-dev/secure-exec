# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T22:51:14.756Z
Description: Loads JSZip, creates an archive, and stages a starter file.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 67.864 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 6.059 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.059 ms
- Dominant bridge time: `_loadPolyfill` 27.428 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 27.428 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream` 1.000 calls/iteration, 6.854 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 6.854 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 385.430 ms; runtime create 102.795 ms; first pass 282.635 ms; sandbox 0.000 ms; checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Sandbox true cold start, warm snapshot disabled: total 329.272 ms; runtime create 4.666 ms; first pass 324.606 ms; sandbox 0.000 ms; checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Sandbox new-session replay, warm snapshot enabled: cold 176.772 ms; warm 67.864 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 277.093 ms; warm 76.983 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 291.762 ms; first checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1; replay checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Host same-session control: total 14.565 ms; first 14.507 ms; replay 0.055 ms; first checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1; replay checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 176.772 ms | 162.509 ms | 14.263 ms | 179 | 96.629 ms |
| 2 | 68.909 ms | 62.265 ms | 6.644 ms | 179 | 11.942 ms |
| 3 | 66.819 ms | 61.345 ms | 5.474 ms | 179 | 12.607 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 162.509 ms | 0.000 ms | 2.263 ms |
| 2 | 6.000 ms | 0.000 ms | 62.265 ms | 0.000 ms | 0.644 ms |
| 3 | 4.000 ms | 0.000 ms | 61.345 ms | 0.000 ms | 1.474 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 27.428 ms | 1.613 ms | 233610.000 |
| `_bridgeDispatch` | 161.000 | 12.901 ms | 0.080 ms | 176998.667 |
| `_log` | 1.000 | 0.064 ms | 0.064 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 17.000 | 27.428 ms | 233610.000 | 17 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.854 ms | 82604.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 6.710 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.240 ms | 57983.333 |
| real polyfill-body loads | by calls | `util` | 1.000 | 4.593 ms | 27772.000 |
| real polyfill-body loads | by calls | `buffer` | 1.000 | 2.053 ms | 16810.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.854 ms | 82604.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 6.710 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.240 ms | 57983.333 |
| real polyfill-body loads | by time | `util` | 1.000 | 4.593 ms | 27772.000 |
| real polyfill-body loads | by time | `buffer` | 1.000 | 2.053 ms | 16810.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.854 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.240 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 6.710 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 4.593 ms | 27772.000 |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 | 2.053 ms | 16810.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 179.000 | 410655.667 | 402242.667 |
| `recv:BridgeCall` | 179.000 | 31584.000 | 20352.000 |
| `send:Execute` | 1.000 | 14302.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

