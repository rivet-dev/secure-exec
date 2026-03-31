# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T23:35:02.618Z (0f9e309606d7dd1aa7c7ddb84de20405f715b997)
Baseline benchmark: 2026-03-31T23:10:47.898Z (a8a9fabc86ff1f8f846bf13fb9e1504f90f14717)
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

Copy the primary sandbox new-session replay warm wall, bridge calls/iteration, warm fixed overhead, warm-run stability, and host-runtime resource fields below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch plus the ranked target-level deltas below. Use the per-scenario `summary.md` Benchmark Modes section for true cold start, same-session replay, snapshot-off replay, host-control numbers, and current target hotspots.

## Microbench Empty Session

- Warm wall: 24.437 -> 23.645 ms (-0.792 ms (-3.24%))
- Bridge calls/iteration: 4.000 -> 4.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.563 -> 6.282 ms (+0.719 ms (+12.93%))
- Warm Create->InjectGlobals: 4.000 -> 5.500 ms (+1.500 ms (+37.50%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.063 -> 0.782 ms (-0.281 ms (-26.43%))
- Bridge time/iteration: 10.340 -> 11.126 ms (+0.786 ms (+7.60%))
- BridgeResponse encoded bytes/iteration: 99926.333 -> 99926.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 24.437 -> 23.645 ms (-0.792 ms (-3.24%))
- Warm wall stddev: 0.450 -> 0.870 ms (+0.420 ms (+93.33%))
- Warm execute median: 18.874 -> 17.362 ms (-1.512 ms (-8.01%))
- Warm execute stddev: 0.366 -> 0.293 ms (-0.073 ms (-19.95%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 10.144 -> 10.960 ms/iteration (+0.816)
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.144 -> 10.960 ms (+0.816 ms (+8.04%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.367 -> 5.404 ms (+0.037 ms (+0.69%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.777 -> 5.556 ms (+0.779 ms (+16.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.777 -> 5.556 ms (+0.779 ms (+16.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.367 -> 5.404 ms (+0.037 ms (+0.69%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.367 -> 5.404 ms (+0.037 ms (+0.69%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.777 -> 5.556 ms (+0.779 ms (+16.31%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import stream

- Warm wall: 28.566 -> 29.101 ms (+0.535 ms (+1.87%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.982 -> 6.048 ms (+0.066 ms (+1.10%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.482 -> 0.548 ms (+0.066 ms (+13.69%))
- Bridge time/iteration: 18.063 -> 34.135 ms (+16.072 ms (+88.98%))
- BridgeResponse encoded bytes/iteration: 182531.000 -> 182531.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 28.566 -> 29.101 ms (+0.535 ms (+1.87%))
- Warm wall stddev: 0.788 -> 0.084 ms (-0.704 ms (-89.34%))
- Warm execute median: 22.584 -> 23.053 ms (+0.469 ms (+2.08%))
- Warm execute stddev: 0.117 -> 0.126 ms (+0.009 ms (+7.69%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 17.868 -> 33.939 ms/iteration (+16.071)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.868 -> 33.939 ms (+16.071 ms (+89.94%)); response bytes 182414.000 -> 182414.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.128 -> 18.300 ms (+11.172 ms (+156.73%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.563 -> 5.827 ms (+0.264 ms (+4.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.177 -> 9.813 ms (+4.636 ms (+89.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.128 -> 18.300 ms (+11.172 ms (+156.73%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.177 -> 9.813 ms (+4.636 ms (+89.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.563 -> 5.827 ms (+0.264 ms (+4.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.128 -> 18.300 ms (+11.172 ms (+156.73%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.563 -> 5.827 ms (+0.264 ms (+4.75%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.177 -> 9.813 ms (+4.636 ms (+89.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import stream/web

- Warm wall: 26.342 -> 27.473 ms (+1.131 ms (+4.29%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.653 -> 5.537 ms (-0.116 ms (-2.05%))
- Warm Create->InjectGlobals: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.653 -> 1.037 ms (+0.384 ms (+58.81%))
- Bridge time/iteration: 12.417 -> 13.109 ms (+0.692 ms (+5.57%))
- BridgeResponse encoded bytes/iteration: 157909.667 -> 157909.667 bytes (0.000 bytes (0.00%))
- Warm wall median: 26.342 -> 27.473 ms (+1.131 ms (+4.29%))
- Warm wall stddev: 1.184 -> 1.477 ms (+0.293 ms (+24.75%))
- Warm execute median: 20.689 -> 21.935 ms (+1.246 ms (+6.02%))
- Warm execute stddev: 0.750 -> 1.123 ms (+0.373 ms (+49.73%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 12.160 -> 12.940 ms/iteration (+0.780)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 12.160 -> 12.940 ms (+0.780 ms (+6.41%)); response bytes 157792.667 -> 157792.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.260 -> 6.279 ms (+0.019 ms (+0.30%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.900 -> 6.661 ms (+0.761 ms (+12.90%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.900 -> 6.661 ms (+0.761 ms (+12.90%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.260 -> 6.279 ms (+0.019 ms (+0.30%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.260 -> 6.279 ms (+0.019 ms (+0.30%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.900 -> 6.661 ms (+0.761 ms (+12.90%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import crypto

- Warm wall: 48.858 -> 48.968 ms (+0.110 ms (+0.23%))
- Bridge calls/iteration: 8.000 -> 8.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.345 -> 5.611 ms (-0.734 ms (-11.57%))
- Warm Create->InjectGlobals: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.345 -> 1.611 ms (+0.266 ms (+19.78%))
- Bridge time/iteration: 38.784 -> 61.618 ms (+22.834 ms (+58.88%))
- BridgeResponse encoded bytes/iteration: 512742.667 -> 512742.667 bytes (0.000 bytes (0.00%))
- Warm wall median: 48.858 -> 48.968 ms (+0.110 ms (+0.23%))
- Warm wall stddev: 0.852 -> 0.209 ms (-0.643 ms (-75.47%))
- Warm execute median: 42.514 -> 43.357 ms (+0.843 ms (+1.98%))
- Warm execute stddev: 0.304 -> 0.077 ms (-0.227 ms (-74.67%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 38.490 -> 61.396 ms/iteration (+22.906)
- _loadPolyfill real polyfill-body loads: calls 6.000 -> 6.000 calls (0.000 calls (0.00%)); time 38.490 -> 61.396 ms (+22.906 ms (+59.51%)); response bytes 512625.667 -> 512625.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.430 -> 28.645 ms (+13.215 ms (+85.64%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.356 -> 6.321 ms (-1.035 ms (-14.07%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.375 -> 6.952 ms (+1.577 ms (+29.34%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.789 -> 13.762 ms (+8.973 ms (+187.37%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.872 -> 5.010 ms (+0.138 ms (+2.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.430 -> 28.645 ms (+13.215 ms (+85.64%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.789 -> 13.762 ms (+8.973 ms (+187.37%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.375 -> 6.952 ms (+1.577 ms (+29.34%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.356 -> 6.321 ms (-1.035 ms (-14.07%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.872 -> 5.010 ms (+0.138 ms (+2.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.430 -> 28.645 ms (+13.215 ms (+85.64%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.356 -> 6.321 ms (-1.035 ms (-14.07%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.375 -> 6.952 ms (+1.577 ms (+29.34%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.789 -> 13.762 ms (+8.973 ms (+187.37%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.872 -> 5.010 ms (+0.138 ms (+2.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import zlib

- Warm wall: 31.642 -> 32.294 ms (+0.652 ms (+2.06%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.740 -> 5.720 ms (-0.020 ms (-0.35%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.740 -> 1.220 ms (+0.480 ms (+64.86%))
- Bridge time/iteration: 20.410 -> 22.325 ms (+1.915 ms (+9.38%))
- BridgeResponse encoded bytes/iteration: 257724.333 -> 257724.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 31.642 -> 32.294 ms (+0.652 ms (+2.06%))
- Warm wall stddev: 0.698 -> 0.481 ms (-0.217 ms (-31.09%))
- Warm execute median: 25.902 -> 26.573 ms (+0.671 ms (+2.59%))
- Warm execute stddev: 0.255 -> 0.100 ms (-0.155 ms (-60.78%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 20.224 -> 22.151 ms/iteration (+1.927)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 20.224 -> 22.151 ms (+1.927 ms (+9.53%)); response bytes 257607.333 -> 257607.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.758 -> 10.412 ms (+1.654 ms (+18.89%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.947 -> 5.489 ms (-0.458 ms (-7.70%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.519 -> 6.250 ms (+0.731 ms (+13.24%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.758 -> 10.412 ms (+1.654 ms (+18.89%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.519 -> 6.250 ms (+0.731 ms (+13.24%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.947 -> 5.489 ms (-0.458 ms (-7.70%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.758 -> 10.412 ms (+1.654 ms (+18.89%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.947 -> 5.489 ms (-0.458 ms (-7.70%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.519 -> 6.250 ms (+0.731 ms (+13.24%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import assert

- Warm wall: 28.986 -> 30.436 ms (+1.450 ms (+5.00%))
- Bridge calls/iteration: 5.000 -> 5.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.188 -> 5.758 ms (-0.430 ms (-6.95%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.688 -> 0.258 ms (-0.430 ms (-62.50%))
- Bridge time/iteration: 17.742 -> 27.349 ms (+9.607 ms (+54.15%))
- BridgeResponse encoded bytes/iteration: 156792.000 -> 156792.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 28.986 -> 30.436 ms (+1.450 ms (+5.00%))
- Warm wall stddev: 1.307 -> 2.367 ms (+1.060 ms (+81.10%))
- Warm execute median: 22.797 -> 24.678 ms (+1.881 ms (+8.25%))
- Warm execute stddev: 1.460 -> 2.431 ms (+0.971 ms (+66.51%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 17.547 -> 27.128 ms/iteration (+9.581)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.547 -> 27.128 ms (+9.581 ms (+54.60%)); response bytes 156675.000 -> 156675.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.245 -> 5.601 ms (+0.356 ms (+6.79%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.492 -> 14.316 ms (+6.824 ms (+91.08%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.810 -> 7.212 ms (+2.402 ms (+49.94%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.492 -> 14.316 ms (+6.824 ms (+91.08%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.810 -> 7.212 ms (+2.402 ms (+49.94%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.245 -> 5.601 ms (+0.356 ms (+6.79%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.245 -> 5.601 ms (+0.356 ms (+6.79%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.492 -> 14.316 ms (+6.824 ms (+91.08%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.810 -> 7.212 ms (+2.402 ms (+49.94%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import url

- Warm wall: 22.880 -> 22.849 ms (-0.031 ms (-0.14%))
- Bridge calls/iteration: 4.000 -> 4.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.468 -> 5.572 ms (+0.104 ms (+1.90%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 1.000 ms (+0.500 ms (+100.00%))
- Warm residual overhead: 0.468 -> -0.427 ms (-0.895 ms (-191.24%))
- Bridge time/iteration: 10.367 -> 11.028 ms (+0.661 ms (+6.38%))
- BridgeResponse encoded bytes/iteration: 99926.333 -> 99926.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 22.880 -> 22.849 ms (-0.031 ms (-0.14%))
- Warm wall stddev: 0.567 -> 0.239 ms (-0.328 ms (-57.85%))
- Warm execute median: 17.412 -> 17.277 ms (-0.135 ms (-0.78%))
- Warm execute stddev: 0.630 -> 0.413 ms (-0.217 ms (-34.44%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 10.195 -> 10.871 ms/iteration (+0.676)
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.195 -> 10.871 ms (+0.676 ms (+6.63%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.337 -> 5.504 ms (+0.167 ms (+3.13%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.858 -> 5.367 ms (+0.509 ms (+10.48%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.858 -> 5.367 ms (+0.509 ms (+10.48%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.337 -> 5.504 ms (+0.167 ms (+3.13%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.337 -> 5.504 ms (+0.167 ms (+3.13%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.858 -> 5.367 ms (+0.509 ms (+10.48%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Microbench Import @borewit/text-codec

- Warm wall: 27.478 -> 26.810 ms (-0.668 ms (-2.43%))
- Bridge calls/iteration: 7.000 -> 7.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.239 -> 6.086 ms (-0.153 ms (-2.45%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.239 -> 0.586 ms (-0.653 ms (-52.70%))
- Bridge time/iteration: 22.070 -> 21.708 ms (-0.362 ms (-1.64%))
- BridgeResponse encoded bytes/iteration: 102932.333 -> 102932.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 27.478 -> 26.810 ms (-0.668 ms (-2.43%))
- Warm wall stddev: 2.700 -> 0.215 ms (-2.485 ms (-92.04%))
- Warm execute median: 21.239 -> 20.724 ms (-0.515 ms (-2.42%))
- Warm execute stddev: 1.567 -> 0.442 ms (-1.125 ms (-71.79%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_bridgeDispatch` 11.719 -> 10.970 ms/iteration (-0.749)
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.299 -> 10.694 ms (+0.395 ms (+3.83%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.422 -> 5.806 ms (+0.384 ms (+7.08%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 4.888 ms (+0.010 ms (+0.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.422 -> 5.806 ms (+0.384 ms (+7.08%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 4.888 ms (+0.010 ms (+0.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.422 -> 5.806 ms (+0.384 ms (+7.08%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 4.888 ms (+0.010 ms (+0.20%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

## Hono Startup

- Warm wall: 36.428 -> 37.572 ms (+1.144 ms (+3.14%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.836 -> 5.554 ms (-0.282 ms (-4.83%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.836 -> 0.554 ms (-0.282 ms (-33.73%))
- Bridge time/iteration: 14.367 -> 14.989 ms (+0.622 ms (+4.33%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 36.428 -> 37.572 ms (+1.144 ms (+3.14%))
- Warm wall stddev: 0.248 -> 0.160 ms (-0.088 ms (-35.48%))
- Warm execute median: 30.592 -> 32.018 ms (+1.426 ms (+4.66%))
- Warm execute stddev: 0.627 -> 0.167 ms (-0.460 ms (-73.36%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 10.027 -> 10.746 ms/iteration (+0.719)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.027 -> 10.746 ms (+0.719 ms (+7.17%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.198 -> 5.709 ms (+0.511 ms (+9.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.767 -> 4.975 ms (+0.208 ms (+4.36%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.062 -> 0.062 ms (0.000 ms (0.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.198 -> 5.709 ms (+0.511 ms (+9.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.767 -> 4.975 ms (+0.208 ms (+4.36%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.062 -> 0.062 ms (0.000 ms (0.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.198 -> 5.709 ms (+0.511 ms (+9.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.767 -> 4.975 ms (+0.208 ms (+4.36%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.062 -> 0.062 ms (0.000 ms (0.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

## Hono End-to-End

- Warm wall: 38.255 -> 35.627 ms (-2.628 ms (-6.87%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.488 -> 5.762 ms (+0.274 ms (+4.99%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.487 -> 1.262 ms (+0.775 ms (+159.14%))
- Bridge time/iteration: 14.893 -> 16.245 ms (+1.352 ms (+9.08%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 38.255 -> 35.627 ms (-2.628 ms (-6.87%))
- Warm wall stddev: 2.135 -> 0.483 ms (-1.652 ms (-77.38%))
- Warm execute median: 32.767 -> 29.864 ms (-2.903 ms (-8.86%))
- Warm execute stddev: 2.190 -> 0.683 ms (-1.507 ms (-68.81%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 10.259 -> 11.972 ms/iteration (+1.713)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.259 -> 11.972 ms (+1.713 ms (+16.70%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.394 -> 5.808 ms (+0.414 ms (+7.67%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.813 -> 6.110 ms (+1.297 ms (+26.95%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.052 -> 0.054 ms (+0.002 ms (+3.85%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.813 -> 6.110 ms (+1.297 ms (+26.95%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.394 -> 5.808 ms (+0.414 ms (+7.67%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.052 -> 0.054 ms (+0.002 ms (+3.85%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.394 -> 5.808 ms (+0.414 ms (+7.67%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.813 -> 6.110 ms (+1.297 ms (+26.95%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `hono` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.052 -> 0.054 ms (+0.002 ms (+3.85%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

## pdf-lib Startup

- Warm wall: 122.178 -> 137.542 ms (+15.364 ms (+12.57%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.839 -> 6.181 ms (-0.658 ms (-9.62%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 1.340 -> 1.181 ms (-0.159 ms (-11.87%))
- Bridge time/iteration: 45.695 -> 61.392 ms (+15.697 ms (+34.35%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 122.178 -> 137.542 ms (+15.364 ms (+12.57%))
- Warm wall stddev: 3.680 -> 22.222 ms (+18.542 ms (+503.86%))
- Warm execute median: 115.339 -> 131.361 ms (+16.022 ms (+13.89%))
- Warm execute stddev: 3.807 -> 21.447 ms (+17.640 ms (+463.36%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_bridgeDispatch` 34.338 -> 51.118 ms/iteration (+16.780)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 11.267 -> 10.132 ms (-1.135 ms (-10.07%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.976 -> 5.399 ms (-0.577 ms (-9.65%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.153 -> 4.580 ms (-0.573 ms (-11.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.039 -> 0.025 ms (-0.014 ms (-35.90%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.976 -> 5.399 ms (-0.577 ms (-9.65%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.153 -> 4.580 ms (-0.573 ms (-11.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.039 -> 0.025 ms (-0.014 ms (-35.90%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.976 -> 5.399 ms (-0.577 ms (-9.65%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.153 -> 4.580 ms (-0.573 ms (-11.12%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.016 -> 0.032 ms (+0.016 ms (+100.00%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `tslib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.039 -> 0.025 ms (-0.014 ms (-35.90%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

## pdf-lib End-to-End

- Warm wall: 179.726 -> 256.817 ms (+77.091 ms (+42.89%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.691 -> 7.571 ms (+0.880 ms (+13.15%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.190 -> 2.071 ms (+0.881 ms (+74.03%))
- Bridge time/iteration: 44.157 -> 58.561 ms (+14.404 ms (+32.62%))
- BridgeResponse encoded bytes/iteration: 653208.000 -> 653208.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 179.726 -> 256.817 ms (+77.091 ms (+42.89%))
- Warm wall stddev: 5.803 -> 71.190 ms (+65.387 ms (+1126.78%))
- Warm execute median: 173.036 -> 249.246 ms (+76.210 ms (+44.04%))
- Warm execute stddev: 5.166 -> 70.843 ms (+65.677 ms (+1271.33%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_bridgeDispatch` 33.189 -> 47.334 ms/iteration (+14.145)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.908 -> 11.109 ms (+0.201 ms (+1.84%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.699 -> 5.917 ms (+0.218 ms (+3.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.086 -> 5.054 ms (-0.032 ms (-0.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.026 -> 0.035 ms (+0.009 ms (+34.62%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.024 -> 0.029 ms (+0.005 ms (+20.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.699 -> 5.917 ms (+0.218 ms (+3.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.086 -> 5.054 ms (-0.032 ms (-0.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.026 -> 0.035 ms (+0.009 ms (+34.62%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.024 -> 0.029 ms (+0.005 ms (+20.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.699 -> 5.917 ms (+0.218 ms (+3.83%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.086 -> 5.054 ms (-0.032 ms (-0.63%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/upng` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.026 -> 0.035 ms (+0.009 ms (+34.62%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `pako` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.017 -> 0.024 ms (+0.007 ms (+41.18%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `@pdf-lib/standard-fonts` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.024 -> 0.029 ms (+0.005 ms (+20.83%)) | 50.000 -> 50.000 bytes (0.000 bytes (0.00%)) |

## JSZip Startup

- Warm wall: 68.439 -> 79.511 ms (+11.072 ms (+16.18%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.226 -> 6.397 ms (+0.171 ms (+2.75%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.226 -> 0.897 ms (-0.329 ms (-26.84%))
- Bridge time/iteration: 38.055 -> 64.362 ms (+26.307 ms (+69.13%))
- BridgeResponse encoded bytes/iteration: 410655.667 -> 410655.667 bytes (0.000 bytes (0.00%))
- Warm wall median: 68.439 -> 79.511 ms (+11.072 ms (+16.18%))
- Warm wall stddev: 2.085 -> 1.855 ms (-0.230 ms (-11.03%))
- Warm execute median: 62.213 -> 73.114 ms (+10.901 ms (+17.52%))
- Warm execute stddev: 1.430 -> 2.101 ms (+0.671 ms (+46.92%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 25.936 -> 45.911 ms/iteration (+19.975)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 25.936 -> 45.911 ms (+19.975 ms (+77.02%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.692 -> 16.926 ms (+10.234 ms (+152.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.880 -> 6.059 ms (+0.179 ms (+3.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.924 -> 7.230 ms (+2.306 ms (+46.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 10.878 ms (+6.000 ms (+123.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.525 -> 2.008 ms (+0.483 ms (+31.67%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.692 -> 16.926 ms (+10.234 ms (+152.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 10.878 ms (+6.000 ms (+123.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.924 -> 7.230 ms (+2.306 ms (+46.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `internal/mime` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 0.630 -> 1.555 ms (+0.925 ms (+146.82%)) | 2071.000 -> 2071.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.525 -> 2.008 ms (+0.483 ms (+31.67%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.692 -> 16.926 ms (+10.234 ms (+152.93%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.880 -> 6.059 ms (+0.179 ms (+3.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.924 -> 7.230 ms (+2.306 ms (+46.83%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.878 -> 10.878 ms (+6.000 ms (+123.00%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.525 -> 2.008 ms (+0.483 ms (+31.67%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

## JSZip End-to-End

- Warm wall: 78.700 -> 78.596 ms (-0.104 ms (-0.13%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.538 -> 6.018 ms (-0.520 ms (-7.95%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.038 -> 1.518 ms (+0.480 ms (+46.24%))
- Bridge time/iteration: 40.086 -> 90.447 ms (+50.361 ms (+125.63%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- Warm wall median: 78.700 -> 78.596 ms (-0.104 ms (-0.13%))
- Warm wall stddev: 3.253 -> 0.395 ms (-2.858 ms (-87.86%))
- Warm execute median: 72.162 -> 72.577 ms (+0.415 ms (+0.57%))
- Warm execute stddev: 3.575 -> 0.303 ms (-3.272 ms (-91.52%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_loadPolyfill` 27.796 -> 70.852 ms/iteration (+43.056)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 27.796 -> 70.852 ms (+43.056 ms (+154.90%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.436 -> 24.097 ms (+16.661 ms (+224.06%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.215 -> 8.221 ms (+2.006 ms (+32.28%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.223 -> 15.285 ms (+10.062 ms (+192.65%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.991 -> 15.164 ms (+10.173 ms (+203.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.650 -> 3.843 ms (+2.193 ms (+132.91%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.436 -> 24.097 ms (+16.661 ms (+224.06%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.991 -> 15.164 ms (+10.173 ms (+203.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.223 -> 15.285 ms (+10.062 ms (+192.65%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.650 -> 3.843 ms (+2.193 ms (+132.91%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.215 -> 8.221 ms (+2.006 ms (+32.28%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.436 -> 24.097 ms (+16.661 ms (+224.06%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.215 -> 8.221 ms (+2.006 ms (+32.28%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.223 -> 15.285 ms (+10.062 ms (+192.65%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `util` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.991 -> 15.164 ms (+10.173 ms (+203.83%)) | 27772.000 -> 27772.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `buffer` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 1.650 -> 3.843 ms (+2.193 ms (+132.91%)) | 16810.667 -> 16810.667 bytes (0.000 bytes (0.00%)) |

## Pi SDK Startup

- Warm wall: 886.870 -> 1722.213 ms (+835.343 ms (+94.19%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 8.576 -> 10.099 ms (+1.523 ms (+17.76%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.577 -> 4.099 ms (+1.522 ms (+59.06%))
- Bridge time/iteration: 478.099 -> 955.050 ms (+476.951 ms (+99.76%))
- BridgeResponse encoded bytes/iteration: 3309659.000 -> 3309659.000 bytes (0.000 bytes (0.00%))
- Warm wall median: 886.870 -> 1722.213 ms (+835.343 ms (+94.19%))
- Warm wall stddev: 0.229 -> 27.424 ms (+27.195 ms (+11875.55%))
- Warm execute median: 878.293 -> 1712.114 ms (+833.821 ms (+94.94%))
- Warm execute stddev: 0.162 -> 29.321 ms (+29.159 ms (+17999.38%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_bridgeDispatch` 429.228 -> 873.951 ms/iteration (+444.723)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 48.003 -> 79.847 ms (+31.844 ms (+66.34%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.181 -> 6.554 ms (+0.373 ms (+6.04%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.880 -> 39.446 ms (+24.566 ms (+165.09%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.647 -> 7.866 ms (+0.219 ms (+2.86%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.811 -> 7.442 ms (+0.631 ms (+9.26%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.055 -> 6.295 ms (+0.240 ms (+3.96%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.880 -> 39.446 ms (+24.566 ms (+165.09%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.944 -> 9.921 ms (+4.977 ms (+100.67%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.811 -> 7.442 ms (+0.631 ms (+9.26%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.181 -> 6.554 ms (+0.373 ms (+6.04%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.055 -> 6.295 ms (+0.240 ms (+3.96%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.880 -> 39.446 ms (+24.566 ms (+165.09%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.647 -> 7.866 ms (+0.219 ms (+2.86%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.181 -> 6.554 ms (+0.373 ms (+6.04%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.811 -> 7.442 ms (+0.631 ms (+9.26%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.055 -> 6.295 ms (+0.240 ms (+3.96%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

## Pi SDK End-to-End

- Warm wall: 1018.723 -> 1705.717 ms (+686.994 ms (+67.44%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.188 -> 9.460 ms (+0.272 ms (+2.96%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.188 -> 3.460 ms (+0.272 ms (+8.53%))
- Bridge time/iteration: 540.002 -> 941.137 ms (+401.135 ms (+74.28%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 1018.723 -> 1705.717 ms (+686.994 ms (+67.44%))
- Warm wall stddev: 35.143 -> 68.281 ms (+33.138 ms (+94.30%))
- Warm execute median: 1009.535 -> 1696.257 ms (+686.722 ms (+68.02%))
- Warm execute stddev: 35.310 -> 68.702 ms (+33.392 ms (+94.57%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_bridgeDispatch` 452.775 -> 825.558 ms/iteration (+372.783)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 51.011 -> 74.665 ms (+23.654 ms (+46.37%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.004 -> 5.875 ms (-0.129 ms (-2.15%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.614 -> 34.284 ms (+18.670 ms (+119.57%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.729 -> 10.569 ms (+0.840 ms (+8.63%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.203 -> 6.071 ms (-0.132 ms (-2.13%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.048 -> 7.673 ms (+0.625 ms (+8.87%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.614 -> 34.284 ms (+18.670 ms (+119.57%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.054 -> 8.041 ms (+2.987 ms (+59.10%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.729 -> 10.569 ms (+0.840 ms (+8.63%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.048 -> 7.673 ms (+0.625 ms (+8.87%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.203 -> 6.071 ms (-0.132 ms (-2.13%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.614 -> 34.284 ms (+18.670 ms (+119.57%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.729 -> 10.569 ms (+0.840 ms (+8.63%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.004 -> 5.875 ms (-0.129 ms (-2.15%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.203 -> 6.071 ms (-0.132 ms (-2.13%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.048 -> 7.673 ms (+0.625 ms (+8.87%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

## Pi CLI Startup

- Warm wall: 953.642 -> 1644.750 ms (+691.108 ms (+72.47%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.565 -> 9.242 ms (-0.323 ms (-3.38%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 4.065 -> 3.742 ms (-0.323 ms (-7.95%))
- Bridge time/iteration: 518.205 -> 958.764 ms (+440.559 ms (+85.02%))
- BridgeResponse encoded bytes/iteration: 3312400.333 -> 3312400.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 953.642 -> 1644.750 ms (+691.108 ms (+72.47%))
- Warm wall stddev: 20.166 -> 75.632 ms (+55.466 ms (+275.05%))
- Warm execute median: 944.077 -> 1635.508 ms (+691.431 ms (+73.24%))
- Warm execute stddev: 20.782 -> 76.415 ms (+55.633 ms (+267.70%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_bridgeDispatch` 417.974 -> 791.547 ms/iteration (+373.573)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 48.828 -> 102.751 ms (+53.923 ms (+110.44%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.230 -> 7.721 ms (+1.491 ms (+23.93%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.743 -> 40.788 ms (+26.045 ms (+176.66%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.606 -> 17.460 ms (+8.854 ms (+102.88%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.671 -> 10.713 ms (+4.042 ms (+60.59%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.075 -> 18.939 ms (+12.864 ms (+211.75%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.743 -> 40.788 ms (+26.045 ms (+176.66%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.075 -> 18.939 ms (+12.864 ms (+211.75%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.606 -> 17.460 ms (+8.854 ms (+102.88%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.671 -> 10.713 ms (+4.042 ms (+60.59%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.230 -> 7.721 ms (+1.491 ms (+23.93%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 14.743 -> 40.788 ms (+26.045 ms (+176.66%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.606 -> 17.460 ms (+8.854 ms (+102.88%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 6.230 -> 7.721 ms (+1.491 ms (+23.93%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.671 -> 10.713 ms (+4.042 ms (+60.59%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.075 -> 18.939 ms (+12.864 ms (+211.75%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

## Pi CLI End-to-End

- Warm wall: 1040.085 -> 1893.622 ms (+853.537 ms (+82.06%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.563 -> 9.846 ms (+0.283 ms (+2.96%))
- Warm Create->InjectGlobals: 5.500 -> 6.000 ms (+0.500 ms (+9.09%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 3.563 -> 3.346 ms (-0.217 ms (-6.09%))
- Bridge time/iteration: 547.754 -> 1024.592 ms (+476.838 ms (+87.05%))
- BridgeResponse encoded bytes/iteration: 3449857.333 -> 3449857.333 bytes (0.000 bytes (0.00%))
- Warm wall median: 1040.085 -> 1893.622 ms (+853.537 ms (+82.06%))
- Warm wall stddev: 7.852 -> 4.081 ms (-3.771 ms (-48.03%))
- Warm execute median: 1030.522 -> 1883.776 ms (+853.254 ms (+82.80%))
- Warm execute stddev: 8.798 -> 3.933 ms (-4.865 ms (-55.30%))
- Peak RSS: -
- Peak heap used: -
- Peak heap / limit: -
- Host CPU user: -
- Host CPU system: -
- Host CPU total: -
- Largest method-time delta: `_bridgeDispatch` 439.532 -> 874.243 ms/iteration (+434.711)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 50.042 -> 63.431 ms (+13.389 ms (+26.76%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.753 -> 5.633 ms (-0.120 ms (-2.09%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.429 -> 27.191 ms (+11.762 ms (+76.23%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.743 -> 9.039 ms (+1.296 ms (+16.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.822 -> 5.981 ms (-0.841 ms (-12.33%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.157 -> 8.260 ms (+0.103 ms (+1.26%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.429 -> 27.191 ms (+11.762 ms (+76.23%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.743 -> 9.039 ms (+1.296 ms (+16.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.822 -> 5.981 ms (-0.841 ms (-12.33%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.670 -> 4.910 ms (+0.240 ms (+5.14%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.753 -> 5.633 ms (-0.120 ms (-2.09%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 15.429 -> 27.191 ms (+11.762 ms (+76.23%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 7.743 -> 9.039 ms (+1.296 ms (+16.74%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.753 -> 5.633 ms (-0.120 ms (-2.09%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.822 -> 5.981 ms (-0.841 ms (-12.33%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.157 -> 8.260 ms (+0.103 ms (+1.26%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

## Transport RTT

- Connect RTT: 0.203 -> 0.310 ms (+0.107 ms (+52.71%))
- 1 B mean RTT: 0.019 -> 0.038 ms (+0.019 ms (+100.00%))
- 1 B P95 RTT: 0.030 -> 0.047 ms (+0.017 ms (+56.67%))
- 1 KB mean RTT: 0.015 -> 0.020 ms (+0.005 ms (+33.33%))
- 1 KB P95 RTT: 0.018 -> 0.021 ms (+0.003 ms (+16.67%))
- 64 KB mean RTT: 0.115 -> 0.136 ms (+0.021 ms (+18.26%))
- 64 KB P95 RTT: 0.123 -> 0.214 ms (+0.091 ms (+73.98%))

