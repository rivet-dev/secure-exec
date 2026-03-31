# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T09:37:46.857Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 150.142 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 109.981 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 2.981 ms
- Dominant bridge time: `_loadPolyfill` 16.343 ms/iteration across 58.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 206155.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 11.237 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 55.000 calls/iteration, 5.107 ms/iteration, 106296.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1242211.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 273.995 ms | 160.348 ms | 113.647 ms | 59 | 39.603 ms |
| 2 | 146.490 ms | 35.632 ms | 110.858 ms | 59 | 3.848 ms |
| 3 | 153.794 ms | 44.691 ms | 109.103 ms | 59 | 5.805 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 160.348 ms | 103.000 ms | 1.647 ms |
| 2 | 0.000 ms | 5.000 ms | 35.632 ms | 102.000 ms | 3.858 ms |
| 3 | 1.000 ms | 4.000 ms | 44.691 ms | 102.000 ms | 2.103 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 58.000 | 16.343 ms | 0.282 ms | 206155.333 |
| `_log` | 1.000 | 0.075 ms | 0.075 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 11.237 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 55.000 | 5.107 ms | 106296.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/compose.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/context.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono-base.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/http-exception.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1242211.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:BridgeResponse` | 59.000 | 206202.333 | 203429.333 |
| `recv:BridgeCall` | 59.000 | 10962.000 | 7372.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T09:37:46.857Z

- Warm wall: 150.142 -> 150.142 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.981 -> 109.981 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.981 -> 2.981 ms (0.000 ms (0.00%))
- Bridge time/iteration: 16.419 -> 16.419 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 206202.333 -> 206202.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 11.237 -> 11.237 ms (0.000 ms (0.00%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 5.107 -> 5.107 ms (0.000 ms (0.00%)); response bytes 106296.000 -> 106296.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

