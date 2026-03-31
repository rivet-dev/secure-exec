# JSZip Startup

Scenario: `jszip-startup`
Kind: `startup`
Generated: 2026-03-31T23:09:52.750Z
Description: Loads JSZip, creates an archive, and stages a starter file.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 68.439 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 6.226 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.226 ms
- Dominant bridge time: `_loadPolyfill` 25.936 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 25.936 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream` 1.000 calls/iteration, 6.692 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 6.692 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 267.833 ms; runtime create 99.434 ms; first pass 168.399 ms; sandbox 0.000 ms; checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Sandbox true cold start, warm snapshot disabled: total 249.803 ms; runtime create 4.531 ms; first pass 245.272 ms; sandbox 0.000 ms; checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Sandbox new-session replay, warm snapshot enabled: cold 160.232 ms; warm 68.439 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 250.776 ms; warm 62.174 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 166.881 ms; first checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1; replay checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Host same-session control: total 13.737 ms; first 13.680 ms; replay 0.055 ms; first checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1; replay checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 160.232 ms | 145.747 ms | 14.485 ms | 179 | 89.583 ms |
| 2 | 70.524 ms | 63.643 ms | 6.881 ms | 179 | 13.462 ms |
| 3 | 66.354 ms | 60.783 ms | 5.571 ms | 179 | 11.121 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 145.747 ms | 0.000 ms | 2.485 ms |
| 2 | 6.000 ms | 0.000 ms | 63.643 ms | 0.000 ms | 0.881 ms |
| 3 | 4.000 ms | 0.000 ms | 60.783 ms | 0.000 ms | 1.571 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 25.936 ms | 1.526 ms | 233610.000 |
| `_bridgeDispatch` | 161.000 | 12.045 ms | 0.075 ms | 176998.667 |
| `_log` | 1.000 | 0.075 ms | 0.075 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 17.000 | 25.936 ms | 233610.000 | 17 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.692 ms | 82604.667 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.880 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.924 ms | 41826.000 |
| real polyfill-body loads | by calls | `util` | 1.000 | 4.878 ms | 27772.000 |
| real polyfill-body loads | by calls | `buffer` | 1.000 | 1.525 ms | 16810.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.692 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.880 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.924 ms | 41826.000 |
| real polyfill-body loads | by time | `util` | 1.000 | 4.878 ms | 27772.000 |
| real polyfill-body loads | by time | `buffer` | 1.000 | 1.525 ms | 16810.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.692 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.880 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.924 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 4.878 ms | 27772.000 |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 | 1.525 ms | 16810.667 |
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

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T22:51:14.756Z

- Warm wall: 67.864 -> 68.439 ms (+0.575 ms (+0.85%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.059 -> 6.226 ms (+0.167 ms (+2.76%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.059 -> 1.226 ms (+0.167 ms (+15.77%))
- Bridge time/iteration: 40.393 -> 38.055 ms (-2.338 ms (-5.79%))
- BridgeResponse encoded bytes/iteration: 410655.667 -> 410655.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 27.428 -> 25.936 ms (-1.492 ms (-5.44%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.854 -> 6.692 ms (-0.162 ms (-2.36%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.240 -> 5.880 ms (+0.640 ms (+12.21%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.710 -> 4.924 ms (-1.786 ms (-26.62%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.593 -> 4.878 ms (+0.285 ms (+6.21%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.053 -> 1.525 ms (-0.528 ms (-25.72%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.710 -> 4.924 ms (-1.786 ms (-26.62%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.240 -> 5.880 ms (+0.640 ms (+12.21%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.053 -> 1.525 ms (-0.528 ms (-25.72%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.593 -> 4.878 ms (+0.285 ms (+6.21%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `events` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.891 -> 1.146 ms (+0.255 ms (+28.62%)) | 4042.333 -> 4042.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.854 -> 6.692 ms (-0.162 ms (-2.36%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.240 -> 5.880 ms (+0.640 ms (+12.21%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.710 -> 4.924 ms (-1.786 ms (-26.62%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.593 -> 4.878 ms (+0.285 ms (+6.21%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.053 -> 1.525 ms (-0.528 ms (-25.72%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 27.428 | 25.936 | -1.492 |
| Method time | `_bridgeDispatch` | 12.901 | 12.045 | -0.856 |
| Method time | `_log` | 0.064 | 0.075 | +0.011 |

