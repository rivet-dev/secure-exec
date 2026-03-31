# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T11:03:59.802Z (91c688ced6f9ca8d055acfcf03bb79a20d21736f)
Baseline benchmark: 2026-03-31T10:39:00.515Z (96164a4c4cc10ca38a643067fa4ff87be490a85a)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 154.125 -> 144.760 ms (-9.365 ms (-6.08%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.961 -> 108.532 ms (-1.429 ms (-1.30%))
- Warm Create->InjectGlobals: 1.000 -> 4.500 ms (+3.500 ms (+350.00%))
- Warm InjectGlobals->Execute: 4.500 -> 0.000 ms (-4.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.461 -> 2.032 ms (-0.429 ms (-17.43%))
- Bridge time/iteration: 26.466 -> 32.439 ms (+5.973 ms (+22.57%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 26.212 -> 32.236 ms/iteration (+6.024)
- Largest frame-byte delta: `send:Execute` 1243801.000 -> 546102.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 14.693 -> 21.362 ms (+6.669 ms (+45.39%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 11.518 -> 10.874 ms (-0.644 ms (-5.59%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## Hono End-to-End

- Warm wall: 150.765 -> 144.303 ms (-6.462 ms (-4.29%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.845 -> 108.572 ms (-0.273 ms (-0.25%))
- Warm Create->InjectGlobals: 0.500 -> 4.000 ms (+3.500 ms (+700.00%))
- Warm InjectGlobals->Execute: 5.000 -> 0.500 ms (-4.500 ms (-90.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 1.845 -> 3.072 ms (+1.227 ms (+66.50%))
- Bridge time/iteration: 22.935 -> 20.807 ms (-2.128 ms (-9.28%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 22.864 -> 20.738 ms/iteration (-2.126)
- Largest frame-byte delta: `send:Execute` 1243918.000 -> 546219.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 16.243 -> 15.901 ms (-0.342 ms (-2.11%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 6.621 -> 4.838 ms (-1.783 ms (-26.93%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## pdf-lib Startup

- Warm wall: 393.688 -> 299.063 ms (-94.625 ms (-24.04%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.483 -> 111.150 ms (+0.667 ms (+0.60%))
- Warm Create->InjectGlobals: 0.500 -> 4.500 ms (+4.000 ms (+800.00%))
- Warm InjectGlobals->Execute: 4.500 -> 0.500 ms (-4.000 ms (-88.89%))
- Warm ExecutionResult->Destroy: 102.000 -> 103.000 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 3.484 -> 3.150 ms (-0.334 ms (-9.59%))
- Bridge time/iteration: 74.966 -> 93.268 ms (+18.302 ms (+24.41%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 74.815 -> 93.122 ms/iteration (+18.307)
- Largest frame-byte delta: `send:Execute` 1243923.000 -> 546224.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.385 -> 15.439 ms (+5.054 ms (+48.67%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 64.430 -> 77.682 ms (+13.252 ms (+20.57%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

## pdf-lib End-to-End

- Warm wall: 395.505 -> 344.577 ms (-50.928 ms (-12.88%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.662 -> 111.449 ms (-0.213 ms (-0.19%))
- Warm Create->InjectGlobals: 0.500 -> 4.000 ms (+3.500 ms (+700.00%))
- Warm InjectGlobals->Execute: 4.500 -> 0.500 ms (-4.000 ms (-88.89%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 4.162 -> 4.949 ms (+0.787 ms (+18.91%))
- Bridge time/iteration: 70.243 -> 66.951 ms (-3.292 ms (-4.69%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 70.165 -> 66.811 ms/iteration (-3.354)
- Largest frame-byte delta: `send:Execute` 1244662.000 -> 546963.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 15.710 -> 11.082 ms (-4.628 ms (-29.46%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 54.455 -> 55.729 ms (+1.274 ms (+2.34%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

## JSZip Startup

- Warm wall: 188.114 -> 197.583 ms (+9.469 ms (+5.03%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.624 -> 108.335 ms (-1.289 ms (-1.18%))
- Warm Create->InjectGlobals: 0.000 -> 4.500 ms (+4.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 0.000 ms (-5.000 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.624 -> 1.835 ms (-0.789 ms (-30.07%))
- Bridge time/iteration: 54.071 -> 50.249 ms (-3.822 ms (-7.07%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 53.965 -> 50.123 ms/iteration (-3.842)
- Largest frame-byte delta: `send:Execute` 1243922.000 -> 546223.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 37.603 -> 29.784 ms (-7.819 ms (-20.79%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 16.363 -> 20.340 ms (+3.977 ms (+24.30%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

## JSZip End-to-End

- Warm wall: 211.995 -> 220.933 ms (+8.938 ms (+4.22%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.157 -> 111.137 ms (+0.980 ms (+0.89%))
- Warm Create->InjectGlobals: 0.000 -> 5.500 ms (+5.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 0.000 ms (-4.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.657 -> 3.637 ms (-0.020 ms (-0.55%))
- Bridge time/iteration: 45.793 -> 85.711 ms (+39.918 ms (+87.17%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 421791.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 45.656 -> 85.607 ms/iteration (+39.951)
- Largest frame-byte delta: `send:Execute` 1245453.000 -> 547754.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 29.786 -> 56.511 ms (+26.725 ms (+89.72%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 164.000 calls (0.000 calls (0.00%)); time 15.870 -> 29.096 ms (+13.226 ms (+83.34%)); response bytes 188195.333 -> 188195.333 bytes (0.000 bytes (0.00%))

## Pi SDK Startup

- Warm wall: 1773.563 -> 1732.934 ms (-40.629 ms (-2.29%))
- Bridge calls/iteration: 2548.000 -> 2548.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.142 -> 116.982 ms (+0.840 ms (+0.72%))
- Warm Create->InjectGlobals: 0.000 -> 4.500 ms (+4.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 0.000 ms (-4.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 9.642 -> 9.982 ms (+0.340 ms (+3.53%))
- Bridge time/iteration: 983.263 -> 994.366 ms (+11.103 ms (+1.13%))
- BridgeResponse encoded bytes/iteration: 3457969.667 -> 3457969.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 942.061 -> 958.124 ms/iteration (+16.063)
- Largest frame-byte delta: `send:Execute` 1243904.000 -> 546205.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 112.940 -> 117.067 ms (+4.127 ms (+3.65%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2444.000 -> 2444.000 calls (0.000 calls (0.00%)); time 829.121 -> 841.057 ms (+11.936 ms (+1.44%)); response bytes 2612354.000 -> 2612354.000 bytes (0.000 bytes (0.00%))

## Pi SDK End-to-End

- Warm wall: 1689.811 -> 1613.442 ms (-76.369 ms (-4.52%))
- Bridge calls/iteration: 2788.000 -> 2788.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.113 -> 115.983 ms (-0.130 ms (-0.11%))
- Warm Create->InjectGlobals: 0.500 -> 4.000 ms (+3.500 ms (+700.00%))
- Warm InjectGlobals->Execute: 4.000 -> 0.000 ms (-4.000 ms (-100.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 9.613 -> 9.983 ms (+0.370 ms (+3.85%))
- Bridge time/iteration: 978.297 -> 939.236 ms (-39.061 ms (-3.99%))
- BridgeResponse encoded bytes/iteration: 3602748.667 -> 3602748.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 885.443 -> 858.330 ms/iteration (-27.113)
- Largest frame-byte delta: `send:Execute` 1244823.000 -> 547124.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 82.727 -> 90.558 ms (+7.831 ms (+9.47%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 2638.000 calls (0.000 calls (0.00%)); time 802.716 -> 767.771 ms (-34.945 ms (-4.35%)); response bytes 2753381.000 -> 2753381.000 bytes (0.000 bytes (0.00%))

## Pi CLI Startup

- Warm wall: 1916.797 -> 1869.642 ms (-47.155 ms (-2.46%))
- Bridge calls/iteration: 2604.000 -> 2604.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.143 -> 117.090 ms (-0.053 ms (-0.04%))
- Warm Create->InjectGlobals: 0.500 -> 4.500 ms (+4.000 ms (+800.00%))
- Warm InjectGlobals->Execute: 5.500 -> 0.000 ms (-5.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 101.000 -> 102.000 ms (+1.000 ms (+0.99%))
- Warm residual overhead: 10.143 -> 10.591 ms (+0.448 ms (+4.42%))
- Bridge time/iteration: 1056.203 -> 1059.078 ms (+2.875 ms (+0.27%))
- BridgeResponse encoded bytes/iteration: 3466268.667 -> 3466269.333 bytes (+0.666 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 917.682 -> 936.657 ms/iteration (+18.975)
- Largest method-byte delta: `_fsStat` 206.333 -> 207.000 encoded bytes/iteration (+0.667)
- Largest frame-byte delta: `send:Execute` 1244082.000 -> 546383.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 91.211 -> 104.855 ms (+13.644 ms (+14.96%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2449.000 -> 2449.000 calls (0.000 calls (0.00%)); time 826.470 -> 831.802 ms (+5.332 ms (+0.65%)); response bytes 2617958.667 -> 2617958.667 bytes (0.000 bytes (0.00%))

## Pi CLI End-to-End

- Warm wall: 1764.241 -> 1789.771 ms (+25.530 ms (+1.45%))
- Bridge calls/iteration: 2823.000 -> 2823.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.732 -> 11.449 ms (+1.717 ms (+17.64%))
- Warm Create->InjectGlobals: 0.500 -> 4.500 ms (+4.000 ms (+800.00%))
- Warm InjectGlobals->Execute: 4.500 -> 0.500 ms (-4.000 ms (-88.89%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 4.732 -> 6.449 ms (+1.717 ms (+36.28%))
- Bridge time/iteration: 1021.796 -> 1064.727 ms (+42.931 ms (+4.20%))
- BridgeResponse encoded bytes/iteration: 3614151.000 -> 3614151.333 bytes (+0.333 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 905.867 -> 954.038 ms/iteration (+48.171)
- Largest method-byte delta: `_fsStat` 206.667 -> 207.000 encoded bytes/iteration (+0.333)
- Largest frame-byte delta: `send:Execute` 1245041.000 -> 547342.000 encoded bytes/iteration (-697699.000)
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 82.903 -> 92.575 ms (+9.672 ms (+11.67%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2647.000 -> 2647.000 calls (0.000 calls (0.00%)); time 822.964 -> 861.463 ms (+38.499 ms (+4.68%)); response bytes 2759212.667 -> 2759212.667 bytes (0.000 bytes (0.00%))

## Transport RTT

- Connect RTT: 0.359 -> 0.344 ms (-0.015 ms (-4.18%))
- 1 B mean RTT: 0.218 -> 0.049 ms (-0.169 ms (-77.52%))
- 1 B P95 RTT: 0.533 -> 0.084 ms (-0.449 ms (-84.24%))
- 1 KB mean RTT: 0.103 -> 0.040 ms (-0.063 ms (-61.16%))
- 1 KB P95 RTT: 0.151 -> 0.060 ms (-0.091 ms (-60.27%))
- 64 KB mean RTT: 0.614 -> 0.150 ms (-0.464 ms (-75.57%))
- 64 KB P95 RTT: 0.626 -> 0.208 ms (-0.418 ms (-66.77%))

