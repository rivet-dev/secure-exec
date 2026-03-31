# Hono Startup

Scenario: `hono-startup`
Kind: `startup`
Generated: 2026-03-31T23:33:18.974Z
Description: Loads Hono and constructs a minimal app.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 37.572 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.554 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.554 ms
- Warm wall stability: median 37.572 ms; min/max 37.413 ms / 37.732 ms; stddev 0.160 ms; range 0.319 ms
- Warm execute stability: median 32.018 ms; min/max 31.851 ms / 32.185 ms; stddev 0.167 ms; range 0.334 ms
- Host runtime resources: peak RSS 209.438 MiB; peak heap 49.030 MiB; heap limit usage 1.143%; CPU user/system/total 0.503 s / 0.105 s / 0.608 s
- Dominant bridge time: `_loadPolyfill` 10.746 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 10.746 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.709 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.709 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 207.562 ms; runtime create 100.494 ms; first pass 107.068 ms; sandbox 0.000 ms; checks `honoType`=function, `fetchType`=function
- Sandbox true cold start, warm snapshot disabled: total 180.133 ms; runtime create 4.735 ms; first pass 175.398 ms; sandbox 0.000 ms; checks `honoType`=function, `fetchType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 83.289 ms; warm 37.572 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 169.270 ms; warm 35.058 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 77.777 ms; first checks `honoType`=function, `fetchType`=function; replay checks `honoType`=function, `fetchType`=function
- Host same-session control: total 7.954 ms; first 7.907 ms; replay 0.044 ms; first checks `honoType`=function, `fetchType`=function; replay checks `honoType`=function, `fetchType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 83.289 ms | 67.436 ms | 15.853 ms | 59 | 37.220 ms |
| 2 | 37.413 ms | 31.851 ms | 5.562 ms | 59 | 4.006 ms |
| 3 | 37.732 ms | 32.185 ms | 5.547 ms | 59 | 3.740 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 67.436 ms | 0.000 ms | 3.853 ms |
| 2 | 5.000 ms | 0.000 ms | 31.851 ms | 1.000 ms | -0.438 ms |
| 3 | 4.000 ms | 0.000 ms | 32.185 ms | 0.000 ms | 1.547 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 37.413 ms | 37.572 ms | 37.572 ms | 37.732 ms | 0.160 ms | 0.319 ms |
| Warm execute | 2 | 31.851 ms | 32.018 ms | 32.018 ms | 32.185 ms | 0.167 ms | 0.334 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 209.438 MiB |
| Peak heap used | 49.030 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.143% |
| CPU user | 0.503 s |
| CPU system | 0.105 s |
| CPU total | 0.608 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 10.746 ms | 3.582 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 4.188 ms | 0.076 ms | 40508.667 |
| `_log` | 1.000 | 0.055 ms | 0.055 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 10.746 ms | 99859.333 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.709 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.975 ms | 41826.000 |
| real polyfill-body loads | by calls | `hono` | 1.000 | 0.062 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.709 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.975 ms | 41826.000 |
| real polyfill-body loads | by time | `hono` | 1.000 | 0.062 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.709 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.975 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `hono` | 1.000 | 0.062 ms | 50.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 140415.000 | 137642.000 |
| `send:Execute` | 1.000 | 14181.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10738.000 | 7038.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:38.094Z

- Warm wall: 36.428 -> 37.572 ms (+1.144 ms (+3.14%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.836 -> 5.554 ms (-0.282 ms (-4.83%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.836 -> 0.554 ms (-0.282 ms (-33.73%))
- Bridge time/iteration: 14.367 -> 14.989 ms (+0.622 ms (+4.33%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 36.428 -> 37.572 ms (+1.144 ms (+3.14%))
- Warm wall stddev: 0.248 -> 0.160 ms (-0.088 ms (-35.48%))
- Warm execute median: 30.592 -> 32.018 ms (+1.426 ms (+4.66%))
- Warm execute stddev: 0.627 -> 0.167 ms (-0.460 ms (-73.36%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.027 -> 10.746 ms (+0.719 ms (+7.17%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.198 -> 5.709 ms (+0.511 ms (+9.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.767 -> 4.975 ms (+0.208 ms (+4.36%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.062 -> 0.062 ms (0.000 ms (0.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.198 -> 5.709 ms (+0.511 ms (+9.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.767 -> 4.975 ms (+0.208 ms (+4.36%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.062 -> 0.062 ms (0.000 ms (0.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.198 -> 5.709 ms (+0.511 ms (+9.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.767 -> 4.975 ms (+0.208 ms (+4.36%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.062 -> 0.062 ms (0.000 ms (0.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.027 | 10.746 | +0.719 |
| Method time | `_bridgeDispatch` | 4.284 | 4.188 | -0.096 |

