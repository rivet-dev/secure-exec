# Hono Startup

Scenario: `hono-startup`
Generated: 2026-03-31T22:12:13.246Z
Description: Loads Hono and constructs a minimal app.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 36.227 ms
- Bridge calls/iteration: 59.000
- Warm fixed session overhead: 5.636 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 4.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 0.637 ms
- Dominant bridge time: `_loadPolyfill` 13.067 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99859.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 13.067 ms/iteration, 99859.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 140.827 ms; runtime create 104.562 ms; first pass 36.265 ms; sandbox 0.000 ms; checks `honoType`=function, `fetchType`=function
- Sandbox true cold start, warm snapshot disabled: total 131.357 ms; runtime create 2.747 ms; first pass 128.610 ms; sandbox 0.000 ms; checks `honoType`=function, `fetchType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 124.129 ms; warm 36.227 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 124.235 ms; warm 32.871 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 36.157 ms; first checks `honoType`=function, `fetchType`=function; replay checks `honoType`=function, `fetchType`=function
- Host same-session control: total 7.380 ms; first 7.345 ms; replay 0.032 ms; first checks `honoType`=function, `fetchType`=function; replay checks `honoType`=function, `fetchType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 124.129 ms | 107.535 ms | 16.594 ms | 59 | 52.842 ms |
| 2 | 36.558 ms | 31.048 ms | 5.510 ms | 59 | 4.163 ms |
| 3 | 35.897 ms | 30.134 ms | 5.763 ms | 59 | 3.795 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 1.000 ms | 107.535 ms | 1.000 ms | 2.594 ms |
| 2 | 4.000 ms | 0.000 ms | 31.048 ms | 1.000 ms | 0.510 ms |
| 3 | 5.000 ms | 0.000 ms | 30.134 ms | 0.000 ms | 0.763 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 13.067 ms | 4.356 ms | 99859.333 |
| `_bridgeDispatch` | 55.000 | 7.084 ms | 0.129 ms | 40508.667 |
| `_log` | 1.000 | 0.116 ms | 0.116 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 3.000 | 13.067 ms | 99859.333 | `hono`, `stream/web`, `url` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

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

Baseline scenario timestamp: 2026-03-31T20:56:14.296Z

- Warm wall: 33.412 -> 36.227 ms (+2.815 ms (+8.43%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.440 -> 5.636 ms (+0.196 ms (+3.60%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.440 -> 0.637 ms (+0.197 ms (+44.77%))
- Bridge time/iteration: 14.571 -> 20.267 ms (+5.696 ms (+39.09%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.399 -> 13.067 ms (+2.668 ms (+25.66%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 4.110 | 7.084 | +2.974 |
| Method time | `_loadPolyfill` | 10.399 | 13.067 | +2.668 |
| Method time | `_log` | 0.061 | 0.116 | +0.055 |

