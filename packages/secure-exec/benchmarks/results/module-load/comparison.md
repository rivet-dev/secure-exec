# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T11:52:13.425Z (a5f06534200cd4f6131d64de2c0a09c1bee14d53)
Baseline benchmark: 2026-03-31T11:03:59.802Z (91c688ced6f9ca8d055acfcf03bb79a20d21736f)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 144.760 -> 139.820 ms (-4.940 ms (-3.41%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.532 -> 109.259 ms (+0.727 ms (+0.67%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.032 -> 2.759 ms (+0.727 ms (+35.78%))
- Bridge time/iteration: 32.439 -> 15.695 ms (-16.744 ms (-51.62%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 32.236 -> 15.623 ms/iteration (-16.613)
- Largest frame-byte delta: `send:Execute` 546102.000 -> 422495.667 encoded bytes/iteration (-123606.333)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 21.362 -> 10.622 ms (-10.740 ms (-50.28%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 10.874 -> 5.001 ms (-5.873 ms (-54.01%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## Hono End-to-End

- Warm wall: 144.303 -> 141.644 ms (-2.659 ms (-1.84%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.572 -> 109.618 ms (+1.046 ms (+0.96%))
- Warm Create->InjectGlobals: 4.000 -> 5.000 ms (+1.000 ms (+25.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 101.000 -> 102.500 ms (+1.500 ms (+1.49%))
- Warm residual overhead: 3.072 -> 2.118 ms (-0.954 ms (-31.05%))
- Bridge time/iteration: 20.807 -> 21.653 ms (+0.846 ms (+4.07%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 20.738 -> 21.603 ms/iteration (+0.865)
- Largest frame-byte delta: `send:Execute` 546219.000 -> 422612.667 encoded bytes/iteration (-123606.333)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 15.901 -> 14.973 ms (-0.928 ms (-5.84%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 4.838 -> 6.629 ms (+1.791 ms (+37.02%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## pdf-lib Startup

- Warm wall: 299.063 -> 238.739 ms (-60.324 ms (-20.17%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.150 -> 109.900 ms (-1.250 ms (-1.13%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 103.000 -> 101.500 ms (-1.500 ms (-1.46%))
- Warm residual overhead: 3.150 -> 3.400 ms (+0.250 ms (+7.94%))
- Bridge time/iteration: 93.268 -> 57.898 ms (-35.370 ms (-37.92%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 93.122 -> 57.815 ms/iteration (-35.307)
- Largest frame-byte delta: `send:Execute` 546224.000 -> 422617.667 encoded bytes/iteration (-123606.333)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 15.439 -> 18.298 ms (+2.859 ms (+18.52%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 77.682 -> 39.517 ms (-38.165 ms (-49.13%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

## pdf-lib End-to-End

- Warm wall: 344.577 -> 349.741 ms (+5.164 ms (+1.50%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.449 -> 111.777 ms (+0.328 ms (+0.29%))
- Warm Create->InjectGlobals: 4.000 -> 5.000 ms (+1.000 ms (+25.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 4.949 -> 4.777 ms (-0.172 ms (-3.48%))
- Bridge time/iteration: 66.951 -> 68.212 ms (+1.261 ms (+1.88%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 66.811 -> 68.094 ms/iteration (+1.283)
- Largest frame-byte delta: `send:Execute` 546963.000 -> 423356.667 encoded bytes/iteration (-123606.333)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 11.082 -> 13.766 ms (+2.684 ms (+24.22%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 55.729 -> 54.328 ms (-1.401 ms (-2.51%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

## JSZip Startup

- Warm wall: 197.583 -> 172.202 ms (-25.381 ms (-12.85%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.335 -> 111.102 ms (+2.767 ms (+2.55%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 103.000 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 1.835 -> 3.603 ms (+1.768 ms (+96.35%))
- Bridge time/iteration: 50.249 -> 76.624 ms (+26.375 ms (+52.49%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 50.123 -> 76.484 ms/iteration (+26.361)
- Largest frame-byte delta: `send:Execute` 546223.000 -> 422616.667 encoded bytes/iteration (-123606.333)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 29.784 -> 49.773 ms (+19.989 ms (+67.11%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 20.340 -> 26.712 ms (+6.372 ms (+31.33%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

## JSZip End-to-End

- Warm wall: 220.933 -> 215.876 ms (-5.057 ms (-2.29%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.137 -> 109.703 ms (-1.434 ms (-1.29%))
- Warm Create->InjectGlobals: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.637 -> 2.704 ms (-0.933 ms (-25.65%))
- Bridge time/iteration: 85.711 -> 62.309 ms (-23.402 ms (-27.30%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 421791.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 85.607 -> 62.205 ms/iteration (-23.402)
- Largest frame-byte delta: `send:Execute` 547754.000 -> 424147.667 encoded bytes/iteration (-123606.333)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 56.511 -> 43.519 ms (-12.992 ms (-22.99%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 164.000 calls (0.000 calls (0.00%)); time 29.096 -> 18.686 ms (-10.410 ms (-35.78%)); response bytes 188195.333 -> 188195.333 bytes (0.000 bytes (0.00%))

## Pi SDK Startup

- Warm wall: 1732.934 -> 1780.762 ms (+47.828 ms (+2.76%))
- Bridge calls/iteration: 2548.000 -> 2548.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.982 -> 116.058 ms (-0.924 ms (-0.79%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 103.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 9.982 -> 8.558 ms (-1.424 ms (-14.27%))
- Bridge time/iteration: 994.366 -> 1009.277 ms (+14.911 ms (+1.50%))
- BridgeResponse encoded bytes/iteration: 3457969.667 -> 3457969.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 958.124 -> 965.840 ms/iteration (+7.716)
- Largest frame-byte delta: `send:Execute` 546205.000 -> 422598.667 encoded bytes/iteration (-123606.333)
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 117.067 -> 102.688 ms (-14.379 ms (-12.28%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2444.000 -> 2444.000 calls (0.000 calls (0.00%)); time 841.057 -> 863.152 ms (+22.095 ms (+2.63%)); response bytes 2612354.000 -> 2612354.000 bytes (0.000 bytes (0.00%))

## Pi SDK End-to-End

- Warm wall: 1613.442 -> 1857.941 ms (+244.499 ms (+15.15%))
- Bridge calls/iteration: 2788.000 -> 2788.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 115.983 -> 116.371 ms (+0.388 ms (+0.34%))
- Warm Create->InjectGlobals: 4.000 -> 5.000 ms (+1.000 ms (+25.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 9.983 -> 9.371 ms (-0.612 ms (-6.13%))
- Bridge time/iteration: 939.236 -> 1060.960 ms (+121.724 ms (+12.96%))
- BridgeResponse encoded bytes/iteration: 3602748.667 -> 3602748.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 858.330 -> 984.662 ms/iteration (+126.332)
- Largest frame-byte delta: `send:Execute` 547124.000 -> 423525.667 encoded bytes/iteration (-123598.333)
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 90.558 -> 87.590 ms (-2.968 ms (-3.28%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 2638.000 calls (0.000 calls (0.00%)); time 767.771 -> 897.073 ms (+129.302 ms (+16.84%)); response bytes 2753381.000 -> 2753381.000 bytes (0.000 bytes (0.00%))

## Pi CLI Startup

- Warm wall: 1869.642 -> 1854.094 ms (-15.548 ms (-0.83%))
- Bridge calls/iteration: 2604.000 -> 2604.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.090 -> 114.551 ms (-2.539 ms (-2.17%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 10.591 -> 7.051 ms (-3.540 ms (-33.42%))
- Bridge time/iteration: 1059.078 -> 1017.137 ms (-41.941 ms (-3.96%))
- BridgeResponse encoded bytes/iteration: 3466269.333 -> 3466269.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 936.657 -> 896.110 ms/iteration (-40.547)
- Largest frame-byte delta: `send:Execute` 546383.000 -> 422469.667 encoded bytes/iteration (-123913.333)
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 104.855 -> 102.925 ms (-1.930 ms (-1.84%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2449.000 -> 2449.000 calls (0.000 calls (0.00%)); time 831.802 -> 793.186 ms (-38.616 ms (-4.64%)); response bytes 2617958.667 -> 2617958.667 bytes (0.000 bytes (0.00%))

## Pi CLI End-to-End

- Warm wall: 1789.771 -> 1993.647 ms (+203.876 ms (+11.39%))
- Bridge calls/iteration: 2823.000 -> 2823.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 11.449 -> 8.235 ms (-3.214 ms (-28.07%))
- Warm Create->InjectGlobals: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 6.449 -> 2.734 ms (-3.715 ms (-57.61%))
- Bridge time/iteration: 1064.727 -> 1076.527 ms (+11.800 ms (+1.11%))
- BridgeResponse encoded bytes/iteration: 3614151.333 -> 3614150.667 bytes (-0.666 bytes (0.00%))
- Largest method-time delta: `_fsExists` 51.455 -> 65.702 ms/iteration (+14.247)
- Largest method-byte delta: `_fsStat` 207.000 -> 206.333 encoded bytes/iteration (-0.667)
- Largest frame-byte delta: `send:Execute` 547342.000 -> 423428.667 encoded bytes/iteration (-123913.333)
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 92.575 -> 114.967 ms (+22.392 ms (+24.19%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2647.000 -> 2647.000 calls (0.000 calls (0.00%)); time 861.463 -> 829.763 ms (-31.700 ms (-3.68%)); response bytes 2759212.667 -> 2759212.667 bytes (0.000 bytes (0.00%))

## Transport RTT

- Connect RTT: 0.344 -> 0.244 ms (-0.100 ms (-29.07%))
- 1 B mean RTT: 0.049 -> 0.083 ms (+0.034 ms (+69.39%))
- 1 B P95 RTT: 0.084 -> 0.127 ms (+0.043 ms (+51.19%))
- 1 KB mean RTT: 0.040 -> 0.047 ms (+0.007 ms (+17.50%))
- 1 KB P95 RTT: 0.060 -> 0.083 ms (+0.023 ms (+38.33%))
- 64 KB mean RTT: 0.150 -> 0.120 ms (-0.030 ms (-20.00%))
- 64 KB P95 RTT: 0.208 -> 0.154 ms (-0.054 ms (-25.96%))

