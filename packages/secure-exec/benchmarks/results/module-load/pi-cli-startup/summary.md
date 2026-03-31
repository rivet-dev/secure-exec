# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T13:28:43.439Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1809.331 ms
- Bridge calls/iteration: 2562.000
- Warm fixed session overhead: 117.805 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 10.305 ms
- Dominant bridge time: `_loadPolyfill` 932.045 ms/iteration across 2510.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3494707.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 83.558 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2440.000 calls/iteration, 848.487 ms/iteration, 2736128.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3500710.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2173.406 ms | 2047.847 ms | 125.559 ms | 2562 | 1202.012 ms |
| 2 | 1738.368 ms | 1620.087 ms | 118.281 ms | 2562 | 808.450 ms |
| 3 | 1880.293 ms | 1762.965 ms | 117.328 ms | 2562 | 950.715 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2047.847 ms | 104.000 ms | 12.559 ms |
| 2 | 6.000 ms | 0.000 ms | 1620.087 ms | 102.000 ms | 10.281 ms |
| 3 | 5.000 ms | 0.000 ms | 1762.965 ms | 102.000 ms | 10.328 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2510.000 | 932.045 ms | 0.371 ms | 3494707.667 |
| `_fsExists` | 41.000 | 43.249 ms | 1.055 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 4.675 ms | 4.675 ms | 47.000 |
| `_fsReadFile` | 2.000 | 1.354 ms | 0.677 ms | 3364.000 |
| `_fsStat` | 1.000 | 1.174 ms | 1.174 ms | 206.333 |
| `_fsRmdir` | 1.000 | 1.158 ms | 1.158 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.084 ms | 1.084 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.041 ms | 1.041 ms | 47.000 |
| `_fsChmod` | 1.000 | 0.936 ms | 0.936 ms | 47.000 |
| `_fsReadDir` | 1.000 | 0.253 ms | 0.253 ms | 53.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 83.558 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2440.000 | 848.487 ms | 2736128.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2562.000 | 3500710.000 | 3380296.000 |
| `recv:BridgeCall` | 2562.000 | 540030.000 | 383961.000 |
| `send:WarmSnapshot` | 0.333 | 494371.333 | 0.000 |
| `send:Execute` | 1.000 | 13173.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:21:45.921Z

- Warm wall: 1876.567 -> 1809.331 ms (-67.236 ms (-3.58%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 118.178 -> 117.805 ms (-0.373 ms (-0.32%))
- Warm Create->InjectGlobals: 6.500 -> 5.500 ms (-1.000 ms (-15.38%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 9.678 -> 10.305 ms (+0.627 ms (+6.48%))
- Bridge time/iteration: 994.234 -> 987.059 ms (-7.175 ms (-0.72%))
- BridgeResponse encoded bytes/iteration: 3500709.333 -> 3500710.000 bytes (+0.667 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 70.267 -> 83.558 ms (+13.291 ms (+18.91%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2440.000 -> 2440.000 calls (0.000 calls (0.00%)); time 847.287 -> 848.487 ms (+1.200 ms (+0.14%)); response bytes 2736128.000 -> 2736128.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_fsExists` | 64.432 | 43.249 | -21.183 |
| Method time | `_loadPolyfill` | 917.554 | 932.045 | +14.491 |
| Method time | `_fsWriteFile` | 1.788 | 1.084 | -0.704 |
| Method bytes | `_fsStat` | 205.667 | 206.333 | +0.666 |
| Frame bytes | `send:Execute` | 507516.667 | 13173.000 | -494343.667 |
| Frame bytes | `send:WarmSnapshot` | 494347.000 | 494371.333 | +24.333 |
| Frame bytes | `send:Ping` | 38.000 | 50.667 | +12.667 |

