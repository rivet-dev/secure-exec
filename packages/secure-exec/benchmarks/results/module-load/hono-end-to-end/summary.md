# Hono End-to-End

Scenario: `hono-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:09:41.090Z
Description: Loads Hono, builds an app, serves a request, and reads the response.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 38.255 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.488 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.487 ms
- Dominant bridge time: `_loadPolyfill` 10.259 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 10.259 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.394 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.394 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 183.601 ms; runtime create 100.655 ms; first pass 82.946 ms; sandbox 0.000 ms; checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Sandbox true cold start, warm snapshot disabled: total 176.899 ms; runtime create 4.622 ms; first pass 172.277 ms; sandbox 0.000 ms; checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Sandbox new-session replay, warm snapshot enabled: cold 82.665 ms; warm 38.255 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 170.661 ms; warm 34.049 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 92.726 ms; first checks `status`=200, `body`={"ok":true,"framework":"hono"}; replay checks `status`=200, `body`={"ok":true,"framework":"hono"}
- Host same-session control: total 24.245 ms; first 23.841 ms; replay 0.402 ms; first checks `status`=200, `body`={"ok":true,"framework":"hono"}; replay checks `status`=200, `body`={"ok":true,"framework":"hono"}

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 82.665 ms | 67.381 ms | 15.284 ms | 59 | 35.506 ms |
| 2 | 36.120 ms | 30.577 ms | 5.543 ms | 59 | 4.444 ms |
| 3 | 40.390 ms | 34.958 ms | 5.432 ms | 59 | 4.728 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 1.000 ms | 67.381 ms | 0.000 ms | 2.284 ms |
| 2 | 5.000 ms | 0.000 ms | 30.577 ms | 1.000 ms | -0.457 ms |
| 3 | 4.000 ms | 0.000 ms | 34.958 ms | 0.000 ms | 1.432 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 10.259 ms | 3.420 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 4.592 ms | 0.083 ms | 40508.667 |
| `_log` | 1.000 | 0.042 ms | 0.042 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 10.259 ms | 99859.333 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.394 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.813 ms | 41826.000 |
| real polyfill-body loads | by calls | `hono` | 1.000 | 0.052 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.394 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.813 ms | 41826.000 |
| real polyfill-body loads | by time | `hono` | 1.000 | 0.052 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.394 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.813 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `hono` | 1.000 | 0.052 ms | 50.000 |
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

Baseline scenario timestamp: 2026-03-31T22:51:01.313Z

- Warm wall: 36.873 -> 38.255 ms (+1.382 ms (+3.75%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.472 -> 5.488 ms (+0.016 ms (+0.29%))
- Warm Create->InjectGlobals: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.472 -> 0.487 ms (-0.985 ms (-66.92%))
- Bridge time/iteration: 15.624 -> 14.893 ms (-0.731 ms (-4.68%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 11.075 -> 10.259 ms (-0.816 ms (-7.37%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.758 -> 5.394 ms (-0.364 ms (-6.32%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.279 -> 4.813 ms (-0.466 ms (-8.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.037 -> 0.052 ms (+0.015 ms (+40.54%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.279 -> 4.813 ms (-0.466 ms (-8.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.758 -> 5.394 ms (-0.364 ms (-6.32%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.037 -> 0.052 ms (+0.015 ms (+40.54%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.758 -> 5.394 ms (-0.364 ms (-6.32%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.279 -> 4.813 ms (-0.466 ms (-8.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.037 -> 0.052 ms (+0.015 ms (+40.54%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 11.075 | 10.259 | -0.816 |
| Method time | `_bridgeDispatch` | 4.499 | 4.592 | +0.093 |
| Method time | `_log` | 0.050 | 0.042 | -0.008 |

