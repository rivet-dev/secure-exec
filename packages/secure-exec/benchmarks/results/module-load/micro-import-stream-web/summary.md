# Microbench Import stream/web

Scenario: `micro-import-stream-web`
Kind: `import`
Generated: 2026-03-31T23:09:19.830Z
Description: Requires the hot Pi builtin `stream/web` once to isolate web-stream bootstrap cost.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 26.342 ms
- Bridge calls/iteration: 5.000
- Warm fixed session overhead: 5.653 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.653 ms
- Dominant bridge time: `_loadPolyfill` 12.160 ms/iteration across 3.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 157792.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 3.000 calls/iteration, 12.160 ms/iteration, 157792.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 2.000 calls/iteration, 6.260 ms/iteration, 115966.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 2.000 calls/iteration, 6.260 ms/iteration, 115966.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 163.579 ms; runtime create 97.787 ms; first pass 65.792 ms; sandbox 0.000 ms; checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function
- Sandbox true cold start, warm snapshot disabled: total 163.938 ms; runtime create 4.673 ms; first pass 159.265 ms; sandbox 0.000 ms; checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 73.926 ms; warm 26.342 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 158.454 ms; warm 25.169 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 67.193 ms; first checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function; replay checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function
- Host same-session control: total 1.682 ms; first 1.661 ms; replay 0.019 ms; first checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function; replay checks `importTarget`=stream/web, `moduleType`=object, `readableStreamType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 73.926 ms | 58.920 ms | 15.006 ms | 5 | 35.689 ms |
| 2 | 27.526 ms | 21.439 ms | 6.087 ms | 5 | 0.891 ms |
| 3 | 25.158 ms | 19.939 ms | 5.219 ms | 5 | 0.670 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 58.920 ms | 1.000 ms | 1.006 ms |
| 2 | 5.000 ms | 0.000 ms | 21.439 ms | 0.000 ms | 1.087 ms |
| 3 | 5.000 ms | 0.000 ms | 19.939 ms | 0.000 ms | 0.219 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 3.000 | 12.160 ms | 4.053 ms | 157792.667 |
| `_bridgeDispatch` | 1.000 | 0.138 ms | 0.138 ms | 70.000 |
| `_log` | 1.000 | 0.118 ms | 0.118 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 3.000 | 12.160 ms | 157792.667 | 2 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 6.260 ms | 115966.667 |
| real polyfill-body loads | by calls | `url` | 1.000 | 5.900 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 6.260 ms | 115966.667 |
| real polyfill-body loads | by time | `url` | 1.000 | 5.900 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 6.260 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 5.900 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 5.000 | 157909.667 | 157674.667 |
| `send:Execute` | 1.000 | 14182.000 | 0.000 |
| `recv:BridgeCall` | 5.000 | 499.000 | 201.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:06:39.332Z

- Warm wall: 25.978 -> 26.342 ms (+0.364 ms (+1.40%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.631 -> 5.653 ms (+0.022 ms (+0.39%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.131 -> 0.653 ms (-0.478 ms (-42.26%))
- Bridge time/iteration: 10.788 -> 12.417 ms (+1.629 ms (+15.10%))
- BridgeResponse encoded bytes/iteration: 157909.667 -> 157909.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.591 -> 12.160 ms (+1.569 ms (+14.81%)); response bytes 157792.667 -> 157792.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.916 -> 6.260 ms (+0.344 ms (+5.82%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.675 -> 5.900 ms (+1.225 ms (+26.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.675 -> 5.900 ms (+1.225 ms (+26.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.916 -> 6.260 ms (+0.344 ms (+5.82%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.916 -> 6.260 ms (+0.344 ms (+5.82%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.675 -> 5.900 ms (+1.225 ms (+26.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.591 | 12.160 | +1.569 |
| Method time | `_bridgeDispatch` | 0.096 | 0.138 | +0.042 |
| Method time | `_log` | 0.101 | 0.118 | +0.017 |

