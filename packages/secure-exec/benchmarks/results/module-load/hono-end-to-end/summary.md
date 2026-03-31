# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T05:47:24.755Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 149.463 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 108.507 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 101.500 ms, residual 1.508 ms
- Dominant bridge time: `_loadPolyfill` 19.199 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240830.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 316.831 ms | 202.541 ms | 114.290 ms | 102 | 48.875 ms |
| 2 | 143.869 ms | 35.301 ms | 108.568 ms | 102 | 4.124 ms |
| 3 | 155.056 ms | 46.609 ms | 108.447 ms | 102 | 4.808 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 4.000 ms | 6.000 ms | 202.541 ms | 102.000 ms | 2.290 ms |
| 2 | 1.000 ms | 5.000 ms | 35.301 ms | 102.000 ms | 0.568 ms |
| 3 | 0.000 ms | 5.000 ms | 46.609 ms | 101.000 ms | 2.447 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 19.199 ms | 0.190 ms | 408083.000 |
| `_log` | 1.000 | 0.070 ms | 0.070 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1240830.000 | 0.000 |
| `send:BridgeResponse` | 102.000 | 408130.000 | 403336.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 102.000 | 15421.000 | 9208.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:24.755Z

- Warm wall: 149.463 -> 149.463 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.507 -> 108.507 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.508 -> 1.508 ms (0.000 ms (0.00%))
- Bridge time/iteration: 19.269 -> 19.269 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

