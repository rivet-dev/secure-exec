# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T20:29:53.447Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1470.153 ms
- Bridge calls/iteration: 2562.000
- Warm fixed session overhead: 9.412 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.912 ms
- Dominant bridge time: `_bridgeDispatch` 640.133 ms/iteration across 2440.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547818.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 70.042 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3312400.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1654.983 ms | 1640.621 ms | 14.362 ms | 2562 | 889.417 ms |
| 2 | 1575.326 ms | 1565.563 ms | 9.763 ms | 2562 | 780.441 ms |
| 3 | 1364.980 ms | 1355.919 ms | 9.061 ms | 2562 | 631.954 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 1.000 ms | 1640.621 ms | 1.000 ms | 3.362 ms |
| 2 | 6.000 ms | 0.000 ms | 1565.563 ms | 0.000 ms | 3.763 ms |
| 3 | 5.000 ms | 0.000 ms | 1355.919 ms | 0.000 ms | 4.061 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2440.000 | 640.133 ms | 0.262 ms | 2547818.333 |
| `_loadPolyfill` | 70.000 | 70.042 ms | 1.001 ms | 758579.667 |
| `_fsExists` | 41.000 | 43.615 ms | 1.064 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 4.756 ms | 4.756 ms | 47.000 |
| `_fsReadFile` | 2.000 | 2.149 ms | 1.074 ms | 3364.000 |
| `_fsStat` | 1.000 | 1.764 ms | 1.764 ms | 206.333 |
| `_fsRmdir` | 1.000 | 1.371 ms | 1.371 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.161 ms | 1.161 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.039 ms | 1.039 ms | 47.000 |
| `_fsChmod` | 1.000 | 0.962 ms | 0.962 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 70.042 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2562.000 | 3312400.333 | 3191986.333 |
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

Baseline scenario timestamp: 2026-03-31T20:09:28.411Z

- Warm wall: 1737.108 -> 1470.153 ms (-266.955 ms (-15.37%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.105 -> 9.412 ms (+0.307 ms (+3.37%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.605 -> 3.912 ms (+0.307 ms (+8.52%))
- Bridge time/iteration: 899.960 -> 767.271 ms (-132.689 ms (-14.74%))
- BridgeResponse encoded bytes/iteration: 7509075.333 -> 3312400.333 bytes (-4196675.000 bytes (-55.89%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 64.531 -> 70.042 ms (+5.511 ms (+8.54%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 758.816 | 640.133 | -118.683 |
| Method time | `_fsExists` | 60.389 | 43.615 | -16.774 |
| Method time | `_loadPolyfill` | 64.531 | 70.042 | +5.511 |
| Method bytes | `_bridgeDispatch` | 6744496.000 | 2547818.333 | -4196677.667 |
| Method bytes | `_fsStat` | 203.667 | 206.333 | +2.666 |
| Frame bytes | `send:BridgeResponse` | 7509075.333 | 3312400.333 | -4196675.000 |

