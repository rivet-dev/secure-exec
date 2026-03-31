# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T13:28:19.098Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 139.728 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 109.456 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 102.500 ms, residual 1.456 ms
- Dominant bridge time: `_loadPolyfill` 16.919 ms/iteration across 58.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 143824.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 10.759 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 55.000 calls/iteration, 6.160 ms/iteration, 43964.667 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411389.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 209.293 ms | 89.732 ms | 119.561 ms | 59 | 42.314 ms |
| 2 | 140.080 ms | 31.370 ms | 108.710 ms | 59 | 4.902 ms |
| 3 | 139.377 ms | 29.175 ms | 110.202 ms | 59 | 3.848 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 89.732 ms | 103.000 ms | 4.561 ms |
| 2 | 5.000 ms | 1.000 ms | 31.370 ms | 102.000 ms | 0.710 ms |
| 3 | 5.000 ms | 0.000 ms | 29.175 ms | 103.000 ms | 2.202 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 58.000 | 16.919 ms | 0.292 ms | 143824.000 |
| `_log` | 1.000 | 0.102 ms | 0.102 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 10.759 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 55.000 | 6.160 ms | 43964.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/compose.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/context.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono-base.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/http-exception.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411389.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 143871.000 | 141098.000 |
| `send:Execute` | 1.000 | 13316.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10962.000 | 7372.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:21:21.114Z

- Warm wall: 143.141 -> 139.728 ms (-3.413 ms (-2.38%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.883 -> 109.456 ms (-0.427 ms (-0.39%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.883 -> 1.456 ms (-1.427 ms (-49.50%))
- Bridge time/iteration: 23.570 -> 17.021 ms (-6.549 ms (-27.79%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 18.194 -> 10.759 ms (-7.435 ms (-40.87%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 5.305 -> 6.160 ms (+0.855 ms (+16.12%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 23.499 | 16.919 | -6.580 |
| Method time | `_log` | 0.071 | 0.102 | +0.031 |
| Frame bytes | `send:Execute` | 424678.000 | 13316.000 | -411362.000 |
| Frame bytes | `send:WarmSnapshot` | 411365.333 | 411389.667 | +24.334 |
| Frame bytes | `send:Ping` | 38.000 | 50.667 | +12.667 |

