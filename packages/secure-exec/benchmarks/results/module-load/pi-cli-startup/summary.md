# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T12:42:20.744Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1977.525 ms
- Bridge calls/iteration: 2571.000
- Warm fixed session overhead: 116.726 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 101.500 ms, residual 10.226 ms
- Dominant bridge time: `_loadPolyfill` 1072.026 ms/iteration across 2519.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3575299.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 102.284 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2440.000 calls/iteration, 969.742 ms/iteration, 2736128.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3581302.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2629.287 ms | 2506.478 ms | 122.809 ms | 2571 | 1445.528 ms |
| 2 | 2115.765 ms | 1999.129 ms | 116.636 ms | 2571 | 1055.918 ms |
| 3 | 1839.285 ms | 1722.469 ms | 116.816 ms | 2571 | 917.845 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 2.000 ms | 2506.478 ms | 102.000 ms | 5.809 ms |
| 2 | 5.000 ms | 0.000 ms | 1999.129 ms | 101.000 ms | 10.636 ms |
| 3 | 5.000 ms | 0.000 ms | 1722.469 ms | 102.000 ms | 9.816 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2519.000 | 1072.026 ms | 0.426 ms | 3575299.667 |
| `_fsExists` | 41.000 | 51.760 ms | 1.262 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 7.498 ms | 7.498 ms | 47.000 |
| `_fsReadFile` | 2.000 | 1.785 ms | 0.893 ms | 3364.000 |
| `_fsChmod` | 1.000 | 1.449 ms | 1.449 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.444 ms | 1.444 ms | 47.000 |
| `_fsStat` | 1.000 | 1.193 ms | 1.193 ms | 207.000 |
| `_fsUtimes` | 1.000 | 1.134 ms | 1.134 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.127 ms | 1.127 ms | 47.000 |
| `_fsReadDir` | 1.000 | 0.266 ms | 0.266 ms | 53.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 102.284 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2440.000 | 969.742 ms | 2736128.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2571.000 | 3581302.667 | 3460465.667 |
| `recv:BridgeCall` | 2571.000 | 540739.000 | 384121.000 |
| `send:Execute` | 1.000 | 424330.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 411160.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:52:06.513Z

- Warm wall: 1854.094 -> 1977.525 ms (+123.431 ms (+6.66%))
- Bridge calls/iteration: 2604.000 -> 2571.000 calls (-33.000 calls (-1.27%))
- Warm fixed overhead: 114.551 -> 116.726 ms (+2.175 ms (+1.90%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 101.500 ms (-1.000 ms (-0.98%))
- Warm residual overhead: 7.051 -> 10.226 ms (+3.175 ms (+45.03%))
- Bridge time/iteration: 1017.137 -> 1139.764 ms (+122.627 ms (+12.06%))
- BridgeResponse encoded bytes/iteration: 3466269.333 -> 3581302.667 bytes (+115033.334 bytes (+3.32%))
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 102.925 -> 102.284 ms (-0.641 ms (-0.62%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2449.000 -> 2440.000 calls (-9.000 calls (-0.37%)); time 793.186 -> 969.742 ms (+176.556 ms (+22.26%)); response bytes 2617958.667 -> 2736128.000 bytes (+118169.333 bytes (+4.51%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 896.110 | 1072.026 | +175.916 |
| Method time | `_resolveModule` | 52.912 | 0.000 | -52.912 |
| Method time | `_fsExists` | 55.496 | 51.760 | -3.736 |
| Method bytes | `_loadPolyfill` | 3457130.333 | 3575299.667 | +118169.334 |
| Method bytes | `_resolveModule` | 2986.000 | 0.000 | -2986.000 |
| Method bytes | `_fsExists` | 2200.000 | 2050.000 | -150.000 |
| Frame bytes | `send:BridgeResponse` | 3466269.333 | 3581302.667 | +115033.334 |
| Frame bytes | `recv:BridgeCall` | 562788.000 | 540739.000 | -22049.000 |
| Frame bytes | `send:Execute` | 422469.667 | 424330.000 | +1860.333 |

