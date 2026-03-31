# Microbench Import @borewit/text-codec

Scenario: `micro-import-text-codec`
Kind: `import`
Generated: 2026-03-31T23:33:15.872Z
Description: Dynamically imports the resolved `@borewit/text-codec` entry file to isolate projected package-file loading from the Pi startup path.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 26.810 ms
- Bridge calls/iteration: 7.000
- Warm fixed session overhead: 6.086 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.586 ms
- Warm wall stability: median 26.810 ms; min/max 26.595 ms / 27.025 ms; stddev 0.215 ms; range 0.430 ms
- Warm execute stability: median 20.724 ms; min/max 20.282 ms / 21.166 ms; stddev 0.442 ms; range 0.884 ms
- Host runtime resources: peak RSS 217.957 MiB; peak heap 47.128 MiB; heap limit usage 1.099%; CPU user/system/total 0.503 s / 0.114 s / 0.617 s
- Dominant bridge time: `_bridgeDispatch` 10.970 ms/iteration across 4.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 2.000 calls/iteration, 10.694 ms/iteration, 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.806 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.806 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 221.184 ms; runtime create 100.968 ms; first pass 120.216 ms; sandbox 0.000 ms; checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function
- Sandbox true cold start, warm snapshot disabled: total 199.697 ms; runtime create 4.949 ms; first pass 194.748 ms; sandbox 0.000 ms; checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 97.944 ms; warm 26.810 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 189.998 ms; warm 26.273 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 106.641 ms; first checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function; replay checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function
- Host same-session control: total 3.020 ms; first 2.930 ms; replay 0.087 ms; first checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function; replay checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 97.944 ms | 83.366 ms | 14.578 ms | 7 | 60.219 ms |
| 2 | 27.025 ms | 21.166 ms | 5.859 ms | 7 | 2.565 ms |
| 3 | 26.595 ms | 20.282 ms | 6.313 ms | 7 | 2.341 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 83.366 ms | 1.000 ms | 0.578 ms |
| 2 | 5.000 ms | 0.000 ms | 21.166 ms | 0.000 ms | 0.859 ms |
| 3 | 6.000 ms | 0.000 ms | 20.282 ms | 0.000 ms | 0.313 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 26.595 ms | 26.810 ms | 26.810 ms | 27.025 ms | 0.215 ms | 0.430 ms |
| Warm execute | 2 | 20.282 ms | 20.724 ms | 20.724 ms | 21.166 ms | 0.442 ms | 0.884 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 217.957 MiB |
| Peak heap used | 47.128 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.099% |
| CPU user | 0.503 s |
| CPU system | 0.114 s |
| CPU total | 0.617 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 4.000 | 10.970 ms | 2.742 ms | 3076.000 |
| `_loadPolyfill` | 2.000 | 10.694 ms | 5.347 ms | 99809.333 |
| `_log` | 1.000 | 0.044 ms | 0.044 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 2.000 | 10.694 ms | 99809.333 | 2 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.806 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.888 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.806 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.888 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.806 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.888 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 7.000 | 102932.333 | 102603.333 |
| `send:Execute` | 1.000 | 14356.000 | 0.000 |
| `recv:BridgeCall` | 7.000 | 1125.000 | 699.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:35.142Z

- Warm wall: 27.478 -> 26.810 ms (-0.668 ms (-2.43%))
- Bridge calls/iteration: 7.000 -> 7.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.239 -> 6.086 ms (-0.153 ms (-2.45%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.239 -> 0.586 ms (-0.653 ms (-52.70%))
- Bridge time/iteration: 22.070 -> 21.708 ms (-0.362 ms (-1.64%))
- BridgeResponse encoded bytes/iteration: 102932.333 -> 102932.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 27.478 -> 26.810 ms (-0.668 ms (-2.43%))
- Warm wall stddev: 2.700 -> 0.215 ms (-2.485 ms (-92.04%))
- Warm execute median: 21.239 -> 20.724 ms (-0.515 ms (-2.42%))
- Warm execute stddev: 1.567 -> 0.442 ms (-1.125 ms (-71.79%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.299 -> 10.694 ms (+0.395 ms (+3.83%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.422 -> 5.806 ms (+0.384 ms (+7.08%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 4.888 ms (+0.010 ms (+0.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.422 -> 5.806 ms (+0.384 ms (+7.08%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 4.888 ms (+0.010 ms (+0.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.422 -> 5.806 ms (+0.384 ms (+7.08%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 4.888 ms (+0.010 ms (+0.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 11.719 | 10.970 | -0.749 |
| Method time | `_loadPolyfill` | 10.299 | 10.694 | +0.395 |
| Method time | `_log` | 0.052 | 0.044 | -0.008 |

