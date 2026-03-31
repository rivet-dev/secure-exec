# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T09:37:45.868Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 143.079 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 110.603 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.000 ms, residual 3.103 ms
- Dominant bridge time: `_loadPolyfill` 14.572 ms/iteration across 58.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 206155.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 10.294 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 55.000 calls/iteration, 4.279 ms/iteration, 106296.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1242094.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 269.783 ms | 153.452 ms | 116.331 ms | 59 | 36.137 ms |
| 2 | 142.687 ms | 30.994 ms | 111.693 ms | 59 | 3.562 ms |
| 3 | 143.472 ms | 33.958 ms | 109.514 ms | 59 | 4.206 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 153.452 ms | 104.000 ms | 3.331 ms |
| 2 | 1.000 ms | 6.000 ms | 30.994 ms | 102.000 ms | 2.693 ms |
| 3 | 0.000 ms | 4.000 ms | 33.958 ms | 102.000 ms | 3.514 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 58.000 | 14.572 ms | 0.251 ms | 206155.333 |
| `_log` | 1.000 | 0.063 ms | 0.063 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 10.294 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 55.000 | 4.279 ms | 106296.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/compose.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/context.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono-base.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/http-exception.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1242094.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:BridgeResponse` | 59.000 | 206202.333 | 203429.333 |
| `recv:BridgeCall` | 59.000 | 10948.000 | 7358.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:23.753Z

- Warm wall: 149.600 -> 143.079 ms (-6.521 ms (-4.36%))
- Bridge calls/iteration: 102.000 -> 59.000 calls (-43.000 calls (-42.16%))
- Warm fixed overhead: 113.206 -> 110.603 ms (-2.603 ms (-2.30%))
- Warm Create->InjectGlobals: 1.000 -> 0.500 ms (-0.500 ms (-50.00%))
- Warm InjectGlobals->Execute: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 5.206 -> 3.103 ms (-2.103 ms (-40.40%))
- Bridge time/iteration: 16.572 -> 14.635 ms (-1.937 ms (-11.69%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 206202.333 bytes (-201927.667 bytes (-49.48%))
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 3.000 calls (+3.000 calls); time 0.000 -> 10.294 ms (+10.294 ms); response bytes 0.000 -> 99859.333 bytes (+99859.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 101.000 -> 55.000 calls (-46.000 calls (-45.55%)); time 16.518 -> 4.279 ms (-12.239 ms (-74.09%)); response bytes 408083.000 -> 106296.000 bytes (-301787.000 bytes (-73.95%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 16.518 | 14.572 | -1.946 |
| Method time | `_log` | 0.054 | 0.063 | +0.009 |
| Method bytes | `_loadPolyfill` | 408083.000 | 206155.333 | -201927.667 |
| Frame bytes | `send:BridgeResponse` | 408130.000 | 206202.333 | -201927.667 |
| Frame bytes | `recv:BridgeCall` | 15407.000 | 10948.000 | -4459.000 |
| Frame bytes | `send:Execute` | 1240713.000 | 1242094.000 | +1381.000 |

