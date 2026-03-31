# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T07:23:03.772Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1949.559 ms
- Bridge calls/iteration: 929.333
- Warm fixed session overhead: -
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 1.000 ms, InjectGlobals->Execute 6.000 ms, ExecutionResult->Destroy -, residual -
- Dominant bridge time: `_loadPolyfill` 403.905 ms/iteration across 906.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 3156104.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 26.667 calls/iteration, 103.451 ms/iteration, 835844.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 879.333 calls/iteration, 300.454 ms/iteration, 2320259.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3159486.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2469.744 ms | 2306.809 ms | 162.935 ms | 2788 | 1319.473 ms |
| 2 | 1989.047 ms | - | - | 0 | 0.000 ms |
| 3 | 1910.072 ms | - | - | 0 | 0.000 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 2306.809 ms | 103.000 ms | 50.935 ms |
| 2 | 1.000 ms | 6.000 ms | - | - | - |
| 3 | - | - | - | - | - |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 906.000 | 403.905 ms | 0.446 ms | 3156104.000 |
| `_resolveModule` | 7.000 | 21.363 ms | 3.052 ms | 995.333 |
| `_fsExists` | 12.667 | 10.364 ms | 0.818 ms | 633.333 |
| `_networkFetchRaw` | 0.333 | 3.490 ms | 10.469 ms | 410.333 |
| `_fsReadFile` | 0.667 | 0.520 ms | 0.780 ms | 1151.000 |
| `_cryptoRandomUUID` | 1.667 | 0.115 ms | 0.069 ms | 145.000 |
| `_log` | 1.000 | 0.068 ms | 0.068 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 26.667 | 103.451 ms | 835844.333 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 879.333 | 300.454 ms | 2320259.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/client.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/api-promise.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/error.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@anthropic-ai+sdk@0.73.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/core/pagination.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 929.333 | 3159486.000 | 3115807.333 |
| `send:Execute` | 0.667 | 828744.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 929.333 | 202313.000 | 145670.000 |
| `send:InjectGlobals` | 0.667 | 152.000 | 126.667 |
| `send:CreateSession` | 0.667 | 30.667 | 0.000 |
| `recv:ExecutionResult` | 0.333 | 14.333 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |
| `send:DestroySession` | 0.333 | 12.667 | 0.000 |
| `send:Ping` | 0.333 | 12.667 | 10.667 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T07:23:03.772Z

- Warm wall: 1949.559 -> 1949.559 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2788.000 -> 929.333 calls (-1858.667 calls (-66.67%))
- Warm fixed overhead: -
- Warm Create->InjectGlobals: 0.000 -> 1.000 ms (+1.000 ms)
- Warm InjectGlobals->Execute: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: -
- Warm residual overhead: -
- Bridge time/iteration: 1048.088 -> 439.824 ms (-608.264 ms (-58.04%))
- BridgeResponse encoded bytes/iteration: 9477120.000 -> 3159486.000 bytes (-6317634.000 bytes (-66.66%))
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 26.667 calls (+26.667 calls); time 0.000 -> 103.451 ms (+103.451 ms); response bytes 0.000 -> 835844.333 bytes (+835844.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2718.000 -> 879.333 calls (-1838.667 calls (-67.65%)); time 938.412 -> 300.454 ms (-637.958 ms (-67.98%)); response bytes 9466974.000 -> 2320259.667 bytes (-7146714.333 bytes (-75.49%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 938.412 | 403.905 | -534.507 |
| Method time | `_resolveModule` | 56.444 | 21.363 | -35.081 |
| Method time | `_fsExists` | 43.058 | 10.364 | -32.694 |
| Method bytes | `_loadPolyfill` | 9466974.000 | 3156104.000 | -6310870.000 |
| Method bytes | `_fsReadFile` | 3453.000 | 1151.000 | -2302.000 |
| Method bytes | `_resolveModule` | 2986.000 | 995.333 | -1990.667 |
| Frame bytes | `send:BridgeResponse` | 9477120.000 | 3159486.000 | -6317634.000 |
| Frame bytes | `send:Execute` | 1243116.000 | 828744.000 | -414372.000 |
| Frame bytes | `recv:BridgeCall` | 606939.000 | 202313.000 | -404626.000 |

