# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T21:00:49.796Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1665.403 ms
- Bridge calls/iteration: 2511.000
- Warm fixed session overhead: 12.056 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 6.056 ms
- Dominant bridge time: `_bridgeDispatch` 779.699 ms/iteration across 2437.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547621.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 74.071 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3309659.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1600.390 ms | 1581.997 ms | 18.393 ms | 2511 | 909.973 ms |
| 2 | 1728.922 ms | 1716.352 ms | 12.570 ms | 2511 | 874.685 ms |
| 3 | 1601.884 ms | 1590.343 ms | 11.541 ms | 2511 | 779.135 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 1.000 ms | 1581.997 ms | 2.000 ms | 6.393 ms |
| 2 | 6.000 ms | 0.000 ms | 1716.352 ms | 0.000 ms | 6.570 ms |
| 3 | 6.000 ms | 0.000 ms | 1590.343 ms | 0.000 ms | 5.541 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2437.000 | 779.699 ms | 0.320 ms | 2547621.333 |
| `_loadPolyfill` | 70.000 | 74.071 ms | 1.058 ms | 758579.667 |
| `_fsExists` | 2.000 | 0.445 ms | 0.222 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.235 ms | 0.235 ms | 3311.000 |
| `_log` | 1.000 | 0.148 ms | 0.148 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 74.071 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

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

Baseline scenario timestamp: 2026-03-31T20:29:42.089Z

- Warm wall: 1422.383 -> 1665.403 ms (+243.020 ms (+17.09%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.264 -> 12.056 ms (+2.792 ms (+30.14%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.263 -> 6.056 ms (+2.793 ms (+85.60%))
- Bridge time/iteration: 884.867 -> 854.598 ms (-30.269 ms (-3.42%))
- BridgeResponse encoded bytes/iteration: 3309659.000 -> 3309659.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 60.800 -> 74.071 ms (+13.271 ms (+21.83%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 822.419 | 779.699 | -42.720 |
| Method time | `_loadPolyfill` | 60.800 | 74.071 | +13.271 |
| Method time | `_fsReadFile` | 0.831 | 0.235 | -0.596 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

