# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T10:39:00.515Z (96164a4c4cc10ca38a643067fa4ff87be490a85a)
Baseline benchmark: none

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 142.239 -> 154.125 ms (+11.886 ms (+8.36%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.936 -> 109.961 ms (+1.025 ms (+0.94%))
- Warm Create->InjectGlobals: 0.500 -> 1.000 ms (+0.500 ms (+100.00%))
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 1.936 -> 2.461 ms (+0.525 ms (+27.12%))
- Bridge time/iteration: 28.606 -> 26.466 ms (-2.140 ms (-7.48%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 28.515 -> 26.212 ms/iteration (-2.303)
- Largest frame-byte delta: `send:Execute` 1242094.000 -> 1243801.000 encoded bytes/iteration (+1707.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 22.497 -> 14.693 ms (-7.804 ms (-34.69%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 6.018 -> 11.518 ms (+5.500 ms (+91.39%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## Hono End-to-End

- Warm wall: 145.074 -> 150.765 ms (+5.691 ms (+3.92%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.294 -> 108.845 ms (-0.449 ms (-0.41%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 101.500 ms (-1.000 ms (-0.98%))
- Warm residual overhead: 1.294 -> 1.845 ms (+0.551 ms (+42.58%))
- Bridge time/iteration: 29.641 -> 22.935 ms (-6.706 ms (-22.62%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 29.391 -> 22.864 ms/iteration (-6.527)
- Largest frame-byte delta: `send:Execute` 1242211.000 -> 1243918.000 encoded bytes/iteration (+1707.000)
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 20.450 -> 16.243 ms (-4.207 ms (-20.57%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 8.941 -> 6.621 ms (-2.320 ms (-25.95%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## pdf-lib Startup

- Warm wall: 326.296 -> 393.688 ms (+67.392 ms (+20.65%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 110.662 -> 110.483 ms (-0.179 ms (-0.16%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.662 -> 3.484 ms (-0.178 ms (-4.86%))
- Bridge time/iteration: 91.850 -> 74.966 ms (-16.884 ms (-18.38%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 91.702 -> 74.815 ms/iteration (-16.887)
- Largest frame-byte delta: `send:Execute` 1242216.000 -> 1243923.000 encoded bytes/iteration (+1707.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 16.919 -> 10.385 ms (-6.534 ms (-38.62%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 74.784 -> 64.430 ms (-10.354 ms (-13.85%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

## pdf-lib End-to-End

- Warm wall: 315.611 -> 395.505 ms (+79.894 ms (+25.31%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.407 -> 111.662 ms (+0.255 ms (+0.23%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 4.907 -> 4.162 ms (-0.745 ms (-15.18%))
- Bridge time/iteration: 64.547 -> 70.243 ms (+5.696 ms (+8.82%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 64.451 -> 70.165 ms/iteration (+5.714)
- Largest frame-byte delta: `send:Execute` 1242955.000 -> 1244662.000 encoded bytes/iteration (+1707.000)
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 22.100 -> 15.710 ms (-6.390 ms (-28.91%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 42.351 -> 54.455 ms (+12.104 ms (+28.58%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

## JSZip Startup

- Warm wall: 175.055 -> 188.114 ms (+13.059 ms (+7.46%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.960 -> 109.624 ms (+0.664 ms (+0.61%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.460 -> 2.624 ms (+0.164 ms (+6.67%))
- Bridge time/iteration: 39.272 -> 54.071 ms (+14.799 ms (+37.68%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 39.221 -> 53.965 ms/iteration (+14.744)
- Largest frame-byte delta: `send:Execute` 1242215.000 -> 1243922.000 encoded bytes/iteration (+1707.000)
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 26.080 -> 37.603 ms (+11.523 ms (+44.18%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 13.142 -> 16.363 ms (+3.221 ms (+24.51%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

## JSZip End-to-End

- No previous baseline was available for this scenario.

## Pi SDK Startup

- No previous baseline was available for this scenario.

## Pi SDK End-to-End

- No previous baseline was available for this scenario.

## Pi CLI Startup

- No previous baseline was available for this scenario.

## Pi CLI End-to-End

- No previous baseline was available for this scenario.

## Transport RTT

- No previous baseline was available for transport RTT.

