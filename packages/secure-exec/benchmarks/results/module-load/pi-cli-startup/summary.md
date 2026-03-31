# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T09:40:53.052Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1697.463 ms
- Bridge calls/iteration: 2604.000
- Warm fixed session overhead: 118.185 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.500 ms, residual 10.685 ms
- Dominant bridge time: `_loadPolyfill` 895.929 ms/iteration across 2528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 7485196.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 117.951 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2449.000 calls/iteration, 777.979 ms/iteration, 6646025.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 7494335.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2443.071 ms | 2318.125 ms | 124.946 ms | 2604 | 1328.528 ms |
| 2 | 1782.612 ms | 1663.405 ms | 119.207 ms | 2604 | 871.446 ms |
| 3 | 1612.313 ms | 1495.150 ms | 117.163 ms | 2604 | 787.348 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 2318.125 ms | 105.000 ms | 10.946 ms |
| 2 | 0.000 ms | 5.000 ms | 1663.405 ms | 103.000 ms | 11.207 ms |
| 3 | 1.000 ms | 4.000 ms | 1495.150 ms | 102.000 ms | 10.163 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2528.000 | 895.929 ms | 0.354 ms | 7485196.667 |
| `_fsExists` | 44.000 | 48.399 ms | 1.100 ms | 2200.000 |
| `_resolveModule` | 21.000 | 36.327 ms | 1.730 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 5.426 ms | 5.426 ms | 47.000 |
| `_fsReadFile` | 2.000 | 2.016 ms | 1.008 ms | 3364.000 |
| `_fsUtimes` | 1.000 | 1.688 ms | 1.688 ms | 47.000 |
| `_fsStat` | 1.000 | 1.643 ms | 1.643 ms | 206.333 |
| `_fsWriteFile` | 1.000 | 1.600 ms | 1.600 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.442 ms | 1.442 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.063 ms | 1.063 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 117.951 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2449.000 | 777.979 ms | 6646025.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2604.000 | 7494335.000 | 7371947.000 |
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

Baseline scenario timestamp: 2026-03-31T07:23:21.380Z

- Warm wall: 1827.171 -> 1697.463 ms (-129.708 ms (-7.10%))
- Bridge calls/iteration: 2604.000 -> 2604.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.846 -> 118.185 ms (+0.339 ms (+0.29%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 10.846 -> 10.685 ms (-0.161 ms (-1.48%))
- Bridge time/iteration: 1038.732 -> 995.774 ms (-42.958 ms (-4.14%))
- BridgeResponse encoded bytes/iteration: 9161307.667 -> 7494335.000 bytes (-1666972.667 bytes (-18.20%))
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 79.000 calls (+79.000 calls); time 0.000 -> 117.951 ms (+117.951 ms); response bytes 0.000 -> 839171.667 bytes (+839171.667 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2528.000 -> 2449.000 calls (-79.000 calls (-3.13%)); time 921.631 -> 777.979 ms (-143.652 ms (-15.59%)); response bytes 9152170.000 -> 6646025.000 bytes (-2506145.000 bytes (-27.38%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 921.631 | 895.929 | -25.702 |
| Method time | `_resolveModule` | 49.533 | 36.327 | -13.206 |
| Method time | `_fsExists` | 54.846 | 48.399 | -6.447 |
| Method bytes | `_loadPolyfill` | 9152170.000 | 7485196.667 | -1666973.333 |
| Method bytes | `_fsStat` | 205.667 | 206.333 | +0.666 |
| Frame bytes | `send:BridgeResponse` | 9161307.667 | 7494335.000 | -1666972.667 |

