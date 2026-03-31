# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T10:38:47.318Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1689.811 ms
- Bridge calls/iteration: 2788.000
- Warm fixed session overhead: 116.113 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.000 ms, ExecutionResult->Destroy 102.000 ms, residual 9.613 ms
- Dominant bridge time: `_loadPolyfill` 885.443 ms/iteration across 2718.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3592602.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 82.727 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2638.000 calls/iteration, 802.716 ms/iteration, 2753381.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3602748.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2652.899 ms | 2530.270 ms | 122.629 ms | 2788 | 1439.342 ms |
| 2 | 1812.019 ms | 1694.685 ms | 117.334 ms | 2788 | 798.673 ms |
| 3 | 1567.603 ms | 1452.712 ms | 114.891 ms | 2788 | 696.876 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2530.270 ms | 103.000 ms | 11.629 ms |
| 2 | 0.000 ms | 5.000 ms | 1694.685 ms | 102.000 ms | 10.334 ms |
| 3 | 1.000 ms | 3.000 ms | 1452.712 ms | 102.000 ms | 8.891 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2718.000 | 885.443 ms | 0.326 ms | 3592602.667 |
| `_resolveModule` | 21.000 | 54.828 ms | 2.611 ms | 2986.000 |
| `_fsExists` | 38.000 | 30.570 ms | 0.804 ms | 1900.000 |
| `_networkFetchRaw` | 1.000 | 4.563 ms | 4.563 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 2.505 ms | 1.252 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.234 ms | 0.047 ms | 435.000 |
| `_log` | 3.000 | 0.154 ms | 0.051 ms | 141.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 82.727 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2638.000 | 802.716 ms | 2753381.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2788.000 | 3602748.667 | 3471712.667 |
| `send:Execute` | 1.000 | 1244823.000 | 0.000 |
| `recv:BridgeCall` | 2788.000 | 606939.000 | 437010.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

