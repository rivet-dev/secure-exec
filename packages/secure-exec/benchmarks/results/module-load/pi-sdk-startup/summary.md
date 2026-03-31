# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T10:14:02.446Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1184.332 ms
- Bridge calls/iteration: 2548.000
- Warm fixed session overhead: 112.421 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 101.000 ms, residual 6.421 ms
- Dominant bridge time: `_loadPolyfill` 576.566 ms/iteration across 2523.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3449159.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 70.621 ms/iteration, 836805.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2444.000 calls/iteration, 505.945 ms/iteration, 2612354.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3455603.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1714.023 ms | 1589.072 ms | 124.951 ms | 2548 | 845.169 ms |
| 2 | 1181.512 ms | 1066.100 ms | 115.412 ms | 2548 | 498.993 ms |
| 3 | 1187.153 ms | 1077.723 ms | 109.430 ms | 2548 | 500.601 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 1589.072 ms | 106.000 ms | 9.951 ms |
| 2 | 0.000 ms | 5.000 ms | 1066.100 ms | 101.000 ms | 9.412 ms |
| 3 | 1.000 ms | 4.000 ms | 1077.723 ms | 101.000 ms | 3.430 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2523.000 | 576.566 ms | 0.229 ms | 3449159.667 |
| `_resolveModule` | 21.000 | 37.513 ms | 1.786 ms | 2986.000 |
| `_fsExists` | 2.000 | 0.422 ms | 0.211 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.311 ms | 0.311 ms | 3311.000 |
| `_log` | 1.000 | 0.109 ms | 0.109 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 70.621 ms | 836805.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2444.000 | 505.945 ms | 2612354.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2548.000 | 3455603.667 | 3335847.667 |
| `send:Execute` | 1.000 | 1242197.000 | 0.000 |
| `recv:BridgeCall` | 2548.000 | 552317.000 | 396887.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T09:40:43.971Z

- Warm wall: 1729.225 -> 1184.332 ms (-544.893 ms (-31.51%))
- Bridge calls/iteration: 2548.000 -> 2548.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.534 -> 112.421 ms (-5.113 ms (-4.35%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 101.000 ms (-1.500 ms (-1.46%))
- Warm residual overhead: 10.034 -> 6.421 ms (-3.613 ms (-36.01%))
- Bridge time/iteration: 899.396 -> 614.921 ms (-284.475 ms (-31.63%))
- BridgeResponse encoded bytes/iteration: 7475865.667 -> 3455603.667 bytes (-4020262.000 bytes (-53.78%))
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 116.126 -> 70.621 ms (-45.505 ms (-39.19%)); response bytes 839171.667 -> 836805.667 bytes (-2366.000 bytes (-0.28%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2444.000 -> 2444.000 calls (0.000 calls (0.00%)); time 728.782 -> 505.945 ms (-222.837 ms (-30.58%)); response bytes 6630250.000 -> 2612354.000 bytes (-4017896.000 bytes (-60.60%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 844.908 | 576.566 | -268.342 |
| Method time | `_resolveModule` | 53.650 | 37.513 | -16.137 |
| Method time | `_fsExists` | 0.463 | 0.422 | -0.041 |
| Method bytes | `_loadPolyfill` | 7469421.667 | 3449159.667 | -4020262.000 |
| Frame bytes | `send:BridgeResponse` | 7475865.667 | 3455603.667 | -4020262.000 |

