# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:35:02.394Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1893.622 ms
- Bridge calls/iteration: 2772.000
- Warm fixed session overhead: 9.846 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 3.346 ms
- Warm wall stability: median 1893.622 ms; min/max 1889.541 ms / 1897.703 ms; stddev 4.081 ms; range 8.162 ms
- Warm execute stability: median 1883.776 ms; min/max 1879.843 ms / 1887.709 ms; stddev 3.933 ms; range 7.866 ms
- Host runtime resources: peak RSS 339.629 MiB; peak heap 86.695 MiB; heap limit usage 2.022%; CPU user/system/total 3.068 s / 0.628 s / 3.696 s
- Dominant bridge time: `_bridgeDispatch` 874.243 ms/iteration across 2638.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2679096.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 63.431 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 27.191 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 27.191 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3449857.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2203.131 ms; runtime create 196.512 ms; first pass 2006.619 ms; mock requests 1; checks `responseSeen`=true
- Sandbox true cold start, warm snapshot disabled: total 2142.625 ms; runtime create 4.560 ms; first pass 2138.065 ms; mock requests 1; checks `responseSeen`=true
- Sandbox new-session replay, warm snapshot enabled: cold 2149.708 ms; warm 1893.622 ms; mock requests mean 1.000
- Sandbox new-session replay, warm snapshot disabled: cold 2386.299 ms; warm 1805.687 ms; mock requests mean 1.000
- Sandbox same-session replay: total 2126.300 ms; mock requests 2; first checks `completed`=true; replay checks `completed`=true
- Host same-session control: total 388.191 ms; first 380.337 ms; replay 7.852 ms; mock requests 2; first checks `completed`=true; replay checks `completed`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2149.708 ms | 2135.364 ms | 14.344 ms | 2772 | 1213.128 ms |
| 2 | 1897.703 ms | 1887.709 ms | 9.994 ms | 2772 | 948.897 ms |
| 3 | 1889.541 ms | 1879.843 ms | 9.698 ms | 2772 | 911.750 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2135.364 ms | 0.000 ms | 5.344 ms |
| 2 | 7.000 ms | 0.000 ms | 1887.709 ms | 1.000 ms | 1.994 ms |
| 3 | 5.000 ms | 0.000 ms | 1879.843 ms | 0.000 ms | 4.698 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 1889.541 ms | 1893.622 ms | 1893.622 ms | 1897.703 ms | 4.081 ms | 8.162 ms |
| Warm execute | 2 | 1879.843 ms | 1883.776 ms | 1883.776 ms | 1887.709 ms | 3.933 ms | 7.866 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 339.629 MiB |
| Peak heap used | 86.695 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 2.022% |
| CPU user | 3.068 s |
| CPU system | 0.628 s |
| CPU total | 3.696 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2638.000 | 874.243 ms | 0.331 ms | 2679096.667 |
| `_fsExists` | 43.000 | 69.013 ms | 1.605 ms | 2150.000 |
| `_loadPolyfill` | 71.000 | 63.431 ms | 0.893 ms | 758629.667 |
| `_fsMkdir` | 1.000 | 4.840 ms | 4.840 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 3.216 ms | 3.216 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 3.135 ms | 0.627 ms | 7684.000 |
| `_fsWriteFile` | 1.000 | 1.657 ms | 1.657 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.242 ms | 1.242 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.197 ms | 1.197 ms | 47.000 |
| `_fsStat` | 1.000 | 0.986 ms | 0.986 ms | 207.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 71.000 | 63.431 ms | 758629.667 | 70 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 5.633 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 27.191 ms | 300368.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 9.039 ms | 157798.000 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 8.260 ms | 56865.667 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 5.981 ms | 82604.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 27.191 ms | 300368.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 9.039 ms | 157798.000 |
| real polyfill-body loads | by time | `assert` | 1.000 | 8.260 ms | 56865.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 5.981 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 5.633 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 27.191 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 9.039 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 5.633 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 5.981 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 8.260 ms | 56865.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2772.000 | 3449857.333 | 3319573.333 |
| `recv:BridgeCall` | 2772.000 | 576212.000 | 402050.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 15114.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:10:47.700Z

- Warm wall: 1040.085 -> 1893.622 ms (+853.537 ms (+82.06%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.563 -> 9.846 ms (+0.283 ms (+2.96%))
- Warm Create->InjectGlobals: 5.500 -> 6.000 ms (+0.500 ms (+9.09%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 3.563 -> 3.346 ms (-0.217 ms (-6.09%))
- Bridge time/iteration: 547.754 -> 1024.592 ms (+476.838 ms (+87.05%))
- BridgeResponse encoded bytes/iteration: 3449857.333 -> 3449857.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 1040.085 -> 1893.622 ms (+853.537 ms (+82.06%))
- Warm wall stddev: 7.852 -> 4.081 ms (-3.771 ms (-48.03%))
- Warm execute median: 1030.522 -> 1883.776 ms (+853.254 ms (+82.80%))
- Warm execute stddev: 8.798 -> 3.933 ms (-4.865 ms (-55.30%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 50.042 -> 63.431 ms (+13.389 ms (+26.76%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.753 -> 5.633 ms (-0.120 ms (-2.09%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.429 -> 27.191 ms (+11.762 ms (+76.23%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.743 -> 9.039 ms (+1.296 ms (+16.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.822 -> 5.981 ms (-0.841 ms (-12.33%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.157 -> 8.260 ms (+0.103 ms (+1.26%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.429 -> 27.191 ms (+11.762 ms (+76.23%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.743 -> 9.039 ms (+1.296 ms (+16.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.822 -> 5.981 ms (-0.841 ms (-12.33%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.670 -> 4.910 ms (+0.240 ms (+5.14%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.753 -> 5.633 ms (-0.120 ms (-2.09%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.429 -> 27.191 ms (+11.762 ms (+76.23%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.743 -> 9.039 ms (+1.296 ms (+16.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.753 -> 5.633 ms (-0.120 ms (-2.09%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.822 -> 5.981 ms (-0.841 ms (-12.33%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.157 -> 8.260 ms (+0.103 ms (+1.26%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 439.532 | 874.243 | +434.711 |
| Method time | `_fsExists` | 40.699 | 69.013 | +28.314 |
| Method time | `_loadPolyfill` | 50.042 | 63.431 | +13.389 |

