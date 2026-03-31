# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T10:38:30.366Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 393.688 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 110.483 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.000 ms, residual 3.484 ms
- Dominant bridge time: `_loadPolyfill` 74.815 ms/iteration across 513.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 682081.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 10.385 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 506.000 calls/iteration, 64.430 ms/iteration, 582021.667 bytes/iteration
- Dominant frame bytes: `send:Execute` 1243923.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 374.499 ms | 257.476 ms | 117.023 ms | 514 | 72.241 ms |
| 2 | 435.598 ms | 324.329 ms | 111.269 ms | 514 | 93.012 ms |
| 3 | 351.778 ms | 242.080 ms | 109.698 ms | 514 | 59.644 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 257.476 ms | 103.000 ms | 6.023 ms |
| 2 | 1.000 ms | 5.000 ms | 324.329 ms | 102.000 ms | 3.269 ms |
| 3 | 0.000 ms | 4.000 ms | 242.080 ms | 102.000 ms | 3.698 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 513.000 | 74.815 ms | 0.146 ms | 682081.000 |
| `_log` | 1.000 | 0.151 ms | 0.151 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 10.385 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 506.000 | 64.430 ms | 582021.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 1.000 | 1243923.000 | 0.000 |
| `send:BridgeResponse` | 514.000 | 682128.000 | 657970.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:BridgeCall` | 514.000 | 103142.000 | 71797.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:26:36.640Z

- Warm wall: 326.296 -> 393.688 ms (+67.392 ms (+20.65%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.662 -> 110.483 ms (-0.179 ms (-0.16%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.662 -> 3.484 ms (-0.178 ms (-4.86%))
- Bridge time/iteration: 91.850 -> 74.966 ms (-16.884 ms (-18.38%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 16.919 -> 10.385 ms (-6.534 ms (-38.62%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 74.784 -> 64.430 ms (-10.354 ms (-13.85%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 91.702 | 74.815 | -16.887 |
| Method time | `_log` | 0.148 | 0.151 | +0.003 |
| Frame bytes | `send:Execute` | 1242216.000 | 1243923.000 | +1707.000 |
| Frame bytes | `send:WarmSnapshot` | 348320.333 | 348889.333 | +569.000 |

