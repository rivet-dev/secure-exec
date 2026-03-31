# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T22:52:40.099Z (71fde781e7f7e39367e687dc93ba10582ee749af)
Baseline benchmark: none
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

Copy the primary sandbox new-session replay warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch plus the ranked target-level deltas below. Use the per-scenario `summary.md` Benchmark Modes section for true cold start, same-session replay, snapshot-off replay, host-control numbers, and current target hotspots.

## Hono Startup

- Warm wall: 38.373 -> 50.069 ms (+11.696 ms (+30.48%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.492 -> 5.976 ms (+0.484 ms (+8.81%))
- Warm Create->InjectGlobals: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.492 -> 0.976 ms (-0.516 ms (-34.58%))
- Bridge time/iteration: 14.442 -> 18.480 ms (+4.038 ms (+27.96%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 4.645 -> 6.805 ms/iteration (+2.160)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 9.709 -> 11.579 ms (+1.870 ms (+19.26%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

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

## Hono End-to-End

- Warm wall: 39.684 -> 36.873 ms (-2.811 ms (-7.08%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.224 -> 5.472 ms (-0.752 ms (-12.08%))
- Warm Create->InjectGlobals: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.224 -> 1.472 ms (+0.248 ms (+20.26%))
- Bridge time/iteration: 15.364 -> 15.624 ms (+0.260 ms (+1.69%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 10.295 -> 11.075 ms/iteration (+0.780)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.295 -> 11.075 ms (+0.780 ms (+7.58%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

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

## pdf-lib Startup

- Warm wall: 113.751 -> 174.310 ms (+60.559 ms (+53.24%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.317 -> 7.675 ms (+1.358 ms (+21.50%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.318 -> 2.675 ms (+1.357 ms (+102.96%))
- Bridge time/iteration: 41.401 -> 65.010 ms (+23.609 ms (+57.02%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 30.329 -> 53.398 ms/iteration (+23.069)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.996 -> 11.535 ms (+0.539 ms (+4.90%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.689 -> 5.582 ms (-0.107 ms (-1.88%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.176 -> 5.774 ms (+0.598 ms (+11.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.027 -> 0.053 ms (+0.026 ms (+96.30%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.015 -> 0.029 ms (+0.014 ms (+93.33%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.176 -> 5.774 ms (+0.598 ms (+11.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.689 -> 5.582 ms (-0.107 ms (-1.88%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.027 -> 0.053 ms (+0.026 ms (+96.30%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.015 -> 0.029 ms (+0.014 ms (+93.33%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.689 -> 5.582 ms (-0.107 ms (-1.88%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.176 -> 5.774 ms (+0.598 ms (+11.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.027 -> 0.053 ms (+0.026 ms (+96.30%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.015 -> 0.029 ms (+0.014 ms (+93.33%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

## pdf-lib End-to-End

- No previous baseline was available for this scenario.

## JSZip Startup

- No previous baseline was available for this scenario.

## JSZip End-to-End

- No previous baseline was available for this scenario.

## Pi SDK Startup

- No previous baseline was available for this scenario.

## Pi SDK End-to-End

- No previous baseline was available for this scenario.

## Pi CLI Startup

- No previous baseline was available for this scenario.

## Pi CLI End-to-End

- No previous baseline was available for this scenario.

## Transport RTT

- No previous baseline was available for transport RTT.

