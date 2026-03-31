# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T11:51:43.934Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.

## Progress Copy Fields

- Warm wall mean: 349.741 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 111.777 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 102.000 ms, residual 4.777 ms
- Dominant bridge time: `_loadPolyfill` 68.094 ms/iteration across 528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 682951.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 13.766 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 521.000 calls/iteration, 54.328 ms/iteration, 582891.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 682998.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 548.179 ms | 428.401 ms | 119.778 ms | 529 | 112.435 ms |
| 2 | 369.010 ms | 255.935 ms | 113.075 ms | 529 | 52.984 ms |
| 3 | 330.472 ms | 219.993 ms | 110.479 ms | 529 | 39.216 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 2.000 ms | 428.401 ms | 102.000 ms | 2.778 ms |
| 2 | 6.000 ms | 0.000 ms | 255.935 ms | 102.000 ms | 5.075 ms |
| 3 | 4.000 ms | 0.000 ms | 219.993 ms | 102.000 ms | 4.479 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 528.000 | 68.094 ms | 0.129 ms | 682951.000 |
| `_log` | 1.000 | 0.117 ms | 0.117 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 13.766 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 521.000 | 54.328 ms | 582891.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 529.000 | 682998.000 | 658135.000 |
| `send:Execute` | 1.000 | 423356.667 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 409300.000 | 0.000 |
| `recv:BridgeCall` | 529.000 | 104588.000 | 72328.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T11:03:31.092Z

- Warm wall: 344.577 -> 349.741 ms (+5.164 ms (+1.50%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.449 -> 111.777 ms (+0.328 ms (+0.29%))
- Warm Create->InjectGlobals: 4.000 -> 5.000 ms (+1.000 ms (+25.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 4.949 -> 4.777 ms (-0.172 ms (-3.48%))
- Bridge time/iteration: 66.951 -> 68.212 ms (+1.261 ms (+1.88%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 11.082 -> 13.766 ms (+2.684 ms (+24.22%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 55.729 -> 54.328 ms (-1.401 ms (-2.51%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 66.811 | 68.094 | +1.283 |
| Method time | `_log` | 0.140 | 0.117 | -0.023 |
| Frame bytes | `send:Execute` | 546963.000 | 423356.667 | -123606.333 |
| Frame bytes | `send:WarmSnapshot` | 348889.333 | 409300.000 | +60410.667 |

