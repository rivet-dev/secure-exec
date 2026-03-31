# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T13:28:50.274Z (be83b6fdd9fec12d9037d0ec08d0d360d3c33f30)
Baseline benchmark: 2026-03-31T13:21:52.548Z (be83b6fdd9fec12d9037d0ec08d0d360d3c33f30)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 140.397 -> 140.959 ms (+0.562 ms (+0.40%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.884 -> 109.115 ms (+0.231 ms (+0.21%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.384 -> 1.615 ms (-0.769 ms (-32.26%))
- Bridge time/iteration: 24.253 -> 38.499 ms (+14.246 ms (+58.74%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 24.199 -> 38.364 ms/iteration (+14.165)
- Largest frame-byte delta: `send:Execute` 424561.000 -> 13199.000 encoded bytes/iteration (-411362.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 18.835 -> 29.585 ms (+10.750 ms (+57.08%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 5.363 -> 8.779 ms (+3.416 ms (+63.70%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## Hono End-to-End

- Warm wall: 143.141 -> 139.728 ms (-3.413 ms (-2.38%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.883 -> 109.456 ms (-0.427 ms (-0.39%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.883 -> 1.456 ms (-1.427 ms (-49.50%))
- Bridge time/iteration: 23.570 -> 17.021 ms (-6.549 ms (-27.79%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 23.499 -> 16.919 ms/iteration (-6.580)
- Largest frame-byte delta: `send:Execute` 424678.000 -> 13316.000 encoded bytes/iteration (-411362.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 18.194 -> 10.759 ms (-7.435 ms (-40.87%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 5.305 -> 6.160 ms (+0.855 ms (+16.12%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## pdf-lib Startup

- Warm wall: 300.394 -> 353.377 ms (+52.983 ms (+17.64%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.038 -> 110.105 ms (-0.933 ms (-0.84%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 103.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.538 -> 2.104 ms (-0.434 ms (-17.10%))
- Bridge time/iteration: 93.288 -> 80.914 ms (-12.374 ms (-13.26%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 93.163 -> 80.806 ms/iteration (-12.357)
- Largest frame-byte delta: `send:Execute` 424683.000 -> 13321.000 encoded bytes/iteration (-411362.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 15.103 -> 13.470 ms (-1.633 ms (-10.81%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 78.060 -> 67.336 ms (-10.724 ms (-13.74%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

## pdf-lib End-to-End

- Warm wall: 410.132 -> 362.870 ms (-47.262 ms (-11.52%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.072 -> 111.424 ms (+0.352 ms (+0.32%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 3.572 -> 3.924 ms (+0.352 ms (+9.85%))
- Bridge time/iteration: 91.629 -> 59.917 ms (-31.712 ms (-34.61%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 91.507 -> 59.792 ms/iteration (-31.715)
- Largest frame-byte delta: `send:Execute` 425422.000 -> 14060.000 encoded bytes/iteration (-411362.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 16.969 -> 10.038 ms (-6.931 ms (-40.84%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 74.538 -> 49.754 ms (-24.784 ms (-33.25%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

## JSZip Startup

- Warm wall: 173.949 -> 169.488 ms (-4.461 ms (-2.56%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.309 -> 109.156 ms (-1.153 ms (-1.04%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 3.809 -> 2.656 ms (-1.153 ms (-30.27%))
- Bridge time/iteration: 75.451 -> 53.999 ms (-21.452 ms (-28.43%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 75.391 -> 53.858 ms/iteration (-21.533)
- Largest frame-byte delta: `send:Execute` 424682.000 -> 13320.000 encoded bytes/iteration (-411362.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 57.504 -> 35.764 ms (-21.740 ms (-37.81%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 17.887 -> 18.094 ms (+0.207 ms (+1.16%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

## JSZip End-to-End

- Warm wall: 210.010 -> 193.293 ms (-16.717 ms (-7.96%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.545 -> 108.653 ms (-1.892 ms (-1.71%))
- Warm Create->InjectGlobals: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 1.000 ms (+1.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 3.545 -> 1.653 ms (-1.892 ms (-53.37%))
- Bridge time/iteration: 52.387 -> 59.496 ms (+7.109 ms (+13.57%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 421791.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 52.258 -> 59.379 ms/iteration (+7.121)
- Largest frame-byte delta: `send:Execute` 426213.000 -> 14851.000 encoded bytes/iteration (-411362.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 35.631 -> 44.497 ms (+8.866 ms (+24.88%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 164.000 calls (0.000 calls (0.00%)); time 16.627 -> 14.882 ms (-1.745 ms (-10.49%)); response bytes 188195.333 -> 188195.333 bytes (0.000 bytes (0.00%))

## Pi SDK Startup

- Warm wall: 1550.300 -> 1668.363 ms (+118.063 ms (+7.62%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.832 -> 115.606 ms (-1.226 ms (-1.05%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 8.832 -> 7.606 ms (-1.226 ms (-13.88%))
- Bridge time/iteration: 817.203 -> 818.355 ms (+1.152 ms (+0.14%))
- BridgeResponse encoded bytes/iteration: 3497993.667 -> 3497993.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 816.333 -> 816.938 ms/iteration (+0.605)
- Largest frame-byte delta: `send:Execute` 507645.667 -> 13302.000 encoded bytes/iteration (-494343.667)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 62.637 -> 75.899 ms (+13.262 ms (+21.17%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2437.000 -> 2437.000 calls (0.000 calls (0.00%)); time 753.696 -> 741.039 ms (-12.657 ms (-1.68%)); response bytes 2735956.000 -> 2735956.000 bytes (0.000 bytes (0.00%))

## Pi SDK End-to-End

- Warm wall: 1815.120 -> 1835.606 ms (+20.486 ms (+1.13%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.820 -> 116.839 ms (-0.981 ms (-0.83%))
- Warm Create->InjectGlobals: 6.000 -> 5.500 ms (-0.500 ms (-8.33%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 9.319 -> 9.339 ms (+0.020 ms (+0.21%))
- Bridge time/iteration: 936.232 -> 938.761 ms (+2.529 ms (+0.27%))
- BridgeResponse encoded bytes/iteration: 3642576.667 -> 3642576.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_fsExists` 34.829 -> 38.878 ms/iteration (+4.049)
- Largest frame-byte delta: `send:Execute` 508572.667 -> 14229.000 encoded bytes/iteration (-494343.667)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 86.992 -> 77.999 ms (-8.993 ms (-10.34%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2631.000 -> 2631.000 calls (0.000 calls (0.00%)); time 807.215 -> 812.973 ms (+5.758 ms (+0.71%)); response bytes 2877087.000 -> 2877087.000 bytes (0.000 bytes (0.00%))

## Pi CLI Startup

- Warm wall: 1876.567 -> 1809.331 ms (-67.236 ms (-3.58%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 118.178 -> 117.805 ms (-0.373 ms (-0.32%))
- Warm Create->InjectGlobals: 6.500 -> 5.500 ms (-1.000 ms (-15.38%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 9.678 -> 10.305 ms (+0.627 ms (+6.48%))
- Bridge time/iteration: 994.234 -> 987.059 ms (-7.175 ms (-0.72%))
- BridgeResponse encoded bytes/iteration: 3500709.333 -> 3500710.000 bytes (+0.667 bytes (0.00%))
- Largest method-time delta: `_fsExists` 64.432 -> 43.249 ms/iteration (-21.183)
- Largest method-byte delta: `_fsStat` 205.667 -> 206.333 encoded bytes/iteration (+0.666)
- Largest frame-byte delta: `send:Execute` 507516.667 -> 13173.000 encoded bytes/iteration (-494343.667)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 70.267 -> 83.558 ms (+13.291 ms (+18.91%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2440.000 -> 2440.000 calls (0.000 calls (0.00%)); time 847.287 -> 848.487 ms (+1.200 ms (+0.14%)); response bytes 2736128.000 -> 2736128.000 bytes (0.000 bytes (0.00%))

## Pi CLI End-to-End

- Warm wall: 1767.146 -> 1926.880 ms (+159.734 ms (+9.04%))
- Bridge calls/iteration: 2772.333 -> 2772.000 calls (-0.333 calls (-0.01%))
- Warm fixed overhead: 12.074 -> 13.261 ms (+1.187 ms (+9.83%))
- Warm Create->InjectGlobals: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 7.074 -> 7.760 ms (+0.686 ms (+9.70%))
- Bridge time/iteration: 995.204 -> 1010.667 ms (+15.463 ms (+1.55%))
- BridgeResponse encoded bytes/iteration: 3648264.333 -> 3648246.667 bytes (-17.666 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 918.892 -> 937.983 ms/iteration (+19.091)
- Largest method-byte delta: `_loadPolyfill` 3636133.333 -> 3636115.667 encoded bytes/iteration (-17.666)
- Largest frame-byte delta: `send:Execute` 508475.667 -> 14132.000 encoded bytes/iteration (-494343.667)
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 112.765 -> 78.924 ms (-33.841 ms (-30.01%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.333 -> 2638.000 calls (-0.333 calls (-0.01%)); time 806.128 -> 859.059 ms (+52.931 ms (+6.57%)); response bytes 2877503.667 -> 2877486.000 bytes (-17.667 bytes (-0.00%))

## Transport RTT

- Connect RTT: 0.174 -> 0.172 ms (-0.002 ms (-1.15%))
- 1 B mean RTT: 0.021 -> 0.028 ms (+0.007 ms (+33.33%))
- 1 B P95 RTT: 0.033 -> 0.047 ms (+0.014 ms (+42.42%))
- 1 KB mean RTT: 0.017 -> 0.019 ms (+0.002 ms (+11.77%))
- 1 KB P95 RTT: 0.020 -> 0.024 ms (+0.004 ms (+20.00%))
- 64 KB mean RTT: 0.113 -> 0.207 ms (+0.094 ms (+83.19%))
- 64 KB P95 RTT: 0.124 -> 0.338 ms (+0.214 ms (+172.58%))

