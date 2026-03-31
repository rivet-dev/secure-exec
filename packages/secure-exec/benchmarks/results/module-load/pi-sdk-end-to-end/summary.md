# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T21:00:55.880Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1695.689 ms
- Bridge calls/iteration: 2745.000
- Warm fixed session overhead: 9.169 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.669 ms
- Dominant bridge time: `_bridgeDispatch` 838.520 ms/iteration across 2631.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2678634.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 65.055 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3444124.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2121.304 ms | 2106.353 ms | 14.951 ms | 2745 | 1127.681 ms |
| 2 | 1629.334 ms | 1619.414 ms | 9.920 ms | 2745 | 848.781 ms |
| 3 | 1762.044 ms | 1753.626 ms | 8.418 ms | 2745 | 853.238 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 1.000 ms | 2106.353 ms | 0.000 ms | 4.951 ms |
| 2 | 6.000 ms | 0.000 ms | 1619.414 ms | 0.000 ms | 3.920 ms |
| 3 | 5.000 ms | 0.000 ms | 1753.626 ms | 0.000 ms | 3.418 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2631.000 | 838.520 ms | 0.319 ms | 2678634.667 |
| `_loadPolyfill` | 71.000 | 65.055 ms | 0.916 ms | 758629.667 |
| `_fsExists` | 32.000 | 34.673 ms | 1.084 ms | 1600.000 |
| `_networkFetchRaw` | 1.000 | 2.767 ms | 2.767 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 1.945 ms | 0.972 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.201 ms | 0.040 ms | 435.000 |
| `_log` | 3.000 | 0.073 ms | 0.024 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 71.000 | 65.055 ms | 758629.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
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

Baseline scenario timestamp: 2026-03-31T20:29:48.229Z

- Warm wall: 1823.659 -> 1695.689 ms (-127.970 ms (-7.02%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 12.578 -> 9.169 ms (-3.409 ms (-27.10%))
- Warm Create->InjectGlobals: 6.500 -> 5.500 ms (-1.000 ms (-15.38%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 5.578 -> 3.669 ms (-1.909 ms (-34.22%))
- Bridge time/iteration: 925.536 -> 943.233 ms (+17.697 ms (+1.91%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 66.774 -> 65.055 ms (-1.719 ms (-2.57%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 816.475 | 838.520 | +22.045 |
| Method time | `_fsReadFile` | 6.474 | 1.945 | -4.529 |
| Method time | `_fsExists` | 31.906 | 34.673 | +2.767 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

