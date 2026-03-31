# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T13:28:36.991Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1835.606 ms
- Bridge calls/iteration: 2745.000
- Warm fixed session overhead: 116.839 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 9.339 ms
- Dominant bridge time: `_loadPolyfill` 890.972 ms/iteration across 2702.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3635716.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 77.999 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2631.000 calls/iteration, 812.973 ms/iteration, 2877087.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3642576.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2148.592 ms | 2024.909 ms | 123.683 ms | 2745 | 1083.587 ms |
| 2 | 1971.628 ms | 1853.680 ms | 117.948 ms | 2745 | 962.820 ms |
| 3 | 1699.584 ms | 1583.854 ms | 115.730 ms | 2745 | 769.875 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2024.909 ms | 103.000 ms | 11.683 ms |
| 2 | 6.000 ms | 0.000 ms | 1853.680 ms | 102.000 ms | 9.948 ms |
| 3 | 5.000 ms | 0.000 ms | 1583.854 ms | 102.000 ms | 8.730 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2702.000 | 890.972 ms | 0.330 ms | 3635716.667 |
| `_fsExists` | 32.000 | 38.878 ms | 1.215 ms | 1600.000 |
| `_networkFetchRaw` | 1.000 | 5.324 ms | 5.324 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 3.120 ms | 1.560 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.261 ms | 0.052 ms | 435.000 |
| `_log` | 3.000 | 0.207 ms | 0.069 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 71.000 | 77.999 ms | 758629.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2631.000 | 812.973 ms | 2877087.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2745.000 | 3642576.667 | 3513561.667 |
| `recv:BridgeCall` | 2745.000 | 583632.000 | 416323.000 |
| `send:WarmSnapshot` | 0.333 | 494371.333 | 0.000 |
| `send:Execute` | 1.000 | 14229.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:36.991Z

- Warm wall: 1835.606 -> 1835.606 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.839 -> 116.839 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 9.339 -> 9.339 ms (0.000 ms (0.00%))
- Bridge time/iteration: 938.761 -> 938.761 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 3642576.667 -> 3642576.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 77.999 -> 77.999 ms (0.000 ms (0.00%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2631.000 -> 2631.000 calls (0.000 calls (0.00%)); time 812.973 -> 812.973 ms (0.000 ms (0.00%)); response bytes 2877087.000 -> 2877087.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

