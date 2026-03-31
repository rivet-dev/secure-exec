# Pi SDK Startup

Scenario: `pi-sdk-startup`
Kind: `startup`
Generated: 2026-03-31T23:10:08.450Z
Description: Loads the Pi SDK entry module and inspects its exported surface.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 886.870 ms
- Bridge calls/iteration: 2511.000
- Warm fixed session overhead: 8.576 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 2.577 ms
- Dominant bridge time: `_bridgeDispatch` 429.228 ms/iteration across 2437.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547621.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 48.003 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 14.880 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 14.880 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3309659.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 1225.725 ms; runtime create 181.278 ms; first pass 1044.447 ms; sandbox 0.000 ms; checks `createAgentSessionType`=function, `runPrintModeType`=function
- Sandbox true cold start, warm snapshot disabled: total 1190.158 ms; runtime create 4.545 ms; first pass 1185.613 ms; sandbox 0.000 ms; checks `createAgentSessionType`=function, `runPrintModeType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 1138.839 ms; warm 886.870 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 1215.265 ms; warm 858.100 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 1064.885 ms; first checks `createAgentSessionType`=function, `runPrintModeType`=function; replay checks `createAgentSessionType`=function, `runPrintModeType`=function
- Host same-session control: total 341.486 ms; first 341.415 ms; replay 0.068 ms; first checks `createAgentSessionType`=function, `runPrintModeType`=function; replay checks `createAgentSessionType`=function, `runPrintModeType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1138.839 ms | 1125.271 ms | 13.568 ms | 2511 | 594.925 ms |
| 2 | 887.099 ms | 878.132 ms | 8.967 ms | 2511 | 422.602 ms |
| 3 | 886.641 ms | 878.455 ms | 8.186 ms | 2511 | 416.771 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 1125.271 ms | 0.000 ms | 4.568 ms |
| 2 | 7.000 ms | 0.000 ms | 878.132 ms | 0.000 ms | 1.967 ms |
| 3 | 5.000 ms | 0.000 ms | 878.455 ms | 0.000 ms | 3.186 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2437.000 | 429.228 ms | 0.176 ms | 2547621.333 |
| `_loadPolyfill` | 70.000 | 48.003 ms | 0.686 ms | 758579.667 |
| `_fsExists` | 2.000 | 0.478 ms | 0.239 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.294 ms | 0.294 ms | 3311.000 |
| `_log` | 1.000 | 0.096 ms | 0.096 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 70.000 | 48.003 ms | 758579.667 | 69 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 6.181 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 14.880 ms | 300368.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 7.647 ms | 157798.000 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.811 ms | 82604.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 6.055 ms | 56865.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 14.880 ms | 300368.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 7.647 ms | 157798.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.811 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 6.181 ms | 115966.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 6.055 ms | 56865.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 14.880 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 7.647 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 6.181 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.811 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 6.055 ms | 56865.667 |
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

Baseline scenario timestamp: 2026-03-31T22:51:37.568Z

- Warm wall: 1559.370 -> 886.870 ms (-672.500 ms (-43.13%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 13.761 -> 8.576 ms (-5.185 ms (-37.68%))
- Warm Create->InjectGlobals: 5.500 -> 6.000 ms (+0.500 ms (+9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 7.761 -> 2.577 ms (-5.184 ms (-66.80%))
- Bridge time/iteration: 876.922 -> 478.099 ms (-398.823 ms (-45.48%))
- BridgeResponse encoded bytes/iteration: 3309659.000 -> 3309659.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 69.370 -> 48.003 ms (-21.367 ms (-30.80%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.234 -> 6.181 ms (-0.053 ms (-0.85%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.961 -> 14.880 ms (-3.081 ms (-17.15%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.260 -> 7.647 ms (-1.613 ms (-17.42%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.263 -> 6.811 ms (+0.548 ms (+8.75%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.902 -> 6.055 ms (-9.847 ms (-61.92%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.902 -> 6.055 ms (-9.847 ms (-61.92%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.638 -> 4.944 ms (-6.694 ms (-57.52%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.961 -> 14.880 ms (-3.081 ms (-17.15%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.260 -> 7.647 ms (-1.613 ms (-17.42%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.263 -> 6.811 ms (+0.548 ms (+8.75%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.961 -> 14.880 ms (-3.081 ms (-17.15%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.260 -> 7.647 ms (-1.613 ms (-17.42%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.234 -> 6.181 ms (-0.053 ms (-0.85%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.263 -> 6.811 ms (+0.548 ms (+8.75%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.902 -> 6.055 ms (-9.847 ms (-61.92%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 805.889 | 429.228 | -376.661 |
| Method time | `_loadPolyfill` | 69.370 | 48.003 | -21.367 |
| Method time | `_fsReadFile` | 0.824 | 0.294 | -0.530 |

