# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T09:40:59.422Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1770.193 ms
- Bridge calls/iteration: 2823.000
- Warm fixed session overhead: 11.691 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.500 ms, ExecutionResult->Destroy 0.000 ms, residual 5.691 ms
- Dominant bridge time: `_loadPolyfill` 889.795 ms/iteration across 2727.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 7816002.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 100.298 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2647.000 calls/iteration, 789.497 ms/iteration, 6976781.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 7831719.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2432.953 ms | 2418.876 ms | 14.077 ms | 2823 | 1272.961 ms |
| 2 | 2000.801 ms | 1987.190 ms | 13.611 ms | 2823 | 1043.842 ms |
| 3 | 1539.585 ms | 1529.814 ms | 9.771 ms | 2823 | 778.021 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 2418.876 ms | 0.000 ms | 5.077 ms |
| 2 | 0.000 ms | 6.000 ms | 1987.190 ms | 0.000 ms | 7.611 ms |
| 3 | 1.000 ms | 5.000 ms | 1529.814 ms | 0.000 ms | 3.771 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2727.000 | 889.795 ms | 0.326 ms | 7816002.667 |
| `_fsExists` | 55.000 | 68.280 ms | 1.241 ms | 2750.000 |
| `_resolveModule` | 21.000 | 47.812 ms | 2.277 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 8.985 ms | 8.985 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 4.474 ms | 4.474 ms | 1231.000 |
| `_fsWriteFile` | 1.000 | 3.065 ms | 3.065 ms | 47.000 |
| `_fsReadFile` | 5.000 | 2.688 ms | 0.538 ms | 7684.000 |
| `_fsChmod` | 1.000 | 2.466 ms | 2.466 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.304 ms | 1.304 ms | 47.000 |
| `_fsStat` | 1.000 | 1.196 ms | 1.196 ms | 207.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 100.298 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2647.000 | 789.497 ms | 6976781.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2823.000 | 7831719.667 | 7699038.667 |
| `send:Execute` | 1.000 | 1243334.000 | 0.000 |
| `recv:BridgeCall` | 2823.000 | 611630.000 | 439660.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T07:23:35.090Z

- Warm wall: 1665.810 -> 1770.193 ms (+104.383 ms (+6.27%))
- Bridge calls/iteration: 2823.333 -> 2823.000 calls (-0.333 calls (-0.01%))
- Warm fixed overhead: 11.201 -> 11.691 ms (+0.490 ms (+4.38%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 5.500 ms (+1.000 ms (+22.22%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 6.701 -> 5.691 ms (-1.010 ms (-15.07%))
- Bridge time/iteration: 1011.245 -> 1031.608 ms (+20.363 ms (+2.01%))
- BridgeResponse encoded bytes/iteration: 9498709.333 -> 7831719.667 bytes (-1666989.666 bytes (-17.55%))
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 80.000 calls (+80.000 calls); time 0.000 -> 100.298 ms (+100.298 ms); response bytes 0.000 -> 839221.667 bytes (+839221.667 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2727.333 -> 2647.000 calls (-80.333 calls (-2.94%)); time 895.365 -> 789.497 ms (-105.868 ms (-11.82%)); response bytes 9482993.667 -> 6976781.000 bytes (-2506212.667 bytes (-26.43%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_fsExists` | 54.831 | 68.280 | +13.449 |
| Method time | `_resolveModule` | 39.418 | 47.812 | +8.394 |
| Method time | `_loadPolyfill` | 895.365 | 889.795 | -5.570 |
| Method bytes | `_loadPolyfill` | 9482993.667 | 7816002.667 | -1666991.000 |
| Method bytes | `_fsStat` | 205.667 | 207.000 | +1.333 |
| Frame bytes | `send:BridgeResponse` | 9498709.333 | 7831719.667 | -1666989.666 |
| Frame bytes | `recv:BridgeCall` | 611661.667 | 611630.000 | -31.667 |
| Frame bytes | `send:StreamEvent` | 135.333 | 116.000 | -19.333 |

