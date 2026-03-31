# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T12:41:49.908Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1767.451 ms
- Bridge calls/iteration: 2520.000
- Warm fixed session overhead: 116.678 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 103.000 ms, residual 9.178 ms
- Dominant bridge time: `_loadPolyfill` 985.493 ms/iteration across 2516.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3575127.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 105.242 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2437.000 calls/iteration, 880.251 ms/iteration, 2735956.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3578585.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2549.383 ms | 2419.244 ms | 130.139 ms | 2520 | 1353.570 ms |
| 2 | 1921.956 ms | 1804.064 ms | 117.892 ms | 2520 | 868.758 ms |
| 3 | 1612.947 ms | 1497.482 ms | 115.465 ms | 2520 | 736.431 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 3.000 ms | 2419.244 ms | 104.000 ms | 11.139 ms |
| 2 | 5.000 ms | 0.000 ms | 1804.064 ms | 104.000 ms | 8.892 ms |
| 3 | 4.000 ms | 0.000 ms | 1497.482 ms | 102.000 ms | 9.465 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2516.000 | 985.493 ms | 0.392 ms | 3575127.667 |
| `_fsExists` | 2.000 | 0.419 ms | 0.210 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.246 ms | 0.246 ms | 3311.000 |
| `_log` | 1.000 | 0.095 ms | 0.095 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 105.242 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2437.000 | 880.251 ms | 2735956.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2520.000 | 3578585.667 | 3460145.667 |
| `recv:BridgeCall` | 2520.000 | 531017.000 | 377316.000 |
| `send:Execute` | 1.000 | 424459.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 411160.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:51:53.030Z

- Warm wall: 1780.762 -> 1767.451 ms (-13.311 ms (-0.75%))
- Bridge calls/iteration: 2548.000 -> 2520.000 calls (-28.000 calls (-1.10%))
- Warm fixed overhead: 116.058 -> 116.678 ms (+0.620 ms (+0.53%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 103.000 -> 103.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 8.558 -> 9.178 ms (+0.620 ms (+7.25%))
- Bridge time/iteration: 1009.277 -> 986.253 ms (-23.024 ms (-2.28%))
- BridgeResponse encoded bytes/iteration: 3457969.667 -> 3578585.667 bytes (+120616.000 bytes (+3.49%))
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 102.688 -> 105.242 ms (+2.554 ms (+2.49%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2444.000 -> 2437.000 calls (-7.000 calls (-0.29%)); time 863.152 -> 880.251 ms (+17.099 ms (+1.98%)); response bytes 2612354.000 -> 2735956.000 bytes (+123602.000 bytes (+4.73%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_resolveModule` | 42.611 | 0.000 | -42.611 |
| Method time | `_loadPolyfill` | 965.840 | 985.493 | +19.653 |
| Method time | `_log` | 0.222 | 0.095 | -0.127 |
| Method bytes | `_loadPolyfill` | 3451525.667 | 3575127.667 | +123602.000 |
| Method bytes | `_resolveModule` | 2986.000 | 0.000 | -2986.000 |
| Frame bytes | `send:BridgeResponse` | 3457969.667 | 3578585.667 | +120616.000 |
| Frame bytes | `recv:BridgeCall` | 552317.000 | 531017.000 | -21300.000 |
| Frame bytes | `send:Execute` | 422598.667 | 424459.000 | +1860.333 |

