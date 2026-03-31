# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T10:38:40.856Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1773.563 ms
- Bridge calls/iteration: 2548.000
- Warm fixed session overhead: 116.142 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 9.642 ms
- Dominant bridge time: `_loadPolyfill` 942.061 ms/iteration across 2523.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3451525.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 112.940 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2444.000 calls/iteration, 829.121 ms/iteration, 2612354.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3457969.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2267.088 ms | 2145.442 ms | 121.646 ms | 2548 | 1226.179 ms |
| 2 | 1862.333 ms | 1745.648 ms | 116.685 ms | 2548 | 912.201 ms |
| 3 | 1684.793 ms | 1569.195 ms | 115.598 ms | 2548 | 811.410 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2145.442 ms | 103.000 ms | 10.646 ms |
| 2 | 0.000 ms | 5.000 ms | 1745.648 ms | 102.000 ms | 9.685 ms |
| 3 | 0.000 ms | 4.000 ms | 1569.195 ms | 102.000 ms | 9.598 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2523.000 | 942.061 ms | 0.373 ms | 3451525.667 |
| `_resolveModule` | 21.000 | 39.984 ms | 1.904 ms | 2986.000 |
| `_fsExists` | 2.000 | 0.675 ms | 0.338 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.390 ms | 0.390 ms | 3311.000 |
| `_log` | 1.000 | 0.153 ms | 0.153 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 112.940 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2444.000 | 829.121 ms | 2612354.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2548.000 | 3457969.667 | 3338213.667 |
| `send:Execute` | 1.000 | 1243904.000 | 0.000 |
| `recv:BridgeCall` | 2548.000 | 552317.000 | 396887.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

