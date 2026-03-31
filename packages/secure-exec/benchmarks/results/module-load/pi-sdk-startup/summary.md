# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T11:03:40.212Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1732.934 ms
- Bridge calls/iteration: 2548.000
- Warm fixed session overhead: 116.982 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.500 ms, residual 9.982 ms
- Dominant bridge time: `_loadPolyfill` 958.124 ms/iteration across 2523.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3451525.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 117.067 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2444.000 calls/iteration, 841.057 ms/iteration, 2612354.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3457969.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2445.925 ms | 2319.517 ms | 126.408 ms | 2548 | 1322.447 ms |
| 2 | 1731.295 ms | 1614.631 ms | 116.664 ms | 2548 | 814.878 ms |
| 3 | 1734.573 ms | 1617.273 ms | 117.300 ms | 2548 | 845.774 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 2.000 ms | 2319.517 ms | 103.000 ms | 12.408 ms |
| 2 | 5.000 ms | 0.000 ms | 1614.631 ms | 103.000 ms | 8.664 ms |
| 3 | 4.000 ms | 0.000 ms | 1617.273 ms | 102.000 ms | 11.300 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2523.000 | 958.124 ms | 0.380 ms | 3451525.667 |
| `_resolveModule` | 21.000 | 35.435 ms | 1.687 ms | 2986.000 |
| `_fsExists` | 2.000 | 0.438 ms | 0.219 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.322 ms | 0.322 ms | 3311.000 |
| `_log` | 1.000 | 0.047 ms | 0.047 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 117.067 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2444.000 | 841.057 ms | 2612354.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2548.000 | 3457969.667 | 3338213.667 |
| `recv:BridgeCall` | 2548.000 | 552317.000 | 396887.000 |
| `send:Execute` | 1.000 | 546205.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:38:40.856Z

- Warm wall: 1773.563 -> 1732.934 ms (-40.629 ms (-2.29%))
- Bridge calls/iteration: 2548.000 -> 2548.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.142 -> 116.982 ms (+0.840 ms (+0.72%))
- Warm Create->InjectGlobals: 0.000 -> 4.500 ms (+4.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 0.000 ms (-4.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 9.642 -> 9.982 ms (+0.340 ms (+3.53%))
- Bridge time/iteration: 983.263 -> 994.366 ms (+11.103 ms (+1.13%))
- BridgeResponse encoded bytes/iteration: 3457969.667 -> 3457969.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 112.940 -> 117.067 ms (+4.127 ms (+3.65%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2444.000 -> 2444.000 calls (0.000 calls (0.00%)); time 829.121 -> 841.057 ms (+11.936 ms (+1.44%)); response bytes 2612354.000 -> 2612354.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 942.061 | 958.124 | +16.063 |
| Method time | `_resolveModule` | 39.984 | 35.435 | -4.549 |
| Method time | `_fsExists` | 0.675 | 0.438 | -0.237 |
| Frame bytes | `send:Execute` | 1243904.000 | 546205.000 | -697699.000 |

