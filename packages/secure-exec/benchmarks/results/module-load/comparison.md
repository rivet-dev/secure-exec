# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T05:05:15.176Z (9adad215396587b45268138893f1efffe08c06ed)
Baseline benchmark: 2026-03-31T05:03:50.186Z (9adad215396587b45268138893f1efffe08c06ed)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`.

## Hono Startup

- Warm wall: 158.655 -> 151.127 ms (-7.528 ms (-4.75%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.977 -> 107.166 ms (-0.811 ms (-0.75%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 101.500 ms (-1.000 ms (-0.98%))
- Warm residual overhead: 0.478 -> 0.665 ms (+0.187 ms (+39.12%))
- Bridge time/iteration: 18.284 -> 25.744 ms (+7.460 ms (+40.80%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 18.208 -> 25.621 ms/iteration (+7.413)

## Hono End-to-End

- Warm wall: 145.863 -> 142.192 ms (-3.671 ms (-2.52%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.204 -> 107.334 ms (-0.870 ms (-0.80%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 101.500 ms (-1.000 ms (-0.98%))
- Warm residual overhead: 0.705 -> 0.834 ms (+0.129 ms (+18.30%))
- Bridge time/iteration: 21.852 -> 18.511 ms (-3.341 ms (-15.29%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 21.799 -> 18.455 ms/iteration (-3.344)

## Pi SDK Startup

- Warm wall: 1617.322 -> 1605.896 ms (-11.426 ms (-0.71%))
- Bridge calls/iteration: 5278.000 -> 5278.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.416 -> 107.982 ms (+0.566 ms (+0.53%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm ExecutionResult->Destroy: 102.500 -> 103.500 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 0.915 -> -0.518 ms (-1.433 ms (-156.61%))
- Bridge time/iteration: 832.306 -> 854.939 ms (+22.633 ms (+2.72%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9362446.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 785.697 -> 813.611 ms/iteration (+27.914)

## Pi SDK End-to-End

- Warm wall: 1870.868 -> 1991.222 ms (+120.354 ms (+6.43%))
- Bridge calls/iteration: 5747.000 -> 5747.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.290 -> 107.215 ms (-0.075 ms (-0.07%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.290 -> 0.715 ms (+0.425 ms (+146.55%))
- Bridge time/iteration: 879.758 -> 1009.139 ms (+129.381 ms (+14.71%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9715780.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 800.693 -> 935.682 ms/iteration (+134.989)

## Pi CLI Startup

- Warm wall: 1920.839 -> 1927.126 ms (+6.287 ms (+0.33%))
- Bridge calls/iteration: 5336.000 -> 5336.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.693 -> 107.510 ms (-0.183 ms (-0.17%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 4.000 ms (-0.500 ms (-11.11%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.693 -> 0.509 ms (-0.184 ms (-26.55%))
- Bridge time/iteration: 905.879 -> 1071.685 ms (+165.806 ms (+18.30%))
- BridgeResponse encoded bytes/iteration: 9381013.333 -> 9381014.000 bytes (+0.667 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 815.840 -> 977.736 ms/iteration (+161.896)
- Largest method-byte delta: `_fsStat` 204.333 -> 205.000 encoded bytes/iteration (+0.667)
- Largest frame-byte delta: `send:BridgeResponse` 9381013.333 -> 9381014.000 encoded bytes/iteration (+0.667)

## Pi CLI End-to-End

- Warm wall: 1734.487 -> 1749.175 ms (+14.688 ms (+0.85%))
- Bridge calls/iteration: 5784.000 -> 5784.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.563 -> 5.340 ms (-0.223 ms (-4.01%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm residual overhead: 0.064 -> 0.840 ms (+0.776 ms (+1212.50%))
- Bridge time/iteration: 966.936 -> 929.697 ms (-37.239 ms (-3.85%))
- BridgeResponse encoded bytes/iteration: 9737452.333 -> 9737452.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 862.442 -> 826.220 ms/iteration (-36.222)

## Transport RTT

- Connect RTT: 0.210 -> 0.198 ms (-0.012 ms (-5.71%))
- 1 B mean RTT: 0.024 -> 0.022 ms (-0.002 ms (-8.33%))
- 1 B P95 RTT: 0.036 -> 0.040 ms (+0.004 ms (+11.11%))
- 1 KB mean RTT: 0.022 -> 0.017 ms (-0.005 ms (-22.73%))
- 1 KB P95 RTT: 0.030 -> 0.020 ms (-0.010 ms (-33.33%))
- 64 KB mean RTT: 0.334 -> 0.143 ms (-0.191 ms (-57.19%))
- 64 KB P95 RTT: 0.725 -> 0.181 ms (-0.544 ms (-75.03%))

