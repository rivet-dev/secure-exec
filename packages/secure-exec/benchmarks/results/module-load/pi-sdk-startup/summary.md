# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T13:28:30.559Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1668.363 ms
- Bridge calls/iteration: 2511.000
- Warm fixed session overhead: 115.606 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.500 ms, residual 7.606 ms
- Dominant bridge time: `_loadPolyfill` 816.938 ms/iteration across 2507.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3494535.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 75.899 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2437.000 calls/iteration, 741.039 ms/iteration, 2735956.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3497993.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1895.463 ms | 1772.994 ms | 122.469 ms | 2511 | 969.519 ms |
| 2 | 1661.547 ms | 1547.024 ms | 114.523 ms | 2511 | 801.074 ms |
| 3 | 1675.178 ms | 1558.488 ms | 116.690 ms | 2511 | 684.471 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 1772.994 ms | 104.000 ms | 9.469 ms |
| 2 | 6.000 ms | 0.000 ms | 1547.024 ms | 103.000 ms | 5.523 ms |
| 3 | 5.000 ms | 0.000 ms | 1558.488 ms | 102.000 ms | 9.690 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2507.000 | 816.938 ms | 0.326 ms | 3494535.667 |
| `_fsExists` | 2.000 | 0.802 ms | 0.401 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.483 ms | 0.483 ms | 3311.000 |
| `_log` | 1.000 | 0.131 ms | 0.131 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 75.899 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2437.000 | 741.039 ms | 2735956.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2511.000 | 3497993.667 | 3379976.667 |
| `recv:BridgeCall` | 2511.000 | 530308.000 | 377156.000 |
| `send:WarmSnapshot` | 0.333 | 494371.333 | 0.000 |
| `send:Execute` | 1.000 | 13302.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:21:33.038Z

- Warm wall: 1550.300 -> 1668.363 ms (+118.063 ms (+7.62%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.832 -> 115.606 ms (-1.226 ms (-1.05%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 8.832 -> 7.606 ms (-1.226 ms (-13.88%))
- Bridge time/iteration: 817.203 -> 818.355 ms (+1.152 ms (+0.14%))
- BridgeResponse encoded bytes/iteration: 3497993.667 -> 3497993.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 62.637 -> 75.899 ms (+13.262 ms (+21.17%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2437.000 -> 2437.000 calls (0.000 calls (0.00%)); time 753.696 -> 741.039 ms (-12.657 ms (-1.68%)); response bytes 2735956.000 -> 2735956.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 816.333 | 816.938 | +0.605 |
| Method time | `_fsExists` | 0.492 | 0.802 | +0.310 |
| Method time | `_fsReadFile` | 0.285 | 0.483 | +0.198 |
| Frame bytes | `send:Execute` | 507645.667 | 13302.000 | -494343.667 |
| Frame bytes | `send:WarmSnapshot` | 494347.000 | 494371.333 | +24.333 |
| Frame bytes | `send:Ping` | 38.000 | 50.667 | +12.667 |

