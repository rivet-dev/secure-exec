# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:34:20.833Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1705.717 ms
- Bridge calls/iteration: 2745.000
- Warm fixed session overhead: 9.460 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.460 ms
- Warm wall stability: median 1705.717 ms; min/max 1637.436 ms / 1773.998 ms; stddev 68.281 ms; range 136.562 ms
- Warm execute stability: median 1696.257 ms; min/max 1627.555 ms / 1764.959 ms; stddev 68.702 ms; range 137.404 ms
- Host runtime resources: peak RSS 322.566 MiB; peak heap 88.678 MiB; heap limit usage 2.068%; CPU user/system/total 2.891 s / 0.623 s / 3.514 s
- Dominant bridge time: `_bridgeDispatch` 825.558 ms/iteration across 2631.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2678634.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 74.665 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 34.284 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 34.284 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3444124.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2503.316 ms; runtime create 203.566 ms; first pass 2299.750 ms; sandbox 0.000 ms; mock requests 1; checks `messageCount`=2
- Sandbox true cold start, warm snapshot disabled: total 2028.725 ms; runtime create 4.602 ms; first pass 2024.123 ms; sandbox 0.000 ms; mock requests 1; checks `messageCount`=2
- Sandbox new-session replay, warm snapshot enabled: cold 2146.195 ms; warm 1705.717 ms; sandbox cold 0.000 ms, warm 0.000 ms; mock requests mean 1.000
- Sandbox new-session replay, warm snapshot disabled: cold 2416.727 ms; warm 1679.476 ms; sandbox cold 0.000 ms, warm 0.000 ms; mock requests mean 1.000
- Sandbox same-session replay: total 1711.478 ms; mock requests 2; first checks `messageCount`=2; replay checks `messageCount`=2
- Host same-session control: total 413.957 ms; first 405.658 ms; replay 8.296 ms; mock requests 2; first checks `messageCount`=2; replay checks `messageCount`=2

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2146.195 ms | 2131.544 ms | 14.651 ms | 2745 | 1151.916 ms |
| 2 | 1637.436 ms | 1627.555 ms | 9.881 ms | 2745 | 784.881 ms |
| 3 | 1773.998 ms | 1764.959 ms | 9.039 ms | 2745 | 886.615 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2131.544 ms | 0.000 ms | 5.651 ms |
| 2 | 6.000 ms | 0.000 ms | 1627.555 ms | 0.000 ms | 3.881 ms |
| 3 | 6.000 ms | 0.000 ms | 1764.959 ms | 0.000 ms | 3.039 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 1637.436 ms | 1705.717 ms | 1705.717 ms | 1773.998 ms | 68.281 ms | 136.562 ms |
| Warm execute | 2 | 1627.555 ms | 1696.257 ms | 1696.257 ms | 1764.959 ms | 68.702 ms | 137.404 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 322.566 MiB |
| Peak heap used | 88.678 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 2.068% |
| CPU user | 2.891 s |
| CPU system | 0.623 s |
| CPU total | 3.514 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2631.000 | 825.558 ms | 0.314 ms | 2678634.667 |
| `_loadPolyfill` | 71.000 | 74.665 ms | 1.052 ms | 758629.667 |
| `_fsExists` | 32.000 | 34.299 ms | 1.072 ms | 1600.000 |
| `_networkFetchRaw` | 1.000 | 3.894 ms | 3.894 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 2.419 ms | 1.209 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.219 ms | 0.044 ms | 435.000 |
| `_log` | 3.000 | 0.083 ms | 0.028 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 71.000 | 74.665 ms | 758629.667 | 70 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 5.875 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 34.284 ms | 300368.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 10.569 ms | 157798.000 |
| real polyfill-body loads | by calls | `url` | 1.000 | 8.041 ms | 41826.000 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 7.673 ms | 56865.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 34.284 ms | 300368.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 10.569 ms | 157798.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 8.041 ms | 41826.000 |
| real polyfill-body loads | by time | `assert` | 1.000 | 7.673 ms | 56865.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.071 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 34.284 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 10.569 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 5.875 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.071 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 7.673 ms | 56865.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2745.000 | 3444124.333 | 3315109.333 |
| `recv:BridgeCall` | 2745.000 | 572981.000 | 400410.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 15211.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:10:21.683Z

- Warm wall: 1018.723 -> 1705.717 ms (+686.994 ms (+67.44%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.188 -> 9.460 ms (+0.272 ms (+2.96%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.188 -> 3.460 ms (+0.272 ms (+8.53%))
- Bridge time/iteration: 540.002 -> 941.137 ms (+401.135 ms (+74.28%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 1018.723 -> 1705.717 ms (+686.994 ms (+67.44%))
- Warm wall stddev: 35.143 -> 68.281 ms (+33.138 ms (+94.30%))
- Warm execute median: 1009.535 -> 1696.257 ms (+686.722 ms (+68.02%))
- Warm execute stddev: 35.310 -> 68.702 ms (+33.392 ms (+94.57%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 51.011 -> 74.665 ms (+23.654 ms (+46.37%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.004 -> 5.875 ms (-0.129 ms (-2.15%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.614 -> 34.284 ms (+18.670 ms (+119.57%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.729 -> 10.569 ms (+0.840 ms (+8.63%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.203 -> 6.071 ms (-0.132 ms (-2.13%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.048 -> 7.673 ms (+0.625 ms (+8.87%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.614 -> 34.284 ms (+18.670 ms (+119.57%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.054 -> 8.041 ms (+2.987 ms (+59.10%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.729 -> 10.569 ms (+0.840 ms (+8.63%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.048 -> 7.673 ms (+0.625 ms (+8.87%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.203 -> 6.071 ms (-0.132 ms (-2.13%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.614 -> 34.284 ms (+18.670 ms (+119.57%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.729 -> 10.569 ms (+0.840 ms (+8.63%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.004 -> 5.875 ms (-0.129 ms (-2.15%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.203 -> 6.071 ms (-0.132 ms (-2.13%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.048 -> 7.673 ms (+0.625 ms (+8.87%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 452.775 | 825.558 | +372.783 |
| Method time | `_loadPolyfill` | 51.011 | 74.665 | +23.654 |
| Method time | `_fsExists` | 31.092 | 34.299 | +3.207 |

