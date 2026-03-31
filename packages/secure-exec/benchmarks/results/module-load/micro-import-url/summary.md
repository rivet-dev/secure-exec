# Microbench Import url

Scenario: `micro-import-url`
Kind: `import`
Generated: 2026-03-31T23:09:32.115Z
Description: Requires the hot Pi builtin `url` once to isolate URL/bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 22.880 ms
- Bridge calls/iteration: 4.000
- Warm fixed session overhead: 5.468 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.468 ms
- Dominant bridge time: `_loadPolyfill` 10.195 ms/iteration across 2.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 2.000 calls/iteration, 10.195 ms/iteration, 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.337 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.337 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 164.915 ms; runtime create 100.950 ms; first pass 63.965 ms; sandbox 0.000 ms; checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function
- Sandbox true cold start, warm snapshot disabled: total 161.300 ms; runtime create 4.697 ms; first pass 156.603 ms; sandbox 0.000 ms; checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 63.817 ms; warm 22.880 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 154.432 ms; warm 24.753 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 65.091 ms; first checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function; replay checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function
- Host same-session control: total 0.056 ms; first 0.044 ms; replay 0.010 ms; first checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function; replay checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 63.817 ms | 48.977 ms | 14.840 ms | 4 | 30.056 ms |
| 2 | 22.313 ms | 16.782 ms | 5.531 ms | 4 | 0.511 ms |
| 3 | 23.446 ms | 18.041 ms | 5.405 ms | 4 | 0.535 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 48.977 ms | 1.000 ms | 1.840 ms |
| 2 | 5.000 ms | 0.000 ms | 16.782 ms | 1.000 ms | -0.469 ms |
| 3 | 4.000 ms | 0.000 ms | 18.041 ms | 0.000 ms | 1.405 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2.000 | 10.195 ms | 5.098 ms | 99809.333 |
| `_bridgeDispatch` | 1.000 | 0.098 ms | 0.098 ms | 70.000 |
| `_log` | 1.000 | 0.075 ms | 0.075 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 2.000 | 10.195 ms | 99809.333 | 2 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.337 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.858 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.337 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.858 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.337 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.858 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 4.000 | 99926.333 | 99738.333 |
| `send:Execute` | 1.000 | 14150.000 | 0.000 |
| `recv:BridgeCall` | 4.000 | 403.000 | 166.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:06:51.704Z

- Warm wall: 23.607 -> 22.880 ms (-0.727 ms (-3.08%))
- Bridge calls/iteration: 4.000 -> 4.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.081 -> 5.468 ms (-0.613 ms (-10.08%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.081 -> 0.468 ms (-0.613 ms (-56.71%))
- Bridge time/iteration: 11.655 -> 10.367 ms (-1.288 ms (-11.05%))
- BridgeResponse encoded bytes/iteration: 99926.333 -> 99926.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 11.472 -> 10.195 ms (-1.277 ms (-11.13%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.204 -> 5.337 ms (-0.867 ms (-13.97%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.268 -> 4.858 ms (-0.410 ms (-7.78%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.204 -> 5.337 ms (-0.867 ms (-13.97%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.268 -> 4.858 ms (-0.410 ms (-7.78%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.204 -> 5.337 ms (-0.867 ms (-13.97%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.268 -> 4.858 ms (-0.410 ms (-7.78%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 11.472 | 10.195 | -1.277 |
| Method time | `_log` | 0.089 | 0.075 | -0.014 |
| Method time | `_bridgeDispatch` | 0.094 | 0.098 | +0.004 |

