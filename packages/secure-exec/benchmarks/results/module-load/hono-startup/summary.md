# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T04:43:24.248Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 167.784 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 109.038 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 103.500 ms, residual 0.538 ms
- Dominant bridge time: `_loadPolyfill` 22.890 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240713.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 287.597 ms | 175.108 ms | 112.489 ms | 102 | 48.752 ms |
| 2 | 148.461 ms | 37.592 ms | 110.869 ms | 102 | 5.858 ms |
| 3 | 187.106 ms | 79.898 ms | 107.208 ms | 102 | 14.351 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 175.108 ms | 103.000 ms | 1.489 ms |
| 2 | 0.000 ms | 6.000 ms | 37.592 ms | 105.000 ms | -0.131 ms |
| 3 | 0.000 ms | 4.000 ms | 79.898 ms | 102.000 ms | 1.208 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 22.890 ms | 0.227 ms | 408083.000 |
| `_log` | 1.000 | 0.097 ms | 0.097 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1240713.000 | 0.000 |
| `send:BridgeResponse` | 102.000 | 408130.000 | 403336.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 102.000 | 15407.000 | 9194.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T04:38:26.527Z

- Warm wall: 142.094 -> 167.784 ms (+25.690 ms (+18.08%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.660 -> 109.038 ms (+1.378 ms (+1.28%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm ExecutionResult->Destroy: 102.500 -> 103.500 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 0.160 -> 0.538 ms (+0.378 ms (+236.25%))
- Bridge time/iteration: 18.681 -> 22.987 ms (+4.306 ms (+23.05%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 18.621 | 22.890 | +4.269 |
| Method time | `_log` | 0.060 | 0.097 | +0.037 |

