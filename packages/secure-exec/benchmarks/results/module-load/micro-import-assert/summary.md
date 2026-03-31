# Microbench Import assert

Scenario: `micro-import-assert`
Kind: `import`
Generated: 2026-03-31T23:33:09.644Z
Description: Requires the hot Pi builtin `assert` once to isolate assertion/bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 30.436 ms
- Bridge calls/iteration: 5.000
- Warm fixed session overhead: 5.758 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.258 ms
- Warm wall stability: median 30.436 ms; min/max 28.069 ms / 32.803 ms; stddev 2.367 ms; range 4.734 ms
- Warm execute stability: median 24.678 ms; min/max 22.247 ms / 27.109 ms; stddev 2.431 ms; range 4.862 ms
- Host runtime resources: peak RSS 204.359 MiB; peak heap 47.397 MiB; heap limit usage 1.105%; CPU user/system/total 0.475 s / 0.114 s / 0.589 s
- Dominant bridge time: `_loadPolyfill` 27.128 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 156675.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 27.128 ms/iteration, 156675.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `assert` 1.000 calls/iteration, 14.316 ms/iteration, 56865.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.601 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 231.651 ms; runtime create 104.972 ms; first pass 126.679 ms; sandbox 0.000 ms; checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function
- Sandbox true cold start, warm snapshot disabled: total 185.936 ms; runtime create 5.661 ms; first pass 180.275 ms; sandbox 0.000 ms; checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 129.956 ms; warm 30.436 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 207.455 ms; warm 27.191 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 121.352 ms; first checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function; replay checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function
- Host same-session control: total 1.981 ms; first 1.940 ms; replay 0.038 ms; first checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function; replay checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 129.956 ms | 115.269 ms | 14.687 ms | 5 | 80.212 ms |
| 2 | 28.069 ms | 22.247 ms | 5.822 ms | 5 | 0.797 ms |
| 3 | 32.803 ms | 27.109 ms | 5.694 ms | 5 | 1.037 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 115.269 ms | 1.000 ms | 1.687 ms |
| 2 | 5.000 ms | 0.000 ms | 22.247 ms | 1.000 ms | -0.178 ms |
| 3 | 5.000 ms | 0.000 ms | 27.109 ms | 0.000 ms | 0.694 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 28.069 ms | 30.436 ms | 30.436 ms | 32.803 ms | 2.367 ms | 4.734 ms |
| Warm execute | 2 | 22.247 ms | 24.678 ms | 24.678 ms | 27.109 ms | 2.431 ms | 4.862 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 204.359 MiB |
| Peak heap used | 47.397 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.105% |
| CPU user | 0.475 s |
| CPU system | 0.114 s |
| CPU total | 0.589 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 27.128 ms | 9.043 ms | 156675.000 |
| `_bridgeDispatch` | 1.000 | 0.115 ms | 0.115 ms | 70.000 |
| `_log` | 1.000 | 0.105 ms | 0.105 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 27.128 ms | 156675.000 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `assert` | 1.000 | 14.316 ms | 56865.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 7.212 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.601 ms | 57983.333 |
| real polyfill-body loads | by time | `assert` | 1.000 | 14.316 ms | 56865.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 7.212 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.601 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.601 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 14.316 ms | 56865.667 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 7.212 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 5.000 | 156792.000 | 156557.000 |
| `send:Execute` | 1.000 | 14168.000 | 0.000 |
| `recv:BridgeCall` | 5.000 | 490.000 | 192.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:29.298Z

- Warm wall: 28.986 -> 30.436 ms (+1.450 ms (+5.00%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.188 -> 5.758 ms (-0.430 ms (-6.95%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.688 -> 0.258 ms (-0.430 ms (-62.50%))
- Bridge time/iteration: 17.742 -> 27.349 ms (+9.607 ms (+54.15%))
- BridgeResponse encoded bytes/iteration: 156792.000 -> 156792.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 28.986 -> 30.436 ms (+1.450 ms (+5.00%))
- Warm wall stddev: 1.307 -> 2.367 ms (+1.060 ms (+81.10%))
- Warm execute median: 22.797 -> 24.678 ms (+1.881 ms (+8.25%))
- Warm execute stddev: 1.460 -> 2.431 ms (+0.971 ms (+66.51%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.547 -> 27.128 ms (+9.581 ms (+54.60%)); response bytes 156675.000 -> 156675.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.245 -> 5.601 ms (+0.356 ms (+6.79%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.492 -> 14.316 ms (+6.824 ms (+91.08%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.810 -> 7.212 ms (+2.402 ms (+49.94%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.492 -> 14.316 ms (+6.824 ms (+91.08%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.810 -> 7.212 ms (+2.402 ms (+49.94%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.245 -> 5.601 ms (+0.356 ms (+6.79%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.245 -> 5.601 ms (+0.356 ms (+6.79%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.492 -> 14.316 ms (+6.824 ms (+91.08%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.810 -> 7.212 ms (+2.402 ms (+49.94%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 17.547 | 27.128 | +9.581 |
| Method time | `_bridgeDispatch` | 0.095 | 0.115 | +0.020 |
| Method time | `_log` | 0.100 | 0.105 | +0.005 |

