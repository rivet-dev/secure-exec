# Hono Startup

Scenario: `hono-startup`
Kind: `startup`
Generated: 2026-03-31T23:09:38.094Z
Description: Loads Hono and constructs a minimal app.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 36.428 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.836 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.836 ms
- Dominant bridge time: `_loadPolyfill` 10.027 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 10.027 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.198 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.198 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 175.672 ms; runtime create 99.384 ms; first pass 76.288 ms; sandbox 0.000 ms; checks `honoType`=function, `fetchType`=function
- Sandbox true cold start, warm snapshot disabled: total 180.369 ms; runtime create 4.552 ms; first pass 175.817 ms; sandbox 0.000 ms; checks `honoType`=function, `fetchType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 80.199 ms; warm 36.428 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 177.239 ms; warm 34.562 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 75.994 ms; first checks `honoType`=function, `fetchType`=function; replay checks `honoType`=function, `fetchType`=function
- Host same-session control: total 7.440 ms; first 7.397 ms; replay 0.041 ms; first checks `honoType`=function, `fetchType`=function; replay checks `honoType`=function, `fetchType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 80.199 ms | 65.647 ms | 14.552 ms | 59 | 35.186 ms |
| 2 | 36.180 ms | 29.965 ms | 6.215 ms | 59 | 3.993 ms |
| 3 | 36.676 ms | 31.219 ms | 5.457 ms | 59 | 3.921 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 1.000 ms | 65.647 ms | 1.000 ms | 0.552 ms |
| 2 | 5.000 ms | 0.000 ms | 29.965 ms | 0.000 ms | 1.215 ms |
| 3 | 5.000 ms | 0.000 ms | 31.219 ms | 0.000 ms | 0.457 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 10.027 ms | 3.342 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 4.284 ms | 0.078 ms | 40508.667 |
| `_log` | 1.000 | 0.055 ms | 0.055 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 10.027 ms | 99859.333 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.198 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.767 ms | 41826.000 |
| real polyfill-body loads | by calls | `hono` | 1.000 | 0.062 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.198 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.767 ms | 41826.000 |
| real polyfill-body loads | by time | `hono` | 1.000 | 0.062 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.198 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.767 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `hono` | 1.000 | 0.062 ms | 50.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 59.000 | 140415.000 | 137642.000 |
| `send:Execute` | 1.000 | 14181.000 | 0.000 |
| `recv:BridgeCall` | 59.000 | 10738.000 | 7038.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T22:50:58.038Z

- Warm wall: 50.069 -> 36.428 ms (-13.641 ms (-27.24%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.976 -> 5.836 ms (-0.140 ms (-2.34%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.976 -> 0.836 ms (-0.140 ms (-14.34%))
- Bridge time/iteration: 18.480 -> 14.367 ms (-4.113 ms (-22.26%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 11.579 -> 10.027 ms (-1.552 ms (-13.40%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.726 -> 5.198 ms (-0.528 ms (-9.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.724 -> 4.767 ms (-0.957 ms (-16.72%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.128 -> 0.062 ms (-0.066 ms (-51.56%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.724 -> 4.767 ms (-0.957 ms (-16.72%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.726 -> 5.198 ms (-0.528 ms (-9.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.128 -> 0.062 ms (-0.066 ms (-51.56%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.726 -> 5.198 ms (-0.528 ms (-9.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.724 -> 4.767 ms (-0.957 ms (-16.72%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.128 -> 0.062 ms (-0.066 ms (-51.56%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 6.805 | 4.284 | -2.521 |
| Method time | `_loadPolyfill` | 11.579 | 10.027 | -1.552 |
| Method time | `_log` | 0.096 | 0.055 | -0.041 |

