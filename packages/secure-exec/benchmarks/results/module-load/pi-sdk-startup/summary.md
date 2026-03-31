# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T11:51:53.030Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1780.762 ms
- Bridge calls/iteration: 2548.000
- Warm fixed session overhead: 116.058 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 103.000 ms, residual 8.558 ms
- Dominant bridge time: `_loadPolyfill` 965.840 ms/iteration across 2523.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3451525.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 102.688 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2444.000 calls/iteration, 863.152 ms/iteration, 2612354.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3457969.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2485.313 ms | 2363.213 ms | 122.100 ms | 2548 | 1311.955 ms |
| 2 | 1885.889 ms | 1769.373 ms | 116.516 ms | 2548 | 918.610 ms |
| 3 | 1675.635 ms | 1560.035 ms | 115.600 ms | 2548 | 797.266 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 4.000 ms | 2363.213 ms | 104.000 ms | 2.100 ms |
| 2 | 5.000 ms | 0.000 ms | 1769.373 ms | 103.000 ms | 8.516 ms |
| 3 | 4.000 ms | 0.000 ms | 1560.035 ms | 103.000 ms | 8.600 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2523.000 | 965.840 ms | 0.383 ms | 3451525.667 |
| `_resolveModule` | 21.000 | 42.611 ms | 2.029 ms | 2986.000 |
| `_fsExists` | 2.000 | 0.391 ms | 0.196 ms | 100.000 |
| `_log` | 1.000 | 0.222 ms | 0.222 ms | 47.000 |
| `_fsReadFile` | 1.000 | 0.213 ms | 0.213 ms | 3311.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 102.688 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2444.000 | 863.152 ms | 2612354.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2548.000 | 3457969.667 | 3338213.667 |
| `recv:BridgeCall` | 2548.000 | 552317.000 | 396887.000 |
| `send:Execute` | 1.000 | 422598.667 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:03:40.212Z

- Warm wall: 1732.934 -> 1780.762 ms (+47.828 ms (+2.76%))
- Bridge calls/iteration: 2548.000 -> 2548.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.982 -> 116.058 ms (-0.924 ms (-0.79%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 103.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 9.982 -> 8.558 ms (-1.424 ms (-14.27%))
- Bridge time/iteration: 994.366 -> 1009.277 ms (+14.911 ms (+1.50%))
- BridgeResponse encoded bytes/iteration: 3457969.667 -> 3457969.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 117.067 -> 102.688 ms (-14.379 ms (-12.28%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2444.000 -> 2444.000 calls (0.000 calls (0.00%)); time 841.057 -> 863.152 ms (+22.095 ms (+2.63%)); response bytes 2612354.000 -> 2612354.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 958.124 | 965.840 | +7.716 |
| Method time | `_resolveModule` | 35.435 | 42.611 | +7.176 |
| Method time | `_log` | 0.047 | 0.222 | +0.175 |
| Frame bytes | `send:Execute` | 546205.000 | 422598.667 | -123606.333 |
| Frame bytes | `send:WarmSnapshot` | 348889.333 | 409300.000 | +60410.667 |

