# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T22:18:09.989Z (1f83e05069161dac59c983520397001abceb978b)
Baseline benchmark: 2026-03-31T21:03:06.214Z (ba7f25d50dd615ef19498cc1d435e1b29a4bb665)
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

Copy the primary sandbox new-session replay warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch. Use the per-scenario `summary.md` Benchmark Modes section for true cold start, same-session replay, snapshot-off replay, and host-control numbers.

## Hono Startup

- Warm wall: 33.412 -> 36.227 ms (+2.815 ms (+8.43%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.440 -> 5.636 ms (+0.196 ms (+3.60%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.440 -> 0.637 ms (+0.197 ms (+44.77%))
- Bridge time/iteration: 14.571 -> 20.267 ms (+5.696 ms (+39.09%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 4.110 -> 7.084 ms/iteration (+2.974)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.399 -> 13.067 ms (+2.668 ms (+25.66%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Hono End-to-End

- Warm wall: 35.979 -> 37.440 ms (+1.461 ms (+4.06%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.543 -> 5.484 ms (-0.059 ms (-1.06%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.543 -> 0.984 ms (+0.441 ms (+81.22%))
- Bridge time/iteration: 23.407 -> 17.473 ms (-5.934 ms (-25.35%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 17.284 -> 11.844 ms/iteration (-5.440)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 17.284 -> 11.844 ms (-5.440 ms (-31.47%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## pdf-lib Startup

- Warm wall: 230.975 -> 117.555 ms (-113.420 ms (-49.10%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.713 -> 6.139 ms (-1.574 ms (-20.41%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.712 -> 1.139 ms (-0.573 ms (-33.47%))
- Bridge time/iteration: 75.494 -> 64.699 ms (-10.795 ms (-14.30%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 62.437 -> 52.767 ms/iteration (-9.670)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 12.926 -> 11.829 ms (-1.097 ms (-8.49%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## pdf-lib End-to-End

- Warm wall: 297.079 -> 254.933 ms (-42.146 ms (-14.19%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.191 -> 7.121 ms (-0.070 ms (-0.97%))
- Warm Create->InjectGlobals: 4.500 -> 5.500 ms (+1.000 ms (+22.22%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 2.691 -> 1.121 ms (-1.570 ms (-58.34%))
- Bridge time/iteration: 70.245 -> 60.865 ms (-9.380 ms (-13.35%))
- BridgeResponse encoded bytes/iteration: 653208.000 -> 653208.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 60.207 -> 50.310 ms/iteration (-9.897)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 9.867 -> 10.482 ms (+0.615 ms (+6.23%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## JSZip Startup

- Warm wall: 68.886 -> 111.213 ms (+42.327 ms (+61.45%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.290 -> 6.728 ms (+0.438 ms (+6.96%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 1.290 -> 1.728 ms (+0.438 ms (+33.95%))
- Bridge time/iteration: 52.825 -> 58.953 ms (+6.128 ms (+11.60%))
- BridgeResponse encoded bytes/iteration: 410655.667 -> 410655.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 15.169 -> 21.145 ms/iteration (+5.976)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 37.582 -> 37.737 ms (+0.155 ms (+0.41%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## JSZip End-to-End

- Warm wall: 79.804 -> 93.152 ms (+13.348 ms (+16.73%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.676 -> 6.330 ms (-0.346 ms (-5.18%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 1.175 -> 0.830 ms (-0.345 ms (-29.36%))
- Bridge time/iteration: 46.383 -> 70.898 ms (+24.515 ms (+52.85%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 33.071 -> 50.391 ms/iteration (+17.320)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 33.071 -> 50.391 ms (+17.320 ms (+52.37%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi SDK Startup

- Warm wall: 1665.403 -> 1628.007 ms (-37.396 ms (-2.25%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 12.056 -> 9.200 ms (-2.856 ms (-23.69%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 6.056 -> 2.700 ms (-3.356 ms (-55.42%))
- Bridge time/iteration: 854.598 -> 895.979 ms (+41.381 ms (+4.84%))
- BridgeResponse encoded bytes/iteration: 3309659.000 -> 3309659.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 779.699 -> 832.555 ms/iteration (+52.856)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 74.071 -> 62.592 ms (-11.479 ms (-15.50%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi SDK End-to-End

- Warm wall: 1695.689 -> 1720.678 ms (+24.989 ms (+1.47%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.169 -> 11.187 ms (+2.018 ms (+22.01%))
- Warm Create->InjectGlobals: 5.500 -> 6.500 ms (+1.000 ms (+18.18%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 3.669 -> 3.687 ms (+0.018 ms (+0.49%))
- Bridge time/iteration: 943.233 -> 930.537 ms (-12.696 ms (-1.35%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 838.520 -> 824.004 ms/iteration (-14.516)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 65.055 -> 63.677 ms (-1.378 ms (-2.12%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi CLI Startup

- Warm wall: 1367.156 -> 1595.248 ms (+228.092 ms (+16.68%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.168 -> 9.021 ms (-0.147 ms (-1.60%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 3.668 -> 3.021 ms (-0.647 ms (-17.64%))
- Bridge time/iteration: 846.662 -> 1010.687 ms (+164.025 ms (+19.37%))
- BridgeResponse encoded bytes/iteration: 3312400.333 -> 3312401.000 bytes (+0.667 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 716.479 -> 851.606 ms/iteration (+135.127)
- Largest method-byte delta: `_fsStat` 206.333 -> 207.000 encoded bytes/iteration (+0.667)
- Largest frame-byte delta: `send:BridgeResponse` 3312400.333 -> 3312401.000 encoded bytes/iteration (+0.667)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 63.722 -> 77.475 ms (+13.753 ms (+21.58%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi CLI End-to-End

- Warm wall: 1754.015 -> 1548.452 ms (-205.563 ms (-11.72%))
- Bridge calls/iteration: 2772.333 -> 2772.000 calls (-0.333 calls (-0.01%))
- Warm fixed overhead: 13.227 -> 13.201 ms (-0.026 ms (-0.20%))
- Warm Create->InjectGlobals: 6.500 -> 5.500 ms (-1.000 ms (-15.38%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 6.226 -> 7.202 ms (+0.976 ms (+15.68%))
- Bridge time/iteration: 971.184 -> 890.790 ms (-80.394 ms (-8.28%))
- BridgeResponse encoded bytes/iteration: 3449878.667 -> 3449856.000 bytes (-22.667 bytes (-0.00%))
- Largest method-time delta: `_bridgeDispatch` 823.737 -> 725.989 ms/iteration (-97.748)
- Largest method-byte delta: `_bridgeDispatch` 2679118.667 -> 2679096.667 encoded bytes/iteration (-22.000)
- Largest frame-byte delta: `recv:BridgeCall` 576242.667 -> 576212.000 encoded bytes/iteration (-30.667)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 80.413 -> 87.478 ms (+7.065 ms (+8.79%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Transport RTT

- Connect RTT: 0.220 -> 0.196 ms (-0.024 ms (-10.91%))
- 1 B mean RTT: 0.048 -> 0.024 ms (-0.024 ms (-50.00%))
- 1 B P95 RTT: 0.059 -> 0.041 ms (-0.018 ms (-30.51%))
- 1 KB mean RTT: 0.023 -> 0.018 ms (-0.005 ms (-21.74%))
- 1 KB P95 RTT: 0.028 -> 0.023 ms (-0.005 ms (-17.86%))
- 64 KB mean RTT: 0.126 -> 0.131 ms (+0.005 ms (+3.97%))
- 64 KB P95 RTT: 0.158 -> 0.176 ms (+0.018 ms (+11.39%))

