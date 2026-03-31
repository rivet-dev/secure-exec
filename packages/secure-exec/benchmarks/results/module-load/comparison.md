# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T20:29:57.618Z (d22ee524f26e5a40e09ee48800a38942524b5239)
Baseline benchmark: 2026-03-31T20:10:29.899Z (834a057fb04ac9b702b78c7d40d5bdfa3558dc0e)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 140.959 -> 37.787 ms (-103.172 ms (-73.19%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.115 -> 5.579 ms (-103.536 ms (-94.89%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 0.000 ms (-102.500 ms (-100.00%))
- Warm residual overhead: 1.615 -> 0.579 ms (-1.036 ms (-64.15%))
- Bridge time/iteration: 38.499 -> 18.062 ms (-20.437 ms (-53.08%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 140415.000 bytes (-3456.000 bytes (-2.40%))
- Largest method-time delta: `_loadPolyfill` 38.364 -> 12.742 ms/iteration (-25.622)
- Largest method-byte delta: `_loadPolyfill` 143824.000 -> 99859.333 encoded bytes/iteration (-43964.667)
- Largest frame-byte delta: `send:BridgeResponse` 143871.000 -> 140415.000 encoded bytes/iteration (-3456.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 29.585 -> 12.742 ms (-16.843 ms (-56.93%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 0.000 calls (-55.000 calls (-100.00%)); time 8.779 -> 0.000 ms (-8.779 ms (-100.00%)); response bytes 43964.667 -> 0.000 bytes (-43964.667 bytes (-100.00%))

## Hono End-to-End

- Warm wall: 139.728 -> 43.049 ms (-96.679 ms (-69.19%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.456 -> 6.241 ms (-103.215 ms (-94.30%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 0.000 ms (-102.500 ms (-100.00%))
- Warm residual overhead: 1.456 -> 0.741 ms (-0.715 ms (-49.11%))
- Bridge time/iteration: 17.021 -> 15.560 ms (-1.461 ms (-8.58%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 140415.000 bytes (-3456.000 bytes (-2.40%))
- Largest method-time delta: `_loadPolyfill` 16.919 -> 10.391 ms/iteration (-6.528)
- Largest method-byte delta: `_loadPolyfill` 143824.000 -> 99859.333 encoded bytes/iteration (-43964.667)
- Largest frame-byte delta: `send:BridgeResponse` 143871.000 -> 140415.000 encoded bytes/iteration (-3456.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.759 -> 10.391 ms (-0.368 ms (-3.42%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 0.000 calls (-55.000 calls (-100.00%)); time 6.160 -> 0.000 ms (-6.160 ms (-100.00%)); response bytes 43964.667 -> 0.000 bytes (-43964.667 bytes (-100.00%))

## pdf-lib Startup

- Warm wall: 353.377 -> 132.760 ms (-220.617 ms (-62.43%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.105 -> 7.157 ms (-102.948 ms (-93.50%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 103.000 -> 0.000 ms (-103.000 ms (-100.00%))
- Warm residual overhead: 2.104 -> 2.158 ms (+0.054 ms (+2.57%))
- Bridge time/iteration: 80.914 -> 74.141 ms (-6.773 ms (-8.37%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 652213.000 bytes (-29915.000 bytes (-4.39%))
- Largest method-time delta: `_loadPolyfill` 80.806 -> 10.406 ms/iteration (-70.400)
- Largest method-byte delta: `_loadPolyfill` 682081.000 -> 100059.333 encoded bytes/iteration (-582021.667)
- Largest frame-byte delta: `send:BridgeResponse` 682128.000 -> 652213.000 encoded bytes/iteration (-29915.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 13.470 -> 10.406 ms (-3.064 ms (-22.75%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 0.000 calls (-506.000 calls (-100.00%)); time 67.336 -> 0.000 ms (-67.336 ms (-100.00%)); response bytes 582021.667 -> 0.000 bytes (-582021.667 bytes (-100.00%))

## pdf-lib End-to-End

- Warm wall: 362.870 -> 297.079 ms (-65.791 ms (-18.13%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.424 -> 7.191 ms (-104.233 ms (-93.55%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 0.000 ms (-102.500 ms (-100.00%))
- Warm residual overhead: 3.924 -> 2.691 ms (-1.233 ms (-31.42%))
- Bridge time/iteration: 59.917 -> 70.245 ms (+10.328 ms (+17.24%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 653208.000 bytes (-29790.000 bytes (-4.36%))
- Largest method-time delta: `_bridgeDispatch` 0.000 -> 60.207 ms/iteration (+60.207)
- Largest method-byte delta: `_loadPolyfill` 682951.000 -> 100059.333 encoded bytes/iteration (-582891.667)
- Largest frame-byte delta: `send:BridgeResponse` 682998.000 -> 653208.000 encoded bytes/iteration (-29790.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.038 -> 9.867 ms (-0.171 ms (-1.70%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 0.000 calls (-521.000 calls (-100.00%)); time 49.754 -> 0.000 ms (-49.754 ms (-100.00%)); response bytes 582891.667 -> 0.000 bytes (-582891.667 bytes (-100.00%))

## JSZip Startup

- Warm wall: 169.488 -> 72.290 ms (-97.198 ms (-57.35%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.156 -> 6.176 ms (-102.980 ms (-94.34%))
- Warm Create->InjectGlobals: 4.500 -> 5.500 ms (+1.000 ms (+22.22%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 0.000 ms (-101.500 ms (-100.00%))
- Warm residual overhead: 2.656 -> 0.676 ms (-1.980 ms (-74.55%))
- Bridge time/iteration: 53.999 -> 51.564 ms (-2.435 ms (-4.51%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 410655.667 bytes (-10962.000 bytes (-2.60%))
- Largest method-time delta: `_loadPolyfill` 53.858 -> 38.119 ms/iteration (-15.739)
- Largest method-byte delta: `_loadPolyfill` 421570.667 -> 233610.000 encoded bytes/iteration (-187960.667)
- Largest frame-byte delta: `send:BridgeResponse` 421617.667 -> 410655.667 encoded bytes/iteration (-10962.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 35.764 -> 38.119 ms (+2.355 ms (+6.58%)); response bytes 233549.333 -> 233610.000 bytes (+60.667 bytes (+0.03%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 0.000 calls (-161.000 calls (-100.00%)); time 18.094 -> 0.000 ms (-18.094 ms (-100.00%)); response bytes 188021.333 -> 0.000 bytes (-188021.333 bytes (-100.00%))

## JSZip End-to-End

- Warm wall: 193.293 -> 77.776 ms (-115.517 ms (-59.76%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.653 -> 6.130 ms (-102.523 ms (-94.36%))
- Warm Create->InjectGlobals: 4.500 -> 5.500 ms (+1.000 ms (+22.22%))
- Warm InjectGlobals->Execute: 1.000 -> 0.000 ms (-1.000 ms (-100.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 0.000 ms (-101.500 ms (-100.00%))
- Warm residual overhead: 1.653 -> 0.630 ms (-1.023 ms (-61.89%))
- Bridge time/iteration: 59.496 -> 65.932 ms (+6.436 ms (+10.82%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 410854.667 bytes (-10937.000 bytes (-2.59%))
- Largest method-time delta: `_bridgeDispatch` 0.000 -> 22.101 ms/iteration (+22.101)
- Largest method-byte delta: `_loadPolyfill` 421744.667 -> 233610.000 encoded bytes/iteration (-188134.667)
- Largest frame-byte delta: `send:BridgeResponse` 421791.667 -> 410854.667 encoded bytes/iteration (-10937.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 44.497 -> 43.727 ms (-0.770 ms (-1.73%)); response bytes 233549.333 -> 233610.000 bytes (+60.667 bytes (+0.03%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 0.000 calls (-164.000 calls (-100.00%)); time 14.882 -> 0.000 ms (-14.882 ms (-100.00%)); response bytes 188195.333 -> 0.000 bytes (-188195.333 bytes (-100.00%))

## Pi SDK Startup

- Warm wall: 1707.406 -> 1422.383 ms (-285.023 ms (-16.69%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.018 -> 9.264 ms (+0.246 ms (+2.73%))
- Warm Create->InjectGlobals: 5.500 -> 6.000 ms (+0.500 ms (+9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.518 -> 3.263 ms (-0.255 ms (-7.25%))
- Bridge time/iteration: 920.916 -> 884.867 ms (-36.049 ms (-3.91%))
- BridgeResponse encoded bytes/iteration: 7506336.667 -> 3309659.000 bytes (-4196677.667 bytes (-55.91%))
- Largest method-time delta: `_bridgeDispatch` 850.245 -> 822.419 ms/iteration (-27.826)
- Largest method-byte delta: `_bridgeDispatch` 6744299.000 -> 2547621.333 encoded bytes/iteration (-4196677.667)
- Largest frame-byte delta: `send:BridgeResponse` 7506336.667 -> 3309659.000 encoded bytes/iteration (-4196677.667)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 69.902 -> 60.800 ms (-9.102 ms (-13.02%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi SDK End-to-End

- Warm wall: 1835.606 -> 1823.659 ms (-11.947 ms (-0.65%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.839 -> 12.578 ms (-104.261 ms (-89.23%))
- Warm Create->InjectGlobals: 5.500 -> 6.500 ms (+1.000 ms (+18.18%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 0.000 ms (-102.000 ms (-100.00%))
- Warm residual overhead: 9.339 -> 5.578 ms (-3.761 ms (-40.27%))
- Bridge time/iteration: 938.761 -> 925.536 ms (-13.225 ms (-1.41%))
- BridgeResponse encoded bytes/iteration: 3642576.667 -> 3444124.333 bytes (-198452.334 bytes (-5.45%))
- Largest method-time delta: `_loadPolyfill` 890.972 -> 66.774 ms/iteration (-824.198)
- Largest method-byte delta: `_loadPolyfill` 3635716.667 -> 758629.667 encoded bytes/iteration (-2877087.000)
- Largest frame-byte delta: `send:BridgeResponse` 3642576.667 -> 3444124.333 encoded bytes/iteration (-198452.334)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 77.999 -> 66.774 ms (-11.225 ms (-14.39%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2631.000 -> 0.000 calls (-2631.000 calls (-100.00%)); time 812.973 -> 0.000 ms (-812.973 ms (-100.00%)); response bytes 2877087.000 -> 0.000 bytes (-2877087.000 bytes (-100.00%))

## Pi CLI Startup

- Warm wall: 1737.108 -> 1470.153 ms (-266.955 ms (-15.37%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.105 -> 9.412 ms (+0.307 ms (+3.37%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.605 -> 3.912 ms (+0.307 ms (+8.52%))
- Bridge time/iteration: 899.960 -> 767.271 ms (-132.689 ms (-14.74%))
- BridgeResponse encoded bytes/iteration: 7509075.333 -> 3312400.333 bytes (-4196675.000 bytes (-55.89%))
- Largest method-time delta: `_bridgeDispatch` 758.816 -> 640.133 ms/iteration (-118.683)
- Largest method-byte delta: `_bridgeDispatch` 6744496.000 -> 2547818.333 encoded bytes/iteration (-4196677.667)
- Largest frame-byte delta: `send:BridgeResponse` 7509075.333 -> 3312400.333 encoded bytes/iteration (-4196675.000)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 64.531 -> 70.042 ms (+5.511 ms (+8.54%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

## Pi CLI End-to-End

- Warm wall: 1926.880 -> 1049.009 ms (-877.871 ms (-45.56%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 13.261 -> 9.409 ms (-3.852 ms (-29.05%))
- Warm Create->InjectGlobals: 5.500 -> 6.000 ms (+0.500 ms (+9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 7.760 -> 3.409 ms (-4.351 ms (-56.07%))
- Bridge time/iteration: 1010.667 -> 553.958 ms (-456.709 ms (-45.19%))
- BridgeResponse encoded bytes/iteration: 3648246.667 -> 3449856.000 bytes (-198390.667 bytes (-5.44%))
- Largest method-time delta: `_loadPolyfill` 937.983 -> 51.942 ms/iteration (-886.041)
- Largest method-byte delta: `_loadPolyfill` 3636115.667 -> 758629.667 encoded bytes/iteration (-2877486.000)
- Largest frame-byte delta: `send:BridgeResponse` 3648246.667 -> 3449856.000 encoded bytes/iteration (-198390.667)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 78.924 -> 51.942 ms (-26.982 ms (-34.19%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 0.000 calls (-2638.000 calls (-100.00%)); time 859.059 -> 0.000 ms (-859.059 ms (-100.00%)); response bytes 2877486.000 -> 0.000 bytes (-2877486.000 bytes (-100.00%))

## Transport RTT

- No previous baseline was available for transport RTT.

