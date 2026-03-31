# pdf-lib Startup

Scenario: `pdf-lib-startup`
Generated: 2026-03-31T11:03:29.404Z
Description: Loads pdf-lib, creates a document, and embeds a standard font.

## Progress Copy Fields

- Warm wall mean: 299.063 ms
- Bridge calls/iteration: 514.000
- Warm fixed session overhead: 111.150 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 103.000 ms, residual 3.150 ms
- Dominant bridge time: `_loadPolyfill` 93.122 ms/iteration across 513.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 682081.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 15.439 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 506.000 calls/iteration, 77.682 ms/iteration, 582021.667 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 682128.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 662.893 ms | 547.944 ms | 114.949 ms | 514 | 186.111 ms |
| 2 | 368.117 ms | 255.952 ms | 112.165 ms | 514 | 64.554 ms |
| 3 | 230.008 ms | 119.873 ms | 110.135 ms | 514 | 29.140 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.000 ms | 2.000 ms | 547.944 ms | 102.000 ms | 2.949 ms |
| 2 | 5.000 ms | 1.000 ms | 255.952 ms | 103.000 ms | 3.165 ms |
| 3 | 4.000 ms | 0.000 ms | 119.873 ms | 103.000 ms | 3.135 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 513.000 | 93.122 ms | 0.182 ms | 682081.000 |
| `_log` | 1.000 | 0.147 ms | 0.147 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 15.439 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 506.000 | 77.682 ms | 582021.667 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Bold.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-BoldOblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier-Oblique.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Courier.compressed.json"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@pdf-lib+standard-fonts@1.0.0/node_modules/@pdf-lib/standard-fonts/lib/Encoding.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 514.000 | 682128.000 | 657970.000 |
| `send:Execute` | 1.000 | 546224.000 | 0.000 |
| `send:WarmSnapshot` | 0.333 | 348889.333 | 0.000 |
| `recv:BridgeCall` | 514.000 | 103142.000 | 71797.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T10:38:30.366Z

- Warm wall: 393.688 -> 299.063 ms (-94.625 ms (-24.04%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.483 -> 111.150 ms (+0.667 ms (+0.60%))
- Warm Create->InjectGlobals: 0.500 -> 4.500 ms (+4.000 ms (+800.00%))
- Warm InjectGlobals->Execute: 4.500 -> 0.500 ms (-4.000 ms (-88.89%))
- Warm ExecutionResult->Destroy: 102.000 -> 103.000 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 3.484 -> 3.150 ms (-0.334 ms (-9.59%))
- Bridge time/iteration: 74.966 -> 93.268 ms (+18.302 ms (+24.41%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.385 -> 15.439 ms (+5.054 ms (+48.67%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 64.430 -> 77.682 ms (+13.252 ms (+20.57%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 74.815 | 93.122 | +18.307 |
| Method time | `_log` | 0.151 | 0.147 | -0.004 |
| Frame bytes | `send:Execute` | 1243923.000 | 546224.000 | -697699.000 |

