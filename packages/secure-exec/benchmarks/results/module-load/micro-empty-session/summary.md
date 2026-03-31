# Microbench Empty Session

Scenario: `micro-empty-session`
Kind: `lifecycle`
Generated: 2026-03-31T23:32:52.935Z
Description: Executes a no-op script to isolate fresh-session create, execute, and destroy overhead.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 23.645 ms
- Bridge calls/iteration: 4.000
- Warm fixed session overhead: 6.282 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.782 ms
- Warm wall stability: median 23.645 ms; min/max 22.775 ms / 24.514 ms; stddev 0.870 ms; range 1.739 ms
- Warm execute stability: median 17.362 ms; min/max 17.069 ms / 17.656 ms; stddev 0.293 ms; range 0.587 ms
- Host runtime resources: peak RSS 208.164 MiB; peak heap 46.912 MiB; heap limit usage 1.094%; CPU user/system/total 0.592 s / 0.106 s / 0.698 s
- Dominant bridge time: `_loadPolyfill` 10.960 ms/iteration across 2.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 2.000 calls/iteration, 10.960 ms/iteration, 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `url` 1.000 calls/iteration, 5.556 ms/iteration, 41826.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.404 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 166.326 ms; runtime create 98.062 ms; first pass 68.264 ms; sandbox 0.000 ms; checks `noop`=true
- Sandbox true cold start, warm snapshot disabled: total 163.900 ms; runtime create 4.612 ms; first pass 159.288 ms; sandbox 0.000 ms; checks `noop`=true
- Sandbox new-session replay, warm snapshot enabled: cold 66.042 ms; warm 23.645 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 156.906 ms; warm 23.483 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 80.798 ms; first checks `noop`=true; replay checks `noop`=true
- Host same-session control: total 0.036 ms; first 0.029 ms; replay 0.005 ms; first checks `noop`=true; replay checks `noop`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 66.042 ms | 51.490 ms | 14.552 ms | 4 | 32.311 ms |
| 2 | 22.775 ms | 17.069 ms | 5.706 ms | 4 | 0.524 ms |
| 3 | 24.514 ms | 17.656 ms | 6.858 ms | 4 | 0.543 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 51.490 ms | 0.000 ms | 2.552 ms |
| 2 | 5.000 ms | 0.000 ms | 17.069 ms | 0.000 ms | 0.706 ms |
| 3 | 6.000 ms | 0.000 ms | 17.656 ms | 0.000 ms | 0.858 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 22.775 ms | 23.645 ms | 23.645 ms | 24.514 ms | 0.870 ms | 1.739 ms |
| Warm execute | 2 | 17.069 ms | 17.362 ms | 17.362 ms | 17.656 ms | 0.293 ms | 0.587 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 208.164 MiB |
| Peak heap used | 46.912 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.094% |
| CPU user | 0.592 s |
| CPU system | 0.106 s |
| CPU total | 0.698 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2.000 | 10.960 ms | 5.480 ms | 99809.333 |
| `_bridgeDispatch` | 1.000 | 0.087 ms | 0.087 ms | 70.000 |
| `_log` | 1.000 | 0.079 ms | 0.079 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 2.000 | 10.960 ms | 99809.333 | 2 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.556 ms | 41826.000 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.404 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.556 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.404 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.404 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.556 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 4.000 | 99926.333 | 99738.333 |
| `send:Execute` | 1.000 | 14018.000 | 0.000 |
| `recv:BridgeCall` | 4.000 | 347.000 | 110.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:09:13.975Z

- Warm wall: 24.437 -> 23.645 ms (-0.792 ms (-3.24%))
- Bridge calls/iteration: 4.000 -> 4.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.563 -> 6.282 ms (+0.719 ms (+12.93%))
- Warm Create->InjectGlobals: 4.000 -> 5.500 ms (+1.500 ms (+37.50%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.063 -> 0.782 ms (-0.281 ms (-26.43%))
- Bridge time/iteration: 10.340 -> 11.126 ms (+0.786 ms (+7.60%))
- BridgeResponse encoded bytes/iteration: 99926.333 -> 99926.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 24.437 -> 23.645 ms (-0.792 ms (-3.24%))
- Warm wall stddev: 0.450 -> 0.870 ms (+0.420 ms (+93.33%))
- Warm execute median: 18.874 -> 17.362 ms (-1.512 ms (-8.01%))
- Warm execute stddev: 0.366 -> 0.293 ms (-0.073 ms (-19.95%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.144 -> 10.960 ms (+0.816 ms (+8.04%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.367 -> 5.404 ms (+0.037 ms (+0.69%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.777 -> 5.556 ms (+0.779 ms (+16.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.777 -> 5.556 ms (+0.779 ms (+16.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.367 -> 5.404 ms (+0.037 ms (+0.69%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.367 -> 5.404 ms (+0.037 ms (+0.69%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.777 -> 5.556 ms (+0.779 ms (+16.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.144 | 10.960 | +0.816 |
| Method time | `_log` | 0.097 | 0.079 | -0.018 |
| Method time | `_bridgeDispatch` | 0.099 | 0.087 | -0.012 |

