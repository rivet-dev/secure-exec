# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T11:51:59.905Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1857.941 ms
- Bridge calls/iteration: 2788.000
- Warm fixed session overhead: 116.371 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 9.371 ms
- Dominant bridge time: `_loadPolyfill` 984.662 ms/iteration across 2718.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3592602.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 87.590 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2638.000 calls/iteration, 897.073 ms/iteration, 2753381.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3602748.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2645.749 ms | 2514.858 ms | 130.891 ms | 2788 | 1388.413 ms |
| 2 | 2075.604 ms | 1959.134 ms | 116.470 ms | 2788 | 982.448 ms |
| 3 | 1640.278 ms | 1524.006 ms | 116.272 ms | 2788 | 812.020 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 3.000 ms | 2514.858 ms | 104.000 ms | 10.891 ms |
| 2 | 6.000 ms | 0.000 ms | 1959.134 ms | 101.000 ms | 9.470 ms |
| 3 | 4.000 ms | 0.000 ms | 1524.006 ms | 103.000 ms | 9.272 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2718.000 | 984.662 ms | 0.362 ms | 3592602.667 |
| `_resolveModule` | 21.000 | 37.299 ms | 1.776 ms | 2986.000 |
| `_fsExists` | 38.000 | 30.414 ms | 0.800 ms | 1900.000 |
| `_networkFetchRaw` | 1.000 | 6.363 ms | 6.363 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 1.931 ms | 0.965 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.218 ms | 0.044 ms | 435.000 |
| `_log` | 3.000 | 0.073 ms | 0.024 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 87.590 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2638.000 | 897.073 ms | 2753381.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2788.000 | 3602748.667 | 3471712.667 |
| `recv:BridgeCall` | 2788.000 | 606939.000 | 437010.000 |
| `send:Execute` | 1.000 | 423525.667 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:03:46.453Z

- Warm wall: 1613.442 -> 1857.941 ms (+244.499 ms (+15.15%))
- Bridge calls/iteration: 2788.000 -> 2788.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 115.983 -> 116.371 ms (+0.388 ms (+0.34%))
- Warm Create->InjectGlobals: 4.000 -> 5.000 ms (+1.000 ms (+25.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 9.983 -> 9.371 ms (-0.612 ms (-6.13%))
- Bridge time/iteration: 939.236 -> 1060.960 ms (+121.724 ms (+12.96%))
- BridgeResponse encoded bytes/iteration: 3602748.667 -> 3602748.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 90.558 -> 87.590 ms (-2.968 ms (-3.28%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 2638.000 calls (0.000 calls (0.00%)); time 767.771 -> 897.073 ms (+129.302 ms (+16.84%)); response bytes 2753381.000 -> 2753381.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 858.330 | 984.662 | +126.332 |
| Method time | `_resolveModule` | 44.155 | 37.299 | -6.856 |
| Method time | `_networkFetchRaw` | 3.264 | 6.363 | +3.099 |
| Frame bytes | `send:Execute` | 547124.000 | 423525.667 | -123598.333 |
| Frame bytes | `send:WarmSnapshot` | 348889.333 | 409300.000 | +60410.667 |

