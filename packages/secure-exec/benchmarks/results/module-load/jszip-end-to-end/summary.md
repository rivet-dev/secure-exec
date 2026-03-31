# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T22:12:24.678Z
Description: Builds a representative nested archive and serializes it to a zip payload.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 93.152 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 6.330 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.830 ms
- Dominant bridge time: `_loadPolyfill` 50.391 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 50.391 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream` 1.000 calls/iteration, 15.201 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 15.201 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 171.130 ms; runtime create 100.886 ms; first pass 70.244 ms; sandbox 0.000 ms; checks `fileCount`=16, `archiveBytes`=5207, `compression`=DEFLATE
- Sandbox true cold start, warm snapshot disabled: total 166.038 ms; runtime create 2.925 ms; first pass 163.113 ms; sandbox 0.000 ms; checks `fileCount`=16, `archiveBytes`=5207, `compression`=DEFLATE
- Sandbox new-session replay, warm snapshot enabled: cold 330.993 ms; warm 93.152 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 168.600 ms; warm 69.210 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 69.920 ms; first checks `fileCount`=16, `manifestPresent`=true; replay checks `fileCount`=16, `manifestPresent`=true
- Host same-session control: total 17.935 ms; first 17.352 ms; replay 0.580 ms; first checks `fileCount`=16, `manifestPresent`=true; replay checks `fileCount`=16, `manifestPresent`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 330.993 ms | 315.935 ms | 15.058 ms | 182 | 182.448 ms |
| 2 | 102.718 ms | 96.000 ms | 6.718 ms | 182 | 17.619 ms |
| 3 | 83.586 ms | 77.644 ms | 5.942 ms | 182 | 12.628 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 315.935 ms | 0.000 ms | 3.058 ms |
| 2 | 5.000 ms | 0.000 ms | 96.000 ms | 0.000 ms | 1.718 ms |
| 3 | 5.000 ms | 0.000 ms | 77.644 ms | 1.000 ms | -0.058 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 50.391 ms | 2.964 ms | 233610.000 |
| `_bridgeDispatch` | 164.000 | 20.386 ms | 0.124 ms | 177197.667 |
| `_log` | 1.000 | 0.121 ms | 0.121 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 17.000 | 50.391 ms | 233610.000 | 17 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream` | 1.000 | 15.201 ms | 82604.667 |
| real polyfill-body loads | by calls | `util` | 1.000 | 12.718 ms | 27772.000 |
| real polyfill-body loads | by calls | `url` | 1.000 | 8.550 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.660 ms | 57983.333 |
| real polyfill-body loads | by calls | `buffer` | 1.000 | 3.240 ms | 16810.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 15.201 ms | 82604.667 |
| real polyfill-body loads | by time | `util` | 1.000 | 12.718 ms | 27772.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 8.550 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.660 ms | 57983.333 |
| real polyfill-body loads | by time | `buffer` | 1.000 | 3.240 ms | 16810.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 15.201 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.660 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 8.550 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 12.718 ms | 27772.000 |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 | 3.240 ms | 16810.667 |
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

Baseline scenario timestamp: 2026-03-31T22:12:24.678Z

- Warm wall: 93.152 -> 93.152 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.330 -> 6.330 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.830 -> 0.830 ms (0.000 ms (0.00%))
- Bridge time/iteration: 70.898 -> 70.898 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 50.391 -> 50.391 ms (0.000 ms (0.00%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.201 -> 15.201 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.660 -> 5.660 ms (0.000 ms (0.00%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.550 -> 8.550 ms (0.000 ms (0.00%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.718 -> 12.718 ms (0.000 ms (0.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 3.240 -> 3.240 ms (0.000 ms (0.00%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.201 -> 15.201 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.718 -> 12.718 ms (0.000 ms (0.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.550 -> 8.550 ms (0.000 ms (0.00%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.660 -> 5.660 ms (0.000 ms (0.00%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 3.240 -> 3.240 ms (0.000 ms (0.00%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.201 -> 15.201 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.660 -> 5.660 ms (0.000 ms (0.00%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.550 -> 8.550 ms (0.000 ms (0.00%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.718 -> 12.718 ms (0.000 ms (0.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 3.240 -> 3.240 ms (0.000 ms (0.00%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

