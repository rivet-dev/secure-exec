# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T20:56:16.125Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 230.975 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 7.713 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 1.712 ms
- Dominant bridge time: `_bridgeDispatch` 62.437 ms/iteration across 506.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 552106.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 12.926 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 652213.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 230.490 ms | 214.146 ms | 16.344 ms | 514 | 95.174 ms |
| 2 | 126.656 ms | 119.812 ms | 6.844 ms | 514 | 33.949 ms |
| 3 | 335.294 ms | 326.713 ms | 8.581 ms | 514 | 97.359 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 214.146 ms | 1.000 ms | 3.344 ms |
| 2 | 6.000 ms | 0.000 ms | 119.812 ms | 1.000 ms | -0.156 ms |
| 3 | 5.000 ms | 0.000 ms | 326.713 ms | 0.000 ms | 3.581 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 506.000 | 62.437 ms | 0.123 ms | 552106.667 |
| `_loadPolyfill` | 7.000 | 12.926 ms | 1.847 ms | 100059.333 |
| `_log` | 1.000 | 0.131 ms | 0.131 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 12.926 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 514.000 | 652213.000 | 628055.000 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `recv:BridgeCall` | 514.000 | 101179.000 | 68822.000 |
| `send:Execute` | 1.000 | 14303.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:29:33.217Z

- Warm wall: 132.760 -> 230.975 ms (+98.215 ms (+73.98%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.157 -> 7.713 ms (+0.556 ms (+7.77%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 2.158 -> 1.712 ms (-0.446 ms (-20.67%))
- Bridge time/iteration: 74.141 -> 75.494 ms (+1.353 ms (+1.82%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.406 -> 12.926 ms (+2.520 ms (+24.22%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.406 | 12.926 | +2.520 |
| Method time | `_bridgeDispatch` | 63.650 | 62.437 | -1.213 |
| Method time | `_log` | 0.085 | 0.131 | +0.046 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

