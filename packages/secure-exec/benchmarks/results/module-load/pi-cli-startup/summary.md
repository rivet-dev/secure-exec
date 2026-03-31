# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T21:01:01.324Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1367.156 ms
- Bridge calls/iteration: 2562.000
- Warm fixed session overhead: 9.168 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.668 ms
- Dominant bridge time: `_bridgeDispatch` 716.479 ms/iteration across 2440.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547818.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 63.722 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3312400.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2094.957 ms | 2081.152 ms | 13.805 ms | 2562 | 1171.518 ms |
| 2 | 1672.466 ms | 1662.404 ms | 10.062 ms | 2562 | 872.818 ms |
| 3 | 1061.846 ms | 1053.571 ms | 8.275 ms | 2562 | 495.651 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.000 ms | 1.000 ms | 2081.152 ms | 0.000 ms | 4.805 ms |
| 2 | 6.000 ms | 0.000 ms | 1662.404 ms | 0.000 ms | 4.062 ms |
| 3 | 5.000 ms | 0.000 ms | 1053.571 ms | 0.000 ms | 3.275 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2440.000 | 716.479 ms | 0.294 ms | 2547818.333 |
| `_loadPolyfill` | 70.000 | 63.722 ms | 0.910 ms | 758579.667 |
| `_fsExists` | 41.000 | 51.473 ms | 1.255 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 5.812 ms | 5.812 ms | 47.000 |
| `_fsReadFile` | 2.000 | 2.404 ms | 1.202 ms | 3364.000 |
| `_fsWriteFile` | 1.000 | 1.648 ms | 1.648 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.310 ms | 1.310 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.188 ms | 1.188 ms | 47.000 |
| `_fsStat` | 1.000 | 1.144 ms | 1.144 ms | 206.333 |
| `_fsUtimes` | 1.000 | 1.081 ms | 1.081 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 63.722 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2562.000 | 3312400.333 | 3191986.333 |
| `recv:BridgeCall` | 2562.000 | 530167.000 | 369218.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 14155.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:29:53.447Z

- Warm wall: 1470.153 -> 1367.156 ms (-102.997 ms (-7.01%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.412 -> 9.168 ms (-0.244 ms (-2.59%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.912 -> 3.668 ms (-0.244 ms (-6.24%))
- Bridge time/iteration: 767.271 -> 846.662 ms (+79.391 ms (+10.35%))
- BridgeResponse encoded bytes/iteration: 3312400.333 -> 3312400.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 70.042 -> 63.722 ms (-6.320 ms (-9.02%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 640.133 | 716.479 | +76.346 |
| Method time | `_fsExists` | 43.615 | 51.473 | +7.858 |
| Method time | `_loadPolyfill` | 70.042 | 63.722 | -6.320 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

