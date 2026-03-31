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

Baseline scenario timestamp: 2026-03-31T09:40:59.422Z

- Warm wall: 1770.193 -> 1770.193 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2823.000 -> 2823.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 11.691 -> 11.691 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 5.691 -> 5.691 ms (0.000 ms (0.00%))
- Bridge time/iteration: 1031.608 -> 1031.608 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 7831719.667 -> 7831719.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 100.298 -> 100.298 ms (0.000 ms (0.00%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2647.000 -> 2647.000 calls (0.000 calls (0.00%)); time 789.497 -> 789.497 ms (0.000 ms (0.00%)); response bytes 6976781.000 -> 6976781.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

