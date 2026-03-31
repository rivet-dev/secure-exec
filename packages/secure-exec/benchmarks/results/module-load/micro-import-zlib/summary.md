# Microbench Import zlib

Scenario: `micro-import-zlib`
Kind: `import`
Generated: 2026-03-31T23:33:06.363Z
Description: Requires the hot Pi builtin `zlib` once to isolate compression bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 32.294 ms
- Bridge calls/iteration: 5.000
- Warm fixed session overhead: 5.720 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.220 ms
- Warm wall stability: median 32.294 ms; min/max 31.813 ms / 32.774 ms; stddev 0.481 ms; range 0.961 ms
- Warm execute stability: median 26.573 ms; min/max 26.473 ms / 26.673 ms; stddev 0.100 ms; range 0.200 ms
- Host runtime resources: peak RSS 210.910 MiB; peak heap 47.966 MiB; heap limit usage 1.119%; CPU user/system/total 0.484 s / 0.105 s / 0.589 s
- Dominant bridge time: `_loadPolyfill` 22.151 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 257607.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 22.151 ms/iteration, 257607.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `zlib` 1.000 calls/iteration, 10.412 ms/iteration, 157798.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `zlib` 1.000 calls/iteration, 10.412 ms/iteration, 157798.000 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 263.059 ms; runtime create 98.781 ms; first pass 164.278 ms; sandbox 0.000 ms; checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function
- Sandbox true cold start, warm snapshot disabled: total 207.618 ms; runtime create 4.547 ms; first pass 203.071 ms; sandbox 0.000 ms; checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 109.091 ms; warm 32.294 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 201.114 ms; warm 32.909 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 152.556 ms; first checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function; replay checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function
- Host same-session control: total 1.378 ms; first 1.357 ms; replay 0.018 ms; first checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function; replay checks `importTarget`=zlib, `moduleType`=object, `gzipSyncType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 109.091 ms | 94.397 ms | 14.694 ms | 5 | 64.956 ms |
| 2 | 32.774 ms | 26.673 ms | 6.101 ms | 5 | 1.069 ms |
| 3 | 31.813 ms | 26.473 ms | 5.340 ms | 5 | 0.949 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 1.000 ms | 94.397 ms | 0.000 ms | 1.694 ms |
| 2 | 5.000 ms | 0.000 ms | 26.673 ms | 0.000 ms | 1.101 ms |
| 3 | 4.000 ms | 0.000 ms | 26.473 ms | 0.000 ms | 1.340 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 31.813 ms | 32.294 ms | 32.294 ms | 32.774 ms | 0.481 ms | 0.961 ms |
| Warm execute | 2 | 26.473 ms | 26.573 ms | 26.573 ms | 26.673 ms | 0.100 ms | 0.200 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 210.910 MiB |
| Peak heap used | 47.966 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.119% |
| CPU user | 0.484 s |
| CPU system | 0.105 s |
| CPU total | 0.589 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 22.151 ms | 7.384 ms | 257607.333 |
| `_bridgeDispatch` | 1.000 | 0.090 ms | 0.090 ms | 70.000 |
| `_log` | 1.000 | 0.083 ms | 0.083 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 22.151 ms | 257607.333 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 10.412 ms | 157798.000 |
| real polyfill-body loads | by calls | `url` | 1.000 | 6.250 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.489 ms | 57983.333 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 10.412 ms | 157798.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 6.250 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.489 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 10.412 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.489 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 6.250 ms | 41826.000 |
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

Baseline scenario timestamp: 2026-03-31T23:09:26.350Z

- Warm wall: 31.642 -> 32.294 ms (+0.652 ms (+2.06%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.740 -> 5.720 ms (-0.020 ms (-0.35%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.740 -> 1.220 ms (+0.480 ms (+64.86%))
- Bridge time/iteration: 20.410 -> 22.325 ms (+1.915 ms (+9.38%))
- BridgeResponse encoded bytes/iteration: 257724.333 -> 257724.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 31.642 -> 32.294 ms (+0.652 ms (+2.06%))
- Warm wall stddev: 0.698 -> 0.481 ms (-0.217 ms (-31.09%))
- Warm execute median: 25.902 -> 26.573 ms (+0.671 ms (+2.59%))
- Warm execute stddev: 0.255 -> 0.100 ms (-0.155 ms (-60.78%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 20.224 -> 22.151 ms (+1.927 ms (+9.53%)); response bytes 257607.333 -> 257607.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.758 -> 10.412 ms (+1.654 ms (+18.89%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.947 -> 5.489 ms (-0.458 ms (-7.70%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.519 -> 6.250 ms (+0.731 ms (+13.24%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.758 -> 10.412 ms (+1.654 ms (+18.89%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.519 -> 6.250 ms (+0.731 ms (+13.24%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.947 -> 5.489 ms (-0.458 ms (-7.70%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.758 -> 10.412 ms (+1.654 ms (+18.89%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.947 -> 5.489 ms (-0.458 ms (-7.70%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.519 -> 6.250 ms (+0.731 ms (+13.24%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 20.224 | 22.151 | +1.927 |
| Method time | `_log` | 0.096 | 0.083 | -0.013 |

