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

Baseline scenario timestamp: 2026-03-31T09:37:50.040Z

- Warm wall: 342.928 -> 342.928 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 112.789 -> 112.789 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 5.289 -> 5.289 ms (0.000 ms (0.00%))
- Bridge time/iteration: 71.123 -> 71.123 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1618463.333 -> 1618463.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 24.324 -> 24.324 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 46.691 -> 46.691 ms (0.000 ms (0.00%)); response bytes 1518357.000 -> 1518357.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |

