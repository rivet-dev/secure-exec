# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T10:38:53.945Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1916.797 ms
- Bridge calls/iteration: 2604.000
- Warm fixed session overhead: 117.143 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.500 ms, ExecutionResult->Destroy 101.000 ms, residual 10.143 ms
- Dominant bridge time: `_loadPolyfill` 917.682 ms/iteration across 2528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3457130.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 91.211 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2449.000 calls/iteration, 826.470 ms/iteration, 2617958.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3466268.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2348.959 ms | 2224.149 ms | 124.810 ms | 2604 | 1247.007 ms |
| 2 | 1779.466 ms | 1661.147 ms | 118.319 ms | 2604 | 849.345 ms |
| 3 | 2054.128 ms | 1938.161 ms | 115.967 ms | 2604 | 1072.256 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2224.149 ms | 105.000 ms | 11.810 ms |
| 2 | 0.000 ms | 6.000 ms | 1661.147 ms | 102.000 ms | 10.319 ms |
| 3 | 1.000 ms | 5.000 ms | 1938.161 ms | 100.000 ms | 9.967 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2528.000 | 917.682 ms | 0.363 ms | 3457130.333 |
| `_fsExists` | 44.000 | 62.217 ms | 1.414 ms | 2200.000 |
| `_resolveModule` | 21.000 | 56.284 ms | 2.680 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 9.370 ms | 9.370 ms | 47.000 |
| `_fsChmod` | 1.000 | 2.303 ms | 2.303 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 2.063 ms | 2.063 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.739 ms | 1.739 ms | 47.000 |
| `_fsStat` | 1.000 | 1.620 ms | 1.620 ms | 206.333 |
| `_fsReadFile` | 2.000 | 1.489 ms | 0.745 ms | 3364.000 |
| `_fsRmdir` | 1.000 | 1.083 ms | 1.083 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 91.211 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2449.000 | 826.470 ms | 2617958.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2604.000 | 3466268.667 | 3343880.667 |
| `send:Execute` | 1.000 | 1244082.000 | 0.000 |
| `recv:BridgeCall` | 2604.000 | 562788.000 | 404148.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

