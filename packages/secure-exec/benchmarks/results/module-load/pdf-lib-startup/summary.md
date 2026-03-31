# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T09:37:48.342Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 330.374 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 111.281 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.500 ms, residual 3.282 ms
- Dominant bridge time: `_loadPolyfill` 71.276 ms/iteration across 513.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1617546.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 22.105 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 506.000 calls/iteration, 49.172 ms/iteration, 1517487.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 1617593.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 432.316 ms | 316.879 ms | 115.437 ms | 514 | 110.561 ms |
| 2 | 372.057 ms | 260.006 ms | 112.051 ms | 514 | 64.245 ms |
| 3 | 288.691 ms | 178.179 ms | 110.512 ms | 514 | 39.289 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 6.000 ms | 316.879 ms | 104.000 ms | 3.437 ms |
| 2 | 0.000 ms | 6.000 ms | 260.006 ms | 103.000 ms | 3.051 ms |
| 3 | 1.000 ms | 4.000 ms | 178.179 ms | 102.000 ms | 3.512 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 513.000 | 71.276 ms | 0.139 ms | 1617546.333 |
| `_log` | 1.000 | 0.089 ms | 0.089 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 22.105 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 506.000 | 49.172 ms | 1517487.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 514.000 | 1617593.333 | 1593435.333 |
| `send:Execute` | 1.000 | 1242216.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 514.000 | 103142.000 | 71797.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T09:37:48.342Z

- Warm wall: 330.374 -> 330.374 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.281 -> 111.281 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.282 -> 3.282 ms (0.000 ms (0.00%))
- Bridge time/iteration: 71.365 -> 71.365 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1617593.333 -> 1617593.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 22.105 -> 22.105 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 49.172 -> 49.172 ms (0.000 ms (0.00%)); response bytes 1517487.000 -> 1517487.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

