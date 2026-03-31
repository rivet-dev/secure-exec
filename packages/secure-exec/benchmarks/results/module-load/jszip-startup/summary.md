# JSZip Startup

Scenario: `jszip-startup`
Generated: 2026-03-31T09:37:51.291Z
Description: Loads JSZip, creates an archive, and stages a starter file.

## Progress Copy Fields

- Warm wall mean: 206.266 ms
- Bridge calls/iteration: 179.000
- Warm fixed session overhead: 109.216 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.000 ms, ExecutionResult->Destroy 102.000 ms, residual 2.716 ms
- Dominant bridge time: `_loadPolyfill` 53.063 ms/iteration across 178.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 725133.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 28.411 ms/iteration, 233549.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 161.000 calls/iteration, 24.652 ms/iteration, 491584.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 1242215.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 415.428 ms | 297.577 ms | 117.851 ms | 179 | 118.498 ms |
| 2 | 204.418 ms | 95.771 ms | 108.647 ms | 179 | 20.388 ms |
| 3 | 208.113 ms | 98.329 ms | 109.784 ms | 179 | 20.606 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 297.577 ms | 104.000 ms | 5.851 ms |
| 2 | 0.000 ms | 5.000 ms | 95.771 ms | 102.000 ms | 1.647 ms |
| 3 | 1.000 ms | 3.000 ms | 98.329 ms | 102.000 ms | 3.784 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 178.000 | 53.063 ms | 0.298 ms | 725133.333 |
| `_log` | 1.000 | 0.101 ms | 0.101 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 28.411 ms | 233549.333 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 161.000 | 24.652 ms | 491584.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1242215.000 | 0.000 |
| `send:BridgeResponse` | 179.000 | 725180.333 | 716767.333 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 179.000 | 32171.000 | 21261.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T09:37:51.291Z

- Warm wall: 206.266 -> 206.266 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.216 -> 109.216 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.000 -> 4.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.716 -> 2.716 ms (0.000 ms (0.00%))
- Bridge time/iteration: 53.164 -> 53.164 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 725180.333 -> 725180.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 28.411 -> 28.411 ms (0.000 ms (0.00%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 24.652 -> 24.652 ms (0.000 ms (0.00%)); response bytes 491584.000 -> 491584.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

