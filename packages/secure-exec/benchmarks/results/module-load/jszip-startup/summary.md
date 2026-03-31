# JSZip Startup

Scenario: `jszip-startup`
Kind: `startup`
Generated: 2026-03-31T23:33:35.939Z
Description: Loads JSZip, creates an archive, and stages a starter file.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 79.511 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 6.397 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.897 ms
- Warm wall stability: median 79.511 ms; min/max 77.657 ms / 81.366 ms; stddev 1.855 ms; range 3.709 ms
- Warm execute stability: median 73.114 ms; min/max 71.014 ms / 75.215 ms; stddev 2.101 ms; range 4.201 ms
- Host runtime resources: peak RSS 214.441 MiB; peak heap 45.646 MiB; heap limit usage 1.065%; CPU user/system/total 0.586 s / 0.175 s / 0.760 s
- Dominant bridge time: `_loadPolyfill` 45.911 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 45.911 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream` 1.000 calls/iteration, 16.926 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 16.926 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 286.904 ms; runtime create 100.969 ms; first pass 185.935 ms; sandbox 0.000 ms; checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Sandbox true cold start, warm snapshot disabled: total 349.490 ms; runtime create 4.851 ms; first pass 344.639 ms; sandbox 0.000 ms; checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Sandbox new-session replay, warm snapshot enabled: cold 263.178 ms; warm 79.511 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 391.867 ms; warm 88.078 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 327.663 ms; first checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1; replay checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Host same-session control: total 17.094 ms; first 17.039 ms; replay 0.053 ms; first checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1; replay checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 263.178 ms | 247.683 ms | 15.495 ms | 179 | 162.595 ms |
| 2 | 77.657 ms | 71.014 ms | 6.643 ms | 179 | 14.634 ms |
| 3 | 81.366 ms | 75.215 ms | 6.151 ms | 179 | 15.857 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 247.683 ms | 1.000 ms | 2.495 ms |
| 2 | 6.000 ms | 0.000 ms | 71.014 ms | 0.000 ms | 0.643 ms |
| 3 | 4.000 ms | 0.000 ms | 75.215 ms | 1.000 ms | 1.151 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 77.657 ms | 79.511 ms | 79.511 ms | 81.366 ms | 1.855 ms | 3.709 ms |
| Warm execute | 2 | 71.014 ms | 73.114 ms | 73.114 ms | 75.215 ms | 2.101 ms | 4.201 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 214.441 MiB |
| Peak heap used | 45.646 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.065% |
| CPU user | 0.586 s |
| CPU system | 0.175 s |
| CPU total | 0.760 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 45.911 ms | 2.701 ms | 233610.000 |
| `_bridgeDispatch` | 161.000 | 18.390 ms | 0.114 ms | 176998.667 |
| `_log` | 1.000 | 0.061 ms | 0.061 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 17.000 | 45.911 ms | 233610.000 | 17 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream` | 1.000 | 16.926 ms | 82604.667 |
| real polyfill-body loads | by calls | `util` | 1.000 | 10.878 ms | 27772.000 |
| real polyfill-body loads | by calls | `url` | 1.000 | 7.230 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 6.059 ms | 57983.333 |
| real polyfill-body loads | by calls | `buffer` | 1.000 | 2.008 ms | 16810.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 16.926 ms | 82604.667 |
| real polyfill-body loads | by time | `util` | 1.000 | 10.878 ms | 27772.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 7.230 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 6.059 ms | 57983.333 |
| real polyfill-body loads | by time | `buffer` | 1.000 | 2.008 ms | 16810.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 16.926 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 6.059 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 7.230 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 10.878 ms | 27772.000 |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 | 2.008 ms | 16810.667 |
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

Baseline scenario timestamp: 2026-03-31T23:09:52.750Z

- Warm wall: 68.439 -> 79.511 ms (+11.072 ms (+16.18%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.226 -> 6.397 ms (+0.171 ms (+2.75%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.226 -> 0.897 ms (-0.329 ms (-26.84%))
- Bridge time/iteration: 38.055 -> 64.362 ms (+26.307 ms (+69.13%))
- BridgeResponse encoded bytes/iteration: 410655.667 -> 410655.667 bytes (0.000 bytes (0.00%))
- Warm wall median: 68.439 -> 79.511 ms (+11.072 ms (+16.18%))
- Warm wall stddev: 2.085 -> 1.855 ms (-0.230 ms (-11.03%))
- Warm execute median: 62.213 -> 73.114 ms (+10.901 ms (+17.52%))
- Warm execute stddev: 1.430 -> 2.101 ms (+0.671 ms (+46.92%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 25.936 -> 45.911 ms (+19.975 ms (+77.02%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.692 -> 16.926 ms (+10.234 ms (+152.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.880 -> 6.059 ms (+0.179 ms (+3.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.924 -> 7.230 ms (+2.306 ms (+46.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 10.878 ms (+6.000 ms (+123.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.525 -> 2.008 ms (+0.483 ms (+31.67%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.692 -> 16.926 ms (+10.234 ms (+152.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 10.878 ms (+6.000 ms (+123.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.924 -> 7.230 ms (+2.306 ms (+46.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `internal/mime` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.630 -> 1.555 ms (+0.925 ms (+146.82%)) | 2071.000 -> 2071.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.525 -> 2.008 ms (+0.483 ms (+31.67%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.692 -> 16.926 ms (+10.234 ms (+152.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.880 -> 6.059 ms (+0.179 ms (+3.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.924 -> 7.230 ms (+2.306 ms (+46.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 10.878 ms (+6.000 ms (+123.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.525 -> 2.008 ms (+0.483 ms (+31.67%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 25.936 | 45.911 | +19.975 |
| Method time | `_bridgeDispatch` | 12.045 | 18.390 | +6.345 |
| Method time | `_log` | 0.075 | 0.061 | -0.014 |

