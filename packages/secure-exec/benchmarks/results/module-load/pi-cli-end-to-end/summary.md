# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T11:03:59.558Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1789.771 ms
- Bridge calls/iteration: 2823.000
- Warm fixed session overhead: 11.449 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 0.000 ms, residual 6.449 ms
- Dominant bridge time: `_loadPolyfill` 954.038 ms/iteration across 2727.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3598434.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 92.575 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2647.000 calls/iteration, 861.463 ms/iteration, 2759212.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3614151.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2457.159 ms | 2441.844 ms | 15.315 ms | 2823 | 1415.799 ms |
| 2 | 1804.508 ms | 1791.282 ms | 13.226 ms | 2823 | 928.970 ms |
| 3 | 1775.033 ms | 1765.361 ms | 9.672 ms | 2823 | 849.411 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.000 ms | 2.000 ms | 2441.844 ms | 1.000 ms | 4.315 ms |
| 2 | 5.000 ms | 1.000 ms | 1791.282 ms | 0.000 ms | 7.226 ms |
| 3 | 4.000 ms | 0.000 ms | 1765.361 ms | 0.000 ms | 5.672 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2727.000 | 954.038 ms | 0.350 ms | 3598434.333 |
| `_fsExists` | 55.000 | 51.455 ms | 0.936 ms | 2750.000 |
| `_resolveModule` | 21.000 | 43.040 ms | 2.050 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 4.166 ms | 4.166 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 3.212 ms | 3.212 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 2.971 ms | 0.594 ms | 7684.000 |
| `_fsWriteFile` | 1.000 | 1.491 ms | 1.491 ms | 47.000 |
| `_fsChmod` | 1.000 | 0.992 ms | 0.992 ms | 47.000 |
| `_fsRmdir` | 1.000 | 0.977 ms | 0.977 ms | 47.000 |
| `_fsStat` | 1.000 | 0.932 ms | 0.932 ms | 207.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 92.575 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2647.000 | 861.463 ms | 2759212.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2823.000 | 3614151.333 | 3481470.333 |
| `recv:BridgeCall` | 2823.000 | 611630.000 | 439660.000 |
| `send:Execute` | 1.000 | 547342.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:39:00.238Z

- Warm wall: 1764.241 -> 1789.771 ms (+25.530 ms (+1.45%))
- Bridge calls/iteration: 2823.000 -> 2823.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.732 -> 11.449 ms (+1.717 ms (+17.64%))
- Warm Create->InjectGlobals: 0.500 -> 4.500 ms (+4.000 ms (+800.00%))
- Warm InjectGlobals->Execute: 4.500 -> 0.500 ms (-4.000 ms (-88.89%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 4.732 -> 6.449 ms (+1.717 ms (+36.28%))
- Bridge time/iteration: 1021.796 -> 1064.727 ms (+42.931 ms (+4.20%))
- BridgeResponse encoded bytes/iteration: 3614151.000 -> 3614151.333 bytes (+0.333 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 82.903 -> 92.575 ms (+9.672 ms (+11.67%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2647.000 -> 2647.000 calls (0.000 calls (0.00%)); time 822.964 -> 861.463 ms (+38.499 ms (+4.68%)); response bytes 2759212.667 -> 2759212.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 905.867 | 954.038 | +48.171 |
| Method time | `_resolveModule` | 53.941 | 43.040 | -10.901 |
| Method time | `_fsExists` | 45.454 | 51.455 | +6.001 |
| Method bytes | `_fsStat` | 206.667 | 207.000 | +0.333 |
| Frame bytes | `send:Execute` | 1245041.000 | 547342.000 | -697699.000 |
| Frame bytes | `send:BridgeResponse` | 3614151.000 | 3614151.333 | +0.333 |

