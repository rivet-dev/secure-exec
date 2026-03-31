# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T04:18:10.561Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 145.024 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 107.840 ms
- Dominant bridge time: `_loadPolyfill` 29.381 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240830.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 348.304 ms | 233.860 ms | 114.444 ms | 102 | 78.740 ms |
| 2 | 140.848 ms | 32.693 ms | 108.155 ms | 102 | 4.004 ms |
| 3 | 149.201 ms | 41.675 ms | 107.526 ms | 102 | 5.673 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 29.381 ms | 0.291 ms | 408083.000 |
| `_log` | 1.000 | 0.092 ms | 0.092 ms | 47.000 |

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
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T04:01:52.147Z

- Warm wall: 143.365 -> 145.024 ms (+1.659 ms (+1.16%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.237 -> 107.840 ms (+0.603 ms (+0.56%))
- Bridge time/iteration: 16.426 -> 29.472 ms (+13.046 ms (+79.42%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 16.322 | 29.381 | +13.059 |
| Method time | `_log` | 0.104 | 0.092 | -0.012 |

