# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T11:51:40.801Z
Description: Loads Hono, builds an app, serves a request, and reads the response.

## Progress Copy Fields

- Warm wall mean: 141.644 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 109.618 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.500 ms, residual 2.118 ms
- Dominant bridge time: `_loadPolyfill` 21.603 ms/iteration across 58.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 143824.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 14.973 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 55.000 calls/iteration, 6.629 ms/iteration, 43964.667 bytes/iteration
- Dominant frame bytes: `send:Execute` 422612.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 324.431 ms | 201.958 ms | 122.473 ms | 59 | 57.365 ms |
| 2 | 142.205 ms | 31.802 ms | 110.403 ms | 59 | 3.839 ms |
| 3 | 141.083 ms | 32.251 ms | 108.832 ms | 59 | 3.756 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 3.000 ms | 201.958 ms | 103.000 ms | 4.473 ms |
| 2 | 5.000 ms | 0.000 ms | 31.802 ms | 103.000 ms | 2.403 ms |
| 3 | 5.000 ms | 0.000 ms | 32.251 ms | 102.000 ms | 1.832 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 58.000 | 21.603 ms | 0.372 ms | 143824.000 |
| `_log` | 1.000 | 0.051 ms | 0.051 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 14.973 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 55.000 | 6.629 ms | 43964.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/compose.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/context.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono-base.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/hono.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/hono@4.12.2/node_modules/hono/dist/cjs/http-exception.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 422612.667 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `send:BridgeResponse` | 59.000 | 143871.000 | 141098.000 |
| `recv:BridgeCall` | 59.000 | 10962.000 | 7372.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:03:27.711Z

- Warm wall: 144.303 -> 141.644 ms (-2.659 ms (-1.84%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.572 -> 109.618 ms (+1.046 ms (+0.96%))
- Warm Create->InjectGlobals: 4.000 -> 5.000 ms (+1.000 ms (+25.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 101.000 -> 102.500 ms (+1.500 ms (+1.49%))
- Warm residual overhead: 3.072 -> 2.118 ms (-0.954 ms (-31.05%))
- Bridge time/iteration: 20.807 -> 21.653 ms (+0.846 ms (+4.07%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 15.901 -> 14.973 ms (-0.928 ms (-5.84%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 4.838 -> 6.629 ms (+1.791 ms (+37.02%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 20.738 | 21.603 | +0.865 |
| Method time | `_log` | 0.068 | 0.051 | -0.017 |
| Frame bytes | `send:Execute` | 546219.000 | 422612.667 | -123606.333 |
| Frame bytes | `send:WarmSnapshot` | 348889.333 | 409300.000 | +60410.667 |

