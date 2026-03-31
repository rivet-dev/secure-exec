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

Baseline scenario timestamp: 2026-03-31T05:47:26.381Z

- Warm wall: 314.083 -> 330.374 ms (+16.291 ms (+5.19%))
- Bridge calls/iteration: 1651.000 -> 514.000 calls (-1137.000 calls (-68.87%))
- Warm fixed overhead: 108.981 -> 111.281 ms (+2.300 ms (+2.11%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.500 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 2.481 -> 3.282 ms (+0.801 ms (+32.28%))
- Bridge time/iteration: 64.700 -> 71.365 ms (+6.665 ms (+10.30%))
- BridgeResponse encoded bytes/iteration: 1918520.000 -> 1617593.333 bytes (-300926.667 bytes (-15.69%))
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 7.000 calls (+7.000 calls); time 0.000 -> 22.105 ms (+22.105 ms); response bytes 0.000 -> 100059.333 bytes (+100059.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 1650.000 -> 506.000 calls (-1144.000 calls (-69.33%)); time 64.567 -> 49.172 ms (-15.395 ms (-23.84%)); response bytes 1918473.000 -> 1517487.000 bytes (-400986.000 bytes (-20.90%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 64.567 | 71.276 | +6.709 |
| Method time | `_log` | 0.133 | 0.089 | -0.044 |
| Method bytes | `_loadPolyfill` | 1918473.000 | 1617546.333 | -300926.667 |
| Frame bytes | `send:BridgeResponse` | 1918520.000 | 1617593.333 | -300926.667 |
| Frame bytes | `recv:BridgeCall` | 247553.000 | 103142.000 | -144411.000 |
| Frame bytes | `send:Execute` | 1240835.000 | 1242216.000 | +1381.000 |

