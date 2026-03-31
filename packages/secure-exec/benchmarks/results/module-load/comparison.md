# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T09:40:59.609Z (4aae2210f7fa581952f107153f551fbe2530285c)
Baseline benchmark: 2026-03-31T07:24:08.544Z (4bb099df925783f92b047045b09d8976fbec7a73)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 149.600 -> 143.079 ms (-6.521 ms (-4.36%))
- Bridge calls/iteration: 102.000 -> 59.000 calls (-43.000 calls (-42.16%))
- Warm fixed overhead: 113.206 -> 110.603 ms (-2.603 ms (-2.30%))
- Warm Create->InjectGlobals: 1.000 -> 0.500 ms (-0.500 ms (-50.00%))
- Warm InjectGlobals->Execute: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 5.206 -> 3.103 ms (-2.103 ms (-40.40%))
- Bridge time/iteration: 16.572 -> 14.635 ms (-1.937 ms (-11.69%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 206202.333 bytes (-201927.667 bytes (-49.48%))
- Largest method-time delta: `_loadPolyfill` 16.518 -> 14.572 ms/iteration (-1.946)
- Largest method-byte delta: `_loadPolyfill` 408083.000 -> 206155.333 encoded bytes/iteration (-201927.667)
- Largest frame-byte delta: `send:BridgeResponse` 408130.000 -> 206202.333 encoded bytes/iteration (-201927.667)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 3.000 calls (+3.000 calls); time 0.000 -> 10.294 ms (+10.294 ms); response bytes 0.000 -> 99859.333 bytes (+99859.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 101.000 -> 55.000 calls (-46.000 calls (-45.55%)); time 16.518 -> 4.279 ms (-12.239 ms (-74.09%)); response bytes 408083.000 -> 106296.000 bytes (-301787.000 bytes (-73.95%))

## Hono End-to-End

- Warm wall: 149.463 -> 150.142 ms (+0.679 ms (+0.45%))
- Bridge calls/iteration: 102.000 -> 59.000 calls (-43.000 calls (-42.16%))
- Warm fixed overhead: 108.507 -> 109.981 ms (+1.474 ms (+1.36%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 1.508 -> 2.981 ms (+1.473 ms (+97.68%))
- Bridge time/iteration: 19.269 -> 16.419 ms (-2.850 ms (-14.79%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 206202.333 bytes (-201927.667 bytes (-49.48%))
- Largest method-time delta: `_loadPolyfill` 19.199 -> 16.343 ms/iteration (-2.856)
- Largest method-byte delta: `_loadPolyfill` 408083.000 -> 206155.333 encoded bytes/iteration (-201927.667)
- Largest frame-byte delta: `send:BridgeResponse` 408130.000 -> 206202.333 encoded bytes/iteration (-201927.667)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 3.000 calls (+3.000 calls); time 0.000 -> 11.237 ms (+11.237 ms); response bytes 0.000 -> 99859.333 bytes (+99859.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 101.000 -> 55.000 calls (-46.000 calls (-45.55%)); time 19.199 -> 5.107 ms (-14.092 ms (-73.40%)); response bytes 408083.000 -> 106296.000 bytes (-301787.000 bytes (-73.95%))

## pdf-lib Startup

- Warm wall: 314.083 -> 330.374 ms (+16.291 ms (+5.19%))
- Bridge calls/iteration: 1651.000 -> 514.000 calls (-1137.000 calls (-68.87%))
- Warm fixed overhead: 108.981 -> 111.281 ms (+2.300 ms (+2.11%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.500 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 2.481 -> 3.282 ms (+0.801 ms (+32.28%))
- Bridge time/iteration: 64.700 -> 71.365 ms (+6.665 ms (+10.30%))
- BridgeResponse encoded bytes/iteration: 1918520.000 -> 1617593.333 bytes (-300926.667 bytes (-15.69%))
- Largest method-time delta: `_loadPolyfill` 64.567 -> 71.276 ms/iteration (+6.709)
- Largest method-byte delta: `_loadPolyfill` 1918473.000 -> 1617546.333 encoded bytes/iteration (-300926.667)
- Largest frame-byte delta: `send:BridgeResponse` 1918520.000 -> 1617593.333 encoded bytes/iteration (-300926.667)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 7.000 calls (+7.000 calls); time 0.000 -> 22.105 ms (+22.105 ms); response bytes 0.000 -> 100059.333 bytes (+100059.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 1650.000 -> 506.000 calls (-1144.000 calls (-69.33%)); time 64.567 -> 49.172 ms (-15.395 ms (-23.84%)); response bytes 1918473.000 -> 1517487.000 bytes (-400986.000 bytes (-20.90%))

## pdf-lib End-to-End

- Warm wall: 387.063 -> 342.928 ms (-44.135 ms (-11.40%))
- Bridge calls/iteration: 1666.000 -> 529.000 calls (-1137.000 calls (-68.25%))
- Warm fixed overhead: 109.839 -> 112.789 ms (+2.950 ms (+2.69%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.338 -> 5.289 ms (+2.951 ms (+126.22%))
- Bridge time/iteration: 71.049 -> 71.123 ms (+0.074 ms (+0.10%))
- BridgeResponse encoded bytes/iteration: 1919390.000 -> 1618463.333 bytes (-300926.667 bytes (-15.68%))
- Largest method-time delta: `_loadPolyfill` 70.926 -> 71.015 ms/iteration (+0.089)
- Largest method-byte delta: `_loadPolyfill` 1919343.000 -> 1618416.333 encoded bytes/iteration (-300926.667)
- Largest frame-byte delta: `send:BridgeResponse` 1919390.000 -> 1618463.333 encoded bytes/iteration (-300926.667)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 7.000 calls (+7.000 calls); time 0.000 -> 24.324 ms (+24.324 ms); response bytes 0.000 -> 100059.333 bytes (+100059.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 1665.000 -> 521.000 calls (-1144.000 calls (-68.71%)); time 70.926 -> 46.691 ms (-24.235 ms (-34.17%)); response bytes 1919343.000 -> 1518357.000 bytes (-400986.000 bytes (-20.89%))

## JSZip Startup

- Warm wall: 177.165 -> 206.266 ms (+29.101 ms (+16.43%))
- Bridge calls/iteration: 405.000 -> 179.000 calls (-226.000 calls (-55.80%))
- Warm fixed overhead: 108.367 -> 109.216 ms (+0.849 ms (+0.78%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 1.367 -> 2.716 ms (+1.349 ms (+98.68%))
- Bridge time/iteration: 55.965 -> 53.164 ms (-2.801 ms (-5.00%))
- BridgeResponse encoded bytes/iteration: 1207899.000 -> 725180.333 bytes (-482718.667 bytes (-39.96%))
- Largest method-time delta: `_loadPolyfill` 55.914 -> 53.063 ms/iteration (-2.851)
- Largest method-byte delta: `_loadPolyfill` 1207852.000 -> 725133.333 encoded bytes/iteration (-482718.667)
- Largest frame-byte delta: `send:BridgeResponse` 1207899.000 -> 725180.333 encoded bytes/iteration (-482718.667)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 17.000 calls (+17.000 calls); time 0.000 -> 28.411 ms (+28.411 ms); response bytes 0.000 -> 233549.333 bytes (+233549.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 404.000 -> 161.000 calls (-243.000 calls (-60.15%)); time 55.914 -> 24.652 ms (-31.262 ms (-55.91%)); response bytes 1207852.000 -> 491584.000 bytes (-716268.000 bytes (-59.30%))

## JSZip End-to-End

- Warm wall: 552.962 -> 552.962 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 519.000 -> 63.667 calls (-455.333 calls (-87.73%))
- Warm fixed overhead: -
- Warm Create->InjectGlobals: -
- Warm InjectGlobals->Execute: -
- Warm ExecutionResult->Destroy: -
- Warm residual overhead: -
- Bridge time/iteration: 46.083 -> 58.723 ms (+12.640 ms (+27.43%))
- BridgeResponse encoded bytes/iteration: 1214540.000 -> 396786.667 bytes (-817753.333 bytes (-67.33%))
- Largest method-time delta: `_loadPolyfill` 45.999 -> 58.723 ms/iteration (+12.724)
- Largest method-byte delta: `_loadPolyfill` 1214493.000 -> 396786.667 encoded bytes/iteration (-817706.333)
- Largest frame-byte delta: `send:Execute` 1242365.000 -> 414582.000 encoded bytes/iteration (-827783.000)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 5.667 calls (+5.667 calls); time 0.000 -> 41.549 ms (+41.549 ms); response bytes 0.000 -> 232670.667 bytes (+232670.667 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 518.000 -> 58.000 calls (-460.000 calls (-88.80%)); time 45.999 -> 17.174 ms (-28.825 ms (-62.66%)); response bytes 1214493.000 -> 164116.000 bytes (-1050377.000 bytes (-86.49%))

## Pi SDK Startup

- Warm wall: 1693.028 -> 1729.225 ms (+36.197 ms (+2.14%))
- Bridge calls/iteration: 2548.000 -> 2548.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 115.200 -> 117.534 ms (+2.334 ms (+2.03%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.000 -> 102.500 ms (+1.500 ms (+1.49%))
- Warm residual overhead: 9.200 -> 10.034 ms (+0.834 ms (+9.06%))
- Bridge time/iteration: 923.769 -> 899.396 ms (-24.373 ms (-2.64%))
- BridgeResponse encoded bytes/iteration: 9142839.000 -> 7475865.667 bytes (-1666973.333 bytes (-18.23%))
- Largest method-time delta: `_loadPolyfill` 878.447 -> 844.908 ms/iteration (-33.539)
- Largest method-byte delta: `_loadPolyfill` 9136395.000 -> 7469421.667 encoded bytes/iteration (-1666973.333)
- Largest frame-byte delta: `send:BridgeResponse` 9142839.000 -> 7475865.667 encoded bytes/iteration (-1666973.333)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 79.000 calls (+79.000 calls); time 0.000 -> 116.126 ms (+116.126 ms); response bytes 0.000 -> 839171.667 bytes (+839171.667 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2523.000 -> 2444.000 calls (-79.000 calls (-3.13%)); time 878.447 -> 728.782 ms (-149.665 ms (-17.04%)); response bytes 9136395.000 -> 6630250.000 bytes (-2506145.000 bytes (-27.43%))

## Pi SDK End-to-End

- Warm wall: 1949.559 -> 1949.559 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2788.000 -> 929.333 calls (-1858.667 calls (-66.67%))
- Warm fixed overhead: -
- Warm Create->InjectGlobals: 0.000 -> 1.000 ms (+1.000 ms)
- Warm InjectGlobals->Execute: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: -
- Warm residual overhead: -
- Bridge time/iteration: 1048.088 -> 439.824 ms (-608.264 ms (-58.04%))
- BridgeResponse encoded bytes/iteration: 9477120.000 -> 3159486.000 bytes (-6317634.000 bytes (-66.66%))
- Largest method-time delta: `_loadPolyfill` 938.412 -> 403.905 ms/iteration (-534.507)
- Largest method-byte delta: `_loadPolyfill` 9466974.000 -> 3156104.000 encoded bytes/iteration (-6310870.000)
- Largest frame-byte delta: `send:BridgeResponse` 9477120.000 -> 3159486.000 encoded bytes/iteration (-6317634.000)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 26.667 calls (+26.667 calls); time 0.000 -> 103.451 ms (+103.451 ms); response bytes 0.000 -> 835844.333 bytes (+835844.333 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2718.000 -> 879.333 calls (-1838.667 calls (-67.65%)); time 938.412 -> 300.454 ms (-637.958 ms (-67.98%)); response bytes 9466974.000 -> 2320259.667 bytes (-7146714.333 bytes (-75.49%))

## Pi CLI Startup

- Warm wall: 1827.171 -> 1697.463 ms (-129.708 ms (-7.10%))
- Bridge calls/iteration: 2604.000 -> 2604.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.846 -> 118.185 ms (+0.339 ms (+0.29%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 10.846 -> 10.685 ms (-0.161 ms (-1.48%))
- Bridge time/iteration: 1038.732 -> 995.774 ms (-42.958 ms (-4.14%))
- BridgeResponse encoded bytes/iteration: 9161307.667 -> 7494335.000 bytes (-1666972.667 bytes (-18.20%))
- Largest method-time delta: `_loadPolyfill` 921.631 -> 895.929 ms/iteration (-25.702)
- Largest method-byte delta: `_loadPolyfill` 9152170.000 -> 7485196.667 encoded bytes/iteration (-1666973.333)
- Largest frame-byte delta: `send:BridgeResponse` 9161307.667 -> 7494335.000 encoded bytes/iteration (-1666972.667)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 79.000 calls (+79.000 calls); time 0.000 -> 117.951 ms (+117.951 ms); response bytes 0.000 -> 839171.667 bytes (+839171.667 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2528.000 -> 2449.000 calls (-79.000 calls (-3.13%)); time 921.631 -> 777.979 ms (-143.652 ms (-15.59%)); response bytes 9152170.000 -> 6646025.000 bytes (-2506145.000 bytes (-27.38%))

## Pi CLI End-to-End

- Warm wall: 1665.810 -> 1770.193 ms (+104.383 ms (+6.27%))
- Bridge calls/iteration: 2823.333 -> 2823.000 calls (-0.333 calls (-0.01%))
- Warm fixed overhead: 11.201 -> 11.691 ms (+0.490 ms (+4.38%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 5.500 ms (+1.000 ms (+22.22%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 6.701 -> 5.691 ms (-1.010 ms (-15.07%))
- Bridge time/iteration: 1011.245 -> 1031.608 ms (+20.363 ms (+2.01%))
- BridgeResponse encoded bytes/iteration: 9498709.333 -> 7831719.667 bytes (-1666989.666 bytes (-17.55%))
- Largest method-time delta: `_fsExists` 54.831 -> 68.280 ms/iteration (+13.449)
- Largest method-byte delta: `_loadPolyfill` 9482993.667 -> 7816002.667 encoded bytes/iteration (-1666991.000)
- Largest frame-byte delta: `send:BridgeResponse` 9498709.333 -> 7831719.667 encoded bytes/iteration (-1666989.666)
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 80.000 calls (+80.000 calls); time 0.000 -> 100.298 ms (+100.298 ms); response bytes 0.000 -> 839221.667 bytes (+839221.667 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2727.333 -> 2647.000 calls (-80.333 calls (-2.94%)); time 895.365 -> 789.497 ms (-105.868 ms (-11.82%)); response bytes 9482993.667 -> 6976781.000 bytes (-2506212.667 bytes (-26.43%))

## Transport RTT

- Connect RTT: 0.194 -> 0.173 ms (-0.021 ms (-10.82%))
- 1 B mean RTT: 0.024 -> 0.024 ms (0.000 ms (0.00%))
- 1 B P95 RTT: 0.032 -> 0.043 ms (+0.011 ms (+34.38%))
- 1 KB mean RTT: 0.015 -> 0.016 ms (+0.001 ms (+6.67%))
- 1 KB P95 RTT: 0.017 -> 0.019 ms (+0.002 ms (+11.77%))
- 64 KB mean RTT: 0.220 -> 0.117 ms (-0.103 ms (-46.82%))
- 64 KB P95 RTT: 0.391 -> 0.123 ms (-0.268 ms (-68.54%))

