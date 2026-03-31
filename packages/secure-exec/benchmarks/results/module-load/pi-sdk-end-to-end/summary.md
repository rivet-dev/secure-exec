# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T22:12:58.044Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1720.678 ms
- Bridge calls/iteration: 2745.000
- Warm fixed session overhead: 11.187 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.500 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 0.500 ms, residual 3.687 ms
- Dominant bridge time: `_bridgeDispatch` 824.004 ms/iteration across 2631.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2678634.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 63.677 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 17.443 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 17.443 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3444124.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2085.137 ms; runtime create 131.599 ms; first pass 1953.538 ms; sandbox 0.000 ms; mock requests 1; checks `messageCount`=2
- Sandbox true cold start, warm snapshot disabled: total 1717.360 ms; runtime create 10.641 ms; first pass 1706.719 ms; sandbox 0.000 ms; mock requests 1; checks `messageCount`=2
- Sandbox new-session replay, warm snapshot enabled: cold 1943.958 ms; warm 1720.678 ms; sandbox cold 0.000 ms, warm 0.000 ms; mock requests mean 1.000
- Sandbox new-session replay, warm snapshot disabled: cold 1701.226 ms; warm 1748.344 ms; sandbox cold 0.000 ms, warm 0.000 ms; mock requests mean 1.000
- Sandbox same-session replay: total 1634.830 ms; mock requests 2; first checks `messageCount`=2; replay checks `messageCount`=2
- Host same-session control: total 412.735 ms; first 402.624 ms; replay 10.109 ms; mock requests 2; first checks `messageCount`=2; replay checks `messageCount`=2

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1943.958 ms | 1929.778 ms | 14.180 ms | 2745 | 1084.333 ms |
| 2 | 1708.525 ms | 1698.088 ms | 10.437 ms | 2745 | 820.131 ms |
| 3 | 1732.832 ms | 1720.895 ms | 11.937 ms | 2745 | 887.146 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 1929.778 ms | 0.000 ms | 5.180 ms |
| 2 | 7.000 ms | 0.000 ms | 1698.088 ms | 0.000 ms | 3.437 ms |
| 3 | 6.000 ms | 1.000 ms | 1720.895 ms | 1.000 ms | 3.937 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2631.000 | 824.004 ms | 0.313 ms | 2678634.667 |
| `_loadPolyfill` | 71.000 | 63.677 ms | 0.897 ms | 758629.667 |
| `_fsExists` | 32.000 | 36.189 ms | 1.131 ms | 1600.000 |
| `_networkFetchRaw` | 1.000 | 3.850 ms | 3.850 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 2.386 ms | 1.193 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.298 ms | 0.060 ms | 435.000 |
| `_log` | 3.000 | 0.132 ms | 0.044 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 71.000 | 63.677 ms | 758629.667 | 70 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 6.586 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 17.443 ms | 300368.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 12.228 ms | 56865.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 9.494 ms | 41826.000 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 9.358 ms | 157798.000 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 17.443 ms | 300368.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 12.228 ms | 56865.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 9.494 ms | 41826.000 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 9.358 ms | 157798.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.680 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 17.443 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 9.358 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 6.586 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.680 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 12.228 ms | 56865.667 |
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

Baseline scenario timestamp: 2026-03-31T22:12:58.044Z

- Warm wall: 1720.678 -> 1720.678 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 11.187 -> 11.187 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 6.500 -> 6.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.687 -> 3.687 ms (0.000 ms (0.00%))
- Bridge time/iteration: 930.537 -> 930.537 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 63.677 -> 63.677 ms (0.000 ms (0.00%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.586 -> 6.586 ms (0.000 ms (0.00%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.443 -> 17.443 ms (0.000 ms (0.00%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.358 -> 9.358 ms (0.000 ms (0.00%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.680 -> 6.680 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.228 -> 12.228 ms (0.000 ms (0.00%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.443 -> 17.443 ms (0.000 ms (0.00%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.228 -> 12.228 ms (0.000 ms (0.00%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.494 -> 9.494 ms (0.000 ms (0.00%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.358 -> 9.358 ms (0.000 ms (0.00%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.680 -> 6.680 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.443 -> 17.443 ms (0.000 ms (0.00%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.358 -> 9.358 ms (0.000 ms (0.00%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.586 -> 6.586 ms (0.000 ms (0.00%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.680 -> 6.680 ms (0.000 ms (0.00%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.228 -> 12.228 ms (0.000 ms (0.00%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

