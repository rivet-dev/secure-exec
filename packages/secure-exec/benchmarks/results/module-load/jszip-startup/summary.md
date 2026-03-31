# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T13:28:23.425Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 169.488 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 109.156 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 101.500 ms, residual 2.656 ms
- Dominant bridge time: `_loadPolyfill` 53.858 ms/iteration across 178.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 421570.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 35.764 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 161.000 calls/iteration, 18.094 ms/iteration, 188021.333 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 421617.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 360.808 ms | 244.260 ms | 116.548 ms | 179 | 138.602 ms |
| 2 | 168.436 ms | 58.016 ms | 110.420 ms | 179 | 11.463 ms |
| 3 | 170.541 ms | 62.649 ms | 107.892 ms | 179 | 11.931 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 244.260 ms | 103.000 ms | 1.548 ms |
| 2 | 5.000 ms | 1.000 ms | 58.016 ms | 102.000 ms | 2.420 ms |
| 3 | 4.000 ms | 0.000 ms | 62.649 ms | 101.000 ms | 2.892 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 178.000 | 53.858 ms | 0.303 ms | 421570.667 |
| `_log` | 1.000 | 0.141 ms | 0.141 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 35.764 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 161.000 | 18.094 ms | 188021.333 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 179.000 | 421617.667 | 413204.667 |
| `send:WarmSnapshot` | 0.333 | 411389.667 | 0.000 |
| `recv:BridgeCall` | 179.000 | 32171.000 | 21261.000 |
| `send:Execute` | 1.000 | 13320.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:23.425Z

- Warm wall: 169.488 -> 169.488 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.156 -> 109.156 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.656 -> 2.656 ms (0.000 ms (0.00%))
- Bridge time/iteration: 53.999 -> 53.999 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 35.764 -> 35.764 ms (0.000 ms (0.00%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 18.094 -> 18.094 ms (0.000 ms (0.00%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

