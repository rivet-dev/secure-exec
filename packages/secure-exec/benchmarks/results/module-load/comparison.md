# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T21:03:06.214Z (ba7f25d50dd615ef19498cc1d435e1b29a4bb665)
Baseline benchmark: 2026-03-31T20:29:57.618Z (d22ee524f26e5a40e09ee48800a38942524b5239)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 37.787 -> 33.412 ms (-4.375 ms (-11.58%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.579 -> 5.440 ms (-0.139 ms (-2.49%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.579 -> 0.440 ms (-0.139 ms (-24.01%))
- Bridge time/iteration: 18.062 -> 14.571 ms (-3.491 ms (-19.33%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 12.742 -> 10.399 ms/iteration (-2.343)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 12.742 -> 10.399 ms (-2.343 ms (-18.39%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Hono End-to-End

- Warm wall: 43.049 -> 35.979 ms (-7.070 ms (-16.42%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.241 -> 5.543 ms (-0.698 ms (-11.18%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.741 -> 0.543 ms (-0.198 ms (-26.72%))
- Bridge time/iteration: 15.560 -> 23.407 ms (+7.847 ms (+50.43%))
- BridgeResponse encoded bytes/iteration: 140415.000 -> 140415.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 10.391 -> 17.284 ms/iteration (+6.893)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.391 -> 17.284 ms (+6.893 ms (+66.34%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## pdf-lib Startup

- Warm wall: 132.760 -> 230.975 ms (+98.215 ms (+73.98%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.157 -> 7.713 ms (+0.556 ms (+7.77%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 2.158 -> 1.712 ms (-0.446 ms (-20.67%))
- Bridge time/iteration: 74.141 -> 75.494 ms (+1.353 ms (+1.82%))
- BridgeResponse encoded bytes/iteration: 652213.000 -> 652213.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 10.406 -> 12.926 ms/iteration (+2.520)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.406 -> 12.926 ms (+2.520 ms (+24.22%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## pdf-lib End-to-End

- Warm wall: 297.079 -> 297.079 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 7.191 -> 7.191 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.691 -> 2.691 ms (0.000 ms (0.00%))
- Bridge time/iteration: 70.245 -> 70.245 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 653208.000 -> 653208.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 9.867 -> 9.867 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## JSZip Startup

- Warm wall: 72.290 -> 68.886 ms (-3.404 ms (-4.71%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.176 -> 6.290 ms (+0.114 ms (+1.85%))
- Warm Create->InjectGlobals: 5.500 -> 4.500 ms (-1.000 ms (-18.18%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.676 -> 1.290 ms (+0.614 ms (+90.83%))
- Bridge time/iteration: 51.564 -> 52.825 ms (+1.261 ms (+2.45%))
- BridgeResponse encoded bytes/iteration: 410655.667 -> 410655.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 13.376 -> 15.169 ms/iteration (+1.793)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 38.119 -> 37.582 ms (-0.537 ms (-1.41%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## JSZip End-to-End

- Warm wall: 77.776 -> 79.804 ms (+2.028 ms (+2.61%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 6.130 -> 6.676 ms (+0.546 ms (+8.91%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.630 -> 1.175 ms (+0.545 ms (+86.51%))
- Bridge time/iteration: 65.932 -> 46.383 ms (-19.549 ms (-29.65%))
- BridgeResponse encoded bytes/iteration: 410854.667 -> 410854.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 43.727 -> 33.071 ms/iteration (-10.656)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 43.727 -> 33.071 ms (-10.656 ms (-24.37%)); response bytes 233610.000 -> 233610.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi SDK Startup

- Warm wall: 1422.383 -> 1665.403 ms (+243.020 ms (+17.09%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.264 -> 12.056 ms (+2.792 ms (+30.14%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.263 -> 6.056 ms (+2.793 ms (+85.60%))
- Bridge time/iteration: 884.867 -> 854.598 ms (-30.269 ms (-3.42%))
- BridgeResponse encoded bytes/iteration: 3309659.000 -> 3309659.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 822.419 -> 779.699 ms/iteration (-42.720)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 60.800 -> 74.071 ms (+13.271 ms (+21.83%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi SDK End-to-End

- Warm wall: 1823.659 -> 1695.689 ms (-127.970 ms (-7.02%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 12.578 -> 9.169 ms (-3.409 ms (-27.10%))
- Warm Create->InjectGlobals: 6.500 -> 5.500 ms (-1.000 ms (-15.38%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 5.578 -> 3.669 ms (-1.909 ms (-34.22%))
- Bridge time/iteration: 925.536 -> 943.233 ms (+17.697 ms (+1.91%))
- BridgeResponse encoded bytes/iteration: 3444124.333 -> 3444124.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 816.475 -> 838.520 ms/iteration (+22.045)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 66.774 -> 65.055 ms (-1.719 ms (-2.57%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi CLI Startup

- Warm wall: 1470.153 -> 1367.156 ms (-102.997 ms (-7.01%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.412 -> 9.168 ms (-0.244 ms (-2.59%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.912 -> 3.668 ms (-0.244 ms (-6.24%))
- Bridge time/iteration: 767.271 -> 846.662 ms (+79.391 ms (+10.35%))
- BridgeResponse encoded bytes/iteration: 3312400.333 -> 3312400.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_bridgeDispatch` 640.133 -> 716.479 ms/iteration (+76.346)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 70.042 -> 63.722 ms (-6.320 ms (-9.02%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi CLI End-to-End

- Warm wall: 1049.009 -> 1754.015 ms (+705.006 ms (+67.21%))
- Bridge calls/iteration: 2772.000 -> 2772.333 calls (+0.333 calls (+0.01%))
- Warm fixed overhead: 9.409 -> 13.227 ms (+3.818 ms (+40.58%))
- Warm Create->InjectGlobals: 6.000 -> 6.500 ms (+0.500 ms (+8.33%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 3.409 -> 6.226 ms (+2.817 ms (+82.63%))
- Bridge time/iteration: 553.958 -> 971.184 ms (+417.226 ms (+75.32%))
- BridgeResponse encoded bytes/iteration: 3449856.000 -> 3449878.667 bytes (+22.667 bytes (+0.00%))
- Largest method-time delta: `_bridgeDispatch` 440.689 -> 823.737 ms/iteration (+383.048)
- Largest method-byte delta: `_bridgeDispatch` 2679096.667 -> 2679118.667 encoded bytes/iteration (+22.000)
- Largest frame-byte delta: `recv:DestroySessionResult` 0.000 -> 39.000 encoded bytes/iteration (+39.000)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 51.942 -> 80.413 ms (+28.471 ms (+54.81%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Transport RTT

- Connect RTT: 0.177 -> 0.220 ms (+0.043 ms (+24.29%))
- 1 B mean RTT: 0.049 -> 0.048 ms (-0.001 ms (-2.04%))
- 1 B P95 RTT: 0.061 -> 0.059 ms (-0.002 ms (-3.28%))
- 1 KB mean RTT: 0.038 -> 0.023 ms (-0.015 ms (-39.47%))
- 1 KB P95 RTT: 0.052 -> 0.028 ms (-0.024 ms (-46.15%))
- 64 KB mean RTT: 0.118 -> 0.126 ms (+0.008 ms (+6.78%))
- 64 KB P95 RTT: 0.133 -> 0.158 ms (+0.025 ms (+18.80%))

