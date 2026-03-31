# Microbench Import crypto

Scenario: `micro-import-crypto`
Kind: `import`
Generated: 2026-03-31T23:33:03.091Z
Description: Requires the hot Pi builtin `crypto` once to isolate crypto bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 48.968 ms
- Bridge calls/iteration: 8.000
- Warm fixed session overhead: 5.611 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.611 ms
- Warm wall stability: median 48.968 ms; min/max 48.759 ms / 49.178 ms; stddev 0.209 ms; range 0.419 ms
- Warm execute stability: median 43.357 ms; min/max 43.280 ms / 43.434 ms; stddev 0.077 ms; range 0.154 ms
- Host runtime resources: peak RSS 213.660 MiB; peak heap 47.978 MiB; heap limit usage 1.119%; CPU user/system/total 0.550 s / 0.097 s / 0.647 s
- Dominant bridge time: `_loadPolyfill` 61.396 ms/iteration across 6.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 512625.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 6.000 calls/iteration, 61.396 ms/iteration, 512625.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 28.645 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 28.645 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 512742.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 313.269 ms; runtime create 102.215 ms; first pass 211.054 ms; sandbox 0.000 ms; checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function
- Sandbox true cold start, warm snapshot disabled: total 320.412 ms; runtime create 4.592 ms; first pass 315.820 ms; sandbox 0.000 ms; checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 258.239 ms; warm 48.968 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 310.995 ms; warm 49.742 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 225.651 ms; first checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function; replay checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function
- Host same-session control: total 0.071 ms; first 0.054 ms; replay 0.011 ms; first checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function; replay checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 258.239 ms | 242.896 ms | 15.343 ms | 8 | 180.612 ms |
| 2 | 49.178 ms | 43.434 ms | 5.744 ms | 8 | 1.778 ms |
| 3 | 48.759 ms | 43.280 ms | 5.479 ms | 8 | 2.463 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 242.896 ms | 0.000 ms | 3.343 ms |
| 2 | 4.000 ms | 0.000 ms | 43.434 ms | 0.000 ms | 1.744 ms |
| 3 | 4.000 ms | 0.000 ms | 43.280 ms | 0.000 ms | 1.479 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 48.759 ms | 48.968 ms | 48.968 ms | 49.178 ms | 0.209 ms | 0.419 ms |
| Warm execute | 2 | 43.280 ms | 43.357 ms | 43.357 ms | 43.434 ms | 0.077 ms | 0.154 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 213.660 MiB |
| Peak heap used | 47.978 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.119% |
| CPU user | 0.550 s |
| CPU system | 0.097 s |
| CPU total | 0.647 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 6.000 | 61.396 ms | 10.233 ms | 512625.667 |
| `_bridgeDispatch` | 1.000 | 0.127 ms | 0.127 ms | 70.000 |
| `_log` | 1.000 | 0.095 ms | 0.095 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 6.000 | 61.396 ms | 512625.667 | 6 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 28.645 ms | 300368.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 13.762 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 6.952 ms | 57983.333 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.321 ms | 82604.667 |
| real polyfill-body loads | by calls | `util` | 1.000 | 5.010 ms | 27772.000 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 28.645 ms | 300368.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 13.762 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 6.952 ms | 57983.333 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.321 ms | 82604.667 |
| real polyfill-body loads | by time | `util` | 1.000 | 5.010 ms | 27772.000 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 28.645 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.321 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 6.952 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 13.762 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 5.010 ms | 27772.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 8.000 | 512742.667 | 512366.667 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:Execute` | 1.000 | 14166.000 | 0.000 |
| `recv:BridgeCall` | 8.000 | 726.000 | 245.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:23.309Z

- Warm wall: 48.858 -> 48.968 ms (+0.110 ms (+0.23%))
- Bridge calls/iteration: 8.000 -> 8.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.345 -> 5.611 ms (-0.734 ms (-11.57%))
- Warm Create->InjectGlobals: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.345 -> 1.611 ms (+0.266 ms (+19.78%))
- Bridge time/iteration: 38.784 -> 61.618 ms (+22.834 ms (+58.88%))
- BridgeResponse encoded bytes/iteration: 512742.667 -> 512742.667 bytes (0.000 bytes (0.00%))
- Warm wall median: 48.858 -> 48.968 ms (+0.110 ms (+0.23%))
- Warm wall stddev: 0.852 -> 0.209 ms (-0.643 ms (-75.47%))
- Warm execute median: 42.514 -> 43.357 ms (+0.843 ms (+1.98%))
- Warm execute stddev: 0.304 -> 0.077 ms (-0.227 ms (-74.67%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 6.000 -> 6.000 calls (0.000 calls (0.00%)); time 38.490 -> 61.396 ms (+22.906 ms (+59.51%)); response bytes 512625.667 -> 512625.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.430 -> 28.645 ms (+13.215 ms (+85.64%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.356 -> 6.321 ms (-1.035 ms (-14.07%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.375 -> 6.952 ms (+1.577 ms (+29.34%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.789 -> 13.762 ms (+8.973 ms (+187.37%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.872 -> 5.010 ms (+0.138 ms (+2.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.430 -> 28.645 ms (+13.215 ms (+85.64%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.789 -> 13.762 ms (+8.973 ms (+187.37%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.375 -> 6.952 ms (+1.577 ms (+29.34%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.356 -> 6.321 ms (-1.035 ms (-14.07%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.872 -> 5.010 ms (+0.138 ms (+2.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.430 -> 28.645 ms (+13.215 ms (+85.64%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.356 -> 6.321 ms (-1.035 ms (-14.07%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.375 -> 6.952 ms (+1.577 ms (+29.34%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.789 -> 13.762 ms (+8.973 ms (+187.37%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.872 -> 5.010 ms (+0.138 ms (+2.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 38.490 | 61.396 | +22.906 |
| Method time | `_log` | 0.150 | 0.095 | -0.055 |
| Method time | `_bridgeDispatch` | 0.144 | 0.127 | -0.017 |

