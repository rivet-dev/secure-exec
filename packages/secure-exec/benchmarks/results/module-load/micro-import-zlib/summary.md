# Microbench Import zlib

Scenario: `micro-import-zlib`
Kind: `import`
Generated: 2026-03-31T23:09:26.350Z
Description: Requires the hot Pi builtin `zlib` once to isolate compression bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 31.642 ms
- Bridge calls/iteration: 5.000
- Warm fixed session overhead: 5.740 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.740 ms
- Dominant bridge time: `_loadPolyfill` 20.224 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 257607.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 20.224 ms/iteration, 257607.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `zlib` 1.000 calls/iteration, 8.758 ms/iteration, 157798.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `zlib` 1.000 calls/iteration, 8.758 ms/iteration, 157798.000 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 198.341 ms; runtime create 98.009 ms; first pass 100.332 ms; sandbox 0.000 ms; checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function
- Sandbox true cold start, warm snapshot disabled: total 203.165 ms; runtime create 5.763 ms; first pass 197.402 ms; sandbox 0.000 ms; checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 106.154 ms; warm 31.642 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 191.894 ms; warm 32.885 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 101.591 ms; first checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function; replay checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function
- Host same-session control: total 1.308 ms; first 1.286 ms; replay 0.019 ms; first checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function; replay checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 106.154 ms | 91.132 ms | 15.022 ms | 5 | 59.322 ms |
| 2 | 32.340 ms | 26.157 ms | 6.183 ms | 5 | 0.976 ms |
| 3 | 30.944 ms | 25.647 ms | 5.297 ms | 5 | 0.932 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 91.132 ms | 1.000 ms | 1.022 ms |
| 2 | 5.000 ms | 0.000 ms | 26.157 ms | 0.000 ms | 1.183 ms |
| 3 | 5.000 ms | 0.000 ms | 25.647 ms | 0.000 ms | 0.297 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 20.224 ms | 6.741 ms | 257607.333 |
| `_log` | 1.000 | 0.096 ms | 0.096 ms | 47.000 |
| `_bridgeDispatch` | 1.000 | 0.090 ms | 0.090 ms | 70.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 20.224 ms | 257607.333 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 8.758 ms | 157798.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.947 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.519 ms | 41826.000 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 8.758 ms | 157798.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.947 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.519 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 8.758 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.947 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.519 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 5.000 | 257724.333 | 257489.333 |
| `send:Execute` | 1.000 | 14158.000 | 0.000 |
| `recv:BridgeCall` | 5.000 | 481.000 | 183.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:06:45.864Z

- Warm wall: 32.641 -> 31.642 ms (-0.999 ms (-3.06%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.498 -> 5.740 ms (+0.242 ms (+4.40%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.498 -> 0.740 ms (+0.242 ms (+48.59%))
- Bridge time/iteration: 18.680 -> 20.410 ms (+1.730 ms (+9.26%))
- BridgeResponse encoded bytes/iteration: 257724.333 -> 257724.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 18.481 -> 20.224 ms (+1.743 ms (+9.43%)); response bytes 257607.333 -> 257607.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.362 -> 8.758 ms (+0.396 ms (+4.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.347 -> 5.947 ms (+0.600 ms (+11.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.773 -> 5.519 ms (+0.746 ms (+15.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.773 -> 5.519 ms (+0.746 ms (+15.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.347 -> 5.947 ms (+0.600 ms (+11.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.362 -> 8.758 ms (+0.396 ms (+4.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.362 -> 8.758 ms (+0.396 ms (+4.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.347 -> 5.947 ms (+0.600 ms (+11.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.773 -> 5.519 ms (+0.746 ms (+15.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 18.481 | 20.224 | +1.743 |
| Method time | `_log` | 0.104 | 0.096 | -0.008 |
| Method time | `_bridgeDispatch` | 0.095 | 0.090 | -0.005 |

