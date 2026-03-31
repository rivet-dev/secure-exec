# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T11:03:31.092Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.

## Progress Copy Fields

- Warm wall mean: 344.577 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 111.449 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.000 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 102.000 ms, residual 4.949 ms
- Dominant bridge time: `_loadPolyfill` 66.811 ms/iteration across 528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 682951.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 11.082 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 521.000 calls/iteration, 55.729 ms/iteration, 582891.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 682998.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 557.363 ms | 440.125 ms | 117.238 ms | 529 | 114.193 ms |
| 2 | 306.155 ms | 194.131 ms | 112.024 ms | 529 | 31.371 ms |
| 3 | 382.999 ms | 272.125 ms | 110.874 ms | 529 | 55.288 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.000 ms | 3.000 ms | 440.125 ms | 104.000 ms | 2.238 ms |
| 2 | 4.000 ms | 1.000 ms | 194.131 ms | 102.000 ms | 5.024 ms |
| 3 | 4.000 ms | 0.000 ms | 272.125 ms | 102.000 ms | 4.874 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 528.000 | 66.811 ms | 0.127 ms | 682951.000 |
| `_log` | 1.000 | 0.140 ms | 0.140 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 11.082 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 521.000 | 55.729 ms | 582891.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 529.000 | 682998.000 | 658135.000 |
| `send:Execute` | 1.000 | 546963.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:BridgeCall` | 529.000 | 104588.000 | 72328.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:38:32.116Z

- Warm wall: 395.505 -> 344.577 ms (-50.928 ms (-12.88%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.662 -> 111.449 ms (-0.213 ms (-0.19%))
- Warm Create->InjectGlobals: 0.500 -> 4.000 ms (+3.500 ms (+700.00%))
- Warm InjectGlobals->Execute: 4.500 -> 0.500 ms (-4.000 ms (-88.89%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 4.162 -> 4.949 ms (+0.787 ms (+18.91%))
- Bridge time/iteration: 70.243 -> 66.951 ms (-3.292 ms (-4.69%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 15.710 -> 11.082 ms (-4.628 ms (-29.46%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 54.455 -> 55.729 ms (+1.274 ms (+2.34%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 70.165 | 66.811 | -3.354 |
| Method time | `_log` | 0.078 | 0.140 | +0.062 |
| Frame bytes | `send:Execute` | 1244662.000 | 546963.000 | -697699.000 |

