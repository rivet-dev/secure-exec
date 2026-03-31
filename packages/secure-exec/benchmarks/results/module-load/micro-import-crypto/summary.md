# Microbench Import crypto

Scenario: `micro-import-crypto`
Kind: `import`
Generated: 2026-03-31T23:09:23.309Z
Description: Requires the hot Pi builtin `crypto` once to isolate crypto bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 48.858 ms
- Bridge calls/iteration: 8.000
- Warm fixed session overhead: 6.345 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.345 ms
- Dominant bridge time: `_loadPolyfill` 38.490 ms/iteration across 6.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 512625.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 6.000 calls/iteration, 38.490 ms/iteration, 512625.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 15.430 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 15.430 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 512742.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 261.029 ms; runtime create 100.264 ms; first pass 160.765 ms; sandbox 0.000 ms; checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function
- Sandbox true cold start, warm snapshot disabled: total 265.663 ms; runtime create 4.448 ms; first pass 261.215 ms; sandbox 0.000 ms; checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 177.345 ms; warm 48.858 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 267.473 ms; warm 48.426 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 170.557 ms; first checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function; replay checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function
- Host same-session control: total 0.070 ms; first 0.053 ms; replay 0.011 ms; first checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function; replay checks `importTarget`=crypto, `moduleType`=object, `createHashType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 177.345 ms | 162.225 ms | 15.120 ms | 8 | 112.872 ms |
| 2 | 49.711 ms | 42.210 ms | 7.501 ms | 8 | 1.737 ms |
| 3 | 48.006 ms | 42.818 ms | 5.188 ms | 8 | 1.744 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 162.225 ms | 0.000 ms | 3.120 ms |
| 2 | 6.000 ms | 0.000 ms | 42.210 ms | 0.000 ms | 1.501 ms |
| 3 | 4.000 ms | 0.000 ms | 42.818 ms | 0.000 ms | 1.188 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 6.000 | 38.490 ms | 6.415 ms | 512625.667 |
| `_log` | 1.000 | 0.150 ms | 0.150 ms | 47.000 |
| `_bridgeDispatch` | 1.000 | 0.144 ms | 0.144 ms | 70.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 6.000 | 38.490 ms | 512625.667 | 6 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 15.430 ms | 300368.667 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 7.356 ms | 82604.667 |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.375 ms | 57983.333 |
| real polyfill-body loads | by calls | `util` | 1.000 | 4.872 ms | 27772.000 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.789 ms | 41826.000 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 15.430 ms | 300368.667 |
| real polyfill-body loads | by time | `stream` | 1.000 | 7.356 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.375 ms | 57983.333 |
| real polyfill-body loads | by time | `util` | 1.000 | 4.872 ms | 27772.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.789 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 15.430 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 7.356 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.375 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.789 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `util` | 1.000 | 4.872 ms | 27772.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 8.000 | 512742.667 | 512366.667 |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:Execute` | 1.000 | 14166.000 | 0.000 |
| `recv:BridgeCall` | 8.000 | 726.000 | 245.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:06:42.791Z

- Warm wall: 51.854 -> 48.858 ms (-2.996 ms (-5.78%))
- Bridge calls/iteration: 8.000 -> 8.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.067 -> 6.345 ms (-0.722 ms (-10.22%))
- Warm Create->InjectGlobals: 6.000 -> 5.000 ms (-1.000 ms (-16.67%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.567 -> 1.345 ms (+0.778 ms (+137.21%))
- Bridge time/iteration: 36.928 -> 38.784 ms (+1.856 ms (+5.03%))
- BridgeResponse encoded bytes/iteration: 512742.667 -> 512742.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 6.000 -> 6.000 calls (0.000 calls (0.00%)); time 36.779 -> 38.490 ms (+1.711 ms (+4.65%)); response bytes 512625.667 -> 512625.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.293 -> 15.430 ms (+0.137 ms (+0.90%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.631 -> 7.356 ms (+0.725 ms (+10.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.417 -> 5.375 ms (-0.042 ms (-0.78%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.513 -> 4.789 ms (+0.276 ms (+6.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.113 -> 4.872 ms (+0.759 ms (+18.45%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.113 -> 4.872 ms (+0.759 ms (+18.45%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.631 -> 7.356 ms (+0.725 ms (+10.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.513 -> 4.789 ms (+0.276 ms (+6.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `internal/mime` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.812 -> 0.668 ms (-0.144 ms (-17.73%)) | 2071.000 -> 2071.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.293 -> 15.430 ms (+0.137 ms (+0.90%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.293 -> 15.430 ms (+0.137 ms (+0.90%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.631 -> 7.356 ms (+0.725 ms (+10.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.417 -> 5.375 ms (-0.042 ms (-0.78%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.513 -> 4.789 ms (+0.276 ms (+6.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.113 -> 4.872 ms (+0.759 ms (+18.45%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 36.779 | 38.490 | +1.711 |
| Method time | `_log` | 0.069 | 0.150 | +0.081 |
| Method time | `_bridgeDispatch` | 0.080 | 0.144 | +0.064 |

