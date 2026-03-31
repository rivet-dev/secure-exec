# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T10:38:34.607Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 211.995 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 110.157 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 3.657 ms
- Dominant bridge time: `_loadPolyfill` 45.656 ms/iteration across 181.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 421744.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 29.786 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 164.000 calls/iteration, 15.870 ms/iteration, 188195.333 bytes/iteration
- Dominant frame bytes: `send:Execute` 1245453.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 391.427 ms | 274.286 ms | 117.141 ms | 182 | 106.296 ms |
| 2 | 224.930 ms | 114.337 ms | 110.593 ms | 182 | 18.378 ms |
| 3 | 199.061 ms | 89.340 ms | 109.721 ms | 182 | 12.704 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 274.286 ms | 104.000 ms | 5.141 ms |
| 2 | 0.000 ms | 5.000 ms | 114.337 ms | 101.000 ms | 4.593 ms |
| 3 | 0.000 ms | 4.000 ms | 89.340 ms | 103.000 ms | 2.721 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 181.000 | 45.656 ms | 0.252 ms | 421744.667 |
| `_log` | 1.000 | 0.137 ms | 0.137 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 29.786 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 164.000 | 15.870 ms | 188195.333 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1245453.000 | 0.000 |
| `send:BridgeResponse` | 182.000 | 421791.667 | 413237.667 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:BridgeCall` | 182.000 | 32458.000 | 21365.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:StreamEvent` | 1.000 | 58.000 | 13.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

