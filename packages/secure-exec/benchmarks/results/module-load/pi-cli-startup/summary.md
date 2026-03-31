# Pi CLI Startup

Scenario: `pi-cli-startup`
Kind: `startup`
Generated: 2026-03-31T23:34:40.915Z
Description: Boots the Pi CLI help path inside the sandbox.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1644.750 ms
- Bridge calls/iteration: 2562.000
- Warm fixed session overhead: 9.242 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.742 ms
- Warm wall stability: median 1644.750 ms; min/max 1569.118 ms / 1720.382 ms; stddev 75.632 ms; range 151.264 ms
- Warm execute stability: median 1635.508 ms; min/max 1559.092 ms / 1711.923 ms; stddev 76.415 ms; range 152.831 ms
- Host runtime resources: peak RSS 352.422 MiB; peak heap 95.823 MiB; heap limit usage 2.235%; CPU user/system/total 2.579 s / 0.591 s / 3.171 s
- Dominant bridge time: `_bridgeDispatch` 791.547 ms/iteration across 2440.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547818.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 102.751 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 40.788 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 40.788 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3312400.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2289.180 ms; runtime create 241.507 ms; first pass 2047.673 ms; checks `stdoutHasUsage`=true
- Sandbox true cold start, warm snapshot disabled: total 2098.134 ms; runtime create 5.768 ms; first pass 2092.366 ms; checks `stdoutHasUsage`=true
- Sandbox new-session replay, warm snapshot enabled: cold 2061.885 ms; warm 1644.750 ms
- Sandbox new-session replay, warm snapshot disabled: cold 2042.151 ms; warm 1712.459 ms
- Sandbox same-session replay: total 1951.112 ms; first checks `completed`=true; replay checks `completed`=true
- Host same-session control: total 338.621 ms; first 337.869 ms; replay 0.749 ms; first checks `completed`=true; replay checks `completed`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2061.885 ms | 2044.961 ms | 16.924 ms | 2562 | 1164.928 ms |
| 2 | 1569.118 ms | 1559.092 ms | 10.026 ms | 2562 | 819.478 ms |
| 3 | 1720.382 ms | 1711.923 ms | 8.459 ms | 2562 | 891.886 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2044.961 ms | 1.000 ms | 6.924 ms |
| 2 | 6.000 ms | 0.000 ms | 1559.092 ms | 0.000 ms | 4.026 ms |
| 3 | 5.000 ms | 0.000 ms | 1711.923 ms | 0.000 ms | 3.459 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 1569.118 ms | 1644.750 ms | 1644.750 ms | 1720.382 ms | 75.632 ms | 151.264 ms |
| Warm execute | 2 | 1559.092 ms | 1635.508 ms | 1635.508 ms | 1711.923 ms | 76.415 ms | 152.831 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 352.422 MiB |
| Peak heap used | 95.823 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 2.235% |
| CPU user | 2.579 s |
| CPU system | 0.591 s |
| CPU total | 3.171 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2440.000 | 791.547 ms | 0.324 ms | 2547818.333 |
| `_loadPolyfill` | 70.000 | 102.751 ms | 1.468 ms | 758579.667 |
| `_fsExists` | 41.000 | 51.051 ms | 1.245 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 5.549 ms | 5.549 ms | 47.000 |
| `_fsReadFile` | 2.000 | 1.829 ms | 0.915 ms | 3364.000 |
| `_fsChmod` | 1.000 | 1.449 ms | 1.449 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.133 ms | 1.133 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.083 ms | 1.083 ms | 47.000 |
| `_fsStat` | 1.000 | 1.080 ms | 1.080 ms | 206.333 |
| `_fsUtimes` | 1.000 | 1.060 ms | 1.060 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 70.000 | 102.751 ms | 758579.667 | 69 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 7.721 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 40.788 ms | 300368.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 18.939 ms | 56865.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 17.460 ms | 157798.000 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 10.713 ms | 82604.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 40.788 ms | 300368.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 18.939 ms | 56865.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 17.460 ms | 157798.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 10.713 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 7.721 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 40.788 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 17.460 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 7.721 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 10.713 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 18.939 ms | 56865.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2562.000 | 3312400.333 | 3191986.333 |
| `recv:BridgeCall` | 2562.000 | 530167.000 | 369218.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 14155.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:10:34.284Z

- Warm wall: 953.642 -> 1644.750 ms (+691.108 ms (+72.47%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.565 -> 9.242 ms (-0.323 ms (-3.38%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 4.065 -> 3.742 ms (-0.323 ms (-7.95%))
- Bridge time/iteration: 518.205 -> 958.764 ms (+440.559 ms (+85.02%))
- BridgeResponse encoded bytes/iteration: 3312400.333 -> 3312400.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 953.642 -> 1644.750 ms (+691.108 ms (+72.47%))
- Warm wall stddev: 20.166 -> 75.632 ms (+55.466 ms (+275.05%))
- Warm execute median: 944.077 -> 1635.508 ms (+691.431 ms (+73.24%))
- Warm execute stddev: 20.782 -> 76.415 ms (+55.633 ms (+267.70%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 48.828 -> 102.751 ms (+53.923 ms (+110.44%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.230 -> 7.721 ms (+1.491 ms (+23.93%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.743 -> 40.788 ms (+26.045 ms (+176.66%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.606 -> 17.460 ms (+8.854 ms (+102.88%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.671 -> 10.713 ms (+4.042 ms (+60.59%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.075 -> 18.939 ms (+12.864 ms (+211.75%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.743 -> 40.788 ms (+26.045 ms (+176.66%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.075 -> 18.939 ms (+12.864 ms (+211.75%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.606 -> 17.460 ms (+8.854 ms (+102.88%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.671 -> 10.713 ms (+4.042 ms (+60.59%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.230 -> 7.721 ms (+1.491 ms (+23.93%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.743 -> 40.788 ms (+26.045 ms (+176.66%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.606 -> 17.460 ms (+8.854 ms (+102.88%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.230 -> 7.721 ms (+1.491 ms (+23.93%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.671 -> 10.713 ms (+4.042 ms (+60.59%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.075 -> 18.939 ms (+12.864 ms (+211.75%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 417.974 | 791.547 | +373.573 |
| Method time | `_loadPolyfill` | 48.828 | 102.751 | +53.923 |
| Method time | `_fsExists` | 39.939 | 51.051 | +11.112 |

