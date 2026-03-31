# JSZip End-to-End

Scenario: `jszip-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:09:56.375Z
Description: Builds a representative nested archive and serializes it to a zip payload.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 78.700 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 6.538 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 1.038 ms
- Dominant bridge time: `_loadPolyfill` 27.796 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 27.796 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream` 1.000 calls/iteration, 7.436 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 7.436 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 274.945 ms; runtime create 101.971 ms; first pass 172.974 ms; sandbox 0.000 ms; checks `fileCount`=16, `archiveBytes`=5207, `compression`=DEFLATE
- Sandbox true cold start, warm snapshot disabled: total 266.910 ms; runtime create 4.535 ms; first pass 262.375 ms; sandbox 0.000 ms; checks `fileCount`=16, `archiveBytes`=5207, `compression`=DEFLATE
- Sandbox new-session replay, warm snapshot enabled: cold 184.555 ms; warm 78.700 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 264.044 ms; warm 71.707 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 156.507 ms; first checks `fileCount`=16, `manifestPresent`=true; replay checks `fileCount`=16, `manifestPresent`=true
- Host same-session control: total 15.490 ms; first 14.836 ms; replay 0.651 ms; first checks `fileCount`=16, `manifestPresent`=true; replay checks `fileCount`=16, `manifestPresent`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 184.555 ms | 168.896 ms | 15.659 ms | 182 | 98.762 ms |
| 2 | 75.447 ms | 68.587 ms | 6.860 ms | 182 | 10.422 ms |
| 3 | 81.953 ms | 75.736 ms | 6.217 ms | 182 | 11.073 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 168.896 ms | 0.000 ms | 3.659 ms |
| 2 | 6.000 ms | 0.000 ms | 68.587 ms | 1.000 ms | -0.140 ms |
| 3 | 4.000 ms | 0.000 ms | 75.736 ms | 0.000 ms | 2.217 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 27.796 ms | 1.635 ms | 233610.000 |
| `_bridgeDispatch` | 164.000 | 12.166 ms | 0.074 ms | 177197.667 |
| `_log` | 1.000 | 0.124 ms | 0.124 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 17.000 | 27.796 ms | 233610.000 | 17 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream` | 1.000 | 7.436 ms | 82604.667 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 6.215 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.223 ms | 41826.000 |
| real polyfill-body loads | by calls | `util` | 1.000 | 4.991 ms | 27772.000 |
| real polyfill-body loads | by calls | `buffer` | 1.000 | 1.650 ms | 16810.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 7.436 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 6.215 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.223 ms | 41826.000 |
| real polyfill-body loads | by time | `util` | 1.000 | 4.991 ms | 27772.000 |
| real polyfill-body loads | by time | `buffer` | 1.000 | 1.650 ms | 16810.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 7.436 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 6.215 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.223 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 4.991 ms | 27772.000 |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 | 1.650 ms | 16810.667 |
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

Baseline scenario timestamp: 2026-03-31T22:51:18.757Z

- Warm wall: 102.546 -> 78.700 ms (-23.846 ms (-23.25%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.208 -> 6.538 ms (+0.330 ms (+5.32%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.208 -> 1.038 ms (-0.170 ms (-14.07%))
- Bridge time/iteration: 49.514 -> 40.086 ms (-9.428 ms (-19.04%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 30.444 -> 27.796 ms (-2.648 ms (-8.70%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.982 -> 7.436 ms (+0.454 ms (+6.50%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.514 -> 6.215 ms (+0.701 ms (+12.71%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.954 -> 5.223 ms (-2.731 ms (-34.34%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.016 -> 4.991 ms (-0.025 ms (-0.50%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.033 -> 1.650 ms (-0.383 ms (-18.84%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.954 -> 5.223 ms (-2.731 ms (-34.34%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.514 -> 6.215 ms (+0.701 ms (+12.71%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `internal/mime` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.321 -> 0.778 ms (-0.543 ms (-41.10%)) | 2071.000 -> 2071.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.982 -> 7.436 ms (+0.454 ms (+6.50%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.033 -> 1.650 ms (-0.383 ms (-18.84%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.982 -> 7.436 ms (+0.454 ms (+6.50%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.514 -> 6.215 ms (+0.701 ms (+12.71%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.954 -> 5.223 ms (-2.731 ms (-34.34%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.016 -> 4.991 ms (-0.025 ms (-0.50%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.033 -> 1.650 ms (-0.383 ms (-18.84%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 18.944 | 12.166 | -6.778 |
| Method time | `_loadPolyfill` | 30.444 | 27.796 | -2.648 |
| Method time | `_log` | 0.126 | 0.124 | -0.002 |

