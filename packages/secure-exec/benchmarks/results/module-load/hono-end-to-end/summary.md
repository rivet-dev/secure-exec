# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T11:03:27.711Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 144.303 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 108.572 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.000 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 101.000 ms, residual 3.072 ms
- Dominant bridge time: `_loadPolyfill` 20.738 ms/iteration across 58.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 143824.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 15.901 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 55.000 calls/iteration, 4.838 ms/iteration, 43964.667 bytes/iteration
- Dominant frame bytes: `send:Execute` 546219.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 289.079 ms | 169.985 ms | 119.094 ms | 59 | 52.777 ms |
| 2 | 147.358 ms | 38.105 ms | 109.253 ms | 59 | 5.055 ms |
| 3 | 141.248 ms | 33.357 ms | 107.891 ms | 59 | 4.588 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 7.000 ms | 3.000 ms | 169.985 ms | 105.000 ms | 4.094 ms |
| 2 | 5.000 ms | 1.000 ms | 38.105 ms | 101.000 ms | 2.253 ms |
| 3 | 3.000 ms | 0.000 ms | 33.357 ms | 101.000 ms | 3.891 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 58.000 | 20.738 ms | 0.358 ms | 143824.000 |
| `_log` | 1.000 | 0.068 ms | 0.068 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 15.901 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 55.000 | 4.838 ms | 43964.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/compose.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/context.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono-base.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/http-exception.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 546219.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `send:BridgeResponse` | 59.000 | 143871.000 | 141098.000 |
| `recv:BridgeCall` | 59.000 | 10962.000 | 7372.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:38:28.769Z

- Warm wall: 150.765 -> 144.303 ms (-6.462 ms (-4.29%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.845 -> 108.572 ms (-0.273 ms (-0.25%))
- Warm Create->InjectGlobals: 0.500 -> 4.000 ms (+3.500 ms (+700.00%))
- Warm InjectGlobals->Execute: 5.000 -> 0.500 ms (-4.500 ms (-90.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 1.845 -> 3.072 ms (+1.227 ms (+66.50%))
- Bridge time/iteration: 22.935 -> 20.807 ms (-2.128 ms (-9.28%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 16.243 -> 15.901 ms (-0.342 ms (-2.11%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 6.621 -> 4.838 ms (-1.783 ms (-26.93%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 22.864 | 20.738 | -2.126 |
| Method time | `_log` | 0.071 | 0.068 | -0.003 |
| Frame bytes | `send:Execute` | 1243918.000 | 546219.000 | -697699.000 |

