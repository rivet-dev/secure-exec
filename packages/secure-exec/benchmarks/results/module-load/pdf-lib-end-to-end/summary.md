# pdf-lib End-to-End

Scenario: `pdf-lib-end-to-end`
Generated: 2026-03-31T22:12:20.777Z
Description: Creates a multi-page PDF with 50 form fields and serializes the document.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 254.933 ms
- Bridge calls/iteration: 529.000
- Warm fixed session overhead: 7.121 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 1.121 ms
- Dominant bridge time: `_bridgeDispatch` 50.310 ms/iteration across 521.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 553101.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 7.000 calls/iteration, 10.482 ms/iteration, 100059.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 653208.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 384.660 ms; runtime create 119.024 ms; first pass 265.636 ms; sandbox 0.000 ms; checks `pageCount`=5, `fieldCount`=50, `savedSize`=41186
- Sandbox true cold start, warm snapshot disabled: total 273.410 ms; runtime create 5.146 ms; first pass 268.264 ms; sandbox 0.000 ms; checks `pageCount`=5, `fieldCount`=50, `savedSize`=41186
- Sandbox new-session replay, warm snapshot enabled: cold 274.007 ms; warm 254.933 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 283.417 ms; warm 221.947 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 206.970 ms; first checks `pageCount`=5, `fieldCount`=50; replay checks `pageCount`=5, `fieldCount`=50
- Host same-session control: total 80.021 ms; first 71.635 ms; replay 8.382 ms; first checks `pageCount`=5, `fieldCount`=50; replay checks `pageCount`=5, `fieldCount`=50

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 274.007 ms | 258.628 ms | 15.379 ms | 529 | 79.116 ms |
| 2 | 288.703 ms | 280.683 ms | 8.020 ms | 529 | 61.817 ms |
| 3 | 221.162 ms | 214.940 ms | 6.222 ms | 529 | 41.661 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 258.628 ms | 1.000 ms | 2.379 ms |
| 2 | 6.000 ms | 0.000 ms | 280.683 ms | 0.000 ms | 2.020 ms |
| 3 | 5.000 ms | 0.000 ms | 214.940 ms | 1.000 ms | 0.222 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 521.000 | 50.310 ms | 0.097 ms | 553101.667 |
| `_loadPolyfill` | 7.000 | 10.482 ms | 1.497 ms | 100059.333 |
| `_log` | 1.000 | 0.073 ms | 0.073 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 7.000 | 10.482 ms | 100059.333 | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `pdf-lib`, `stream/web` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 529.000 | 653208.000 | 628345.000 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `recv:BridgeCall` | 529.000 | 102565.000 | 69263.000 |
| `send:Execute` | 1.000 | 15042.000 | 0.000 |
| `send:StreamEvent` | 8.000 | 464.000 | 104.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:29:34.584Z

- Warm wall: 297.079 -> 254.933 ms (-42.146 ms (-14.19%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.191 -> 7.121 ms (-0.070 ms (-0.97%))
- Warm Create->InjectGlobals: 4.500 -> 5.500 ms (+1.000 ms (+22.22%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 2.691 -> 1.121 ms (-1.570 ms (-58.34%))
- Bridge time/iteration: 70.245 -> 60.865 ms (-9.380 ms (-13.35%))
- BridgeResponse encoded bytes/iteration: 653208.000 -> 653208.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 9.867 -> 10.482 ms (+0.615 ms (+6.23%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 60.207 | 50.310 | -9.897 |
| Method time | `_loadPolyfill` | 9.867 | 10.482 | +0.615 |
| Method time | `_log` | 0.171 | 0.073 | -0.098 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

