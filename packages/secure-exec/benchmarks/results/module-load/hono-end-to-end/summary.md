# Hono End-to-End

Scenario: `hono-end-to-end`
Generated: 2026-03-31T22:51:01.313Z
Description: Loads Hono, builds an app, serves a request, and reads the response.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 36.873 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.472 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 4.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.472 ms
- Dominant bridge time: `_loadPolyfill` 11.075 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 11.075 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.758 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.758 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 211.348 ms; runtime create 102.211 ms; first pass 109.137 ms; sandbox 0.000 ms; checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Sandbox true cold start, warm snapshot disabled: total 178.313 ms; runtime create 5.046 ms; first pass 173.267 ms; sandbox 0.000 ms; checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Sandbox new-session replay, warm snapshot enabled: cold 83.373 ms; warm 36.873 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 172.998 ms; warm 46.279 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 162.678 ms; first checks `status`=200, `body`={"ok":true,"framework":"hono"}; replay checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Host same-session control: total 25.390 ms; first 25.027 ms; replay 0.361 ms; first checks `status`=200, `body`={"ok":true,"framework":"hono"}; replay checks `status`=200, `body`={"ok":true,"framework":"hono"}

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 83.373 ms | 68.535 ms | 14.838 ms | 59 | 38.158 ms |
| 2 | 34.080 ms | 28.751 ms | 5.329 ms | 59 | 3.821 ms |
| 3 | 39.665 ms | 34.050 ms | 5.615 ms | 59 | 4.892 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 68.535 ms | 0.000 ms | 1.838 ms |
| 2 | 4.000 ms | 0.000 ms | 28.751 ms | 0.000 ms | 1.329 ms |
| 3 | 4.000 ms | 0.000 ms | 34.050 ms | 0.000 ms | 1.615 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 11.075 ms | 3.692 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 4.499 ms | 0.082 ms | 40508.667 |
| `_log` | 1.000 | 0.050 ms | 0.050 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 11.075 ms | 99859.333 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.758 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.279 ms | 41826.000 |
| real polyfill-body loads | by calls | `hono` | 1.000 | 0.037 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.758 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.279 ms | 41826.000 |
| real polyfill-body loads | by time | `hono` | 1.000 | 0.037 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.758 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.279 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `hono` | 1.000 | 0.037 ms | 50.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 140415.000 | 137642.000 |
| `send:Execute` | 1.000 | 14298.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10752.000 | 7052.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T22:34:39.328Z

- Warm wall: 39.684 -> 36.873 ms (-2.811 ms (-7.08%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.224 -> 5.472 ms (-0.752 ms (-12.08%))
- Warm Create->InjectGlobals: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.224 -> 1.472 ms (+0.248 ms (+20.26%))
- Bridge time/iteration: 15.364 -> 15.624 ms (+0.260 ms (+1.69%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.295 -> 11.075 ms (+0.780 ms (+7.58%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.344 -> 5.758 ms (+0.414 ms (+7.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.887 -> 5.279 ms (+0.392 ms (+8.02%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.063 -> 0.037 ms (-0.026 ms (-41.27%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.344 -> 5.758 ms (+0.414 ms (+7.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.887 -> 5.279 ms (+0.392 ms (+8.02%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.063 -> 0.037 ms (-0.026 ms (-41.27%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.344 -> 5.758 ms (+0.414 ms (+7.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.887 -> 5.279 ms (+0.392 ms (+8.02%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.063 -> 0.037 ms (-0.026 ms (-41.27%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.295 | 11.075 | +0.780 |
| Method time | `_bridgeDispatch` | 4.994 | 4.499 | -0.495 |
| Method time | `_log` | 0.076 | 0.050 | -0.026 |

