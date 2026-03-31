# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T10:38:27.770Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 154.125 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 109.961 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 1.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 2.461 ms
- Dominant bridge time: `_loadPolyfill` 26.212 ms/iteration across 58.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 143824.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 14.693 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 55.000 calls/iteration, 11.518 ms/iteration, 43964.667 bytes/iteration
- Dominant frame bytes: `send:Execute` 1243801.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 342.374 ms | 226.754 ms | 115.620 ms | 59 | 67.284 ms |
| 2 | 166.092 ms | 55.491 ms | 110.601 ms | 59 | 7.654 ms |
| 3 | 142.158 ms | 32.837 ms | 109.321 ms | 59 | 4.459 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 6.000 ms | 226.754 ms | 104.000 ms | 3.620 ms |
| 2 | 1.000 ms | 5.000 ms | 55.491 ms | 102.000 ms | 2.601 ms |
| 3 | 1.000 ms | 4.000 ms | 32.837 ms | 102.000 ms | 2.321 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 58.000 | 26.212 ms | 0.452 ms | 143824.000 |
| `_log` | 1.000 | 0.254 ms | 0.254 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 14.693 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 55.000 | 11.518 ms | 43964.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/compose.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/context.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono-base.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/http-exception.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1243801.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `send:BridgeResponse` | 59.000 | 143871.000 | 141098.000 |
| `recv:BridgeCall` | 59.000 | 10948.000 | 7358.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:26:33.869Z

- Warm wall: 142.239 -> 154.125 ms (+11.886 ms (+8.36%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.936 -> 109.961 ms (+1.025 ms (+0.94%))
- Warm Create->InjectGlobals: 0.500 -> 1.000 ms (+0.500 ms (+100.00%))
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 1.936 -> 2.461 ms (+0.525 ms (+27.12%))
- Bridge time/iteration: 28.606 -> 26.466 ms (-2.140 ms (-7.48%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 22.497 -> 14.693 ms (-7.804 ms (-34.69%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 6.018 -> 11.518 ms (+5.500 ms (+91.39%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 28.515 | 26.212 | -2.303 |
| Method time | `_log` | 0.091 | 0.254 | +0.163 |
| Frame bytes | `send:Execute` | 1242094.000 | 1243801.000 | +1707.000 |
| Frame bytes | `send:WarmSnapshot` | 348320.333 | 348889.333 | +569.000 |

