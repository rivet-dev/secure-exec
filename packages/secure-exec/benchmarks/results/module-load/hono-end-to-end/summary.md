# Hono End-to-End

Scenario: `hono-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:33:22.305Z
Description: Loads Hono, builds an app, serves a request, and reads the response.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 35.627 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.762 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.262 ms
- Warm wall stability: median 35.627 ms; min/max 35.143 ms / 36.110 ms; stddev 0.483 ms; range 0.967 ms
- Warm execute stability: median 29.864 ms; min/max 29.181 ms / 30.547 ms; stddev 0.683 ms; range 1.366 ms
- Host runtime resources: peak RSS 209.820 MiB; peak heap 47.159 MiB; heap limit usage 1.100%; CPU user/system/total 0.555 s / 0.132 s / 0.686 s
- Dominant bridge time: `_loadPolyfill` 11.972 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 11.972 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `url` 1.000 calls/iteration, 6.110 ms/iteration, 41826.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.808 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 212.903 ms; runtime create 99.720 ms; first pass 113.183 ms; sandbox 0.000 ms; checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Sandbox true cold start, warm snapshot disabled: total 192.096 ms; runtime create 4.734 ms; first pass 187.362 ms; sandbox 0.000 ms; checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Sandbox new-session replay, warm snapshot enabled: cold 88.580 ms; warm 35.627 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 176.230 ms; warm 35.008 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 96.190 ms; first checks `status`=200, `body`={"ok":true,"framework":"hono"}; replay checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Host same-session control: total 28.385 ms; first 28.018 ms; replay 0.364 ms; first checks `status`=200, `body`={"ok":true,"framework":"hono"}; replay checks `status`=200, `body`={"ok":true,"framework":"hono"}

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 88.580 ms | 73.781 ms | 14.799 ms | 59 | 40.981 ms |
| 2 | 35.143 ms | 29.181 ms | 5.962 ms | 59 | 3.755 ms |
| 3 | 36.110 ms | 30.547 ms | 5.563 ms | 59 | 3.999 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 73.781 ms | 0.000 ms | 2.799 ms |
| 2 | 5.000 ms | 0.000 ms | 29.181 ms | 0.000 ms | 0.962 ms |
| 3 | 4.000 ms | 0.000 ms | 30.547 ms | 0.000 ms | 1.563 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 35.143 ms | 35.627 ms | 35.627 ms | 36.110 ms | 0.483 ms | 0.967 ms |
| Warm execute | 2 | 29.181 ms | 29.864 ms | 29.864 ms | 30.547 ms | 0.683 ms | 1.366 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 209.820 MiB |
| Peak heap used | 47.159 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.100% |
| CPU user | 0.555 s |
| CPU system | 0.132 s |
| CPU total | 0.686 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 11.972 ms | 3.991 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 4.231 ms | 0.077 ms | 40508.667 |
| `_log` | 1.000 | 0.042 ms | 0.042 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 11.972 ms | 99859.333 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `url` | 1.000 | 6.110 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.808 ms | 57983.333 |
| real polyfill-body loads | by calls | `hono` | 1.000 | 0.054 ms | 50.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 6.110 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.808 ms | 57983.333 |
| real polyfill-body loads | by time | `hono` | 1.000 | 0.054 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.808 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 6.110 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `hono` | 1.000 | 0.054 ms | 50.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 140415.000 | 137642.000 |
| `send:Execute` | 1.000 | 14298.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10752.000 | 7052.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:41.090Z

- Warm wall: 38.255 -> 35.627 ms (-2.628 ms (-6.87%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.488 -> 5.762 ms (+0.274 ms (+4.99%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.487 -> 1.262 ms (+0.775 ms (+159.14%))
- Bridge time/iteration: 14.893 -> 16.245 ms (+1.352 ms (+9.08%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 38.255 -> 35.627 ms (-2.628 ms (-6.87%))
- Warm wall stddev: 2.135 -> 0.483 ms (-1.652 ms (-77.38%))
- Warm execute median: 32.767 -> 29.864 ms (-2.903 ms (-8.86%))
- Warm execute stddev: 2.190 -> 0.683 ms (-1.507 ms (-68.81%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.259 -> 11.972 ms (+1.713 ms (+16.70%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.394 -> 5.808 ms (+0.414 ms (+7.67%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.813 -> 6.110 ms (+1.297 ms (+26.95%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.052 -> 0.054 ms (+0.002 ms (+3.85%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.813 -> 6.110 ms (+1.297 ms (+26.95%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.394 -> 5.808 ms (+0.414 ms (+7.67%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.052 -> 0.054 ms (+0.002 ms (+3.85%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.394 -> 5.808 ms (+0.414 ms (+7.67%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.813 -> 6.110 ms (+1.297 ms (+26.95%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.052 -> 0.054 ms (+0.002 ms (+3.85%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.259 | 11.972 | +1.713 |
| Method time | `_bridgeDispatch` | 4.592 | 4.231 | -0.361 |

