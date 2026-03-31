# Microbench Import assert

Scenario: `micro-import-assert`
Kind: `import`
Generated: 2026-03-31T23:09:29.298Z
Description: Requires the hot Pi builtin `assert` once to isolate assertion/bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 28.986 ms
- Bridge calls/iteration: 5.000
- Warm fixed session overhead: 6.188 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.688 ms
- Dominant bridge time: `_loadPolyfill` 17.547 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 156675.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 17.547 ms/iteration, 156675.000 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `assert` 1.000 calls/iteration, 7.492 ms/iteration, 56865.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.245 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 185.980 ms; runtime create 99.926 ms; first pass 86.054 ms; sandbox 0.000 ms; checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function
- Sandbox true cold start, warm snapshot disabled: total 186.341 ms; runtime create 4.765 ms; first pass 181.576 ms; sandbox 0.000 ms; checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 90.746 ms; warm 28.986 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 185.363 ms; warm 26.895 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 88.131 ms; first checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function; replay checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function
- Host same-session control: total 1.952 ms; first 1.930 ms; replay 0.017 ms; first checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function; replay checks `importTarget`=assert, `moduleType`=function, `strictEqualType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 90.746 ms | 75.739 ms | 15.007 ms | 5 | 51.717 ms |
| 2 | 30.293 ms | 24.258 ms | 6.035 ms | 5 | 0.783 ms |
| 3 | 27.678 ms | 21.337 ms | 6.341 ms | 5 | 0.726 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 75.739 ms | 0.000 ms | 2.007 ms |
| 2 | 5.000 ms | 0.000 ms | 24.258 ms | 0.000 ms | 1.035 ms |
| 3 | 6.000 ms | 0.000 ms | 21.337 ms | 0.000 ms | 0.341 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 17.547 ms | 5.849 ms | 156675.000 |
| `_log` | 1.000 | 0.100 ms | 0.100 ms | 47.000 |
| `_bridgeDispatch` | 1.000 | 0.095 ms | 0.095 ms | 70.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 17.547 ms | 156675.000 | 3 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `assert` | 1.000 | 7.492 ms | 56865.667 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.245 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.810 ms | 41826.000 |
| real polyfill-body loads | by time | `assert` | 1.000 | 7.492 ms | 56865.667 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.245 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.810 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.245 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 7.492 ms | 56865.667 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.810 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 5.000 | 156792.000 | 156557.000 |
| `send:Execute` | 1.000 | 14168.000 | 0.000 |
| `recv:BridgeCall` | 5.000 | 490.000 | 192.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:06:48.846Z

- Warm wall: 29.453 -> 28.986 ms (-0.467 ms (-1.59%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.838 -> 6.188 ms (+0.350 ms (+6.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.837 -> 0.688 ms (-0.149 ms (-17.80%))
- Bridge time/iteration: 17.448 -> 17.742 ms (+0.294 ms (+1.69%))
- BridgeResponse encoded bytes/iteration: 156792.000 -> 156792.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.272 -> 17.547 ms (+0.275 ms (+1.59%)); response bytes 156675.000 -> 156675.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.781 -> 5.245 ms (-0.536 ms (-9.27%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.244 -> 7.492 ms (+1.248 ms (+19.99%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.247 -> 4.810 ms (-0.437 ms (-8.33%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.244 -> 7.492 ms (+1.248 ms (+19.99%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.781 -> 5.245 ms (-0.536 ms (-9.27%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.247 -> 4.810 ms (-0.437 ms (-8.33%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.781 -> 5.245 ms (-0.536 ms (-9.27%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.244 -> 7.492 ms (+1.248 ms (+19.99%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.247 -> 4.810 ms (-0.437 ms (-8.33%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 17.272 | 17.547 | +0.275 |
| Method time | `_log` | 0.088 | 0.100 | +0.012 |
| Method time | `_bridgeDispatch` | 0.088 | 0.095 | +0.007 |

