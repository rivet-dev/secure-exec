# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T22:51:57.749Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1812.370 ms
- Bridge calls/iteration: 2745.000
- Warm fixed session overhead: 9.002 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.002 ms
- Dominant bridge time: `_bridgeDispatch` 850.049 ms/iteration across 2631.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2678634.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 92.816 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 32.267 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 32.267 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3444124.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2258.421 ms; runtime create 203.426 ms; first pass 2054.995 ms; sandbox 0.000 ms; mock requests 1; checks `messageCount`=2
- Sandbox true cold start, warm snapshot disabled: total 2083.265 ms; runtime create 4.456 ms; first pass 2078.809 ms; sandbox 0.000 ms; mock requests 1; checks `messageCount`=2
- Sandbox new-session replay, warm snapshot enabled: cold 1972.914 ms; warm 1812.370 ms; sandbox cold 0.000 ms, warm 0.000 ms; mock requests mean 1.000
- Sandbox new-session replay, warm snapshot disabled: cold 2133.166 ms; warm 1602.508 ms; sandbox cold 0.000 ms, warm 0.000 ms; mock requests mean 1.000
- Sandbox same-session replay: total 1955.608 ms; mock requests 2; first checks `messageCount`=2; replay checks `messageCount`=2
- Host same-session control: total 415.919 ms; first 407.112 ms; replay 8.804 ms; mock requests 2; first checks `messageCount`=2; replay checks `messageCount`=2

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1972.914 ms | 1957.442 ms | 15.472 ms | 2745 | 1115.212 ms |
| 2 | 1842.612 ms | 1833.102 ms | 9.510 ms | 2745 | 911.890 ms |
| 3 | 1782.127 ms | 1773.632 ms | 8.495 ms | 2745 | 934.708 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 1.000 ms | 1957.442 ms | 1.000 ms | 4.472 ms |
| 2 | 6.000 ms | 0.000 ms | 1833.102 ms | 0.000 ms | 3.510 ms |
| 3 | 6.000 ms | 0.000 ms | 1773.632 ms | 0.000 ms | 2.495 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2631.000 | 850.049 ms | 0.323 ms | 2678634.667 |
| `_loadPolyfill` | 71.000 | 92.816 ms | 1.307 ms | 758629.667 |
| `_fsExists` | 32.000 | 38.442 ms | 1.201 ms | 1600.000 |
| `_fsReadFile` | 2.000 | 2.923 ms | 1.462 ms | 3453.000 |
| `_networkFetchRaw` | 1.000 | 2.724 ms | 2.724 ms | 1231.000 |
| `_cryptoRandomUUID` | 5.000 | 0.223 ms | 0.045 ms | 435.000 |
| `_log` | 3.000 | 0.093 ms | 0.031 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 71.000 | 92.816 ms | 758629.667 | 70 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 5.830 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 32.267 ms | 300368.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 21.643 ms | 157798.000 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 16.182 ms | 56865.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 8.438 ms | 41826.000 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 32.267 ms | 300368.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 21.643 ms | 157798.000 |
| real polyfill-body loads | by time | `assert` | 1.000 | 16.182 ms | 56865.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 8.438 ms | 41826.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 5.967 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 32.267 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 21.643 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 5.830 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 5.967 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 16.182 ms | 56865.667 |
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

