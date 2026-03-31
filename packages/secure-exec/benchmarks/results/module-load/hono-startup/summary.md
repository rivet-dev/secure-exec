# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T04:18:09.493Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 141.156 ms
- Bridge calls/iteration: 102.000
- Warm fixed session overhead: 108.902 ms
- Dominant bridge time: `_loadPolyfill` 21.553 ms/iteration across 101.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 408083.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1240713.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 303.453 ms | 189.292 ms | 114.161 ms | 102 | 56.836 ms |
| 2 | 142.446 ms | 32.866 ms | 109.580 ms | 102 | 4.221 ms |
| 3 | 139.865 ms | 31.641 ms | 108.224 ms | 102 | 3.821 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 101.000 | 21.553 ms | 0.213 ms | 408083.000 |
| `_log` | 1.000 | 0.073 ms | 0.073 ms | 47.000 |

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

Baseline scenario timestamp: 2026-03-31T04:01:51.150Z

- Warm wall: 153.889 -> 141.156 ms (-12.733 ms (-8.27%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.073 -> 108.902 ms (+0.829 ms (+0.77%))
- Bridge time/iteration: 22.174 -> 21.626 ms (-0.548 ms (-2.47%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 22.048 | 21.553 | -0.495 |
| Method time | `_log` | 0.125 | 0.073 | -0.052 |

