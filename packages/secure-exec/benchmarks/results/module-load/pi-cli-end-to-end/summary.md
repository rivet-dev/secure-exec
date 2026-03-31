# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T11:52:13.176Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1993.647 ms
- Bridge calls/iteration: 2823.000
- Warm fixed session overhead: 8.235 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 0.000 ms, residual 2.734 ms
- Dominant bridge time: `_loadPolyfill` 944.730 ms/iteration across 2727.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3598434.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 80.000 calls/iteration, 114.967 ms/iteration, 839221.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2647.000 calls/iteration, 829.763 ms/iteration, 2759212.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3614150.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2302.224 ms | 2281.382 ms | 20.842 ms | 2823 | 1277.310 ms |
| 2 | 2173.772 ms | 2165.065 ms | 8.707 ms | 2823 | 1045.186 ms |
| 3 | 1813.522 ms | 1805.760 ms | 7.762 ms | 2823 | 907.085 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 3.000 ms | 2281.382 ms | 0.000 ms | 4.842 ms |
| 2 | 6.000 ms | 0.000 ms | 2165.065 ms | 0.000 ms | 2.707 ms |
| 3 | 4.000 ms | 1.000 ms | 1805.760 ms | 0.000 ms | 2.762 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2727.000 | 944.730 ms | 0.346 ms | 3598434.333 |
| `_fsExists` | 55.000 | 65.702 ms | 1.195 ms | 2750.000 |
| `_resolveModule` | 21.000 | 43.723 ms | 2.082 ms | 2986.000 |
| `_fsMkdir` | 1.000 | 5.882 ms | 5.882 ms | 47.000 |
| `_fsReadFile` | 5.000 | 4.748 ms | 0.950 ms | 7684.000 |
| `_networkFetchRaw` | 1.000 | 3.888 ms | 3.888 ms | 1231.000 |
| `_fsStat` | 1.000 | 1.735 ms | 1.735 ms | 206.333 |
| `_fsRmdir` | 1.000 | 1.704 ms | 1.704 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.633 ms | 1.633 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.161 ms | 1.161 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 80.000 | 114.967 ms | 839221.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 2647.000 | 829.763 ms | 2759212.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2823.000 | 3614150.667 | 3481469.667 |
| `recv:BridgeCall` | 2823.000 | 611630.000 | 439660.000 |
| `send:Execute` | 1.000 | 423428.667 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:03:59.558Z

- Warm wall: 1789.771 -> 1993.647 ms (+203.876 ms (+11.39%))
- Bridge calls/iteration: 2823.000 -> 2823.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 11.449 -> 8.235 ms (-3.214 ms (-28.07%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 6.449 -> 2.734 ms (-3.715 ms (-57.61%))
- Bridge time/iteration: 1064.727 -> 1076.527 ms (+11.800 ms (+1.11%))
- BridgeResponse encoded bytes/iteration: 3614151.333 -> 3614150.667 bytes (-0.666 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 92.575 -> 114.967 ms (+22.392 ms (+24.19%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2647.000 -> 2647.000 calls (0.000 calls (0.00%)); time 861.463 -> 829.763 ms (-31.700 ms (-3.68%)); response bytes 2759212.667 -> 2759212.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_fsExists` | 51.455 | 65.702 | +14.247 |
| Method time | `_loadPolyfill` | 954.038 | 944.730 | -9.308 |
| Method time | `_fsReadFile` | 2.971 | 4.748 | +1.777 |
| Method bytes | `_fsStat` | 207.000 | 206.333 | -0.667 |
| Frame bytes | `send:Execute` | 547342.000 | 423428.667 | -123913.333 |
| Frame bytes | `send:WarmSnapshot` | 348889.333 | 409300.000 | +60410.667 |
| Frame bytes | `send:BridgeResponse` | 3614151.333 | 3614150.667 | -0.666 |

