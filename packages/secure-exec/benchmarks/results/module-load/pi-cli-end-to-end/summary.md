# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T13:28:50.007Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1926.880 ms
- Bridge calls/iteration: 2772.000
- Warm fixed session overhead: 13.261 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 7.760 ms
- Dominant bridge time: `_loadPolyfill` 937.983 ms/iteration across 2709.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3636115.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 78.924 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2638.000 calls/iteration, 859.059 ms/iteration, 2877486.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3648246.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2087.074 ms | 2071.024 ms | 16.050 ms | 2772 | 1144.934 ms |
| 2 | 1943.517 ms | 1930.946 ms | 12.571 ms | 2772 | 1007.021 ms |
| 3 | 1910.242 ms | 1896.292 ms | 13.950 ms | 2772 | 880.047 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 10.000 ms | 1.000 ms | 2071.024 ms | 1.000 ms | 4.050 ms |
| 2 | 6.000 ms | 0.000 ms | 1930.946 ms | 0.000 ms | 6.571 ms |
| 3 | 5.000 ms | 0.000 ms | 1896.292 ms | 0.000 ms | 8.950 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2709.000 | 937.983 ms | 0.346 ms | 3636115.667 |
| `_fsExists` | 43.000 | 52.290 ms | 1.216 ms | 2150.000 |
| `_networkFetchRaw` | 1.000 | 5.840 ms | 5.840 ms | 1231.000 |
| `_fsMkdir` | 1.000 | 5.144 ms | 5.144 ms | 47.000 |
| `_fsReadFile` | 5.000 | 3.281 ms | 0.656 ms | 7684.000 |
| `_fsWriteFile` | 1.000 | 1.245 ms | 1.245 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.202 ms | 1.202 ms | 47.000 |
| `_fsStat` | 1.000 | 1.065 ms | 1.065 ms | 207.000 |
| `_fsChmod` | 1.000 | 1.013 ms | 1.013 ms | 47.000 |
| `_fsUtimes` | 1.000 | 0.972 ms | 0.972 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 71.000 | 78.924 ms | 758629.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2638.000 | 859.059 ms | 2877486.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2772.000 | 3648246.667 | 3517962.667 |
| `recv:BridgeCall` | 2772.000 | 586892.000 | 418006.000 |
| `send:WarmSnapshot` | 0.333 | 494371.333 | 0.000 |
| `send:Execute` | 1.000 | 14132.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:50.007Z

- Warm wall: 1926.880 -> 1926.880 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 13.261 -> 13.261 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 7.760 -> 7.760 ms (0.000 ms (0.00%))
- Bridge time/iteration: 1010.667 -> 1010.667 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 3648246.667 -> 3648246.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 78.924 -> 78.924 ms (0.000 ms (0.00%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 2638.000 calls (0.000 calls (0.00%)); time 859.059 -> 859.059 ms (0.000 ms (0.00%)); response bytes 2877486.000 -> 2877486.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

