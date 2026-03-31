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

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 71.000 | 63.677 ms | 758629.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

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

Baseline scenario timestamp: 2026-03-31T21:00:55.880Z

- Warm wall: 1695.689 -> 1720.678 ms (+24.989 ms (+1.47%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.169 -> 11.187 ms (+2.018 ms (+22.01%))
- Warm Create->InjectGlobals: 5.500 -> 6.500 ms (+1.000 ms (+18.18%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 3.669 -> 3.687 ms (+0.018 ms (+0.49%))
- Bridge time/iteration: 943.233 -> 930.537 ms (-12.696 ms (-1.35%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 65.055 -> 63.677 ms (-1.378 ms (-2.12%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 838.520 | 824.004 | -14.516 |
| Method time | `_fsExists` | 34.673 | 36.189 | +1.516 |
| Method time | `_loadPolyfill` | 65.055 | 63.677 | -1.378 |

