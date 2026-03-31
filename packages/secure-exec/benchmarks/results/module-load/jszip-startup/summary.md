# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T11:03:32.364Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 197.583 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 108.335 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 1.835 ms
- Dominant bridge time: `_loadPolyfill` 50.123 ms/iteration across 178.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 421570.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 29.784 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 161.000 calls/iteration, 20.340 ms/iteration, 188021.333 bytes/iteration
- Dominant frame bytes: `send:Execute` 546223.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 402.030 ms | 286.567 ms | 115.463 ms | 179 | 117.135 ms |
| 2 | 168.474 ms | 60.120 ms | 108.354 ms | 179 | 11.541 ms |
| 3 | 226.692 ms | 118.376 ms | 108.316 ms | 179 | 22.071 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 7.000 ms | 3.000 ms | 286.567 ms | 103.000 ms | 2.463 ms |
| 2 | 5.000 ms | 0.000 ms | 60.120 ms | 102.000 ms | 1.354 ms |
| 3 | 4.000 ms | 0.000 ms | 118.376 ms | 102.000 ms | 2.316 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 178.000 | 50.123 ms | 0.282 ms | 421570.667 |
| `_log` | 1.000 | 0.126 ms | 0.126 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 29.784 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 161.000 | 20.340 ms | 188021.333 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 546223.000 | 0.000 |
| `send:BridgeResponse` | 179.000 | 421617.667 | 413204.667 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:BridgeCall` | 179.000 | 32171.000 | 21261.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:38:33.312Z

- Warm wall: 188.114 -> 197.583 ms (+9.469 ms (+5.03%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.624 -> 108.335 ms (-1.289 ms (-1.18%))
- Warm Create->InjectGlobals: 0.000 -> 4.500 ms (+4.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 0.000 ms (-5.000 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.624 -> 1.835 ms (-0.789 ms (-30.07%))
- Bridge time/iteration: 54.071 -> 50.249 ms (-3.822 ms (-7.07%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 37.603 -> 29.784 ms (-7.819 ms (-20.79%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 16.363 -> 20.340 ms (+3.977 ms (+24.30%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 53.965 | 50.123 | -3.842 |
| Method time | `_log` | 0.106 | 0.126 | +0.020 |
| Frame bytes | `send:Execute` | 1243922.000 | 546223.000 | -697699.000 |

