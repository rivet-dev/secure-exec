# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T20:09:09.260Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1707.406 ms
- Bridge calls/iteration: 2511.000
- Warm fixed session overhead: 9.018 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.518 ms
- Dominant bridge time: `_bridgeDispatch` 850.245 ms/iteration across 2437.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 6744299.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 69.902 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 7506336.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1856.977 ms | 1843.018 ms | 13.959 ms | 2511 | 1032.568 ms |
| 2 | 1719.757 ms | 1710.061 ms | 9.696 ms | 2511 | 873.917 ms |
| 3 | 1695.055 ms | 1686.716 ms | 8.339 ms | 2511 | 856.263 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 1843.018 ms | 1.000 ms | 3.959 ms |
| 2 | 6.000 ms | 0.000 ms | 1710.061 ms | 0.000 ms | 3.696 ms |
| 3 | 5.000 ms | 0.000 ms | 1686.716 ms | 0.000 ms | 3.339 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2437.000 | 850.245 ms | 0.349 ms | 6744299.000 |
| `_loadPolyfill` | 70.000 | 69.902 ms | 0.999 ms | 758579.667 |
| `_fsExists` | 2.000 | 0.435 ms | 0.217 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.286 ms | 0.286 ms | 3311.000 |
| `_log` | 1.000 | 0.049 ms | 0.049 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 69.902 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2511.000 | 7506336.667 | 7388319.667 |
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

Baseline scenario timestamp: 2026-03-31T13:28:30.559Z

- Warm wall: 1668.363 -> 1707.406 ms (+39.043 ms (+2.34%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 115.606 -> 9.018 ms (-106.588 ms (-92.20%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 0.000 ms (-102.500 ms (-100.00%))
- Warm residual overhead: 7.606 -> 3.518 ms (-4.088 ms (-53.75%))
- Bridge time/iteration: 818.355 -> 920.916 ms (+102.561 ms (+12.53%))
- BridgeResponse encoded bytes/iteration: 3497993.667 -> 7506336.667 bytes (+4008343.000 bytes (+114.59%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 75.899 -> 69.902 ms (-5.997 ms (-7.90%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2437.000 -> 0.000 calls (-2437.000 calls (-100.00%)); time 741.039 -> 0.000 ms (-741.039 ms (-100.00%)); response bytes 2735956.000 -> 0.000 bytes (-2735956.000 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 0.000 | 850.245 | +850.245 |
| Method time | `_loadPolyfill` | 816.938 | 69.902 | -747.036 |
| Method time | `_fsExists` | 0.802 | 0.435 | -0.367 |
| Method bytes | `_bridgeDispatch` | 0.000 | 6744299.000 | +6744299.000 |
| Method bytes | `_loadPolyfill` | 3494535.667 | 758579.667 | -2735956.000 |
| Frame bytes | `send:BridgeResponse` | 3497993.667 | 7506336.667 | +4008343.000 |
| Frame bytes | `recv:BridgeCall` | 530308.000 | 520459.000 | -9849.000 |
| Frame bytes | `send:Execute` | 13302.000 | 14284.000 | +982.000 |

