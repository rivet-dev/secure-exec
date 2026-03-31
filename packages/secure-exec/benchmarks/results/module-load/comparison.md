# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T05:47:54.440Z (88d1992eeca4a42f5db14755c593d86a2d776481)
Baseline benchmark: 2026-03-31T05:29:53.612Z (6197d51aa59337c452dded8d5317cab31e30b8a5)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`.

## Hono Startup

- Warm wall: 143.668 -> 149.600 ms (+5.932 ms (+4.13%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.096 -> 113.206 ms (+5.110 ms (+4.73%))
- Warm Create->InjectGlobals: 0.500 -> 1.000 ms (+0.500 ms (+100.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.596 -> 5.206 ms (+4.610 ms (+773.49%))
- Bridge time/iteration: 20.530 -> 16.572 ms (-3.958 ms (-19.28%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 20.373 -> 16.518 ms/iteration (-3.855)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## Hono End-to-End

- Warm wall: 158.059 -> 149.463 ms (-8.596 ms (-5.44%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.936 -> 108.507 ms (+0.571 ms (+0.53%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.936 -> 1.508 ms (+0.572 ms (+61.11%))
- Bridge time/iteration: 19.030 -> 19.269 ms (+0.239 ms (+1.26%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 18.976 -> 19.199 ms/iteration (+0.223)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## pdf-lib Startup

- Warm wall: 283.235 -> 314.083 ms (+30.848 ms (+10.89%))
- Bridge calls/iteration: 1651.000 -> 1651.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.558 -> 108.981 ms (+1.423 ms (+1.32%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.500 -> 5.000 ms (-0.500 ms (-9.09%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.058 -> 2.481 ms (+2.423 ms (+4177.59%))
- Bridge time/iteration: 63.273 -> 64.700 ms (+1.427 ms (+2.25%))
- BridgeResponse encoded bytes/iteration: 1918520.000 -> 1918520.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 63.188 -> 64.567 ms/iteration (+1.379)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## pdf-lib End-to-End

- Warm wall: 346.978 -> 387.063 ms (+40.085 ms (+11.55%))
- Bridge calls/iteration: 1666.000 -> 1666.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.320 -> 109.839 ms (+2.519 ms (+2.35%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: -0.180 -> 2.338 ms (+2.518 ms (-1398.89%))
- Bridge time/iteration: 64.197 -> 71.049 ms (+6.852 ms (+10.67%))
- BridgeResponse encoded bytes/iteration: 1919390.000 -> 1919390.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 64.109 -> 70.926 ms/iteration (+6.817)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## JSZip Startup

- Warm wall: 179.459 -> 177.165 ms (-2.294 ms (-1.28%))
- Bridge calls/iteration: 405.000 -> 405.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.322 -> 108.367 ms (+1.045 ms (+0.97%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.322 -> 1.367 ms (+1.045 ms (+324.53%))
- Bridge time/iteration: 85.171 -> 55.965 ms (-29.206 ms (-34.29%))
- BridgeResponse encoded bytes/iteration: 1207899.000 -> 1207899.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 85.118 -> 55.914 ms/iteration (-29.204)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## JSZip End-to-End

- Warm wall: 588.452 -> 552.962 ms (-35.490 ms (-6.03%))
- Bridge calls/iteration: 519.000 -> 519.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.377 -> 108.426 ms (+1.049 ms (+0.98%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.378 -> 1.426 ms (+1.048 ms (+277.25%))
- Bridge time/iteration: 80.354 -> 46.083 ms (-34.271 ms (-42.65%))
- BridgeResponse encoded bytes/iteration: 1214540.000 -> 1214540.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 80.144 -> 45.999 ms/iteration (-34.145)
- Largest frame-byte delta: `send:Execute` 1242293.000 -> 1242365.000 encoded bytes/iteration (+72.000)

## Pi SDK Startup

- Warm wall: 1629.538 -> 1441.818 ms (-187.720 ms (-11.52%))
- Bridge calls/iteration: 5278.000 -> 5278.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.279 -> 112.577 ms (+5.298 ms (+4.94%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.000 ms (-0.500 ms (-11.11%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.279 -> 6.577 ms (+6.298 ms (+2257.35%))
- Bridge time/iteration: 919.609 -> 655.910 ms (-263.699 ms (-28.68%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9362446.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 881.464 -> 614.728 ms/iteration (-266.736)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## Pi SDK End-to-End

- Warm wall: 1334.696 -> 1294.301 ms (-40.395 ms (-3.03%))
- Bridge calls/iteration: 5747.000 -> 5747.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 106.892 -> 109.273 ms (+2.381 ms (+2.23%))
- Warm Create->InjectGlobals: 0.500 -> 1.000 ms (+0.500 ms (+100.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.000 ms (-0.500 ms (-11.11%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.392 -> 2.773 ms (+2.381 ms (+607.40%))
- Bridge time/iteration: 626.718 -> 660.320 ms (+33.602 ms (+5.36%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9715780.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 556.728 -> 587.640 ms/iteration (+30.912)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## Pi CLI Startup

- Warm wall: 1948.524 -> 1735.594 ms (-212.930 ms (-10.93%))
- Bridge calls/iteration: 5336.000 -> 5336.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.761 -> 111.233 ms (+3.472 ms (+3.22%))
- Warm Create->InjectGlobals: 1.000 -> 1.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: -0.239 -> 3.232 ms (+3.471 ms (-1452.30%))
- Bridge time/iteration: 1103.810 -> 740.932 ms (-362.878 ms (-32.88%))
- BridgeResponse encoded bytes/iteration: 9381016.000 -> 9381016.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 994.653 -> 636.155 ms/iteration (-358.498)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## Pi CLI End-to-End

- Warm wall: 1471.664 -> 1959.386 ms (+487.722 ms (+33.14%))
- Bridge calls/iteration: 5784.000 -> 5784.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.091 -> 9.326 ms (+4.235 ms (+83.19%))
- Warm Create->InjectGlobals: 1.000 -> 0.500 ms (-0.500 ms (-50.00%))
- Warm InjectGlobals->Execute: 3.500 -> 5.000 ms (+1.500 ms (+42.86%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.591 -> 3.826 ms (+3.235 ms (+547.38%))
- Bridge time/iteration: 843.151 -> 975.198 ms (+132.047 ms (+15.66%))
- BridgeResponse encoded bytes/iteration: 9737451.667 -> 9737453.000 bytes (+1.333 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 741.734 -> 861.924 ms/iteration (+120.190)
- Largest method-byte delta: `_fsStat` 205.667 -> 207.000 encoded bytes/iteration (+1.333)
- Largest frame-byte delta: `send:Ping` 0.000 -> 38.000 encoded bytes/iteration (+38.000)

## Transport RTT

- Connect RTT: 0.200 -> 0.194 ms (-0.006 ms (-3.00%))
- 1 B mean RTT: 0.022 -> 0.024 ms (+0.002 ms (+9.09%))
- 1 B P95 RTT: 0.033 -> 0.032 ms (-0.001 ms (-3.03%))
- 1 KB mean RTT: 0.017 -> 0.015 ms (-0.002 ms (-11.77%))
- 1 KB P95 RTT: 0.019 -> 0.017 ms (-0.002 ms (-10.53%))
- 64 KB mean RTT: 0.128 -> 0.220 ms (+0.092 ms (+71.88%))
- 64 KB P95 RTT: 0.133 -> 0.391 ms (+0.258 ms (+193.99%))

