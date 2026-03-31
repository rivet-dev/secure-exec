# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T12:42:35.710Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1746.020 ms
- Bridge calls/iteration: 2781.000
- Warm fixed session overhead: 8.521 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.521 ms
- Dominant bridge time: `_loadPolyfill` 999.854 ms/iteration across 2718.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3716707.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 109.059 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2638.000 calls/iteration, 890.794 ms/iteration, 2877486.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3728838.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2666.722 ms | 2645.824 ms | 20.898 ms | 2781 | 1459.170 ms |
| 2 | 1843.331 ms | 1833.946 ms | 9.385 ms | 2781 | 902.521 ms |
| 3 | 1648.709 ms | 1641.053 ms | 7.656 ms | 2781 | 840.689 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 3.000 ms | 2645.824 ms | 1.000 ms | 3.898 ms |
| 2 | 5.000 ms | 0.000 ms | 1833.946 ms | 0.000 ms | 4.385 ms |
| 3 | 5.000 ms | 0.000 ms | 1641.053 ms | 0.000 ms | 2.656 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2718.000 | 999.854 ms | 0.368 ms | 3716707.667 |
| `_fsExists` | 43.000 | 46.360 ms | 1.078 ms | 2150.000 |
| `_fsMkdir` | 1.000 | 7.999 ms | 7.999 ms | 47.000 |
| `_fsReadFile` | 5.000 | 3.070 ms | 0.614 ms | 7684.000 |
| `_networkFetchRaw` | 1.000 | 3.051 ms | 3.051 ms | 1231.000 |
| `_fsChmod` | 1.000 | 1.607 ms | 1.607 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.396 ms | 1.396 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.232 ms | 1.232 ms | 47.000 |
| `_fsStat` | 1.000 | 1.189 ms | 1.189 ms | 206.333 |
| `_fsRmdir` | 1.000 | 1.058 ms | 1.058 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 109.059 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2638.000 | 890.794 ms | 2877486.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2781.000 | 3728838.000 | 3598131.000 |
| `recv:BridgeCall` | 2781.000 | 587601.000 | 418166.000 |
| `send:Execute` | 1.000 | 425289.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 411160.333 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:52:13.176Z

- Warm wall: 1993.647 -> 1746.020 ms (-247.627 ms (-12.42%))
- Bridge calls/iteration: 2823.000 -> 2781.000 calls (-42.000 calls (-1.49%))
- Warm fixed overhead: 8.235 -> 8.521 ms (+0.286 ms (+3.47%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.734 -> 3.521 ms (+0.787 ms (+28.79%))
- Bridge time/iteration: 1076.527 -> 1067.460 ms (-9.067 ms (-0.84%))
- BridgeResponse encoded bytes/iteration: 3614150.667 -> 3728838.000 bytes (+114687.333 bytes (+3.17%))
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 114.967 -> 109.059 ms (-5.908 ms (-5.14%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2647.000 -> 2638.000 calls (-9.000 calls (-0.34%)); time 829.763 -> 890.794 ms (+61.031 ms (+7.36%)); response bytes 2759212.667 -> 2877486.000 bytes (+118273.333 bytes (+4.29%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 944.730 | 999.854 | +55.124 |
| Method time | `_resolveModule` | 43.723 | 0.000 | -43.723 |
| Method time | `_fsExists` | 65.702 | 46.360 | -19.342 |
| Method bytes | `_loadPolyfill` | 3598434.333 | 3716707.667 | +118273.334 |
| Method bytes | `_resolveModule` | 2986.000 | 0.000 | -2986.000 |
| Method bytes | `_fsExists` | 2750.000 | 2150.000 | -600.000 |
| Frame bytes | `send:BridgeResponse` | 3614150.667 | 3728838.000 | +114687.333 |
| Frame bytes | `recv:BridgeCall` | 611630.000 | 587601.000 | -24029.000 |
| Frame bytes | `send:Execute` | 423428.667 | 425289.000 | +1860.333 |

