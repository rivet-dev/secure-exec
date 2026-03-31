# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T20:56:14.296Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 33.412 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.440 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.440 ms
- Dominant bridge time: `_loadPolyfill` 10.399 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 10.399 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 79.670 ms | 64.934 ms | 14.736 ms | 59 | 36.037 ms |
| 2 | 34.142 ms | 28.727 ms | 5.415 ms | 59 | 4.074 ms |
| 3 | 32.682 ms | 27.217 ms | 5.465 ms | 59 | 3.602 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 64.934 ms | 0.000 ms | 1.736 ms |
| 2 | 5.000 ms | 0.000 ms | 28.727 ms | 0.000 ms | 0.415 ms |
| 3 | 5.000 ms | 0.000 ms | 27.217 ms | 0.000 ms | 0.465 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 10.399 ms | 3.466 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 4.110 ms | 0.075 ms | 40508.667 |
| `_log` | 1.000 | 0.061 ms | 0.061 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 10.399 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 140415.000 | 137642.000 |
| `send:Execute` | 1.000 | 14181.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10738.000 | 7038.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:29:31.390Z

- Warm wall: 37.787 -> 33.412 ms (-4.375 ms (-11.58%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.579 -> 5.440 ms (-0.139 ms (-2.49%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.579 -> 0.440 ms (-0.139 ms (-24.01%))
- Bridge time/iteration: 18.062 -> 14.571 ms (-3.491 ms (-19.33%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 12.742 -> 10.399 ms (-2.343 ms (-18.39%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 12.742 | 10.399 | -2.343 |
| Method time | `_bridgeDispatch` | 5.248 | 4.110 | -1.138 |
| Method time | `_log` | 0.072 | 0.061 | -0.011 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

