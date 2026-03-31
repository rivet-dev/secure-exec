# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T09:37:50.040Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.

## Progress Copy Fields

- Warm wall mean: 342.928 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 112.789 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.000 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.500 ms, residual 5.289 ms
- Dominant bridge time: `_loadPolyfill` 71.015 ms/iteration across 528.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 1618416.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 24.324 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 521.000 calls/iteration, 46.691 ms/iteration, 1518357.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 1618463.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 563.788 ms | 444.961 ms | 118.827 ms | 529 | 133.766 ms |
| 2 | 294.634 ms | 179.501 ms | 115.133 ms | 529 | 25.838 ms |
| 3 | 391.221 ms | 280.776 ms | 110.445 ms | 529 | 53.766 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 6.000 ms | 444.961 ms | 105.000 ms | 5.827 ms |
| 2 | 0.000 ms | 6.000 ms | 179.501 ms | 103.000 ms | 6.133 ms |
| 3 | 0.000 ms | 4.000 ms | 280.776 ms | 102.000 ms | 4.445 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 528.000 | 71.015 ms | 0.134 ms | 1618416.333 |
| `_log` | 1.000 | 0.108 ms | 0.108 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 24.324 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 521.000 | 46.691 ms | 1518357.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 529.000 | 1618463.333 | 1593600.333 |
| `send:Execute` | 1.000 | 1242955.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 529.000 | 104588.000 | 72328.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:28.174Z

- Warm wall: 387.063 -> 342.928 ms (-44.135 ms (-11.40%))
- Bridge calls/iteration: 1666.000 -> 529.000 calls (-1137.000 calls (-68.25%))
- Warm fixed overhead: 109.839 -> 112.789 ms (+2.950 ms (+2.69%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.338 -> 5.289 ms (+2.951 ms (+126.22%))
- Bridge time/iteration: 71.049 -> 71.123 ms (+0.074 ms (+0.10%))
- BridgeResponse encoded bytes/iteration: 1919390.000 -> 1618463.333 bytes (-300926.667 bytes (-15.68%))
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 7.000 calls (+7.000 calls); time 0.000 -> 24.324 ms (+24.324 ms); response bytes 0.000 -> 100059.333 bytes (+100059.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 1665.000 -> 521.000 calls (-1144.000 calls (-68.71%)); time 70.926 -> 46.691 ms (-24.235 ms (-34.17%)); response bytes 1919343.000 -> 1518357.000 bytes (-400986.000 bytes (-20.89%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 70.926 | 71.015 | +0.089 |
| Method time | `_log` | 0.123 | 0.108 | -0.015 |
| Method bytes | `_loadPolyfill` | 1919343.000 | 1618416.333 | -300926.667 |
| Frame bytes | `send:BridgeResponse` | 1919390.000 | 1618463.333 | -300926.667 |
| Frame bytes | `recv:BridgeCall` | 248999.000 | 104588.000 | -144411.000 |
| Frame bytes | `send:Execute` | 1241574.000 | 1242955.000 | +1381.000 |

