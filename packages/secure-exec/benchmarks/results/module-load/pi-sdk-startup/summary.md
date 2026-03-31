# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T20:29:42.089Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1422.383 ms
- Bridge calls/iteration: 2511.000
- Warm fixed session overhead: 9.264 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.263 ms
- Dominant bridge time: `_bridgeDispatch` 822.419 ms/iteration across 2437.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547621.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 60.800 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3309659.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2155.286 ms | 2138.992 ms | 16.294 ms | 2511 | 1191.288 ms |
| 2 | 1423.741 ms | 1413.479 ms | 10.262 ms | 2511 | 708.441 ms |
| 3 | 1421.026 ms | 1412.761 ms | 8.265 ms | 2511 | 754.872 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 1.000 ms | 2138.992 ms | 1.000 ms | 5.294 ms |
| 2 | 6.000 ms | 0.000 ms | 1413.479 ms | 0.000 ms | 4.262 ms |
| 3 | 6.000 ms | 0.000 ms | 1412.761 ms | 0.000 ms | 2.265 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2437.000 | 822.419 ms | 0.337 ms | 2547621.333 |
| `_loadPolyfill` | 70.000 | 60.800 ms | 0.869 ms | 758579.667 |
| `_fsReadFile` | 1.000 | 0.831 ms | 0.831 ms | 3311.000 |
| `_fsExists` | 2.000 | 0.710 ms | 0.355 ms | 100.000 |
| `_log` | 1.000 | 0.107 ms | 0.107 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 60.800 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2511.000 | 3309659.000 | 3191642.000 |
| `recv:BridgeCall` | 2511.000 | 520459.000 | 362433.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 14284.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:09:09.260Z

- Warm wall: 1707.406 -> 1422.383 ms (-285.023 ms (-16.69%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.018 -> 9.264 ms (+0.246 ms (+2.73%))
- Warm Create->InjectGlobals: 5.500 -> 6.000 ms (+0.500 ms (+9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.518 -> 3.263 ms (-0.255 ms (-7.25%))
- Bridge time/iteration: 920.916 -> 884.867 ms (-36.049 ms (-3.91%))
- BridgeResponse encoded bytes/iteration: 7506336.667 -> 3309659.000 bytes (-4196677.667 bytes (-55.91%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 69.902 -> 60.800 ms (-9.102 ms (-13.02%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 850.245 | 822.419 | -27.826 |
| Method time | `_loadPolyfill` | 69.902 | 60.800 | -9.102 |
| Method time | `_fsReadFile` | 0.286 | 0.831 | +0.545 |
| Method bytes | `_bridgeDispatch` | 6744299.000 | 2547621.333 | -4196677.667 |
| Frame bytes | `send:BridgeResponse` | 7506336.667 | 3309659.000 | -4196677.667 |

