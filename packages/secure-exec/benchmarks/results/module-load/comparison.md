# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T12:45:53.747Z (9efe5dc13e3cba345660e3d91b0f194a2f16bd52)
Baseline benchmark: 2026-03-31T11:52:13.425Z (a5f06534200cd4f6131d64de2c0a09c1bee14d53)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`. When `_loadPolyfill` is relevant, also copy the split between real polyfill bodies and `__bd:*` bridge dispatch.

## Hono Startup

- Warm wall: 139.820 -> 139.820 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.259 -> 109.259 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.759 -> 2.759 ms (0.000 ms (0.00%))
- Bridge time/iteration: 15.695 -> 15.695 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 10.622 -> 10.622 ms (0.000 ms (0.00%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 5.001 -> 5.001 ms (0.000 ms (0.00%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## Hono End-to-End

- Warm wall: 141.644 -> 141.644 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 59.000 -> 59.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.618 -> 109.618 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.118 -> 2.118 ms (0.000 ms (0.00%))
- Bridge time/iteration: 21.653 -> 21.653 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 143871.000 -> 143871.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 3.000 -> 3.000 calls (0.000 calls (0.00%)); time 14.973 -> 14.973 ms (0.000 ms (0.00%)); response bytes 99859.333 -> 99859.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 55.000 -> 55.000 calls (0.000 calls (0.00%)); time 6.629 -> 6.629 ms (0.000 ms (0.00%)); response bytes 43964.667 -> 43964.667 bytes (0.000 bytes (0.00%))

## pdf-lib Startup

- Warm wall: 238.739 -> 238.739 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 514.000 -> 514.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.900 -> 109.900 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.400 -> 3.400 ms (0.000 ms (0.00%))
- Bridge time/iteration: 57.898 -> 57.898 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 682128.000 -> 682128.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 18.298 -> 18.298 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 506.000 -> 506.000 calls (0.000 calls (0.00%)); time 39.517 -> 39.517 ms (0.000 ms (0.00%)); response bytes 582021.667 -> 582021.667 bytes (0.000 bytes (0.00%))

## pdf-lib End-to-End

- Warm wall: 349.741 -> 349.741 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 529.000 -> 529.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.777 -> 111.777 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 4.777 -> 4.777 ms (0.000 ms (0.00%))
- Bridge time/iteration: 68.212 -> 68.212 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 682998.000 -> 682998.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 7.000 -> 7.000 calls (0.000 calls (0.00%)); time 13.766 -> 13.766 ms (0.000 ms (0.00%)); response bytes 100059.333 -> 100059.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 521.000 -> 521.000 calls (0.000 calls (0.00%)); time 54.328 -> 54.328 ms (0.000 ms (0.00%)); response bytes 582891.667 -> 582891.667 bytes (0.000 bytes (0.00%))

## JSZip Startup

- Warm wall: 172.202 -> 172.202 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 179.000 -> 179.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 111.102 -> 111.102 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 103.000 -> 103.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 3.603 -> 3.603 ms (0.000 ms (0.00%))
- Bridge time/iteration: 76.624 -> 76.624 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 421617.667 -> 421617.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 49.773 -> 49.773 ms (0.000 ms (0.00%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 161.000 -> 161.000 calls (0.000 calls (0.00%)); time 26.712 -> 26.712 ms (0.000 ms (0.00%)); response bytes 188021.333 -> 188021.333 bytes (0.000 bytes (0.00%))

## JSZip End-to-End

- Warm wall: 215.876 -> 215.876 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.703 -> 109.703 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.704 -> 2.704 ms (0.000 ms (0.00%))
- Bridge time/iteration: 62.309 -> 62.309 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 421791.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 43.519 -> 43.519 ms (0.000 ms (0.00%)); response bytes 233549.333 -> 233549.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 164.000 calls (0.000 calls (0.00%)); time 18.686 -> 18.686 ms (0.000 ms (0.00%)); response bytes 188195.333 -> 188195.333 bytes (0.000 bytes (0.00%))

## Pi SDK Startup

- Warm wall: 1780.762 -> 1767.451 ms (-13.311 ms (-0.75%))
- Bridge calls/iteration: 2548.000 -> 2520.000 calls (-28.000 calls (-1.10%))
- Warm fixed overhead: 116.058 -> 116.678 ms (+0.620 ms (+0.53%))
- Warm Create->InjectGlobals: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 103.000 -> 103.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 8.558 -> 9.178 ms (+0.620 ms (+7.25%))
- Bridge time/iteration: 1009.277 -> 986.253 ms (-23.024 ms (-2.28%))
- BridgeResponse encoded bytes/iteration: 3457969.667 -> 3578585.667 bytes (+120616.000 bytes (+3.49%))
- Largest method-time delta: `_resolveModule` 42.611 -> 0.000 ms/iteration (-42.611)
- Largest method-byte delta: `_loadPolyfill` 3451525.667 -> 3575127.667 encoded bytes/iteration (+123602.000)
- Largest frame-byte delta: `send:BridgeResponse` 3457969.667 -> 3578585.667 encoded bytes/iteration (+120616.000)
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 102.688 -> 105.242 ms (+2.554 ms (+2.49%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2444.000 -> 2437.000 calls (-7.000 calls (-0.29%)); time 863.152 -> 880.251 ms (+17.099 ms (+1.98%)); response bytes 2612354.000 -> 2735956.000 bytes (+123602.000 bytes (+4.73%))

## Pi SDK End-to-End

- Warm wall: 1857.941 -> 2054.149 ms (+196.208 ms (+10.56%))
- Bridge calls/iteration: 2788.000 -> 2754.000 calls (-34.000 calls (-1.22%))
- Warm fixed overhead: 116.371 -> 116.365 ms (-0.006 ms (-0.01%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 9.371 -> 9.865 ms (+0.494 ms (+5.27%))
- Bridge time/iteration: 1060.960 -> 1092.643 ms (+31.683 ms (+2.99%))
- BridgeResponse encoded bytes/iteration: 3602748.667 -> 3723168.667 bytes (+120420.000 bytes (+3.34%))
- Largest method-time delta: `_loadPolyfill` 984.662 -> 1049.312 ms/iteration (+64.650)
- Largest method-byte delta: `_loadPolyfill` 3592602.667 -> 3716308.667 encoded bytes/iteration (+123706.000)
- Largest frame-byte delta: `send:BridgeResponse` 3602748.667 -> 3723168.667 encoded bytes/iteration (+120420.000)
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 87.590 -> 105.064 ms (+17.474 ms (+19.95%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2638.000 -> 2631.000 calls (-7.000 calls (-0.27%)); time 897.073 -> 944.248 ms (+47.175 ms (+5.26%)); response bytes 2753381.000 -> 2877087.000 bytes (+123706.000 bytes (+4.49%))

## Pi CLI Startup

- Warm wall: 1854.094 -> 1977.525 ms (+123.431 ms (+6.66%))
- Bridge calls/iteration: 2604.000 -> 2571.000 calls (-33.000 calls (-1.27%))
- Warm fixed overhead: 114.551 -> 116.726 ms (+2.175 ms (+1.90%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 102.500 -> 101.500 ms (-1.000 ms (-0.98%))
- Warm residual overhead: 7.051 -> 10.226 ms (+3.175 ms (+45.03%))
- Bridge time/iteration: 1017.137 -> 1139.764 ms (+122.627 ms (+12.06%))
- BridgeResponse encoded bytes/iteration: 3466269.333 -> 3581302.667 bytes (+115033.334 bytes (+3.32%))
- Largest method-time delta: `_loadPolyfill` 896.110 -> 1072.026 ms/iteration (+175.916)
- Largest method-byte delta: `_loadPolyfill` 3457130.333 -> 3575299.667 encoded bytes/iteration (+118169.334)
- Largest frame-byte delta: `send:BridgeResponse` 3466269.333 -> 3581302.667 encoded bytes/iteration (+115033.334)
- _loadPolyfill real polyfill-body loads: calls 79.000 -> 79.000 calls (0.000 calls (0.00%)); time 102.925 -> 102.284 ms (-0.641 ms (-0.62%)); response bytes 839171.667 -> 839171.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2449.000 -> 2440.000 calls (-9.000 calls (-0.37%)); time 793.186 -> 969.742 ms (+176.556 ms (+22.26%)); response bytes 2617958.667 -> 2736128.000 bytes (+118169.333 bytes (+4.51%))

## Pi CLI End-to-End

- Warm wall: 1993.647 -> 1746.020 ms (-247.627 ms (-12.42%))
- Bridge calls/iteration: 2823.000 -> 2781.000 calls (-42.000 calls (-1.49%))
- Warm fixed overhead: 8.235 -> 8.521 ms (+0.286 ms (+3.47%))
- Warm Create->InjectGlobals: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.734 -> 3.521 ms (+0.787 ms (+28.79%))
- Bridge time/iteration: 1076.527 -> 1067.460 ms (-9.067 ms (-0.84%))
- BridgeResponse encoded bytes/iteration: 3614150.667 -> 3728838.000 bytes (+114687.333 bytes (+3.17%))
- Largest method-time delta: `_loadPolyfill` 944.730 -> 999.854 ms/iteration (+55.124)
- Largest method-byte delta: `_loadPolyfill` 3598434.333 -> 3716707.667 encoded bytes/iteration (+118273.334)
- Largest frame-byte delta: `send:BridgeResponse` 3614150.667 -> 3728838.000 encoded bytes/iteration (+114687.333)
- _loadPolyfill real polyfill-body loads: calls 80.000 -> 80.000 calls (0.000 calls (0.00%)); time 114.967 -> 109.059 ms (-5.908 ms (-5.14%)); response bytes 839221.667 -> 839221.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2647.000 -> 2638.000 calls (-9.000 calls (-0.34%)); time 829.763 -> 890.794 ms (+61.031 ms (+7.36%)); response bytes 2759212.667 -> 2877486.000 bytes (+118273.333 bytes (+4.29%))

## Transport RTT

- Connect RTT: 0.244 -> 0.244 ms (0.000 ms (0.00%))
- 1 B mean RTT: 0.083 -> 0.083 ms (0.000 ms (0.00%))
- 1 B P95 RTT: 0.127 -> 0.127 ms (0.000 ms (0.00%))
- 1 KB mean RTT: 0.047 -> 0.047 ms (0.000 ms (0.00%))
- 1 KB P95 RTT: 0.083 -> 0.083 ms (0.000 ms (0.00%))
- 64 KB mean RTT: 0.120 -> 0.120 ms (0.000 ms (0.00%))
- 64 KB P95 RTT: 0.154 -> 0.154 ms (0.000 ms (0.00%))

