# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T11:03:33.852Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 220.933 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 111.137 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 3.637 ms
- Dominant bridge time: `_loadPolyfill` 85.607 ms/iteration across 181.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 421744.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 56.511 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 164.000 calls/iteration, 29.096 ms/iteration, 188195.333 bytes/iteration
- Dominant frame bytes: `send:Execute` 547754.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 608.764 ms | 489.356 ms | 119.408 ms | 182 | 222.062 ms |
| 2 | 206.539 ms | 95.857 ms | 110.682 ms | 182 | 14.808 ms |
| 3 | 235.328 ms | 123.736 ms | 111.592 ms | 182 | 20.262 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.000 ms | 2.000 ms | 489.356 ms | 103.000 ms | 6.408 ms |
| 2 | 5.000 ms | 0.000 ms | 95.857 ms | 102.000 ms | 3.682 ms |
| 3 | 6.000 ms | 0.000 ms | 123.736 ms | 102.000 ms | 3.592 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 181.000 | 85.607 ms | 0.473 ms | 421744.667 |
| `_log` | 1.000 | 0.104 ms | 0.104 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 56.511 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 164.000 | 29.096 ms | 188195.333 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 547754.000 | 0.000 |
| `send:BridgeResponse` | 182.000 | 421791.667 | 413237.667 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:BridgeCall` | 182.000 | 32458.000 | 21365.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:StreamEvent` | 1.000 | 58.000 | 13.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:38:34.607Z

- Warm wall: 211.995 -> 220.933 ms (+8.938 ms (+4.22%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.157 -> 111.137 ms (+0.980 ms (+0.89%))
- Warm Create->InjectGlobals: 0.000 -> 5.500 ms (+5.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 0.000 ms (-4.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.657 -> 3.637 ms (-0.020 ms (-0.55%))
- Bridge time/iteration: 45.793 -> 85.711 ms (+39.918 ms (+87.17%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 421791.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 29.786 -> 56.511 ms (+26.725 ms (+89.72%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 164.000 calls (0.000 calls (0.00%)); time 15.870 -> 29.096 ms (+13.226 ms (+83.34%)); response bytes 188195.333 -> 188195.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 45.656 | 85.607 | +39.951 |
| Method time | `_log` | 0.137 | 0.104 | -0.033 |
| Frame bytes | `send:Execute` | 1245453.000 | 547754.000 | -697699.000 |

