# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T11:52:06.513Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1854.094 ms
- Bridge calls/iteration: 2604.000
- Warm fixed session overhead: 114.551 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.500 ms, residual 7.051 ms
- Dominant bridge time: `_loadPolyfill` 896.110 ms/iteration across 2528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3457130.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 102.925 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2449.000 calls/iteration, 793.186 ms/iteration, 2617958.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3466269.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2443.590 ms | 2311.595 ms | 131.995 ms | 2604 | 1273.417 ms |
| 2 | 1735.245 ms | 1617.772 ms | 117.473 ms | 2604 | 840.234 ms |
| 3 | 1972.944 ms | 1861.315 ms | 111.629 ms | 2604 | 937.760 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 14.000 ms | 3.000 ms | 2311.595 ms | 104.000 ms | 10.995 ms |
| 2 | 6.000 ms | 0.000 ms | 1617.772 ms | 102.000 ms | 9.473 ms |
| 3 | 4.000 ms | 0.000 ms | 1861.315 ms | 103.000 ms | 4.629 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2528.000 | 896.110 ms | 0.354 ms | 3457130.333 |
| `_fsExists` | 44.000 | 55.496 ms | 1.261 ms | 2200.000 |
| `_resolveModule` | 21.000 | 52.912 ms | 2.520 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 5.062 ms | 5.062 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.645 ms | 1.645 ms | 47.000 |
| `_fsReadFile` | 2.000 | 1.355 ms | 0.678 ms | 3364.000 |
| `_fsRmdir` | 1.000 | 1.136 ms | 1.136 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.046 ms | 1.046 ms | 47.000 |
| `_fsStat` | 1.000 | 1.017 ms | 1.017 ms | 207.000 |
| `_fsUtimes` | 1.000 | 1.017 ms | 1.017 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 102.925 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2449.000 | 793.186 ms | 2617958.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2604.000 | 3466269.333 | 3343881.333 |
| `recv:BridgeCall` | 2604.000 | 562788.000 | 404148.000 |
| `send:Execute` | 1.000 | 422469.667 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:03:53.117Z

- Warm wall: 1869.642 -> 1854.094 ms (-15.548 ms (-0.83%))
- Bridge calls/iteration: 2604.000 -> 2604.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.090 -> 114.551 ms (-2.539 ms (-2.17%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 10.591 -> 7.051 ms (-3.540 ms (-33.42%))
- Bridge time/iteration: 1059.078 -> 1017.137 ms (-41.941 ms (-3.96%))
- BridgeResponse encoded bytes/iteration: 3466269.333 -> 3466269.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 104.855 -> 102.925 ms (-1.930 ms (-1.84%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2449.000 -> 2449.000 calls (0.000 calls (0.00%)); time 831.802 -> 793.186 ms (-38.616 ms (-4.64%)); response bytes 2617958.667 -> 2617958.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 936.657 | 896.110 | -40.547 |
| Method time | `_resolveModule` | 37.805 | 52.912 | +15.107 |
| Method time | `_fsExists` | 65.762 | 55.496 | -10.266 |
| Frame bytes | `send:Execute` | 546383.000 | 422469.667 | -123913.333 |
| Frame bytes | `send:WarmSnapshot` | 348889.333 | 409300.000 | +60410.667 |

