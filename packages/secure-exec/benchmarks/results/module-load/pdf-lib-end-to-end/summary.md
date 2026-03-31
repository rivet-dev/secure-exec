# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T10:38:32.116Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.

## Progress Copy Fields

- Warm wall mean: 395.505 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 111.662 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.500 ms, residual 4.162 ms
- Dominant bridge time: `_loadPolyfill` 70.165 ms/iteration across 528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 682951.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 15.710 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 521.000 calls/iteration, 54.455 ms/iteration, 582891.667 bytes/iteration
- Dominant frame bytes: `send:Execute` 1244662.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 480.722 ms | 365.025 ms | 115.697 ms | 529 | 98.036 ms |
| 2 | 453.835 ms | 341.607 ms | 112.228 ms | 529 | 73.757 ms |
| 3 | 337.176 ms | 226.080 ms | 111.096 ms | 529 | 38.936 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 365.025 ms | 102.000 ms | 5.697 ms |
| 2 | 1.000 ms | 5.000 ms | 341.607 ms | 102.000 ms | 4.228 ms |
| 3 | 0.000 ms | 4.000 ms | 226.080 ms | 103.000 ms | 4.096 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 528.000 | 70.165 ms | 0.133 ms | 682951.000 |
| `_log` | 1.000 | 0.078 ms | 0.078 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 15.710 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 521.000 | 54.455 ms | 582891.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1244662.000 | 0.000 |
| `send:BridgeResponse` | 529.000 | 682998.000 | 658135.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:BridgeCall` | 529.000 | 104588.000 | 72328.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:26:38.266Z

- Warm wall: 315.611 -> 395.505 ms (+79.894 ms (+25.31%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.407 -> 111.662 ms (+0.255 ms (+0.23%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 4.907 -> 4.162 ms (-0.745 ms (-15.18%))
- Bridge time/iteration: 64.547 -> 70.243 ms (+5.696 ms (+8.82%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 22.100 -> 15.710 ms (-6.390 ms (-28.91%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 42.351 -> 54.455 ms (+12.104 ms (+28.58%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 64.451 | 70.165 | +5.714 |
| Method time | `_log` | 0.096 | 0.078 | -0.018 |
| Frame bytes | `send:Execute` | 1242955.000 | 1244662.000 | +1707.000 |
| Frame bytes | `send:WarmSnapshot` | 348320.333 | 348889.333 | +569.000 |

