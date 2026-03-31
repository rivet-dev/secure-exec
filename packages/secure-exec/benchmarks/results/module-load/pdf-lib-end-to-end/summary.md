# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T05:47:28.174Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.

## Progress Copy Fields

- Warm wall mean: 387.063 ms
- Bridge calls/iteration: 1666.000
- Warm fixed session overhead: 109.839 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.500 ms, ExecutionResult->Destroy 102.000 ms, residual 2.338 ms
- Dominant bridge time: `_loadPolyfill` 70.926 ms/iteration across 1665.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1919343.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 1919390.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 610.573 ms | 496.626 ms | 113.947 ms | 1666 | 111.508 ms |
| 2 | 383.764 ms | 272.358 ms | 111.406 ms | 1666 | 50.241 ms |
| 3 | 390.361 ms | 282.090 ms | 108.271 ms | 1666 | 51.398 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 496.626 ms | 103.000 ms | 1.947 ms |
| 2 | 0.000 ms | 7.000 ms | 272.358 ms | 102.000 ms | 2.406 ms |
| 3 | 0.000 ms | 4.000 ms | 282.090 ms | 102.000 ms | 2.271 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 1665.000 | 70.926 ms | 0.043 ms | 1919343.000 |
| `_log` | 1.000 | 0.123 ms | 0.123 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 1666.000 | 1919390.000 | 1841088.000 |
| `send:Execute` | 1.000 | 1241574.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 1666.000 | 248999.000 | 147382.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:29:25.657Z

- Warm wall: 346.978 -> 387.063 ms (+40.085 ms (+11.55%))
- Bridge calls/iteration: 1666.000 -> 1666.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.320 -> 109.839 ms (+2.519 ms (+2.35%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: -0.180 -> 2.338 ms (+2.518 ms (-1398.89%))
- Bridge time/iteration: 64.197 -> 71.049 ms (+6.852 ms (+10.67%))
- BridgeResponse encoded bytes/iteration: 1919390.000 -> 1919390.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 64.109 | 70.926 | +6.817 |
| Method time | `_log` | 0.088 | 0.123 | +0.035 |
| Frame bytes | `send:Ping` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `recv:Pong` | 0.000 | 38.000 | +38.000 |

