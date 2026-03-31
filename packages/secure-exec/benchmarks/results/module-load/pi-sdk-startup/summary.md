# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T22:51:37.568Z
Description: Loads the Pi SDK entry module and inspects its exported surface.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1559.370 ms
- Bridge calls/iteration: 2511.000
- Warm fixed session overhead: 13.761 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 7.761 ms
- Dominant bridge time: `_bridgeDispatch` 805.889 ms/iteration across 2437.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547621.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 69.370 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 17.961 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 17.961 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3309659.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2185.021 ms; runtime create 213.216 ms; first pass 1971.805 ms; sandbox 0.000 ms; checks `createAgentSessionType`=function, `runPrintModeType`=function
- Sandbox true cold start, warm snapshot disabled: total 1991.023 ms; runtime create 4.590 ms; first pass 1986.433 ms; sandbox 0.000 ms; checks `createAgentSessionType`=function, `runPrintModeType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 2029.376 ms; warm 1559.370 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 2178.901 ms; warm 1333.907 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 1735.667 ms; first checks `createAgentSessionType`=function, `runPrintModeType`=function; replay checks `createAgentSessionType`=function, `runPrintModeType`=function
- Host same-session control: total 337.507 ms; first 337.442 ms; replay 0.062 ms; first checks `createAgentSessionType`=function, `runPrintModeType`=function; replay checks `createAgentSessionType`=function, `runPrintModeType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2029.376 ms | 2009.339 ms | 20.037 ms | 2511 | 1117.078 ms |
| 2 | 1632.441 ms | 1617.080 ms | 15.361 ms | 2511 | 805.939 ms |
| 3 | 1486.300 ms | 1474.140 ms | 12.160 ms | 2511 | 707.749 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2009.339 ms | 2.000 ms | 9.037 ms |
| 2 | 6.000 ms | 0.000 ms | 1617.080 ms | 0.000 ms | 9.361 ms |
| 3 | 5.000 ms | 0.000 ms | 1474.140 ms | 1.000 ms | 6.160 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2437.000 | 805.889 ms | 0.331 ms | 2547621.333 |
| `_loadPolyfill` | 70.000 | 69.370 ms | 0.991 ms | 758579.667 |
| `_fsReadFile` | 1.000 | 0.824 ms | 0.824 ms | 3311.000 |
| `_fsExists` | 2.000 | 0.631 ms | 0.315 ms | 100.000 |
| `_log` | 1.000 | 0.208 ms | 0.208 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 70.000 | 69.370 ms | 758579.667 | 69 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 6.234 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 17.961 ms | 300368.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 15.902 ms | 56865.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 11.638 ms | 41826.000 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 9.260 ms | 157798.000 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 17.961 ms | 300368.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 15.902 ms | 56865.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 11.638 ms | 41826.000 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 9.260 ms | 157798.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.263 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 17.961 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 9.260 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 6.234 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.263 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 15.902 ms | 56865.667 |
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

