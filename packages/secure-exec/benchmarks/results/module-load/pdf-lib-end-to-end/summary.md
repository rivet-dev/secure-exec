# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:09:49.239Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 179.726 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 6.691 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 1.190 ms
- Dominant bridge time: `_bridgeDispatch` 33.189 ms/iteration across 521.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 553101.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 10.908 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.699 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.699 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 653208.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 333.953 ms; runtime create 104.987 ms; first pass 228.966 ms; sandbox 0.000 ms; checks `pageCount`=5, `fieldCount`=50, `savedSize`=41186
- Sandbox true cold start, warm snapshot disabled: total 330.646 ms; runtime create 5.149 ms; first pass 325.497 ms; sandbox 0.000 ms; checks `pageCount`=5, `fieldCount`=50, `savedSize`=41186
- Sandbox new-session replay, warm snapshot enabled: cold 258.629 ms; warm 179.726 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 318.763 ms; warm 163.219 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 197.930 ms; first checks `pageCount`=5, `fieldCount`=50; replay checks `pageCount`=5, `fieldCount`=50
- Host same-session control: total 77.433 ms; first 69.170 ms; replay 8.260 ms; first checks `pageCount`=5, `fieldCount`=50; replay checks `pageCount`=5, `fieldCount`=50

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 258.629 ms | 243.367 ms | 15.262 ms | 529 | 71.202 ms |
| 2 | 185.530 ms | 178.202 ms | 7.328 ms | 529 | 32.889 ms |
| 3 | 173.923 ms | 167.870 ms | 6.053 ms | 529 | 28.379 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 243.367 ms | 1.000 ms | 1.262 ms |
| 2 | 6.000 ms | 0.000 ms | 178.202 ms | 1.000 ms | 0.328 ms |
| 3 | 4.000 ms | 0.000 ms | 167.870 ms | 0.000 ms | 2.053 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 521.000 | 33.189 ms | 0.064 ms | 553101.667 |
| `_loadPolyfill` | 7.000 | 10.908 ms | 1.558 ms | 100059.333 |
| `_log` | 1.000 | 0.060 ms | 0.060 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 7.000 | 10.908 ms | 100059.333 | 7 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.699 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.086 ms | 41826.000 |
| real polyfill-body loads | by calls | `pdf-lib` | 1.000 | 0.032 ms | 50.000 |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 | 0.026 ms | 50.000 |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 | 0.024 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.699 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.086 ms | 41826.000 |
| real polyfill-body loads | by time | `pdf-lib` | 1.000 | 0.032 ms | 50.000 |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 | 0.026 ms | 50.000 |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 | 0.024 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.699 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.086 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `pdf-lib` | 1.000 | 0.032 ms | 50.000 |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 | 0.026 ms | 50.000 |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 | 0.024 ms | 50.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 529.000 | 653208.000 | 628345.000 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `recv:BridgeCall` | 529.000 | 102565.000 | 69263.000 |
| `send:Execute` | 1.000 | 15042.000 | 0.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T22:51:10.673Z

- Warm wall: 243.269 -> 179.726 ms (-63.543 ms (-26.12%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.503 -> 6.691 ms (-0.812 ms (-10.82%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 2.503 -> 1.190 ms (-1.313 ms (-52.46%))
- Bridge time/iteration: 60.261 -> 44.157 ms (-16.104 ms (-26.72%))
- BridgeResponse encoded bytes/iteration: 653208.000 -> 653208.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 13.209 -> 10.908 ms (-2.301 ms (-17.42%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.403 -> 5.699 ms (+0.296 ms (+5.48%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.626 -> 5.086 ms (-2.540 ms (-33.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.049 -> 0.026 ms (-0.023 ms (-46.94%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.031 -> 0.017 ms (-0.014 ms (-45.16%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.035 -> 0.023 ms (-0.012 ms (-34.29%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.626 -> 5.086 ms (-2.540 ms (-33.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.403 -> 5.699 ms (+0.296 ms (+5.48%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.049 -> 0.026 ms (-0.023 ms (-46.94%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.031 -> 0.017 ms (-0.014 ms (-45.16%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.035 -> 0.023 ms (-0.012 ms (-34.29%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.403 -> 5.699 ms (+0.296 ms (+5.48%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.626 -> 5.086 ms (-2.540 ms (-33.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.049 -> 0.026 ms (-0.023 ms (-46.94%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.031 -> 0.017 ms (-0.014 ms (-45.16%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.035 -> 0.023 ms (-0.012 ms (-34.29%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 46.974 | 33.189 | -13.785 |
| Method time | `_loadPolyfill` | 13.209 | 10.908 | -2.301 |
| Method time | `_log` | 0.077 | 0.060 | -0.017 |

