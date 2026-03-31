# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T23:10:47.898Z (a8a9fabc86ff1f8f846bf13fb9e1504f90f14717)
Baseline benchmark: 2026-03-31T22:52:40.099Z (71fde781e7f7e39367e687dc93ba10582ee749af)
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

Copy the primary sandbox new-session replay warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch plus the ranked target-level deltas below. Use the per-scenario `summary.md` Benchmark Modes section for true cold start, same-session replay, snapshot-off replay, host-control numbers, and current target hotspots.

## Microbench Empty Session

- Warm wall: 23.887 -> 24.437 ms (+0.550 ms (+2.30%))
- Bridge calls/iteration: 4.000 -> 4.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.994 -> 5.563 ms (-0.431 ms (-7.19%))
- Warm Create->InjectGlobals: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.994 -> 1.063 ms (+0.069 ms (+6.94%))
- Bridge time/iteration: 10.618 -> 10.340 ms (-0.278 ms (-2.62%))
- BridgeResponse encoded bytes/iteration: 99926.333 -> 99926.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 10.415 -> 10.144 ms/iteration (-0.271)
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.415 -> 10.144 ms (-0.271 ms (-2.60%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.479 -> 5.367 ms (-0.112 ms (-2.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.936 -> 4.777 ms (-0.159 ms (-3.22%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.936 -> 4.777 ms (-0.159 ms (-3.22%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.479 -> 5.367 ms (-0.112 ms (-2.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.479 -> 5.367 ms (-0.112 ms (-2.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.936 -> 4.777 ms (-0.159 ms (-3.22%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import stream

- Warm wall: 28.872 -> 28.566 ms (-0.306 ms (-1.06%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.450 -> 5.982 ms (+0.532 ms (+9.76%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 1.000 -> 0.000 ms (-1.000 ms (-100.00%))
- Warm residual overhead: -0.549 -> 0.482 ms (+1.031 ms (-187.80%))
- Bridge time/iteration: 17.752 -> 18.063 ms (+0.311 ms (+1.75%))
- BridgeResponse encoded bytes/iteration: 182531.000 -> 182531.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 17.539 -> 17.868 ms/iteration (+0.329)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.539 -> 17.868 ms (+0.329 ms (+1.88%)); response bytes 182414.000 -> 182414.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.753 -> 7.128 ms (+0.375 ms (+5.55%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.554 -> 5.563 ms (+0.009 ms (+0.16%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.233 -> 5.177 ms (-0.056 ms (-1.07%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.753 -> 7.128 ms (+0.375 ms (+5.55%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.233 -> 5.177 ms (-0.056 ms (-1.07%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.554 -> 5.563 ms (+0.009 ms (+0.16%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.753 -> 7.128 ms (+0.375 ms (+5.55%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.554 -> 5.563 ms (+0.009 ms (+0.16%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.233 -> 5.177 ms (-0.056 ms (-1.07%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import stream/web

- Warm wall: 25.978 -> 26.342 ms (+0.364 ms (+1.40%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.631 -> 5.653 ms (+0.022 ms (+0.39%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.131 -> 0.653 ms (-0.478 ms (-42.26%))
- Bridge time/iteration: 10.788 -> 12.417 ms (+1.629 ms (+15.10%))
- BridgeResponse encoded bytes/iteration: 157909.667 -> 157909.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 10.591 -> 12.160 ms/iteration (+1.569)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.591 -> 12.160 ms (+1.569 ms (+14.81%)); response bytes 157792.667 -> 157792.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.916 -> 6.260 ms (+0.344 ms (+5.82%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.675 -> 5.900 ms (+1.225 ms (+26.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.675 -> 5.900 ms (+1.225 ms (+26.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.916 -> 6.260 ms (+0.344 ms (+5.82%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.916 -> 6.260 ms (+0.344 ms (+5.82%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.675 -> 5.900 ms (+1.225 ms (+26.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import crypto

- Warm wall: 51.854 -> 48.858 ms (-2.996 ms (-5.78%))
- Bridge calls/iteration: 8.000 -> 8.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.067 -> 6.345 ms (-0.722 ms (-10.22%))
- Warm Create->InjectGlobals: 6.000 -> 5.000 ms (-1.000 ms (-16.67%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.567 -> 1.345 ms (+0.778 ms (+137.21%))
- Bridge time/iteration: 36.928 -> 38.784 ms (+1.856 ms (+5.03%))
- BridgeResponse encoded bytes/iteration: 512742.667 -> 512742.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 36.779 -> 38.490 ms/iteration (+1.711)
- _loadPolyfill real polyfill-body loads: calls 6.000 -> 6.000 calls (0.000 calls (0.00%)); time 36.779 -> 38.490 ms (+1.711 ms (+4.65%)); response bytes 512625.667 -> 512625.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

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

## Microbench Import zlib

- Warm wall: 32.641 -> 31.642 ms (-0.999 ms (-3.06%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.498 -> 5.740 ms (+0.242 ms (+4.40%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.498 -> 0.740 ms (+0.242 ms (+48.59%))
- Bridge time/iteration: 18.680 -> 20.410 ms (+1.730 ms (+9.26%))
- BridgeResponse encoded bytes/iteration: 257724.333 -> 257724.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 18.481 -> 20.224 ms/iteration (+1.743)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 18.481 -> 20.224 ms (+1.743 ms (+9.43%)); response bytes 257607.333 -> 257607.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.362 -> 8.758 ms (+0.396 ms (+4.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.347 -> 5.947 ms (+0.600 ms (+11.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.773 -> 5.519 ms (+0.746 ms (+15.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.773 -> 5.519 ms (+0.746 ms (+15.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.347 -> 5.947 ms (+0.600 ms (+11.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.362 -> 8.758 ms (+0.396 ms (+4.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.362 -> 8.758 ms (+0.396 ms (+4.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.347 -> 5.947 ms (+0.600 ms (+11.22%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.773 -> 5.519 ms (+0.746 ms (+15.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import assert

- Warm wall: 29.453 -> 28.986 ms (-0.467 ms (-1.59%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.838 -> 6.188 ms (+0.350 ms (+6.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.837 -> 0.688 ms (-0.149 ms (-17.80%))
- Bridge time/iteration: 17.448 -> 17.742 ms (+0.294 ms (+1.69%))
- BridgeResponse encoded bytes/iteration: 156792.000 -> 156792.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 17.272 -> 17.547 ms/iteration (+0.275)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.272 -> 17.547 ms (+0.275 ms (+1.59%)); response bytes 156675.000 -> 156675.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

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

## Microbench Import url

- Warm wall: 23.607 -> 22.880 ms (-0.727 ms (-3.08%))
- Bridge calls/iteration: 4.000 -> 4.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.081 -> 5.468 ms (-0.613 ms (-10.08%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.081 -> 0.468 ms (-0.613 ms (-56.71%))
- Bridge time/iteration: 11.655 -> 10.367 ms (-1.288 ms (-11.05%))
- BridgeResponse encoded bytes/iteration: 99926.333 -> 99926.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 11.472 -> 10.195 ms/iteration (-1.277)
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 11.472 -> 10.195 ms (-1.277 ms (-11.13%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.204 -> 5.337 ms (-0.867 ms (-13.97%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.268 -> 4.858 ms (-0.410 ms (-7.78%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.204 -> 5.337 ms (-0.867 ms (-13.97%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.268 -> 4.858 ms (-0.410 ms (-7.78%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.204 -> 5.337 ms (-0.867 ms (-13.97%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.268 -> 4.858 ms (-0.410 ms (-7.78%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import @borewit/text-codec

- Warm wall: 27.296 -> 27.478 ms (+0.182 ms (+0.67%))
- Bridge calls/iteration: 7.000 -> 7.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.566 -> 6.239 ms (+0.673 ms (+12.09%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.067 -> 1.239 ms (+0.172 ms (+16.12%))
- Bridge time/iteration: 21.872 -> 22.070 ms (+0.198 ms (+0.91%))
- BridgeResponse encoded bytes/iteration: 102932.333 -> 102932.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 11.309 -> 11.719 ms/iteration (+0.410)
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.516 -> 10.299 ms (-0.217 ms (-2.06%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.049 -> 5.422 ms (+0.373 ms (+7.39%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.467 -> 4.878 ms (-0.589 ms (-10.77%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.467 -> 4.878 ms (-0.589 ms (-10.77%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.049 -> 5.422 ms (+0.373 ms (+7.39%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.049 -> 5.422 ms (+0.373 ms (+7.39%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.467 -> 4.878 ms (-0.589 ms (-10.77%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Hono Startup

- Warm wall: 50.069 -> 36.428 ms (-13.641 ms (-27.24%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.976 -> 5.836 ms (-0.140 ms (-2.34%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.976 -> 0.836 ms (-0.140 ms (-14.34%))
- Bridge time/iteration: 18.480 -> 14.367 ms (-4.113 ms (-22.26%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 6.805 -> 4.284 ms/iteration (-2.521)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 11.579 -> 10.027 ms (-1.552 ms (-13.40%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

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

## Hono End-to-End

- Warm wall: 36.873 -> 38.255 ms (+1.382 ms (+3.75%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.472 -> 5.488 ms (+0.016 ms (+0.29%))
- Warm Create->InjectGlobals: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.472 -> 0.487 ms (-0.985 ms (-66.92%))
- Bridge time/iteration: 15.624 -> 14.893 ms (-0.731 ms (-4.68%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 11.075 -> 10.259 ms/iteration (-0.816)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 11.075 -> 10.259 ms (-0.816 ms (-7.37%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

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

## pdf-lib Startup

- Warm wall: 174.310 -> 122.178 ms (-52.132 ms (-29.91%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.675 -> 6.839 ms (-0.836 ms (-10.89%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.675 -> 1.340 ms (-1.335 ms (-49.91%))
- Bridge time/iteration: 65.010 -> 45.695 ms (-19.315 ms (-29.71%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 53.398 -> 34.338 ms/iteration (-19.060)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 11.535 -> 11.267 ms (-0.268 ms (-2.32%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.582 -> 5.976 ms (+0.394 ms (+7.06%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.774 -> 5.153 ms (-0.621 ms (-10.76%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.053 -> 0.022 ms (-0.031 ms (-58.49%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.016 ms (-0.013 ms (-44.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.039 ms (+0.010 ms (+34.48%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.774 -> 5.153 ms (-0.621 ms (-10.76%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.582 -> 5.976 ms (+0.394 ms (+7.06%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.053 -> 0.022 ms (-0.031 ms (-58.49%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.016 ms (-0.013 ms (-44.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.039 ms (+0.010 ms (+34.48%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.582 -> 5.976 ms (+0.394 ms (+7.06%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.774 -> 5.153 ms (-0.621 ms (-10.76%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.053 -> 0.022 ms (-0.031 ms (-58.49%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.016 ms (-0.013 ms (-44.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.029 -> 0.039 ms (+0.010 ms (+34.48%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

## pdf-lib End-to-End

- Warm wall: 243.269 -> 179.726 ms (-63.543 ms (-26.12%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.503 -> 6.691 ms (-0.812 ms (-10.82%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 2.503 -> 1.190 ms (-1.313 ms (-52.46%))
- Bridge time/iteration: 60.261 -> 44.157 ms (-16.104 ms (-26.72%))
- BridgeResponse encoded bytes/iteration: 653208.000 -> 653208.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 46.974 -> 33.189 ms/iteration (-13.785)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 13.209 -> 10.908 ms (-2.301 ms (-17.42%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.403 -> 5.699 ms (+0.296 ms (+5.48%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.626 -> 5.086 ms (-2.540 ms (-33.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.049 -> 0.026 ms (-0.023 ms (-46.94%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.031 -> 0.017 ms (-0.014 ms (-45.16%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.035 -> 0.023 ms (-0.012 ms (-34.29%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.626 -> 5.086 ms (-2.540 ms (-33.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.403 -> 5.699 ms (+0.296 ms (+5.48%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.049 -> 0.026 ms (-0.023 ms (-46.94%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.031 -> 0.017 ms (-0.014 ms (-45.16%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.035 -> 0.023 ms (-0.012 ms (-34.29%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.403 -> 5.699 ms (+0.296 ms (+5.48%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.626 -> 5.086 ms (-2.540 ms (-33.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.049 -> 0.026 ms (-0.023 ms (-46.94%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.031 -> 0.017 ms (-0.014 ms (-45.16%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.035 -> 0.023 ms (-0.012 ms (-34.29%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

## JSZip Startup

- Warm wall: 67.864 -> 68.439 ms (+0.575 ms (+0.85%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.059 -> 6.226 ms (+0.167 ms (+2.76%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.059 -> 1.226 ms (+0.167 ms (+15.77%))
- Bridge time/iteration: 40.393 -> 38.055 ms (-2.338 ms (-5.79%))
- BridgeResponse encoded bytes/iteration: 410655.667 -> 410655.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 27.428 -> 25.936 ms/iteration (-1.492)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 27.428 -> 25.936 ms (-1.492 ms (-5.44%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.854 -> 6.692 ms (-0.162 ms (-2.36%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.240 -> 5.880 ms (+0.640 ms (+12.21%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.710 -> 4.924 ms (-1.786 ms (-26.62%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.593 -> 4.878 ms (+0.285 ms (+6.21%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.053 -> 1.525 ms (-0.528 ms (-25.72%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.710 -> 4.924 ms (-1.786 ms (-26.62%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.240 -> 5.880 ms (+0.640 ms (+12.21%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.053 -> 1.525 ms (-0.528 ms (-25.72%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.593 -> 4.878 ms (+0.285 ms (+6.21%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `events` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.891 -> 1.146 ms (+0.255 ms (+28.62%)) | 4042.333 -> 4042.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.854 -> 6.692 ms (-0.162 ms (-2.36%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.240 -> 5.880 ms (+0.640 ms (+12.21%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.710 -> 4.924 ms (-1.786 ms (-26.62%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.593 -> 4.878 ms (+0.285 ms (+6.21%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.053 -> 1.525 ms (-0.528 ms (-25.72%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

## JSZip End-to-End

- Warm wall: 102.546 -> 78.700 ms (-23.846 ms (-23.25%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.208 -> 6.538 ms (+0.330 ms (+5.32%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.208 -> 1.038 ms (-0.170 ms (-14.07%))
- Bridge time/iteration: 49.514 -> 40.086 ms (-9.428 ms (-19.04%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 18.944 -> 12.166 ms/iteration (-6.778)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 30.444 -> 27.796 ms (-2.648 ms (-8.70%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.982 -> 7.436 ms (+0.454 ms (+6.50%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.514 -> 6.215 ms (+0.701 ms (+12.71%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.954 -> 5.223 ms (-2.731 ms (-34.34%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.016 -> 4.991 ms (-0.025 ms (-0.50%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.033 -> 1.650 ms (-0.383 ms (-18.84%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.954 -> 5.223 ms (-2.731 ms (-34.34%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.514 -> 6.215 ms (+0.701 ms (+12.71%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `internal/mime` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.321 -> 0.778 ms (-0.543 ms (-41.10%)) | 2071.000 -> 2071.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.982 -> 7.436 ms (+0.454 ms (+6.50%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.033 -> 1.650 ms (-0.383 ms (-18.84%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.982 -> 7.436 ms (+0.454 ms (+6.50%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.514 -> 6.215 ms (+0.701 ms (+12.71%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.954 -> 5.223 ms (-2.731 ms (-34.34%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.016 -> 4.991 ms (-0.025 ms (-0.50%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 2.033 -> 1.650 ms (-0.383 ms (-18.84%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

## Pi SDK Startup

- Warm wall: 1559.370 -> 886.870 ms (-672.500 ms (-43.13%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 13.761 -> 8.576 ms (-5.185 ms (-37.68%))
- Warm Create->InjectGlobals: 5.500 -> 6.000 ms (+0.500 ms (+9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 7.761 -> 2.577 ms (-5.184 ms (-66.80%))
- Bridge time/iteration: 876.922 -> 478.099 ms (-398.823 ms (-45.48%))
- BridgeResponse encoded bytes/iteration: 3309659.000 -> 3309659.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 805.889 -> 429.228 ms/iteration (-376.661)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 69.370 -> 48.003 ms (-21.367 ms (-30.80%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.234 -> 6.181 ms (-0.053 ms (-0.85%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.961 -> 14.880 ms (-3.081 ms (-17.15%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.260 -> 7.647 ms (-1.613 ms (-17.42%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.263 -> 6.811 ms (+0.548 ms (+8.75%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.902 -> 6.055 ms (-9.847 ms (-61.92%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.902 -> 6.055 ms (-9.847 ms (-61.92%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.638 -> 4.944 ms (-6.694 ms (-57.52%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.961 -> 14.880 ms (-3.081 ms (-17.15%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.260 -> 7.647 ms (-1.613 ms (-17.42%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.263 -> 6.811 ms (+0.548 ms (+8.75%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 17.961 -> 14.880 ms (-3.081 ms (-17.15%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.260 -> 7.647 ms (-1.613 ms (-17.42%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.234 -> 6.181 ms (-0.053 ms (-0.85%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.263 -> 6.811 ms (+0.548 ms (+8.75%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.902 -> 6.055 ms (-9.847 ms (-61.92%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

## Pi SDK End-to-End

- Warm wall: 1812.370 -> 1018.723 ms (-793.647 ms (-43.79%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.002 -> 9.188 ms (+0.186 ms (+2.07%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.002 -> 3.188 ms (+0.186 ms (+6.20%))
- Bridge time/iteration: 987.270 -> 540.002 ms (-447.268 ms (-45.30%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 850.049 -> 452.775 ms/iteration (-397.274)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 92.816 -> 51.011 ms (-41.805 ms (-45.04%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.830 -> 6.004 ms (+0.174 ms (+2.98%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.267 -> 15.614 ms (-16.653 ms (-51.61%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 21.643 -> 9.729 ms (-11.914 ms (-55.05%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.967 -> 6.203 ms (+0.236 ms (+3.96%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.182 -> 7.048 ms (-9.134 ms (-56.45%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.267 -> 15.614 ms (-16.653 ms (-51.61%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 21.643 -> 9.729 ms (-11.914 ms (-55.05%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.182 -> 7.048 ms (-9.134 ms (-56.45%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.438 -> 5.054 ms (-3.384 ms (-40.10%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.967 -> 6.203 ms (+0.236 ms (+3.96%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 32.267 -> 15.614 ms (-16.653 ms (-51.61%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 21.643 -> 9.729 ms (-11.914 ms (-55.05%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.830 -> 6.004 ms (+0.174 ms (+2.98%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.967 -> 6.203 ms (+0.236 ms (+3.96%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.182 -> 7.048 ms (-9.134 ms (-56.45%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

## Pi CLI Startup

- Warm wall: 1603.007 -> 953.642 ms (-649.365 ms (-40.51%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.242 -> 9.565 ms (+0.323 ms (+3.50%))
- Warm Create->InjectGlobals: 6.500 -> 5.500 ms (-1.000 ms (-15.38%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.742 -> 4.065 ms (+1.323 ms (+48.25%))
- Bridge time/iteration: 985.069 -> 518.205 ms (-466.864 ms (-47.39%))
- BridgeResponse encoded bytes/iteration: 3312400.333 -> 3312400.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 833.158 -> 417.974 ms/iteration (-415.184)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 86.321 -> 48.828 ms (-37.493 ms (-43.43%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.751 -> 6.230 ms (+0.479 ms (+8.33%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 44.430 -> 14.743 ms (-29.687 ms (-66.82%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.513 -> 8.606 ms (+0.093 ms (+1.09%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.138 -> 6.671 ms (+0.533 ms (+8.68%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.459 -> 6.075 ms (-6.384 ms (-51.24%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 44.430 -> 14.743 ms (-29.687 ms (-66.82%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.459 -> 6.075 ms (-6.384 ms (-51.24%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.905 -> 5.072 ms (-1.833 ms (-26.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.138 -> 6.671 ms (+0.533 ms (+8.68%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.751 -> 6.230 ms (+0.479 ms (+8.33%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 44.430 -> 14.743 ms (-29.687 ms (-66.82%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.513 -> 8.606 ms (+0.093 ms (+1.09%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.751 -> 6.230 ms (+0.479 ms (+8.33%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.138 -> 6.671 ms (+0.533 ms (+8.68%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.459 -> 6.075 ms (-6.384 ms (-51.24%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

## Pi CLI End-to-End

- Warm wall: 1898.294 -> 1040.085 ms (-858.209 ms (-45.21%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 10.689 -> 9.563 ms (-1.126 ms (-10.53%))
- Warm Create->InjectGlobals: 7.000 -> 5.500 ms (-1.500 ms (-21.43%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.689 -> 3.563 ms (-0.126 ms (-3.42%))
- Bridge time/iteration: 1090.520 -> 547.754 ms (-542.766 ms (-49.77%))
- BridgeResponse encoded bytes/iteration: 3449855.333 -> 3449857.333 bytes (+2.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 951.271 -> 439.532 ms/iteration (-511.739)
- Largest method-byte delta: `_fsStat` 205.000 -> 207.000 encoded bytes/iteration (+2.000)
- Largest frame-byte delta: `send:BridgeResponse` 3449855.333 -> 3449857.333 encoded bytes/iteration (+2.000)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 58.042 -> 50.042 ms (-8.000 ms (-13.78%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.420 -> 5.753 ms (+0.333 ms (+6.14%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.287 -> 15.429 ms (-0.858 ms (-5.27%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.256 -> 7.743 ms (-1.513 ms (-16.35%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.536 -> 6.822 ms (+0.286 ms (+4.38%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.772 -> 8.157 ms (-3.615 ms (-30.71%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.772 -> 8.157 ms (-3.615 ms (-30.71%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.226 -> 4.670 ms (-1.556 ms (-24.99%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.256 -> 7.743 ms (-1.513 ms (-16.35%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.287 -> 15.429 ms (-0.858 ms (-5.27%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.420 -> 5.753 ms (+0.333 ms (+6.14%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.287 -> 15.429 ms (-0.858 ms (-5.27%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.256 -> 7.743 ms (-1.513 ms (-16.35%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.420 -> 5.753 ms (+0.333 ms (+6.14%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.536 -> 6.822 ms (+0.286 ms (+4.38%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.772 -> 8.157 ms (-3.615 ms (-30.71%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

## Transport RTT

- Connect RTT: 0.286 -> 0.203 ms (-0.083 ms (-29.02%))
- 1 B mean RTT: 0.048 -> 0.019 ms (-0.029 ms (-60.42%))
- 1 B P95 RTT: 0.080 -> 0.030 ms (-0.050 ms (-62.50%))
- 1 KB mean RTT: 0.016 -> 0.015 ms (-0.001 ms (-6.25%))
- 1 KB P95 RTT: 0.017 -> 0.018 ms (+0.001 ms (+5.88%))
- 64 KB mean RTT: 0.141 -> 0.115 ms (-0.026 ms (-18.44%))
- 64 KB P95 RTT: 0.205 -> 0.123 ms (-0.082 ms (-40.00%))

