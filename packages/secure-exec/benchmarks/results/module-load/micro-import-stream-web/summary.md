# Microbench Import stream/web

Scenario: `micro-import-stream-web`
Kind: `import`
Generated: 2026-03-31T23:32:59.249Z
Description: Requires the hot Pi builtin `stream/web` once to isolate web-stream bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 27.473 ms
- Bridge calls/iteration: 5.000
- Warm fixed session overhead: 5.537 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 1.037 ms
- Warm wall stability: median 27.473 ms; min/max 25.996 ms / 28.949 ms; stddev 1.477 ms; range 2.953 ms
- Warm execute stability: median 21.935 ms; min/max 20.813 ms / 23.058 ms; stddev 1.123 ms; range 2.245 ms
- Host runtime resources: peak RSS 209.426 MiB; peak heap 46.780 MiB; heap limit usage 1.091%; CPU user/system/total 0.476 s / 0.118 s / 0.594 s
- Dominant bridge time: `_loadPolyfill` 12.940 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 157792.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 12.940 ms/iteration, 157792.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `url` 1.000 calls/iteration, 6.661 ms/iteration, 41826.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 2.000 calls/iteration, 6.279 ms/iteration, 115966.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 188.098 ms; runtime create 99.358 ms; first pass 88.740 ms; sandbox 0.000 ms; checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function
- Sandbox true cold start, warm snapshot disabled: total 166.843 ms; runtime create 4.533 ms; first pass 162.310 ms; sandbox 0.000 ms; checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 76.759 ms; warm 27.473 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 159.299 ms; warm 25.599 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 73.870 ms; first checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function; replay checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function
- Host same-session control: total 2.310 ms; first 2.281 ms; replay 0.026 ms; first checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function; replay checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 76.759 ms | 60.745 ms | 16.014 ms | 5 | 37.160 ms |
| 2 | 28.949 ms | 23.058 ms | 5.891 ms | 5 | 1.287 ms |
| 3 | 25.996 ms | 20.813 ms | 5.183 ms | 5 | 0.879 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 60.745 ms | 0.000 ms | 4.014 ms |
| 2 | 4.000 ms | 0.000 ms | 23.058 ms | 1.000 ms | 0.891 ms |
| 3 | 4.000 ms | 0.000 ms | 20.813 ms | 0.000 ms | 1.183 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 25.996 ms | 27.473 ms | 27.473 ms | 28.949 ms | 1.477 ms | 2.953 ms |
| Warm execute | 2 | 20.813 ms | 21.935 ms | 21.935 ms | 23.058 ms | 1.123 ms | 2.245 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 209.426 MiB |
| Peak heap used | 46.780 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.091% |
| CPU user | 0.476 s |
| CPU system | 0.118 s |
| CPU total | 0.594 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 12.940 ms | 4.313 ms | 157792.667 |
| `_bridgeDispatch` | 1.000 | 0.088 ms | 0.088 ms | 70.000 |
| `_log` | 1.000 | 0.081 ms | 0.081 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 12.940 ms | 157792.667 | 2 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 6.279 ms | 115966.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 6.661 ms | 41826.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 6.661 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 6.279 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 6.279 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 6.661 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 5.000 | 157909.667 | 157674.667 |
| `send:Execute` | 1.000 | 14182.000 | 0.000 |
| `recv:BridgeCall` | 5.000 | 499.000 | 201.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:19.830Z

- Warm wall: 26.342 -> 27.473 ms (+1.131 ms (+4.29%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.653 -> 5.537 ms (-0.116 ms (-2.05%))
- Warm Create->InjectGlobals: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.653 -> 1.037 ms (+0.384 ms (+58.81%))
- Bridge time/iteration: 12.417 -> 13.109 ms (+0.692 ms (+5.57%))
- BridgeResponse encoded bytes/iteration: 157909.667 -> 157909.667 bytes (0.000 bytes (0.00%))
- Warm wall median: 26.342 -> 27.473 ms (+1.131 ms (+4.29%))
- Warm wall stddev: 1.184 -> 1.477 ms (+0.293 ms (+24.75%))
- Warm execute median: 20.689 -> 21.935 ms (+1.246 ms (+6.02%))
- Warm execute stddev: 0.750 -> 1.123 ms (+0.373 ms (+49.73%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 12.160 -> 12.940 ms (+0.780 ms (+6.41%)); response bytes 157792.667 -> 157792.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.260 -> 6.279 ms (+0.019 ms (+0.30%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.900 -> 6.661 ms (+0.761 ms (+12.90%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.900 -> 6.661 ms (+0.761 ms (+12.90%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.260 -> 6.279 ms (+0.019 ms (+0.30%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.260 -> 6.279 ms (+0.019 ms (+0.30%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.900 -> 6.661 ms (+0.761 ms (+12.90%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 12.160 | 12.940 | +0.780 |
| Method time | `_bridgeDispatch` | 0.138 | 0.088 | -0.050 |
| Method time | `_log` | 0.118 | 0.081 | -0.037 |

