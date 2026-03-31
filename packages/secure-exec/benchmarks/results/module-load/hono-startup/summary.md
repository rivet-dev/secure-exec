# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T13:28:18.129Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 140.959 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 109.115 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 102.500 ms, residual 1.615 ms
- Dominant bridge time: `_loadPolyfill` 38.364 ms/iteration across 58.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 143824.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 29.585 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 55.000 calls/iteration, 8.779 ms/iteration, 43964.667 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411389.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 306.868 ms | 185.274 ms | 121.594 ms | 59 | 105.638 ms |
| 2 | 143.324 ms | 33.386 ms | 109.938 ms | 59 | 5.480 ms |
| 3 | 138.593 ms | 30.301 ms | 108.292 ms | 59 | 4.380 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 14.000 ms | 0.000 ms | 185.274 ms | 104.000 ms | 3.594 ms |
| 2 | 4.000 ms | 1.000 ms | 33.386 ms | 103.000 ms | 1.938 ms |
| 3 | 5.000 ms | 0.000 ms | 30.301 ms | 102.000 ms | 1.292 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 58.000 | 38.364 ms | 0.661 ms | 143824.000 |
| `_log` | 1.000 | 0.135 ms | 0.135 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 29.585 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 55.000 | 8.779 ms | 43964.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/compose.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/context.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono-base.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/http-exception.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411389.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 143871.000 | 141098.000 |
| `send:Execute` | 1.000 | 13199.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10948.000 | 7358.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:21:20.033Z

- Warm wall: 140.397 -> 140.959 ms (+0.562 ms (+0.40%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.884 -> 109.115 ms (+0.231 ms (+0.21%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.384 -> 1.615 ms (-0.769 ms (-32.26%))
- Bridge time/iteration: 24.253 -> 38.499 ms (+14.246 ms (+58.74%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 18.835 -> 29.585 ms (+10.750 ms (+57.08%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 5.363 -> 8.779 ms (+3.416 ms (+63.70%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 24.199 | 38.364 | +14.165 |
| Method time | `_log` | 0.055 | 0.135 | +0.080 |
| Frame bytes | `send:Execute` | 424561.000 | 13199.000 | -411362.000 |
| Frame bytes | `send:WarmSnapshot` | 411365.333 | 411389.667 | +24.334 |
| Frame bytes | `send:Ping` | 38.000 | 50.667 | +12.667 |

