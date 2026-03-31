# Pi SDK Startup

Scenario: `pi-sdk-startup`
Kind: `startup`
Generated: 2026-03-31T23:34:00.222Z
Description: Loads the Pi SDK entry module and inspects its exported surface.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1722.213 ms
- Bridge calls/iteration: 2511.000
- Warm fixed session overhead: 10.099 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 4.099 ms
- Warm wall stability: median 1722.213 ms; min/max 1694.789 ms / 1749.638 ms; stddev 27.424 ms; range 54.849 ms
- Warm execute stability: median 1712.114 ms; min/max 1682.793 ms / 1741.435 ms; stddev 29.321 ms; range 58.642 ms
- Host runtime resources: peak RSS 294.043 MiB; peak heap 78.514 MiB; heap limit usage 1.831%; CPU user/system/total 2.652 s / 0.606 s / 3.258 s
- Dominant bridge time: `_bridgeDispatch` 873.951 ms/iteration across 2437.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547621.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 79.847 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 39.446 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 39.446 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3309659.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 1885.206 ms; runtime create 192.016 ms; first pass 1693.190 ms; sandbox 0.000 ms; checks `createAgentSessionType`=function, `runPrintModeType`=function
- Sandbox true cold start, warm snapshot disabled: total 2448.468 ms; runtime create 5.211 ms; first pass 2443.257 ms; sandbox 0.000 ms; checks `createAgentSessionType`=function, `runPrintModeType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 2091.457 ms; warm 1722.213 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 2018.819 ms; warm 1631.499 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 1818.984 ms; first checks `createAgentSessionType`=function, `runPrintModeType`=function; replay checks `createAgentSessionType`=function, `runPrintModeType`=function
- Host same-session control: total 328.451 ms; first 328.385 ms; replay 0.063 ms; first checks `createAgentSessionType`=function, `runPrintModeType`=function; replay checks `createAgentSessionType`=function, `runPrintModeType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2091.457 ms | 2073.670 ms | 17.787 ms | 2511 | 1167.102 ms |
| 2 | 1694.789 ms | 1682.793 ms | 11.996 ms | 2511 | 871.465 ms |
| 3 | 1749.638 ms | 1741.435 ms | 8.203 ms | 2511 | 826.582 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 1.000 ms | 2073.670 ms | 1.000 ms | 6.787 ms |
| 2 | 6.000 ms | 0.000 ms | 1682.793 ms | 0.000 ms | 5.996 ms |
| 3 | 6.000 ms | 0.000 ms | 1741.435 ms | 0.000 ms | 2.203 ms |

## Warm Stability

| Series | Samples | Min | Median | Mean | Max | Stddev | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm wall | 2 | 1694.789 ms | 1722.213 ms | 1722.213 ms | 1749.638 ms | 27.424 ms | 54.849 ms |
| Warm execute | 2 | 1682.793 ms | 1712.114 ms | 1712.114 ms | 1741.435 ms | 29.321 ms | 58.642 ms |

## Host Runtime Resources

These values come from the host-side Node IPC observability process and are sampled through the existing Prometheus observability path during the benchmark run.

| Metric | Value |
| --- | ---: |
| Peak RSS | 294.043 MiB |
| Peak heap used | 78.514 MiB |
| Heap limit | 4288.000 MiB |
| Peak heap / limit | 1.831% |
| CPU user | 2.652 s |
| CPU system | 0.606 s |
| CPU total | 3.258 s |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2437.000 | 873.951 ms | 0.359 ms | 2547621.333 |
| `_loadPolyfill` | 70.000 | 79.847 ms | 1.141 ms | 758579.667 |
| `_fsExists` | 2.000 | 0.587 ms | 0.294 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.526 ms | 0.526 ms | 3311.000 |
| `_log` | 1.000 | 0.138 ms | 0.138 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 70.000 | 79.847 ms | 758579.667 | 69 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 6.554 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 39.446 ms | 300368.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 9.921 ms | 41826.000 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 7.866 ms | 157798.000 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 7.442 ms | 82604.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 39.446 ms | 300368.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 9.921 ms | 41826.000 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 7.866 ms | 157798.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 7.442 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 6.554 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 39.446 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 7.866 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 6.554 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 7.442 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 6.295 ms | 56865.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2511.000 | 3309659.000 | 3191642.000 |
| `recv:BridgeCall` | 2511.000 | 520459.000 | 362433.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 14284.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:10:08.450Z

- Warm wall: 886.870 -> 1722.213 ms (+835.343 ms (+94.19%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 8.576 -> 10.099 ms (+1.523 ms (+17.76%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.577 -> 4.099 ms (+1.522 ms (+59.06%))
- Bridge time/iteration: 478.099 -> 955.050 ms (+476.951 ms (+99.76%))
- BridgeResponse encoded bytes/iteration: 3309659.000 -> 3309659.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 886.870 -> 1722.213 ms (+835.343 ms (+94.19%))
- Warm wall stddev: 0.229 -> 27.424 ms (+27.195 ms (+11875.55%))
- Warm execute median: 878.293 -> 1712.114 ms (+833.821 ms (+94.94%))
- Warm execute stddev: 0.162 -> 29.321 ms (+29.159 ms (+17999.38%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 48.003 -> 79.847 ms (+31.844 ms (+66.34%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.181 -> 6.554 ms (+0.373 ms (+6.04%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.880 -> 39.446 ms (+24.566 ms (+165.09%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.647 -> 7.866 ms (+0.219 ms (+2.86%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.811 -> 7.442 ms (+0.631 ms (+9.26%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.055 -> 6.295 ms (+0.240 ms (+3.96%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.880 -> 39.446 ms (+24.566 ms (+165.09%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.944 -> 9.921 ms (+4.977 ms (+100.67%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.811 -> 7.442 ms (+0.631 ms (+9.26%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.181 -> 6.554 ms (+0.373 ms (+6.04%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.055 -> 6.295 ms (+0.240 ms (+3.96%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.880 -> 39.446 ms (+24.566 ms (+165.09%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.647 -> 7.866 ms (+0.219 ms (+2.86%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.181 -> 6.554 ms (+0.373 ms (+6.04%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.811 -> 7.442 ms (+0.631 ms (+9.26%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.055 -> 6.295 ms (+0.240 ms (+3.96%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 429.228 | 873.951 | +444.723 |
| Method time | `_loadPolyfill` | 48.003 | 79.847 | +31.844 |
| Method time | `_fsReadFile` | 0.294 | 0.526 | +0.232 |

