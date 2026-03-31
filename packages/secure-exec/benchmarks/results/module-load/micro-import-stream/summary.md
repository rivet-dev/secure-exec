# Microbench Import stream

Scenario: `micro-import-stream`
Kind: `import`
Generated: 2026-03-31T23:32:56.221Z
Description: Requires the hot Pi builtin `stream` once to isolate single-import bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 29.101 ms
- Bridge calls/iteration: 5.000
- Warm fixed session overhead: 6.048 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.548 ms
- Warm wall stability: median 29.101 ms; min/max 29.017 ms / 29.184 ms; stddev 0.084 ms; range 0.167 ms
- Warm execute stability: median 23.053 ms; min/max 22.927 ms / 23.178 ms; stddev 0.126 ms; range 0.251 ms
- Host runtime resources: peak RSS 207.027 MiB; peak heap 47.555 MiB; heap limit usage 1.109%; CPU user/system/total 0.495 s / 0.099 s / 0.594 s
- Dominant bridge time: `_loadPolyfill` 33.939 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 182414.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 33.939 ms/iteration, 182414.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream` 1.000 calls/iteration, 18.300 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 18.300 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 194.175 ms; runtime create 97.859 ms; first pass 96.316 ms; sandbox 0.000 ms; checks `importTarget`=stream, `moduleType`=function, `readableType`=function
- Sandbox true cold start, warm snapshot disabled: total 205.434 ms; runtime create 4.492 ms; first pass 200.942 ms; sandbox 0.000 ms; checks `importTarget`=stream, `moduleType`=function, `readableType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 153.947 ms; warm 29.101 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 195.878 ms; warm 28.489 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 115.896 ms; first checks `importTarget`=stream, `moduleType`=function, `readableType`=function; replay checks `importTarget`=stream, `moduleType`=function, `readableType`=function
- Host same-session control: total 0.831 ms; first 0.809 ms; replay 0.016 ms; first checks `importTarget`=stream, `moduleType`=function, `readableType`=function; replay checks `importTarget`=stream, `moduleType`=function, `readableType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 153.947 ms | 138.534 ms | 15.413 ms | 5 | 100.706 ms |
| 2 | 29.184 ms | 23.178 ms | 6.006 ms | 5 | 0.798 ms |
| 3 | 29.017 ms | 22.927 ms | 6.090 ms | 5 | 0.902 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 11.000 ms | 1.000 ms | 138.534 ms | 1.000 ms | 2.413 ms |
| 2 | 5.000 ms | 0.000 ms | 23.178 ms | 0.000 ms | 1.006 ms |
| 3 | 5.000 ms | 0.000 ms | 22.927 ms | 1.000 ms | 0.090 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 29.017 ms | 29.101 ms | 29.101 ms | 29.184 ms | 0.084 ms | 0.167 ms |
| Warm execute | 2 | 22.927 ms | 23.053 ms | 23.053 ms | 23.178 ms | 0.126 ms | 0.251 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 207.027 MiB |
| Peak heap used | 47.555 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.109% |
| CPU user | 0.495 s |
| CPU system | 0.099 s |
| CPU total | 0.594 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 33.939 ms | 11.313 ms | 182414.000 |
| `_bridgeDispatch` | 1.000 | 0.115 ms | 0.115 ms | 70.000 |
| `_log` | 1.000 | 0.081 ms | 0.081 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 33.939 ms | 182414.000 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream` | 1.000 | 18.300 ms | 82604.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 9.813 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.827 ms | 57983.333 |
| real polyfill-body loads | by time | `stream` | 1.000 | 18.300 ms | 82604.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 9.813 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.827 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 18.300 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.827 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 9.813 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 5.000 | 182531.000 | 182296.000 |
| `send:Execute` | 1.000 | 14162.000 | 0.000 |
| `recv:BridgeCall` | 5.000 | 487.000 | 189.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:16.966Z

- Warm wall: 28.566 -> 29.101 ms (+0.535 ms (+1.87%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.982 -> 6.048 ms (+0.066 ms (+1.10%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.482 -> 0.548 ms (+0.066 ms (+13.69%))
- Bridge time/iteration: 18.063 -> 34.135 ms (+16.072 ms (+88.98%))
- BridgeResponse encoded bytes/iteration: 182531.000 -> 182531.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 28.566 -> 29.101 ms (+0.535 ms (+1.87%))
- Warm wall stddev: 0.788 -> 0.084 ms (-0.704 ms (-89.34%))
- Warm execute median: 22.584 -> 23.053 ms (+0.469 ms (+2.08%))
- Warm execute stddev: 0.117 -> 0.126 ms (+0.009 ms (+7.69%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.868 -> 33.939 ms (+16.071 ms (+89.94%)); response bytes 182414.000 -> 182414.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.128 -> 18.300 ms (+11.172 ms (+156.73%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.563 -> 5.827 ms (+0.264 ms (+4.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.177 -> 9.813 ms (+4.636 ms (+89.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.128 -> 18.300 ms (+11.172 ms (+156.73%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.177 -> 9.813 ms (+4.636 ms (+89.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.563 -> 5.827 ms (+0.264 ms (+4.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.128 -> 18.300 ms (+11.172 ms (+156.73%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.563 -> 5.827 ms (+0.264 ms (+4.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.177 -> 9.813 ms (+4.636 ms (+89.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 17.868 | 33.939 | +16.071 |
| Method time | `_bridgeDispatch` | 0.098 | 0.115 | +0.017 |
| Method time | `_log` | 0.097 | 0.081 | -0.016 |

