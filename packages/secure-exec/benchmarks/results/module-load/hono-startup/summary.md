# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T22:50:58.038Z
Description: Loads Hono and constructs a minimal app.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 50.069 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.976 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.976 ms
- Dominant bridge time: `_loadPolyfill` 11.579 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 11.579 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.726 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.726 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 210.930 ms; runtime create 97.882 ms; first pass 113.048 ms; sandbox 0.000 ms; checks `honoType`=function, `fetchType`=function
- Sandbox true cold start, warm snapshot disabled: total 240.474 ms; runtime create 4.509 ms; first pass 235.965 ms; sandbox 0.000 ms; checks `honoType`=function, `fetchType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 87.272 ms; warm 50.069 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 172.048 ms; warm 41.746 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 136.069 ms; first checks `honoType`=function, `fetchType`=function; replay checks `honoType`=function, `fetchType`=function
- Host same-session control: total 10.379 ms; first 10.336 ms; replay 0.035 ms; first checks `honoType`=function, `fetchType`=function; replay checks `honoType`=function, `fetchType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 87.272 ms | 71.780 ms | 15.492 ms | 59 | 40.438 ms |
| 2 | 43.565 ms | 37.752 ms | 5.813 ms | 59 | 5.890 ms |
| 3 | 56.574 ms | 50.435 ms | 6.139 ms | 59 | 9.111 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 71.780 ms | 1.000 ms | 2.492 ms |
| 2 | 5.000 ms | 0.000 ms | 37.752 ms | 0.000 ms | 0.813 ms |
| 3 | 4.000 ms | 0.000 ms | 50.435 ms | 1.000 ms | 1.139 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 11.579 ms | 3.860 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 6.805 ms | 0.124 ms | 40508.667 |
| `_log` | 1.000 | 0.096 ms | 0.096 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 11.579 ms | 99859.333 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.726 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.724 ms | 41826.000 |
| real polyfill-body loads | by calls | `hono` | 1.000 | 0.128 ms | 50.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.726 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.724 ms | 41826.000 |
| real polyfill-body loads | by time | `hono` | 1.000 | 0.128 ms | 50.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.726 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.724 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `hono` | 1.000 | 0.128 ms | 50.000 |
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

Baseline scenario timestamp: 2026-03-31T22:34:37.938Z

- Warm wall: 38.373 -> 50.069 ms (+11.696 ms (+30.48%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.492 -> 5.976 ms (+0.484 ms (+8.81%))
- Warm Create->InjectGlobals: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.492 -> 0.976 ms (-0.516 ms (-34.58%))
- Bridge time/iteration: 14.442 -> 18.480 ms (+4.038 ms (+27.96%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 9.709 -> 11.579 ms (+1.870 ms (+19.26%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.363 -> 5.726 ms (+0.363 ms (+6.77%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.287 -> 5.724 ms (+1.437 ms (+33.52%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.058 -> 0.128 ms (+0.070 ms (+120.69%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.287 -> 5.724 ms (+1.437 ms (+33.52%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.363 -> 5.726 ms (+0.363 ms (+6.77%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.058 -> 0.128 ms (+0.070 ms (+120.69%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.363 -> 5.726 ms (+0.363 ms (+6.77%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.287 -> 5.724 ms (+1.437 ms (+33.52%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.058 -> 0.128 ms (+0.070 ms (+120.69%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 4.645 | 6.805 | +2.160 |
| Method time | `_loadPolyfill` | 9.709 | 11.579 | +1.870 |
| Method time | `_log` | 0.088 | 0.096 | +0.008 |

