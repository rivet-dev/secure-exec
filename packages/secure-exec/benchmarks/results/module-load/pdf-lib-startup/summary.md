# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T11:51:42.194Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 238.739 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 109.900 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 101.500 ms, residual 3.400 ms
- Dominant bridge time: `_loadPolyfill` 57.815 ms/iteration across 513.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 682081.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 18.298 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 506.000 calls/iteration, 39.517 ms/iteration, 582021.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 682128.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 469.403 ms | 345.630 ms | 123.773 ms | 514 | 116.308 ms |
| 2 | 240.992 ms | 129.928 ms | 111.064 ms | 514 | 30.212 ms |
| 3 | 236.486 ms | 127.750 ms | 108.736 ms | 514 | 27.175 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 2.000 ms | 345.630 ms | 103.000 ms | 5.773 ms |
| 2 | 6.000 ms | 0.000 ms | 129.928 ms | 102.000 ms | 3.064 ms |
| 3 | 4.000 ms | 0.000 ms | 127.750 ms | 101.000 ms | 3.736 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 513.000 | 57.815 ms | 0.113 ms | 682081.000 |
| `_log` | 1.000 | 0.083 ms | 0.083 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 18.298 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 506.000 | 39.517 ms | 582021.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 514.000 | 682128.000 | 657970.000 |
| `send:Execute` | 1.000 | 422617.667 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `recv:BridgeCall` | 514.000 | 103142.000 | 71797.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:03:29.404Z

- Warm wall: 299.063 -> 238.739 ms (-60.324 ms (-20.17%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.150 -> 109.900 ms (-1.250 ms (-1.13%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 103.000 -> 101.500 ms (-1.500 ms (-1.46%))
- Warm residual overhead: 3.150 -> 3.400 ms (+0.250 ms (+7.94%))
- Bridge time/iteration: 93.268 -> 57.898 ms (-35.370 ms (-37.92%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 15.439 -> 18.298 ms (+2.859 ms (+18.52%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 77.682 -> 39.517 ms (-38.165 ms (-49.13%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 93.122 | 57.815 | -35.307 |
| Method time | `_log` | 0.147 | 0.083 | -0.064 |
| Frame bytes | `send:Execute` | 546224.000 | 422617.667 | -123606.333 |
| Frame bytes | `send:WarmSnapshot` | 348889.333 | 409300.000 | +60410.667 |

