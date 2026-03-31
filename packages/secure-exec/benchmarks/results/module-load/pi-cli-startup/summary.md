# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T10:14:02.930Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1335.294 ms
- Bridge calls/iteration: 2604.000
- Warm fixed session overhead: 117.153 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 10.152 ms
- Dominant bridge time: `_loadPolyfill` 648.443 ms/iteration across 2528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3454764.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 76.686 ms/iteration, 836805.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2449.000 calls/iteration, 571.757 ms/iteration, 2617958.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3463902.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1884.240 ms | 1769.440 ms | 114.800 ms | 2604 | 1002.816 ms |
| 2 | 1300.900 ms | 1183.769 ms | 117.131 ms | 2604 | 586.135 ms |
| 3 | 1369.688 ms | 1252.514 ms | 117.174 ms | 2604 | 649.556 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 7.000 ms | 1769.440 ms | 102.000 ms | 2.800 ms |
| 2 | 1.000 ms | 5.000 ms | 1183.769 ms | 102.000 ms | 9.131 ms |
| 3 | 0.000 ms | 4.000 ms | 1252.514 ms | 102.000 ms | 11.174 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2528.000 | 648.443 ms | 0.257 ms | 3454764.333 |
| `_fsExists` | 44.000 | 44.423 ms | 1.010 ms | 2200.000 |
| `_resolveModule` | 21.000 | 41.544 ms | 1.978 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 5.037 ms | 5.037 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.197 ms | 1.197 ms | 47.000 |
| `_fsStat` | 1.000 | 1.179 ms | 1.179 ms | 205.667 |
| `_fsReadFile` | 2.000 | 1.170 ms | 0.585 ms | 3364.000 |
| `_fsWriteFile` | 1.000 | 1.050 ms | 1.050 ms | 47.000 |
| `_fsRmdir` | 1.000 | 0.910 ms | 0.910 ms | 47.000 |
| `_fsChmod` | 1.000 | 0.874 ms | 0.874 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 76.686 ms | 836805.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2449.000 | 571.757 ms | 2617958.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2604.000 | 3463902.000 | 3341514.000 |
| `send:Execute` | 1.000 | 1242375.000 | 0.000 |
| `recv:BridgeCall` | 2604.000 | 562788.000 | 404148.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T09:40:53.052Z

- Warm wall: 1697.463 -> 1335.294 ms (-362.169 ms (-21.34%))
- Bridge calls/iteration: 2604.000 -> 2604.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 118.185 -> 117.153 ms (-1.032 ms (-0.87%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 10.685 -> 10.152 ms (-0.533 ms (-4.99%))
- Bridge time/iteration: 995.774 -> 746.169 ms (-249.605 ms (-25.07%))
- BridgeResponse encoded bytes/iteration: 7494335.000 -> 3463902.000 bytes (-4030433.000 bytes (-53.78%))
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 117.951 -> 76.686 ms (-41.265 ms (-34.98%)); response bytes 839171.667 -> 836805.667 bytes (-2366.000 bytes (-0.28%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2449.000 -> 2449.000 calls (0.000 calls (0.00%)); time 777.979 -> 571.757 ms (-206.222 ms (-26.51%)); response bytes 6646025.000 -> 2617958.667 bytes (-4028066.333 bytes (-60.61%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 895.929 | 648.443 | -247.486 |
| Method time | `_resolveModule` | 36.327 | 41.544 | +5.217 |
| Method time | `_fsExists` | 48.399 | 44.423 | -3.976 |
| Method bytes | `_loadPolyfill` | 7485196.667 | 3454764.333 | -4030432.334 |
| Method bytes | `_fsStat` | 206.333 | 205.667 | -0.666 |
| Frame bytes | `send:BridgeResponse` | 7494335.000 | 3463902.000 | -4030433.000 |

