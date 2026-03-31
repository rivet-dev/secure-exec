# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T20:29:31.390Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 37.787 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.579 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.579 ms
- Dominant bridge time: `_loadPolyfill` 12.742 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 12.742 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 115.911 ms | 87.533 ms | 28.378 ms | 59 | 45.741 ms |
| 2 | 37.024 ms | 31.156 ms | 5.868 ms | 59 | 3.981 ms |
| 3 | 38.549 ms | 33.260 ms | 5.289 ms | 59 | 4.464 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 21.000 ms | 0.000 ms | 87.533 ms | 0.000 ms | 7.378 ms |
| 2 | 5.000 ms | 0.000 ms | 31.156 ms | 0.000 ms | 0.868 ms |
| 3 | 5.000 ms | 0.000 ms | 33.260 ms | 0.000 ms | 0.289 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 12.742 ms | 4.247 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 5.248 ms | 0.095 ms | 40508.667 |
| `_log` | 1.000 | 0.072 ms | 0.072 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 12.742 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 140415.000 | 137642.000 |
| `send:Execute` | 1.000 | 14181.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10738.000 | 7038.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:18.129Z

- Warm wall: 140.959 -> 37.787 ms (-103.172 ms (-73.19%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.115 -> 5.579 ms (-103.536 ms (-94.89%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 0.000 ms (-102.500 ms (-100.00%))
- Warm residual overhead: 1.615 -> 0.579 ms (-1.036 ms (-64.15%))
- Bridge time/iteration: 38.499 -> 18.062 ms (-20.437 ms (-53.08%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 140415.000 bytes (-3456.000 bytes (-2.40%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 29.585 -> 12.742 ms (-16.843 ms (-56.93%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 0.000 calls (-55.000 calls (-100.00%)); time 8.779 -> 0.000 ms (-8.779 ms (-100.00%)); response bytes 43964.667 -> 0.000 bytes (-43964.667 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 38.364 | 12.742 | -25.622 |
| Method time | `_bridgeDispatch` | 0.000 | 5.248 | +5.248 |
| Method time | `_log` | 0.135 | 0.072 | -0.063 |
| Method bytes | `_loadPolyfill` | 143824.000 | 99859.333 | -43964.667 |
| Method bytes | `_bridgeDispatch` | 0.000 | 40508.667 | +40508.667 |
| Frame bytes | `send:BridgeResponse` | 143871.000 | 140415.000 | -3456.000 |
| Frame bytes | `send:Execute` | 13199.000 | 14181.000 | +982.000 |
| Frame bytes | `recv:BridgeCall` | 10948.000 | 10738.000 | -210.000 |

