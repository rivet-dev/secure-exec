# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T22:51:18.757Z
Description: Builds a representative nested archive and serializes it to a zip payload.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 102.546 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 6.208 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 1.208 ms
- Dominant bridge time: `_loadPolyfill` 30.444 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 30.444 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `url` 1.000 calls/iteration, 7.954 ms/iteration, 41826.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 6.982 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 309.893 ms; runtime create 100.328 ms; first pass 209.565 ms; sandbox 0.000 ms; checks `fileCount`=16, `archiveBytes`=5207, `compression`=DEFLATE
- Sandbox true cold start, warm snapshot disabled: total 298.387 ms; runtime create 5.772 ms; first pass 292.615 ms; sandbox 0.000 ms; checks `fileCount`=16, `archiveBytes`=5207, `compression`=DEFLATE
- Sandbox new-session replay, warm snapshot enabled: cold 225.989 ms; warm 102.546 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 342.704 ms; warm 71.052 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 212.014 ms; first checks `fileCount`=16, `manifestPresent`=true; replay checks `fileCount`=16, `manifestPresent`=true
- Host same-session control: total 14.626 ms; first 14.027 ms; replay 0.596 ms; first checks `fileCount`=16, `manifestPresent`=true; replay checks `fileCount`=16, `manifestPresent`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 225.989 ms | 210.033 ms | 15.956 ms | 182 | 113.386 ms |
| 2 | 122.044 ms | 114.913 ms | 7.131 ms | 182 | 22.618 ms |
| 3 | 83.048 ms | 77.763 ms | 5.285 ms | 182 | 12.538 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 210.033 ms | 0.000 ms | 2.956 ms |
| 2 | 5.000 ms | 0.000 ms | 114.913 ms | 1.000 ms | 1.131 ms |
| 3 | 4.000 ms | 0.000 ms | 77.763 ms | 0.000 ms | 1.285 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 30.444 ms | 1.791 ms | 233610.000 |
| `_bridgeDispatch` | 164.000 | 18.944 ms | 0.116 ms | 177197.667 |
| `_log` | 1.000 | 0.126 ms | 0.126 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 17.000 | 30.444 ms | 233610.000 | 17 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `url` | 1.000 | 7.954 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.982 ms | 82604.667 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.514 ms | 57983.333 |
| real polyfill-body loads | by calls | `util` | 1.000 | 5.016 ms | 27772.000 |
| real polyfill-body loads | by calls | `buffer` | 1.000 | 2.033 ms | 16810.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 7.954 ms | 41826.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.982 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.514 ms | 57983.333 |
| real polyfill-body loads | by time | `util` | 1.000 | 5.016 ms | 27772.000 |
| real polyfill-body loads | by time | `buffer` | 1.000 | 2.033 ms | 16810.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.982 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.514 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 7.954 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 5.016 ms | 27772.000 |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 | 2.033 ms | 16810.667 |
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

