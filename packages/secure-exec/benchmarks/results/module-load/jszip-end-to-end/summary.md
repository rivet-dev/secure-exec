# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T13:28:24.667Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 193.293 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 108.653 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 1.000 ms, ExecutionResult->Destroy 101.500 ms, residual 1.653 ms
- Dominant bridge time: `_loadPolyfill` 59.379 ms/iteration across 181.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 421744.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 44.497 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 164.000 calls/iteration, 14.882 ms/iteration, 188195.333 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 421791.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 358.245 ms | 240.939 ms | 117.306 ms | 182 | 150.151 ms |
| 2 | 187.847 ms | 77.590 ms | 110.257 ms | 182 | 11.568 ms |
| 3 | 198.739 ms | 91.690 ms | 107.049 ms | 182 | 16.768 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 240.939 ms | 103.000 ms | 2.306 ms |
| 2 | 5.000 ms | 1.000 ms | 77.590 ms | 101.000 ms | 3.257 ms |
| 3 | 4.000 ms | 1.000 ms | 91.690 ms | 102.000 ms | 0.049 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 181.000 | 59.379 ms | 0.328 ms | 421744.667 |
| `_log` | 1.000 | 0.117 ms | 0.117 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 44.497 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 164.000 | 14.882 ms | 188195.333 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 182.000 | 421791.667 | 413237.667 |
| `send:WarmSnapshot` | 0.333 | 411389.667 | 0.000 |
| `recv:BridgeCall` | 182.000 | 32458.000 | 21365.000 |
| `send:Execute` | 1.000 | 14851.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:StreamEvent` | 1.000 | 58.000 | 13.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:21:27.323Z

- Warm wall: 210.010 -> 193.293 ms (-16.717 ms (-7.96%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.545 -> 108.653 ms (-1.892 ms (-1.71%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 1.000 ms (+1.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 3.545 -> 1.653 ms (-1.892 ms (-53.37%))
- Bridge time/iteration: 52.387 -> 59.496 ms (+7.109 ms (+13.57%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 421791.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 35.631 -> 44.497 ms (+8.866 ms (+24.88%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 164.000 calls (0.000 calls (0.00%)); time 16.627 -> 14.882 ms (-1.745 ms (-10.49%)); response bytes 188195.333 -> 188195.333 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 52.258 | 59.379 | +7.121 |
| Method time | `_log` | 0.129 | 0.117 | -0.012 |
| Frame bytes | `send:Execute` | 426213.000 | 14851.000 | -411362.000 |
| Frame bytes | `send:WarmSnapshot` | 411365.333 | 411389.667 | +24.334 |
| Frame bytes | `send:Ping` | 38.000 | 50.667 | +12.667 |

