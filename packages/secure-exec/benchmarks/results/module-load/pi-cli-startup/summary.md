# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T20:09:28.411Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1737.108 ms
- Bridge calls/iteration: 2562.000
- Warm fixed session overhead: 9.105 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.605 ms
- Dominant bridge time: `_bridgeDispatch` 758.816 ms/iteration across 2440.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 6744496.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 64.531 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 7509075.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1779.084 ms | 1764.725 ms | 14.359 ms | 2562 | 991.038 ms |
| 2 | 1723.868 ms | 1714.395 ms | 9.473 ms | 2562 | 804.536 ms |
| 3 | 1750.348 ms | 1741.611 ms | 8.737 ms | 2562 | 904.306 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 10.000 ms | 0.000 ms | 1764.725 ms | 1.000 ms | 3.359 ms |
| 2 | 6.000 ms | 0.000 ms | 1714.395 ms | 0.000 ms | 3.473 ms |
| 3 | 5.000 ms | 0.000 ms | 1741.611 ms | 0.000 ms | 3.737 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2440.000 | 758.816 ms | 0.311 ms | 6744496.000 |
| `_loadPolyfill` | 70.000 | 64.531 ms | 0.922 ms | 758579.667 |
| `_fsExists` | 41.000 | 60.389 ms | 1.473 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 6.044 ms | 6.044 ms | 47.000 |
| `_fsReadFile` | 2.000 | 2.220 ms | 1.110 ms | 3364.000 |
| `_fsStat` | 1.000 | 1.968 ms | 1.968 ms | 203.667 |
| `_fsWriteFile` | 1.000 | 1.515 ms | 1.515 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.473 ms | 1.473 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.445 ms | 1.445 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.256 ms | 1.256 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 64.531 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2562.000 | 7509075.333 | 7388661.333 |
| `recv:BridgeCall` | 2562.000 | 530167.000 | 369218.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 14155.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:43.439Z

- Warm wall: 1809.331 -> 1737.108 ms (-72.223 ms (-3.99%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.805 -> 9.105 ms (-108.700 ms (-92.27%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 0.000 ms (-102.000 ms (-100.00%))
- Warm residual overhead: 10.305 -> 3.605 ms (-6.700 ms (-65.02%))
- Bridge time/iteration: 987.059 -> 899.960 ms (-87.099 ms (-8.82%))
- BridgeResponse encoded bytes/iteration: 3500710.000 -> 7509075.333 bytes (+4008365.333 bytes (+114.50%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 83.558 -> 64.531 ms (-19.027 ms (-22.77%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2440.000 -> 0.000 calls (-2440.000 calls (-100.00%)); time 848.487 -> 0.000 ms (-848.487 ms (-100.00%)); response bytes 2736128.000 -> 0.000 bytes (-2736128.000 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 932.045 | 64.531 | -867.514 |
| Method time | `_bridgeDispatch` | 0.000 | 758.816 | +758.816 |
| Method time | `_fsExists` | 43.249 | 60.389 | +17.140 |
| Method bytes | `_bridgeDispatch` | 0.000 | 6744496.000 | +6744496.000 |
| Method bytes | `_loadPolyfill` | 3494707.667 | 758579.667 | -2736128.000 |
| Method bytes | `_fsStat` | 206.333 | 203.667 | -2.666 |
| Frame bytes | `send:BridgeResponse` | 3500710.000 | 7509075.333 | +4008365.333 |
| Frame bytes | `recv:BridgeCall` | 540030.000 | 530167.000 | -9863.000 |
| Frame bytes | `send:Execute` | 13173.000 | 14155.000 | +982.000 |

