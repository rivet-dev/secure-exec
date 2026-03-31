# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T10:16:48.972Z (15fe74822735b30a00317370009fb788e86855e3)
Baseline benchmark: 2026-03-31T09:40:59.609Z (4aae2210f7fa581952f107153f551fbe2530285c)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 143.079 -> 143.079 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.603 -> 110.603 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.103 -> 3.103 ms (0.000 ms (0.00%))
- Bridge time/iteration: 14.635 -> 14.635 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 206202.333 -> 206202.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.294 -> 10.294 ms (0.000 ms (0.00%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 4.279 -> 4.279 ms (0.000 ms (0.00%)); response bytes 106296.000 -> 106296.000 bytes (0.000 bytes (0.00%))

## Hono End-to-End

- Warm wall: 150.142 -> 150.142 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.981 -> 109.981 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.981 -> 2.981 ms (0.000 ms (0.00%))
- Bridge time/iteration: 16.419 -> 16.419 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 206202.333 -> 206202.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 11.237 -> 11.237 ms (0.000 ms (0.00%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 5.107 -> 5.107 ms (0.000 ms (0.00%)); response bytes 106296.000 -> 106296.000 bytes (0.000 bytes (0.00%))

## pdf-lib Startup

- Warm wall: 330.374 -> 330.374 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.281 -> 111.281 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.282 -> 3.282 ms (0.000 ms (0.00%))
- Bridge time/iteration: 71.365 -> 71.365 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1617593.333 -> 1617593.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 22.105 -> 22.105 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 49.172 -> 49.172 ms (0.000 ms (0.00%)); response bytes 1517487.000 -> 1517487.000 bytes (0.000 bytes (0.00%))

## pdf-lib End-to-End

- Warm wall: 342.928 -> 342.928 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 112.789 -> 112.789 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 5.289 -> 5.289 ms (0.000 ms (0.00%))
- Bridge time/iteration: 71.123 -> 71.123 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1618463.333 -> 1618463.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 24.324 -> 24.324 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 46.691 -> 46.691 ms (0.000 ms (0.00%)); response bytes 1518357.000 -> 1518357.000 bytes (0.000 bytes (0.00%))

## JSZip Startup

- Warm wall: 206.266 -> 206.266 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.216 -> 109.216 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.000 -> 4.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.716 -> 2.716 ms (0.000 ms (0.00%))
- Bridge time/iteration: 53.164 -> 53.164 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 725180.333 -> 725180.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 28.411 -> 28.411 ms (0.000 ms (0.00%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 24.652 -> 24.652 ms (0.000 ms (0.00%)); response bytes 491584.000 -> 491584.000 bytes (0.000 bytes (0.00%))

## JSZip End-to-End

- Warm wall: 552.962 -> 552.962 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 63.667 -> 63.667 calls (0.000 calls (0.00%))
- Warm fixed overhead: -
- Warm Create->InjectGlobals: -
- Warm InjectGlobals->Execute: -
- Warm ExecutionResult->Destroy: -
- Warm residual overhead: -
- Bridge time/iteration: 58.723 -> 58.723 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 396786.667 -> 396786.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 5.667 -> 5.667 calls (0.000 calls (0.00%)); time 41.549 -> 41.549 ms (0.000 ms (0.00%)); response bytes 232670.667 -> 232670.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 58.000 -> 58.000 calls (0.000 calls (0.00%)); time 17.174 -> 17.174 ms (0.000 ms (0.00%)); response bytes 164116.000 -> 164116.000 bytes (0.000 bytes (0.00%))

## Pi SDK Startup

- Warm wall: 1729.225 -> 1184.332 ms (-544.893 ms (-31.51%))
- Bridge calls/iteration: 2548.000 -> 2548.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.534 -> 112.421 ms (-5.113 ms (-4.35%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 101.000 ms (-1.500 ms (-1.46%))
- Warm residual overhead: 10.034 -> 6.421 ms (-3.613 ms (-36.01%))
- Bridge time/iteration: 899.396 -> 614.921 ms (-284.475 ms (-31.63%))
- BridgeResponse encoded bytes/iteration: 7475865.667 -> 3455603.667 bytes (-4020262.000 bytes (-53.78%))
- Largest method-time delta: `_loadPolyfill` 844.908 -> 576.566 ms/iteration (-268.342)
- Largest method-byte delta: `_loadPolyfill` 7469421.667 -> 3449159.667 encoded bytes/iteration (-4020262.000)
- Largest frame-byte delta: `send:BridgeResponse` 7475865.667 -> 3455603.667 encoded bytes/iteration (-4020262.000)
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 116.126 -> 70.621 ms (-45.505 ms (-39.19%)); response bytes 839171.667 -> 836805.667 bytes (-2366.000 bytes (-0.28%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2444.000 -> 2444.000 calls (0.000 calls (0.00%)); time 728.782 -> 505.945 ms (-222.837 ms (-30.58%)); response bytes 6630250.000 -> 2612354.000 bytes (-4017896.000 bytes (-60.60%))

## Pi SDK End-to-End

- Warm wall: 1949.559 -> 1949.559 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 929.333 -> 929.333 calls (0.000 calls (0.00%))
- Warm fixed overhead: -
- Warm Create->InjectGlobals: 1.000 -> 1.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: -
- Warm residual overhead: -
- Bridge time/iteration: 439.824 -> 439.824 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 3159486.000 -> 3159486.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 26.667 -> 26.667 calls (0.000 calls (0.00%)); time 103.451 -> 103.451 ms (0.000 ms (0.00%)); response bytes 835844.333 -> 835844.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 879.333 -> 879.333 calls (0.000 calls (0.00%)); time 300.454 -> 300.454 ms (0.000 ms (0.00%)); response bytes 2320259.667 -> 2320259.667 bytes (0.000 bytes (0.00%))

## Pi CLI Startup

- Warm wall: 1697.463 -> 1335.294 ms (-362.169 ms (-21.34%))
- Bridge calls/iteration: 2604.000 -> 2604.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 118.185 -> 117.153 ms (-1.032 ms (-0.87%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 10.685 -> 10.152 ms (-0.533 ms (-4.99%))
- Bridge time/iteration: 995.774 -> 746.169 ms (-249.605 ms (-25.07%))
- BridgeResponse encoded bytes/iteration: 7494335.000 -> 3463902.000 bytes (-4030433.000 bytes (-53.78%))
- Largest method-time delta: `_loadPolyfill` 895.929 -> 648.443 ms/iteration (-247.486)
- Largest method-byte delta: `_loadPolyfill` 7485196.667 -> 3454764.333 encoded bytes/iteration (-4030432.334)
- Largest frame-byte delta: `send:BridgeResponse` 7494335.000 -> 3463902.000 encoded bytes/iteration (-4030433.000)
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 117.951 -> 76.686 ms (-41.265 ms (-34.98%)); response bytes 839171.667 -> 836805.667 bytes (-2366.000 bytes (-0.28%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2449.000 -> 2449.000 calls (0.000 calls (0.00%)); time 777.979 -> 571.757 ms (-206.222 ms (-26.51%)); response bytes 6646025.000 -> 2617958.667 bytes (-4028066.333 bytes (-60.61%))

## Pi CLI End-to-End

- Warm wall: 1770.193 -> 1770.193 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2823.000 -> 2823.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 11.691 -> 11.691 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 5.691 -> 5.691 ms (0.000 ms (0.00%))
- Bridge time/iteration: 1031.608 -> 1031.608 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 7831719.667 -> 7831719.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 100.298 -> 100.298 ms (0.000 ms (0.00%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2647.000 -> 2647.000 calls (0.000 calls (0.00%)); time 789.497 -> 789.497 ms (0.000 ms (0.00%)); response bytes 6976781.000 -> 6976781.000 bytes (0.000 bytes (0.00%))

## Transport RTT

- Connect RTT: 0.194 -> 0.173 ms (-0.021 ms (-10.82%))
- 1 B mean RTT: 0.024 -> 0.024 ms (0.000 ms (0.00%))
- 1 B P95 RTT: 0.032 -> 0.043 ms (+0.011 ms (+34.38%))
- 1 KB mean RTT: 0.015 -> 0.016 ms (+0.001 ms (+6.67%))
- 1 KB P95 RTT: 0.017 -> 0.019 ms (+0.002 ms (+11.77%))
- 64 KB mean RTT: 0.220 -> 0.117 ms (-0.103 ms (-46.82%))
- 64 KB P95 RTT: 0.391 -> 0.123 ms (-0.268 ms (-68.54%))

