# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T20:10:29.899Z (834a057fb04ac9b702b78c7d40d5bdfa3558dc0e)
Baseline benchmark: 2026-03-31T13:28:50.274Z (be83b6fdd9fec12d9037d0ec08d0d360d3c33f30)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 140.959 -> 140.959 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.115 -> 109.115 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.615 -> 1.615 ms (0.000 ms (0.00%))
- Bridge time/iteration: 38.499 -> 38.499 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 29.585 -> 29.585 ms (0.000 ms (0.00%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 8.779 -> 8.779 ms (0.000 ms (0.00%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## Hono End-to-End

- Warm wall: 139.728 -> 139.728 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.456 -> 109.456 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.456 -> 1.456 ms (0.000 ms (0.00%))
- Bridge time/iteration: 17.021 -> 17.021 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.759 -> 10.759 ms (0.000 ms (0.00%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 6.160 -> 6.160 ms (0.000 ms (0.00%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## pdf-lib Startup

- Warm wall: 353.377 -> 353.377 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.105 -> 110.105 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 103.000 -> 103.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.104 -> 2.104 ms (0.000 ms (0.00%))
- Bridge time/iteration: 80.914 -> 80.914 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 13.470 -> 13.470 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 67.336 -> 67.336 ms (0.000 ms (0.00%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

## pdf-lib End-to-End

- Warm wall: 362.870 -> 362.870 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.424 -> 111.424 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.924 -> 3.924 ms (0.000 ms (0.00%))
- Bridge time/iteration: 59.917 -> 59.917 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 10.038 -> 10.038 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 49.754 -> 49.754 ms (0.000 ms (0.00%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

## JSZip Startup

- Warm wall: 169.488 -> 169.488 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.156 -> 109.156 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.656 -> 2.656 ms (0.000 ms (0.00%))
- Bridge time/iteration: 53.999 -> 53.999 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 35.764 -> 35.764 ms (0.000 ms (0.00%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 18.094 -> 18.094 ms (0.000 ms (0.00%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

## JSZip End-to-End

- Warm wall: 193.293 -> 193.293 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.653 -> 108.653 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 1.000 -> 1.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.653 -> 1.653 ms (0.000 ms (0.00%))
- Bridge time/iteration: 59.496 -> 59.496 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 421791.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 44.497 -> 44.497 ms (0.000 ms (0.00%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 164.000 calls (0.000 calls (0.00%)); time 14.882 -> 14.882 ms (0.000 ms (0.00%)); response bytes 188195.333 -> 188195.333 bytes (0.000 bytes (0.00%))

## Pi SDK Startup

- Warm wall: 1668.363 -> 1707.406 ms (+39.043 ms (+2.34%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 115.606 -> 9.018 ms (-106.588 ms (-92.20%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 0.000 ms (-102.500 ms (-100.00%))
- Warm residual overhead: 7.606 -> 3.518 ms (-4.088 ms (-53.75%))
- Bridge time/iteration: 818.355 -> 920.916 ms (+102.561 ms (+12.53%))
- BridgeResponse encoded bytes/iteration: 3497993.667 -> 7506336.667 bytes (+4008343.000 bytes (+114.59%))
- Largest method-time delta: `_bridgeDispatch` 0.000 -> 850.245 ms/iteration (+850.245)
- Largest method-byte delta: `_bridgeDispatch` 0.000 -> 6744299.000 encoded bytes/iteration (+6744299.000)
- Largest frame-byte delta: `send:BridgeResponse` 3497993.667 -> 7506336.667 encoded bytes/iteration (+4008343.000)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 75.899 -> 69.902 ms (-5.997 ms (-7.90%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2437.000 -> 0.000 calls (-2437.000 calls (-100.00%)); time 741.039 -> 0.000 ms (-741.039 ms (-100.00%)); response bytes 2735956.000 -> 0.000 bytes (-2735956.000 bytes (-100.00%))

## Pi SDK End-to-End

- Warm wall: 1835.606 -> 1835.606 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2745.000 -> 2745.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 116.839 -> 116.839 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 9.339 -> 9.339 ms (0.000 ms (0.00%))
- Bridge time/iteration: 938.761 -> 938.761 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 3642576.667 -> 3642576.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 77.999 -> 77.999 ms (0.000 ms (0.00%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2631.000 -> 2631.000 calls (0.000 calls (0.00%)); time 812.973 -> 812.973 ms (0.000 ms (0.00%)); response bytes 2877087.000 -> 2877087.000 bytes (0.000 bytes (0.00%))

## Pi CLI Startup

- Warm wall: 1809.331 -> 1737.108 ms (-72.223 ms (-3.99%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 117.805 -> 9.105 ms (-108.700 ms (-92.27%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 0.000 ms (-102.000 ms (-100.00%))
- Warm residual overhead: 10.305 -> 3.605 ms (-6.700 ms (-65.02%))
- Bridge time/iteration: 987.059 -> 899.960 ms (-87.099 ms (-8.82%))
- BridgeResponse encoded bytes/iteration: 3500710.000 -> 7509075.333 bytes (+4008365.333 bytes (+114.50%))
- Largest method-time delta: `_loadPolyfill` 932.045 -> 64.531 ms/iteration (-867.514)
- Largest method-byte delta: `_bridgeDispatch` 0.000 -> 6744496.000 encoded bytes/iteration (+6744496.000)
- Largest frame-byte delta: `send:BridgeResponse` 3500710.000 -> 7509075.333 encoded bytes/iteration (+4008365.333)
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 83.558 -> 64.531 ms (-19.027 ms (-22.77%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2440.000 -> 0.000 calls (-2440.000 calls (-100.00%)); time 848.487 -> 0.000 ms (-848.487 ms (-100.00%)); response bytes 2736128.000 -> 0.000 bytes (-2736128.000 bytes (-100.00%))

## Pi CLI End-to-End

- Warm wall: 1926.880 -> 1926.880 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 13.261 -> 13.261 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 7.760 -> 7.760 ms (0.000 ms (0.00%))
- Bridge time/iteration: 1010.667 -> 1010.667 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 3648246.667 -> 3648246.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 78.924 -> 78.924 ms (0.000 ms (0.00%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 2638.000 calls (0.000 calls (0.00%)); time 859.059 -> 859.059 ms (0.000 ms (0.00%)); response bytes 2877486.000 -> 2877486.000 bytes (0.000 bytes (0.00%))

