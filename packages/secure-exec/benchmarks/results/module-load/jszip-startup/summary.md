# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T22:12:22.700Z
Description: Loads JSZip, creates an archive, and stages a starter file.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 111.213 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 6.728 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.728 ms
- Dominant bridge time: `_loadPolyfill` 37.737 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 37.737 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 191.478 ms; runtime create 117.749 ms; first pass 73.729 ms; sandbox 0.000 ms; checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Sandbox true cold start, warm snapshot disabled: total 154.390 ms; runtime create 7.171 ms; first pass 147.219 ms; sandbox 0.000 ms; checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Sandbox new-session replay, warm snapshot enabled: cold 214.879 ms; warm 111.213 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 150.242 ms; warm 78.558 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 58.075 ms; first checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1; replay checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1
- Host same-session control: total 16.059 ms; first 16.003 ms; replay 0.051 ms; first checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1; replay checks `jszipType`=function, `generateAsyncType`=function, `fileCount`=1

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 214.879 ms | 200.530 ms | 14.349 ms | 179 | 128.555 ms |
| 2 | 112.040 ms | 104.995 ms | 7.045 ms | 179 | 22.485 ms |
| 3 | 110.385 ms | 103.975 ms | 6.410 ms | 179 | 25.820 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 200.530 ms | 0.000 ms | 2.349 ms |
| 2 | 6.000 ms | 0.000 ms | 104.995 ms | 0.000 ms | 1.045 ms |
| 3 | 4.000 ms | 0.000 ms | 103.975 ms | 0.000 ms | 2.410 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 37.737 ms | 2.220 ms | 233610.000 |
| `_bridgeDispatch` | 161.000 | 21.145 ms | 0.131 ms | 176998.667 |
| `_log` | 1.000 | 0.071 ms | 0.071 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 37.737 ms | 233610.000 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

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

Baseline scenario timestamp: 2026-03-31T21:00:43.389Z

- Warm wall: 68.886 -> 111.213 ms (+42.327 ms (+61.45%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.290 -> 6.728 ms (+0.438 ms (+6.96%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.290 -> 1.728 ms (+0.438 ms (+33.95%))
- Bridge time/iteration: 52.825 -> 58.953 ms (+6.128 ms (+11.60%))
- BridgeResponse encoded bytes/iteration: 410655.667 -> 410655.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 37.582 -> 37.737 ms (+0.155 ms (+0.41%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 15.169 | 21.145 | +5.976 |
| Method time | `_loadPolyfill` | 37.582 | 37.737 | +0.155 |
| Method time | `_log` | 0.074 | 0.071 | -0.003 |

