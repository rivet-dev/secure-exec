# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T11:03:26.692Z
Description: Loads Hono and constructs a minimal app.

## Progress Copy Fields

- Warm wall mean: 144.760 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 108.532 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 2.032 ms
- Dominant bridge time: `_loadPolyfill` 32.236 ms/iteration across 58.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 143824.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 21.362 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 55.000 calls/iteration, 10.874 ms/iteration, 43964.667 bytes/iteration
- Dominant frame bytes: `send:Execute` 546102.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 372.225 ms | 253.454 ms | 118.771 ms | 59 | 86.833 ms |
| 2 | 147.809 ms | 39.463 ms | 108.346 ms | 59 | 5.892 ms |
| 3 | 141.710 ms | 32.992 ms | 108.718 ms | 59 | 4.591 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.000 ms | 2.000 ms | 253.454 ms | 105.000 ms | 3.771 ms |
| 2 | 5.000 ms | 0.000 ms | 39.463 ms | 102.000 ms | 1.346 ms |
| 3 | 4.000 ms | 0.000 ms | 32.992 ms | 102.000 ms | 2.718 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 58.000 | 32.236 ms | 0.556 ms | 143824.000 |
| `_log` | 1.000 | 0.203 ms | 0.203 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 21.362 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 55.000 | 10.874 ms | 43964.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/compose.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/context.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono-base.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/http-exception.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 546102.000 | 0.000 |
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

Baseline scenario timestamp: 2026-03-31T10:38:27.770Z

- Warm wall: 154.125 -> 144.760 ms (-9.365 ms (-6.08%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.961 -> 108.532 ms (-1.429 ms (-1.30%))
- Warm Create->InjectGlobals: 1.000 -> 4.500 ms (+3.500 ms (+350.00%))
- Warm InjectGlobals->Execute: 4.500 -> 0.000 ms (-4.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.461 -> 2.032 ms (-0.429 ms (-17.43%))
- Bridge time/iteration: 26.466 -> 32.439 ms (+5.973 ms (+22.57%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 14.693 -> 21.362 ms (+6.669 ms (+45.39%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 11.518 -> 10.874 ms (-0.644 ms (-5.59%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 26.212 | 32.236 | +6.024 |
| Method time | `_log` | 0.254 | 0.203 | -0.051 |
| Frame bytes | `send:Execute` | 1243801.000 | 546102.000 | -697699.000 |

