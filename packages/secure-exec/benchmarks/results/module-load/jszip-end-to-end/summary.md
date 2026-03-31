# JSZip End-to-End

Scenario: `jszip-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:33:40.380Z
Description: Builds a representative nested archive and serializes it to a zip payload.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 78.596 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 6.018 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.518 ms
- Warm wall stability: median 78.596 ms; min/max 78.200 ms / 78.991 ms; stddev 0.395 ms; range 0.791 ms
- Warm execute stability: median 72.577 ms; min/max 72.274 ms / 72.880 ms; stddev 0.303 ms; range 0.606 ms
- Host runtime resources: peak RSS 215.832 MiB; peak heap 45.896 MiB; heap limit usage 1.070%; CPU user/system/total 0.707 s / 0.114 s / 0.821 s
- Dominant bridge time: `_loadPolyfill` 70.852 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 70.852 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream` 1.000 calls/iteration, 24.097 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 24.097 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 470.696 ms; runtime create 106.335 ms; first pass 364.361 ms; sandbox 0.000 ms; checks `fileCount`=16, `archiveBytes`=5207, `compression`=DEFLATE
- Sandbox true cold start, warm snapshot disabled: total 284.619 ms; runtime create 4.692 ms; first pass 279.927 ms; sandbox 0.000 ms; checks `fileCount`=16, `archiveBytes`=5207, `compression`=DEFLATE
- Sandbox new-session replay, warm snapshot enabled: cold 409.074 ms; warm 78.596 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 309.640 ms; warm 84.287 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 270.333 ms; first checks `fileCount`=16, `manifestPresent`=true; replay checks `fileCount`=16, `manifestPresent`=true
- Host same-session control: total 20.766 ms; first 20.217 ms; replay 0.546 ms; first checks `fileCount`=16, `manifestPresent`=true; replay checks `fileCount`=16, `manifestPresent`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 409.074 ms | 394.230 ms | 14.844 ms | 182 | 247.614 ms |
| 2 | 78.991 ms | 72.274 ms | 6.717 ms | 182 | 12.576 ms |
| 3 | 78.200 ms | 72.880 ms | 5.320 ms | 182 | 11.150 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 394.230 ms | 1.000 ms | 1.844 ms |
| 2 | 5.000 ms | 0.000 ms | 72.274 ms | 0.000 ms | 1.717 ms |
| 3 | 4.000 ms | 0.000 ms | 72.880 ms | 0.000 ms | 1.320 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 78.200 ms | 78.596 ms | 78.596 ms | 78.991 ms | 0.395 ms | 0.791 ms |
| Warm execute | 2 | 72.274 ms | 72.577 ms | 72.577 ms | 72.880 ms | 0.303 ms | 0.606 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 215.832 MiB |
| Peak heap used | 45.896 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.070% |
| CPU user | 0.707 s |
| CPU system | 0.114 s |
| CPU total | 0.821 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 70.852 ms | 4.168 ms | 233610.000 |
| `_bridgeDispatch` | 164.000 | 19.493 ms | 0.119 ms | 177197.667 |
| `_log` | 1.000 | 0.102 ms | 0.102 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 17.000 | 70.852 ms | 233610.000 | 17 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream` | 1.000 | 24.097 ms | 82604.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 15.285 ms | 41826.000 |
| real polyfill-body loads | by calls | `util` | 1.000 | 15.164 ms | 27772.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 8.221 ms | 57983.333 |
| real polyfill-body loads | by calls | `buffer` | 1.000 | 3.843 ms | 16810.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 24.097 ms | 82604.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 15.285 ms | 41826.000 |
| real polyfill-body loads | by time | `util` | 1.000 | 15.164 ms | 27772.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 8.221 ms | 57983.333 |
| real polyfill-body loads | by time | `buffer` | 1.000 | 3.843 ms | 16810.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 24.097 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 8.221 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 15.285 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 15.164 ms | 27772.000 |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 | 3.843 ms | 16810.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 182.000 | 410854.667 | 402300.667 |
| `recv:BridgeCall` | 182.000 | 31859.000 | 20438.000 |
| `send:Execute` | 1.000 | 15833.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:StreamEvent` | 1.000 | 58.000 | 13.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:56.375Z

- Warm wall: 78.700 -> 78.596 ms (-0.104 ms (-0.13%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.538 -> 6.018 ms (-0.520 ms (-7.95%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.038 -> 1.518 ms (+0.480 ms (+46.24%))
- Bridge time/iteration: 40.086 -> 90.447 ms (+50.361 ms (+125.63%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- Warm wall median: 78.700 -> 78.596 ms (-0.104 ms (-0.13%))
- Warm wall stddev: 3.253 -> 0.395 ms (-2.858 ms (-87.86%))
- Warm execute median: 72.162 -> 72.577 ms (+0.415 ms (+0.57%))
- Warm execute stddev: 3.575 -> 0.303 ms (-3.272 ms (-91.52%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 27.796 -> 70.852 ms (+43.056 ms (+154.90%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.436 -> 24.097 ms (+16.661 ms (+224.06%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.215 -> 8.221 ms (+2.006 ms (+32.28%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.223 -> 15.285 ms (+10.062 ms (+192.65%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.991 -> 15.164 ms (+10.173 ms (+203.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.650 -> 3.843 ms (+2.193 ms (+132.91%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.436 -> 24.097 ms (+16.661 ms (+224.06%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.991 -> 15.164 ms (+10.173 ms (+203.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.223 -> 15.285 ms (+10.062 ms (+192.65%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.650 -> 3.843 ms (+2.193 ms (+132.91%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.215 -> 8.221 ms (+2.006 ms (+32.28%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.436 -> 24.097 ms (+16.661 ms (+224.06%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.215 -> 8.221 ms (+2.006 ms (+32.28%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.223 -> 15.285 ms (+10.062 ms (+192.65%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.991 -> 15.164 ms (+10.173 ms (+203.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.650 -> 3.843 ms (+2.193 ms (+132.91%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 27.796 | 70.852 | +43.056 |
| Method time | `_bridgeDispatch` | 12.166 | 19.493 | +7.327 |
| Method time | `_log` | 0.124 | 0.102 | -0.022 |

