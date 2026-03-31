# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T11:51:45.270Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 172.202 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 111.102 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 103.000 ms, residual 3.603 ms
- Dominant bridge time: `_loadPolyfill` 76.484 ms/iteration across 178.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 421570.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 49.773 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 161.000 calls/iteration, 26.712 ms/iteration, 188021.333 bytes/iteration
- Dominant frame bytes: `send:Execute` 422616.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 560.658 ms | 438.842 ms | 121.816 ms | 179 | 206.327 ms |
| 2 | 174.499 ms | 62.979 ms | 111.520 ms | 179 | 12.725 ms |
| 3 | 169.906 ms | 59.221 ms | 110.685 ms | 179 | 10.819 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 3.000 ms | 438.842 ms | 104.000 ms | 1.816 ms |
| 2 | 5.000 ms | 0.000 ms | 62.979 ms | 103.000 ms | 3.520 ms |
| 3 | 4.000 ms | 0.000 ms | 59.221 ms | 103.000 ms | 3.685 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 178.000 | 76.484 ms | 0.430 ms | 421570.667 |
| `_log` | 1.000 | 0.139 ms | 0.139 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 49.773 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 161.000 | 26.712 ms | 188021.333 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 422616.667 | 0.000 |
| `send:BridgeResponse` | 179.000 | 421617.667 | 413204.667 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `recv:BridgeCall` | 179.000 | 32171.000 | 21261.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:03:32.364Z

- Warm wall: 197.583 -> 172.202 ms (-25.381 ms (-12.85%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.335 -> 111.102 ms (+2.767 ms (+2.55%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 103.000 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 1.835 -> 3.603 ms (+1.768 ms (+96.35%))
- Bridge time/iteration: 50.249 -> 76.624 ms (+26.375 ms (+52.49%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 29.784 -> 49.773 ms (+19.989 ms (+67.11%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 20.340 -> 26.712 ms (+6.372 ms (+31.33%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 50.123 | 76.484 | +26.361 |
| Method time | `_log` | 0.126 | 0.139 | +0.013 |
| Frame bytes | `send:Execute` | 546223.000 | 422616.667 | -123606.333 |
| Frame bytes | `send:WarmSnapshot` | 348889.333 | 409300.000 | +60410.667 |

