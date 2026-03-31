# Microbench Import stream

Scenario: `micro-import-stream`
Kind: `import`
Generated: 2026-03-31T23:09:16.966Z
Description: Requires the hot Pi builtin `stream` once to isolate single-import bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 28.566 ms
- Bridge calls/iteration: 5.000
- Warm fixed session overhead: 5.982 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 0.000 ms, residual 0.482 ms
- Dominant bridge time: `_loadPolyfill` 17.868 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 182414.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 17.868 ms/iteration, 182414.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream` 1.000 calls/iteration, 7.128 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream` 1.000 calls/iteration, 7.128 ms/iteration, 82604.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 188.623 ms; runtime create 98.086 ms; first pass 90.537 ms; sandbox 0.000 ms; checks `importTarget`=stream, `moduleType`=function, `readableType`=function
- Sandbox true cold start, warm snapshot disabled: total 187.089 ms; runtime create 5.534 ms; first pass 181.555 ms; sandbox 0.000 ms; checks `importTarget`=stream, `moduleType`=function, `readableType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 92.787 ms; warm 28.566 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 184.581 ms; warm 28.834 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 90.675 ms; first checks `importTarget`=stream, `moduleType`=function, `readableType`=function; replay checks `importTarget`=stream, `moduleType`=function, `readableType`=function
- Host same-session control: total 0.819 ms; first 0.795 ms; replay 0.015 ms; first checks `importTarget`=stream, `moduleType`=function, `readableType`=function; replay checks `importTarget`=stream, `moduleType`=function, `readableType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 92.787 ms | 78.239 ms | 14.548 ms | 5 | 52.531 ms |
| 2 | 29.354 ms | 22.467 ms | 6.887 ms | 5 | 0.860 ms |
| 3 | 27.778 ms | 22.701 ms | 5.077 ms | 5 | 0.799 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 78.239 ms | 1.000 ms | 1.548 ms |
| 2 | 6.000 ms | 0.000 ms | 22.467 ms | 0.000 ms | 0.887 ms |
| 3 | 4.000 ms | 1.000 ms | 22.701 ms | 0.000 ms | 0.077 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 17.868 ms | 5.956 ms | 182414.000 |
| `_bridgeDispatch` | 1.000 | 0.098 ms | 0.098 ms | 70.000 |
| `_log` | 1.000 | 0.097 ms | 0.097 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 17.868 ms | 182414.000 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream` | 1.000 | 7.128 ms | 82604.667 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.563 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.177 ms | 41826.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 7.128 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.563 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.177 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 7.128 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.563 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.177 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 5.000 | 182531.000 | 182296.000 |
| `send:Execute` | 1.000 | 14162.000 | 0.000 |
| `recv:BridgeCall` | 5.000 | 487.000 | 189.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:06:36.477Z

- Warm wall: 28.872 -> 28.566 ms (-0.306 ms (-1.06%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.450 -> 5.982 ms (+0.532 ms (+9.76%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 1.000 -> 0.000 ms (-1.000 ms (-100.00%))
- Warm residual overhead: -0.549 -> 0.482 ms (+1.031 ms (-187.80%))
- Bridge time/iteration: 17.752 -> 18.063 ms (+0.311 ms (+1.75%))
- BridgeResponse encoded bytes/iteration: 182531.000 -> 182531.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.539 -> 17.868 ms (+0.329 ms (+1.88%)); response bytes 182414.000 -> 182414.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.753 -> 7.128 ms (+0.375 ms (+5.55%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.554 -> 5.563 ms (+0.009 ms (+0.16%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.233 -> 5.177 ms (-0.056 ms (-1.07%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.753 -> 7.128 ms (+0.375 ms (+5.55%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.233 -> 5.177 ms (-0.056 ms (-1.07%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.554 -> 5.563 ms (+0.009 ms (+0.16%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.753 -> 7.128 ms (+0.375 ms (+5.55%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.554 -> 5.563 ms (+0.009 ms (+0.16%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.233 -> 5.177 ms (-0.056 ms (-1.07%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 17.539 | 17.868 | +0.329 |
| Method time | `_log` | 0.106 | 0.097 | -0.009 |
| Method time | `_bridgeDispatch` | 0.106 | 0.098 | -0.008 |

