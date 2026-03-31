# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T20:29:33.217Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 132.760 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 7.157 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 2.158 ms
- Dominant bridge time: `_bridgeDispatch` 63.650 ms/iteration across 506.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 552106.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 10.406 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 652213.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 419.435 ms | 405.000 ms | 14.435 ms | 514 | 154.459 ms |
| 2 | 140.681 ms | 131.876 ms | 8.805 ms | 514 | 36.836 ms |
| 3 | 124.839 ms | 119.329 ms | 5.510 ms | 514 | 31.129 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 405.000 ms | 1.000 ms | 1.435 ms |
| 2 | 5.000 ms | 0.000 ms | 131.876 ms | 0.000 ms | 3.805 ms |
| 3 | 5.000 ms | 0.000 ms | 119.329 ms | 0.000 ms | 0.510 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 506.000 | 63.650 ms | 0.126 ms | 552106.667 |
| `_loadPolyfill` | 7.000 | 10.406 ms | 1.487 ms | 100059.333 |
| `_log` | 1.000 | 0.085 ms | 0.085 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 10.406 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 514.000 | 652213.000 | 628055.000 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `recv:BridgeCall` | 514.000 | 101179.000 | 68822.000 |
| `send:Execute` | 1.000 | 14303.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:20.629Z

- Warm wall: 353.377 -> 132.760 ms (-220.617 ms (-62.43%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.105 -> 7.157 ms (-102.948 ms (-93.50%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 103.000 -> 0.000 ms (-103.000 ms (-100.00%))
- Warm residual overhead: 2.104 -> 2.158 ms (+0.054 ms (+2.57%))
- Bridge time/iteration: 80.914 -> 74.141 ms (-6.773 ms (-8.37%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 652213.000 bytes (-29915.000 bytes (-4.39%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 13.470 -> 10.406 ms (-3.064 ms (-22.75%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 0.000 calls (-506.000 calls (-100.00%)); time 67.336 -> 0.000 ms (-67.336 ms (-100.00%)); response bytes 582021.667 -> 0.000 bytes (-582021.667 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 80.806 | 10.406 | -70.400 |
| Method time | `_bridgeDispatch` | 0.000 | 63.650 | +63.650 |
| Method time | `_log` | 0.108 | 0.085 | -0.023 |
| Method bytes | `_loadPolyfill` | 682081.000 | 100059.333 | -582021.667 |
| Method bytes | `_bridgeDispatch` | 0.000 | 552106.667 | +552106.667 |
| Frame bytes | `send:BridgeResponse` | 682128.000 | 652213.000 | -29915.000 |
| Frame bytes | `recv:BridgeCall` | 103142.000 | 101179.000 | -1963.000 |
| Frame bytes | `send:Execute` | 13321.000 | 14303.000 | +982.000 |

