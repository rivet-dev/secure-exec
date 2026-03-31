# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T20:29:48.229Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1823.659 ms
- Bridge calls/iteration: 2745.000
- Warm fixed session overhead: 12.578 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 6.500 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 0.000 ms, residual 5.578 ms
- Dominant bridge time: `_bridgeDispatch` 816.475 ms/iteration across 2631.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2678634.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 66.774 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3444124.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1896.289 ms | 1882.749 ms | 13.540 ms | 2745 | 1036.670 ms |
| 2 | 1692.484 ms | 1679.596 ms | 12.888 ms | 2745 | 840.500 ms |
| 3 | 1954.833 ms | 1942.566 ms | 12.267 ms | 2745 | 899.437 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 1882.749 ms | 0.000 ms | 4.540 ms |
| 2 | 8.000 ms | 0.000 ms | 1679.596 ms | 0.000 ms | 4.888 ms |
| 3 | 5.000 ms | 1.000 ms | 1942.566 ms | 0.000 ms | 6.267 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2631.000 | 816.475 ms | 0.310 ms | 2678634.667 |
| `_loadPolyfill` | 71.000 | 66.774 ms | 0.940 ms | 758629.667 |
| `_fsExists` | 32.000 | 31.906 ms | 0.997 ms | 1600.000 |
| `_fsReadFile` | 2.000 | 6.474 ms | 3.237 ms | 3453.000 |
| `_networkFetchRaw` | 1.000 | 3.573 ms | 3.573 ms | 1231.000 |
| `_cryptoRandomUUID` | 5.000 | 0.247 ms | 0.049 ms | 435.000 |
| `_log` | 3.000 | 0.086 ms | 0.029 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 71.000 | 66.774 ms | 758629.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2745.000 | 3444124.333 | 3315109.333 |
| `recv:BridgeCall` | 2745.000 | 572981.000 | 400410.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 15211.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:36.991Z

- Warm wall: 1835.606 -> 1823.659 ms (-11.947 ms (-0.65%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.839 -> 12.578 ms (-104.261 ms (-89.23%))
- Warm Create->InjectGlobals: 5.500 -> 6.500 ms (+1.000 ms (+18.18%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 0.000 ms (-102.000 ms (-100.00%))
- Warm residual overhead: 9.339 -> 5.578 ms (-3.761 ms (-40.27%))
- Bridge time/iteration: 938.761 -> 925.536 ms (-13.225 ms (-1.41%))
- BridgeResponse encoded bytes/iteration: 3642576.667 -> 3444124.333 bytes (-198452.334 bytes (-5.45%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 77.999 -> 66.774 ms (-11.225 ms (-14.39%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2631.000 -> 0.000 calls (-2631.000 calls (-100.00%)); time 812.973 -> 0.000 ms (-812.973 ms (-100.00%)); response bytes 2877087.000 -> 0.000 bytes (-2877087.000 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 890.972 | 66.774 | -824.198 |
| Method time | `_bridgeDispatch` | 0.000 | 816.475 | +816.475 |
| Method time | `_fsExists` | 38.878 | 31.906 | -6.972 |
| Method bytes | `_loadPolyfill` | 3635716.667 | 758629.667 | -2877087.000 |
| Method bytes | `_bridgeDispatch` | 0.000 | 2678634.667 | +2678634.667 |
| Frame bytes | `send:BridgeResponse` | 3642576.667 | 3444124.333 | -198452.334 |
| Frame bytes | `recv:BridgeCall` | 583632.000 | 572981.000 | -10651.000 |
| Frame bytes | `send:Execute` | 14229.000 | 15211.000 | +982.000 |

