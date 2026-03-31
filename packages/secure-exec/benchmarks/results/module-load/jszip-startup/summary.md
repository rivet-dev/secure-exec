# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T10:38:33.312Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 188.114 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 109.624 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.000 ms, residual 2.624 ms
- Dominant bridge time: `_loadPolyfill` 53.965 ms/iteration across 178.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 421570.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 37.603 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 161.000 calls/iteration, 16.363 ms/iteration, 188021.333 bytes/iteration
- Dominant frame bytes: `send:Execute` 1243922.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 403.420 ms | 286.217 ms | 117.203 ms | 179 | 131.364 ms |
| 2 | 182.647 ms | 70.521 ms | 112.126 ms | 179 | 11.955 ms |
| 3 | 193.581 ms | 86.459 ms | 107.122 ms | 179 | 18.895 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 286.217 ms | 105.000 ms | 4.203 ms |
| 2 | 0.000 ms | 6.000 ms | 70.521 ms | 102.000 ms | 4.126 ms |
| 3 | 0.000 ms | 4.000 ms | 86.459 ms | 102.000 ms | 1.122 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 178.000 | 53.965 ms | 0.303 ms | 421570.667 |
| `_log` | 1.000 | 0.106 ms | 0.106 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 37.603 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 161.000 | 16.363 ms | 188021.333 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1243922.000 | 0.000 |
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

Baseline scenario timestamp: 2026-03-31T10:26:39.391Z

- Warm wall: 175.055 -> 188.114 ms (+13.059 ms (+7.46%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.960 -> 109.624 ms (+0.664 ms (+0.61%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.460 -> 2.624 ms (+0.164 ms (+6.67%))
- Bridge time/iteration: 39.272 -> 54.071 ms (+14.799 ms (+37.68%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 26.080 -> 37.603 ms (+11.523 ms (+44.18%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 13.142 -> 16.363 ms (+3.221 ms (+24.51%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 39.221 | 53.965 | +14.744 |
| Method time | `_log` | 0.051 | 0.106 | +0.055 |
| Frame bytes | `send:Execute` | 1242215.000 | 1243922.000 | +1707.000 |
| Frame bytes | `send:WarmSnapshot` | 348320.333 | 348889.333 | +569.000 |

