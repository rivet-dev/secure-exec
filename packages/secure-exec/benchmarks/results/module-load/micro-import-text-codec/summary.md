# Microbench Import @borewit/text-codec

Scenario: `micro-import-text-codec`
Kind: `import`
Generated: 2026-03-31T23:09:35.142Z
Description: Dynamically imports the resolved `@borewit/text-codec` entry file to isolate projected package-file loading from the Pi startup path.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 27.478 ms
- Bridge calls/iteration: 7.000
- Warm fixed session overhead: 6.239 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 1.239 ms
- Dominant bridge time: `_bridgeDispatch` 11.719 ms/iteration across 4.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 2.000 calls/iteration, 10.299 ms/iteration, 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.422 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.422 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 197.020 ms; runtime create 99.270 ms; first pass 97.750 ms; sandbox 0.000 ms; checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function
- Sandbox true cold start, warm snapshot disabled: total 189.786 ms; runtime create 4.591 ms; first pass 185.195 ms; sandbox 0.000 ms; checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 96.299 ms; warm 27.478 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 187.226 ms; warm 26.326 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 108.070 ms; first checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function; replay checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function
- Host same-session control: total 2.056 ms; first 1.974 ms; replay 0.080 ms; first checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function; replay checks `importTarget`=@borewit/text-codec/lib/index.js, `moduleType`=object, `textDecodeType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 96.299 ms | 81.430 ms | 14.869 ms | 7 | 60.403 ms |
| 2 | 30.178 ms | 22.806 ms | 7.372 ms | 7 | 3.484 ms |
| 3 | 24.778 ms | 19.673 ms | 5.105 ms | 7 | 2.324 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 81.430 ms | 1.000 ms | 0.869 ms |
| 2 | 6.000 ms | 0.000 ms | 22.806 ms | 0.000 ms | 1.372 ms |
| 3 | 4.000 ms | 0.000 ms | 19.673 ms | 0.000 ms | 1.105 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 4.000 | 11.719 ms | 2.930 ms | 3076.000 |
| `_loadPolyfill` | 2.000 | 10.299 ms | 5.150 ms | 99809.333 |
| `_log` | 1.000 | 0.052 ms | 0.052 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 2.000 | 10.299 ms | 99809.333 | 2 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.422 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.878 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.422 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.878 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.422 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.878 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 7.000 | 102932.333 | 102603.333 |
| `send:Execute` | 1.000 | 14356.000 | 0.000 |
| `recv:BridgeCall` | 7.000 | 1125.000 | 699.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:06:54.686Z

- Warm wall: 27.296 -> 27.478 ms (+0.182 ms (+0.67%))
- Bridge calls/iteration: 7.000 -> 7.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.566 -> 6.239 ms (+0.673 ms (+12.09%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.067 -> 1.239 ms (+0.172 ms (+16.12%))
- Bridge time/iteration: 21.872 -> 22.070 ms (+0.198 ms (+0.91%))
- BridgeResponse encoded bytes/iteration: 102932.333 -> 102932.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.516 -> 10.299 ms (-0.217 ms (-2.06%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.049 -> 5.422 ms (+0.373 ms (+7.39%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.467 -> 4.878 ms (-0.589 ms (-10.77%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.467 -> 4.878 ms (-0.589 ms (-10.77%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.049 -> 5.422 ms (+0.373 ms (+7.39%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.049 -> 5.422 ms (+0.373 ms (+7.39%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.467 -> 4.878 ms (-0.589 ms (-10.77%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 11.309 | 11.719 | +0.410 |
| Method time | `_loadPolyfill` | 10.516 | 10.299 | -0.217 |
| Method time | `_log` | 0.047 | 0.052 | +0.005 |

