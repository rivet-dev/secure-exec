# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T12:42:05.288Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 2054.149 ms
- Bridge calls/iteration: 2754.000
- Warm fixed session overhead: 116.365 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 101.500 ms, residual 9.865 ms
- Dominant bridge time: `_loadPolyfill` 1049.312 ms/iteration across 2711.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3716308.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 105.064 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2631.000 calls/iteration, 944.248 ms/iteration, 2877087.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3723168.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2841.284 ms | 2709.871 ms | 131.413 ms | 2754 | 1454.475 ms |
| 2 | 2051.473 ms | 1934.254 ms | 117.219 ms | 2754 | 895.291 ms |
| 3 | 2056.825 ms | 1941.314 ms | 115.511 ms | 2754 | 928.163 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 3.000 ms | 2709.871 ms | 104.000 ms | 11.413 ms |
| 2 | 6.000 ms | 0.000 ms | 1934.254 ms | 102.000 ms | 9.219 ms |
| 3 | 4.000 ms | 0.000 ms | 1941.314 ms | 101.000 ms | 10.511 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2711.000 | 1049.312 ms | 0.387 ms | 3716308.667 |
| `_fsExists` | 32.000 | 33.129 ms | 1.035 ms | 1600.000 |
| `_networkFetchRaw` | 1.000 | 5.078 ms | 5.078 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 4.799 ms | 2.400 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.222 ms | 0.044 ms | 435.000 |
| `_log` | 3.000 | 0.102 ms | 0.034 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 105.064 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2631.000 | 944.248 ms | 2877087.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2754.000 | 3723168.667 | 3593730.667 |
| `recv:BridgeCall` | 2754.000 | 584341.000 | 416483.000 |
| `send:Execute` | 1.000 | 425386.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 411160.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:51:59.905Z

- Warm wall: 1857.941 -> 2054.149 ms (+196.208 ms (+10.56%))
- Bridge calls/iteration: 2788.000 -> 2754.000 calls (-34.000 calls (-1.22%))
- Warm fixed overhead: 116.371 -> 116.365 ms (-0.006 ms (-0.01%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 9.371 -> 9.865 ms (+0.494 ms (+5.27%))
- Bridge time/iteration: 1060.960 -> 1092.643 ms (+31.683 ms (+2.99%))
- BridgeResponse encoded bytes/iteration: 3602748.667 -> 3723168.667 bytes (+120420.000 bytes (+3.34%))
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 87.590 -> 105.064 ms (+17.474 ms (+19.95%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 2631.000 calls (-7.000 calls (-0.27%)); time 897.073 -> 944.248 ms (+47.175 ms (+5.26%)); response bytes 2753381.000 -> 2877087.000 bytes (+123706.000 bytes (+4.49%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 984.662 | 1049.312 | +64.650 |
| Method time | `_resolveModule` | 37.299 | 0.000 | -37.299 |
| Method time | `_fsReadFile` | 1.931 | 4.799 | +2.868 |
| Method bytes | `_loadPolyfill` | 3592602.667 | 3716308.667 | +123706.000 |
| Method bytes | `_resolveModule` | 2986.000 | 0.000 | -2986.000 |
| Method bytes | `_fsExists` | 1900.000 | 1600.000 | -300.000 |
| Frame bytes | `send:BridgeResponse` | 3602748.667 | 3723168.667 | +120420.000 |
| Frame bytes | `recv:BridgeCall` | 606939.000 | 584341.000 | -22598.000 |
| Frame bytes | `send:Execute` | 423525.667 | 425386.000 | +1860.333 |

