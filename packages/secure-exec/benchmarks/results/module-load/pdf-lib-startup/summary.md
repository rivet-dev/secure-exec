# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T13:28:20.629Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 353.377 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 110.105 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 103.000 ms, residual 2.104 ms
- Dominant bridge time: `_loadPolyfill` 80.806 ms/iteration across 513.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 682081.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 13.470 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 506.000 calls/iteration, 67.336 ms/iteration, 582021.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 682128.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 351.083 ms | 229.579 ms | 121.504 ms | 514 | 93.801 ms |
| 2 | 253.658 ms | 141.319 ms | 112.339 ms | 514 | 41.256 ms |
| 3 | 453.095 ms | 345.225 ms | 107.870 ms | 514 | 107.685 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 1.000 ms | 229.579 ms | 104.000 ms | 4.504 ms |
| 2 | 6.000 ms | 0.000 ms | 141.319 ms | 103.000 ms | 3.339 ms |
| 3 | 4.000 ms | 0.000 ms | 345.225 ms | 103.000 ms | 0.870 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 513.000 | 80.806 ms | 0.158 ms | 682081.000 |
| `_log` | 1.000 | 0.108 ms | 0.108 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 13.470 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 506.000 | 67.336 ms | 582021.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 514.000 | 682128.000 | 657970.000 |
| `send:WarmSnapshot` | 0.333 | 411389.667 | 0.000 |
| `recv:BridgeCall` | 514.000 | 103142.000 | 71797.000 |
| `send:Execute` | 1.000 | 13321.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:20.629Z

- Warm wall: 353.377 -> 353.377 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.105 -> 110.105 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 103.000 -> 103.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.104 -> 2.104 ms (0.000 ms (0.00%))
- Bridge time/iteration: 80.914 -> 80.914 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 13.470 -> 13.470 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 67.336 -> 67.336 ms (0.000 ms (0.00%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

