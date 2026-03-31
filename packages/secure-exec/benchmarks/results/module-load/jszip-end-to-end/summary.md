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

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 50.391 ms | 233610.000 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

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

Baseline scenario timestamp: 2026-03-31T21:00:44.283Z

- Warm wall: 79.804 -> 93.152 ms (+13.348 ms (+16.73%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.676 -> 6.330 ms (-0.346 ms (-5.18%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.175 -> 0.830 ms (-0.345 ms (-29.36%))
- Bridge time/iteration: 46.383 -> 70.898 ms (+24.515 ms (+52.85%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 33.071 -> 50.391 ms (+17.320 ms (+52.37%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 33.071 | 50.391 | +17.320 |
| Method time | `_bridgeDispatch` | 13.212 | 20.386 | +7.174 |
| Method time | `_log` | 0.101 | 0.121 | +0.020 |

