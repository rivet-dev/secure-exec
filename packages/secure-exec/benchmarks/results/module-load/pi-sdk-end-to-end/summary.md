# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:10:21.683Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1018.723 ms
- Bridge calls/iteration: 2745.000
- Warm fixed session overhead: 9.188 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.188 ms
- Dominant bridge time: `_bridgeDispatch` 452.775 ms/iteration across 2631.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2678634.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 51.011 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 15.614 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 15.614 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3444124.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 1355.654 ms; runtime create 185.241 ms; first pass 1170.413 ms; sandbox 0.000 ms; mock requests 1; checks `messageCount`=2
- Sandbox true cold start, warm snapshot disabled: total 1334.497 ms; runtime create 5.468 ms; first pass 1329.029 ms; sandbox 0.000 ms; mock requests 1; checks `messageCount`=2
- Sandbox new-session replay, warm snapshot enabled: cold 1292.532 ms; warm 1018.723 ms; sandbox cold 0.000 ms, warm 0.000 ms; mock requests mean 1.000
- Sandbox new-session replay, warm snapshot disabled: cold 1365.665 ms; warm 935.891 ms; sandbox cold 0.000 ms, warm 0.000 ms; mock requests mean 1.000
- Sandbox same-session replay: total 1172.461 ms; mock requests 2; first checks `messageCount`=2; replay checks `messageCount`=2
- Host same-session control: total 417.481 ms; first 409.986 ms; replay 7.492 ms; mock requests 2; first checks `messageCount`=2; replay checks `messageCount`=2

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1292.532 ms | 1278.070 ms | 14.462 ms | 2745 | 680.002 ms |
| 2 | 983.580 ms | 974.225 ms | 9.355 ms | 2745 | 465.586 ms |
| 3 | 1053.866 ms | 1044.846 ms | 9.020 ms | 2745 | 474.419 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 1278.070 ms | 0.000 ms | 5.462 ms |
| 2 | 6.000 ms | 0.000 ms | 974.225 ms | 0.000 ms | 3.355 ms |
| 3 | 6.000 ms | 0.000 ms | 1044.846 ms | 0.000 ms | 3.020 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2631.000 | 452.775 ms | 0.172 ms | 2678634.667 |
| `_loadPolyfill` | 71.000 | 51.011 ms | 0.718 ms | 758629.667 |
| `_fsExists` | 32.000 | 31.092 ms | 0.972 ms | 1600.000 |
| `_networkFetchRaw` | 1.000 | 2.980 ms | 2.980 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 1.755 ms | 0.877 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.275 ms | 0.055 ms | 435.000 |
| `_log` | 3.000 | 0.113 ms | 0.038 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 71.000 | 51.011 ms | 758629.667 | 70 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 6.004 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 15.614 ms | 300368.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 9.729 ms | 157798.000 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 7.048 ms | 56865.667 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.203 ms | 82604.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 15.614 ms | 300368.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 9.729 ms | 157798.000 |
| real polyfill-body loads | by time | `assert` | 1.000 | 7.048 ms | 56865.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.203 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 6.004 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 15.614 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 9.729 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 6.004 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.203 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 7.048 ms | 56865.667 |
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

Baseline scenario timestamp: 2026-03-31T22:51:57.749Z

- Warm wall: 1812.370 -> 1018.723 ms (-793.647 ms (-43.79%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.002 -> 9.188 ms (+0.186 ms (+2.07%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.002 -> 3.188 ms (+0.186 ms (+6.20%))
- Bridge time/iteration: 987.270 -> 540.002 ms (-447.268 ms (-45.30%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 92.816 -> 51.011 ms (-41.805 ms (-45.04%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.830 -> 6.004 ms (+0.174 ms (+2.98%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.267 -> 15.614 ms (-16.653 ms (-51.61%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 21.643 -> 9.729 ms (-11.914 ms (-55.05%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.967 -> 6.203 ms (+0.236 ms (+3.96%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.182 -> 7.048 ms (-9.134 ms (-56.45%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.267 -> 15.614 ms (-16.653 ms (-51.61%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 21.643 -> 9.729 ms (-11.914 ms (-55.05%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.182 -> 7.048 ms (-9.134 ms (-56.45%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.438 -> 5.054 ms (-3.384 ms (-40.10%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.967 -> 6.203 ms (+0.236 ms (+3.96%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.267 -> 15.614 ms (-16.653 ms (-51.61%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 21.643 -> 9.729 ms (-11.914 ms (-55.05%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.830 -> 6.004 ms (+0.174 ms (+2.98%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.967 -> 6.203 ms (+0.236 ms (+3.96%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.182 -> 7.048 ms (-9.134 ms (-56.45%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 850.049 | 452.775 | -397.274 |
| Method time | `_loadPolyfill` | 92.816 | 51.011 | -41.805 |
| Method time | `_fsExists` | 38.442 | 31.092 | -7.350 |

