# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T11:03:53.117Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1869.642 ms
- Bridge calls/iteration: 2604.000
- Warm fixed session overhead: 117.090 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 10.591 ms
- Dominant bridge time: `_loadPolyfill` 936.657 ms/iteration across 2528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3457130.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 104.855 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2449.000 calls/iteration, 831.802 ms/iteration, 2617958.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3466269.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2467.475 ms | 2340.159 ms | 127.316 ms | 2604 | 1324.457 ms |
| 2 | 1878.361 ms | 1760.682 ms | 117.679 ms | 2604 | 915.296 ms |
| 3 | 1860.923 ms | 1744.421 ms | 116.502 ms | 2604 | 937.481 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.000 ms | 2.000 ms | 2340.159 ms | 105.000 ms | 12.316 ms |
| 2 | 5.000 ms | 0.000 ms | 1760.682 ms | 102.000 ms | 10.679 ms |
| 3 | 4.000 ms | 0.000 ms | 1744.421 ms | 102.000 ms | 10.502 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2528.000 | 936.657 ms | 0.371 ms | 3457130.333 |
| `_fsExists` | 44.000 | 65.762 ms | 1.495 ms | 2200.000 |
| `_resolveModule` | 21.000 | 37.805 ms | 1.800 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 6.719 ms | 6.719 ms | 47.000 |
| `_fsReadFile` | 2.000 | 2.475 ms | 1.237 ms | 3364.000 |
| `_fsStat` | 1.000 | 2.196 ms | 2.196 ms | 207.000 |
| `_fsUtimes` | 1.000 | 2.163 ms | 2.163 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.958 ms | 1.958 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.615 ms | 1.615 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.356 ms | 1.356 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 104.855 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2449.000 | 831.802 ms | 2617958.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2604.000 | 3466269.333 | 3343881.333 |
| `recv:BridgeCall` | 2604.000 | 562788.000 | 404148.000 |
| `send:Execute` | 1.000 | 546383.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:38:53.945Z

- Warm wall: 1916.797 -> 1869.642 ms (-47.155 ms (-2.46%))
- Bridge calls/iteration: 2604.000 -> 2604.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.143 -> 117.090 ms (-0.053 ms (-0.04%))
- Warm Create->InjectGlobals: 0.500 -> 4.500 ms (+4.000 ms (+800.00%))
- Warm InjectGlobals->Execute: 5.500 -> 0.000 ms (-5.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 101.000 -> 102.000 ms (+1.000 ms (+0.99%))
- Warm residual overhead: 10.143 -> 10.591 ms (+0.448 ms (+4.42%))
- Bridge time/iteration: 1056.203 -> 1059.078 ms (+2.875 ms (+0.27%))
- BridgeResponse encoded bytes/iteration: 3466268.667 -> 3466269.333 bytes (+0.666 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 91.211 -> 104.855 ms (+13.644 ms (+14.96%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2449.000 -> 2449.000 calls (0.000 calls (0.00%)); time 826.470 -> 831.802 ms (+5.332 ms (+0.65%)); response bytes 2617958.667 -> 2617958.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 917.682 | 936.657 | +18.975 |
| Method time | `_resolveModule` | 56.284 | 37.805 | -18.479 |
| Method time | `_fsExists` | 62.217 | 65.762 | +3.545 |
| Method bytes | `_fsStat` | 206.333 | 207.000 | +0.667 |
| Frame bytes | `send:Execute` | 1244082.000 | 546383.000 | -697699.000 |
| Frame bytes | `send:BridgeResponse` | 3466268.667 | 3466269.333 | +0.666 |

