# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T11:51:46.579Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 215.876 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 109.703 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 2.704 ms
- Dominant bridge time: `_loadPolyfill` 62.205 ms/iteration across 181.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 421744.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 43.519 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 164.000 calls/iteration, 18.686 ms/iteration, 188195.333 bytes/iteration
- Dominant frame bytes: `send:Execute` 424147.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 455.819 ms | 332.422 ms | 123.397 ms | 182 | 149.834 ms |
| 2 | 249.082 ms | 136.915 ms | 112.167 ms | 182 | 25.837 ms |
| 3 | 182.670 ms | 75.430 ms | 107.240 ms | 182 | 11.256 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 3.000 ms | 332.422 ms | 103.000 ms | 4.397 ms |
| 2 | 6.000 ms | 0.000 ms | 136.915 ms | 102.000 ms | 4.167 ms |
| 3 | 4.000 ms | 0.000 ms | 75.430 ms | 102.000 ms | 1.240 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 181.000 | 62.205 ms | 0.344 ms | 421744.667 |
| `_log` | 1.000 | 0.104 ms | 0.104 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 43.519 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 164.000 | 18.686 ms | 188195.333 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 424147.667 | 0.000 |
| `send:BridgeResponse` | 182.000 | 421791.667 | 413237.667 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `recv:BridgeCall` | 182.000 | 32458.000 | 21365.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:StreamEvent` | 1.000 | 58.000 | 13.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:51:46.579Z

- Warm wall: 215.876 -> 215.876 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.703 -> 109.703 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.704 -> 2.704 ms (0.000 ms (0.00%))
- Bridge time/iteration: 62.309 -> 62.309 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 421791.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 43.519 -> 43.519 ms (0.000 ms (0.00%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 164.000 calls (0.000 calls (0.00%)); time 18.686 -> 18.686 ms (0.000 ms (0.00%)); response bytes 188195.333 -> 188195.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

