# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T10:39:00.238Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1764.241 ms
- Bridge calls/iteration: 2823.000
- Warm fixed session overhead: 9.732 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 0.000 ms, residual 4.732 ms
- Dominant bridge time: `_loadPolyfill` 905.867 ms/iteration across 2727.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3598434.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 82.903 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2647.000 calls/iteration, 822.964 ms/iteration, 2759212.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3614151.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2367.603 ms | 2354.912 ms | 12.691 ms | 2823 | 1335.891 ms |
| 2 | 1918.112 ms | 1908.026 ms | 10.086 ms | 2823 | 899.676 ms |
| 3 | 1610.370 ms | 1600.992 ms | 9.378 ms | 2823 | 829.821 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2354.912 ms | 1.000 ms | 3.691 ms |
| 2 | 1.000 ms | 5.000 ms | 1908.026 ms | 0.000 ms | 4.086 ms |
| 3 | 0.000 ms | 4.000 ms | 1600.992 ms | 0.000 ms | 5.378 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2727.000 | 905.867 ms | 0.332 ms | 3598434.333 |
| `_resolveModule` | 21.000 | 53.941 ms | 2.569 ms | 2986.000 |
| `_fsExists` | 55.000 | 45.454 ms | 0.826 ms | 2750.000 |
| `_fsMkdir` | 1.000 | 4.796 ms | 4.796 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 3.136 ms | 3.136 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 2.847 ms | 0.569 ms | 7684.000 |
| `_fsWriteFile` | 1.000 | 1.295 ms | 1.295 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.218 ms | 1.218 ms | 47.000 |
| `_fsRmdir` | 1.000 | 0.961 ms | 0.961 ms | 47.000 |
| `_fsStat` | 1.000 | 0.924 ms | 0.924 ms | 206.667 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 82.903 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2647.000 | 822.964 ms | 2759212.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2823.000 | 3614151.000 | 3481470.000 |
| `send:Execute` | 1.000 | 1245041.000 | 0.000 |
| `recv:BridgeCall` | 2823.000 | 611630.000 | 439660.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

