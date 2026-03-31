# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T11:03:46.453Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1613.442 ms
- Bridge calls/iteration: 2788.000
- Warm fixed session overhead: 115.983 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 9.983 ms
- Dominant bridge time: `_loadPolyfill` 858.330 ms/iteration across 2718.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3592602.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 90.558 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2638.000 calls/iteration, 767.771 ms/iteration, 2753381.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3602748.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2574.550 ms | 2448.061 ms | 126.489 ms | 2788 | 1349.318 ms |
| 2 | 1616.739 ms | 1500.483 ms | 116.256 ms | 2788 | 734.943 ms |
| 3 | 1610.145 ms | 1494.435 ms | 115.710 ms | 2788 | 733.447 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 3.000 ms | 2448.061 ms | 104.000 ms | 10.489 ms |
| 2 | 5.000 ms | 0.000 ms | 1500.483 ms | 102.000 ms | 9.256 ms |
| 3 | 3.000 ms | 0.000 ms | 1494.435 ms | 102.000 ms | 10.710 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2718.000 | 858.330 ms | 0.316 ms | 3592602.667 |
| `_resolveModule` | 21.000 | 44.155 ms | 2.103 ms | 2986.000 |
| `_fsExists` | 38.000 | 30.012 ms | 0.790 ms | 1900.000 |
| `_networkFetchRaw` | 1.000 | 3.264 ms | 3.264 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 3.151 ms | 1.576 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.217 ms | 0.043 ms | 435.000 |
| `_log` | 3.000 | 0.108 ms | 0.036 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 90.558 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2638.000 | 767.771 ms | 2753381.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2788.000 | 3602748.667 | 3471712.667 |
| `recv:BridgeCall` | 2788.000 | 606939.000 | 437010.000 |
| `send:Execute` | 1.000 | 547124.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:38:47.318Z

- Warm wall: 1689.811 -> 1613.442 ms (-76.369 ms (-4.52%))
- Bridge calls/iteration: 2788.000 -> 2788.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.113 -> 115.983 ms (-0.130 ms (-0.11%))
- Warm Create->InjectGlobals: 0.500 -> 4.000 ms (+3.500 ms (+700.00%))
- Warm InjectGlobals->Execute: 4.000 -> 0.000 ms (-4.000 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 9.613 -> 9.983 ms (+0.370 ms (+3.85%))
- Bridge time/iteration: 978.297 -> 939.236 ms (-39.061 ms (-3.99%))
- BridgeResponse encoded bytes/iteration: 3602748.667 -> 3602748.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 82.727 -> 90.558 ms (+7.831 ms (+9.47%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 2638.000 calls (0.000 calls (0.00%)); time 802.716 -> 767.771 ms (-34.945 ms (-4.35%)); response bytes 2753381.000 -> 2753381.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 885.443 | 858.330 | -27.113 |
| Method time | `_resolveModule` | 54.828 | 44.155 | -10.673 |
| Method time | `_networkFetchRaw` | 4.563 | 3.264 | -1.299 |
| Frame bytes | `send:Execute` | 1244823.000 | 547124.000 | -697699.000 |

