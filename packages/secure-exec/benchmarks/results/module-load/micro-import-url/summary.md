# Microbench Import url

Scenario: `micro-import-url`
Kind: `import`
Generated: 2026-03-31T23:33:12.678Z
Description: Requires the hot Pi builtin `url` once to isolate URL/bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 22.849 ms
- Bridge calls/iteration: 4.000
- Warm fixed session overhead: 5.572 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 1.000 ms, residual -0.427 ms
- Warm wall stability: median 22.849 ms; min/max 22.610 ms / 23.089 ms; stddev 0.239 ms; range 0.479 ms
- Warm execute stability: median 17.277 ms; min/max 16.864 ms / 17.690 ms; stddev 0.413 ms; range 0.826 ms
- Host runtime resources: peak RSS 205.195 MiB; peak heap 46.920 MiB; heap limit usage 1.094%; CPU user/system/total 0.529 s / 0.080 s / 0.609 s
- Dominant bridge time: `_loadPolyfill` 10.871 ms/iteration across 2.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 2.000 calls/iteration, 10.871 ms/iteration, 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.504 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.504 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 163.958 ms; runtime create 100.277 ms; first pass 63.681 ms; sandbox 0.000 ms; checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function
- Sandbox true cold start, warm snapshot disabled: total 167.576 ms; runtime create 4.714 ms; first pass 162.862 ms; sandbox 0.000 ms; checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 65.614 ms; warm 22.849 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 171.170 ms; warm 22.830 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 68.123 ms; first checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function; replay checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function
- Host same-session control: total 0.058 ms; first 0.045 ms; replay 0.010 ms; first checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function; replay checks `importTarget`=url, `moduleType`=object, `urlCtorType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 65.614 ms | 51.147 ms | 14.467 ms | 4 | 31.879 ms |
| 2 | 22.610 ms | 16.864 ms | 5.746 ms | 4 | 0.516 ms |
| 3 | 23.089 ms | 17.690 ms | 5.399 ms | 4 | 0.689 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 1.000 ms | 51.147 ms | 0.000 ms | 1.467 ms |
| 2 | 4.000 ms | 1.000 ms | 16.864 ms | 1.000 ms | -0.254 ms |
| 3 | 5.000 ms | 0.000 ms | 17.690 ms | 1.000 ms | -0.601 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 22.610 ms | 22.849 ms | 22.849 ms | 23.089 ms | 0.239 ms | 0.479 ms |
| Warm execute | 2 | 16.864 ms | 17.277 ms | 17.277 ms | 17.690 ms | 0.413 ms | 0.826 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 205.195 MiB |
| Peak heap used | 46.920 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.094% |
| CPU user | 0.529 s |
| CPU system | 0.080 s |
| CPU total | 0.609 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2.000 | 10.871 ms | 5.436 ms | 99809.333 |
| `_bridgeDispatch` | 1.000 | 0.083 ms | 0.083 ms | 70.000 |
| `_log` | 1.000 | 0.074 ms | 0.074 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 2.000 | 10.871 ms | 99809.333 | 2 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.504 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.367 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.504 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.367 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.504 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.367 ms | 41826.000 |
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

Baseline scenario timestamp: 2026-03-31T23:09:32.115Z

- Warm wall: 22.880 -> 22.849 ms (-0.031 ms (-0.14%))
- Bridge calls/iteration: 4.000 -> 4.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.468 -> 5.572 ms (+0.104 ms (+1.90%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 1.000 ms (+0.500 ms (+100.00%))
- Warm residual overhead: 0.468 -> -0.427 ms (-0.895 ms (-191.24%))
- Bridge time/iteration: 10.367 -> 11.028 ms (+0.661 ms (+6.38%))
- BridgeResponse encoded bytes/iteration: 99926.333 -> 99926.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 22.880 -> 22.849 ms (-0.031 ms (-0.14%))
- Warm wall stddev: 0.567 -> 0.239 ms (-0.328 ms (-57.85%))
- Warm execute median: 17.412 -> 17.277 ms (-0.135 ms (-0.78%))
- Warm execute stddev: 0.630 -> 0.413 ms (-0.217 ms (-34.44%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.195 -> 10.871 ms (+0.676 ms (+6.63%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.337 -> 5.504 ms (+0.167 ms (+3.13%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.858 -> 5.367 ms (+0.509 ms (+10.48%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.858 -> 5.367 ms (+0.509 ms (+10.48%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.337 -> 5.504 ms (+0.167 ms (+3.13%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.337 -> 5.504 ms (+0.167 ms (+3.13%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.858 -> 5.367 ms (+0.509 ms (+10.48%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.195 | 10.871 | +0.676 |
| Method time | `_bridgeDispatch` | 0.098 | 0.083 | -0.015 |
| Method time | `_log` | 0.075 | 0.074 | -0.001 |

