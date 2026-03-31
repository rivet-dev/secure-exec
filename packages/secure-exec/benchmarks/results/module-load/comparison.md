# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T04:43:52.284Z (3772f039226af33b598e63088829fd4f39b345d3)
Baseline benchmark: 2026-03-31T04:38:53.052Z (3772f039226af33b598e63088829fd4f39b345d3)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`.

## Hono Startup

- Warm wall: 142.094 -> 167.784 ms (+25.690 ms (+18.08%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.660 -> 109.038 ms (+1.378 ms (+1.28%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm ExecutionResult->Destroy: 102.500 -> 103.500 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 0.160 -> 0.538 ms (+0.378 ms (+236.25%))
- Bridge time/iteration: 18.681 -> 22.987 ms (+4.306 ms (+23.05%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 18.621 -> 22.890 ms/iteration (+4.269)

## Hono End-to-End

- Warm wall: 145.766 -> 146.134 ms (+0.368 ms (+0.25%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.660 -> 107.780 ms (+0.120 ms (+0.11%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.161 -> 0.280 ms (+0.119 ms (+73.91%))
- Bridge time/iteration: 21.043 -> 17.671 ms (-3.372 ms (-16.02%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 20.887 -> 17.628 ms/iteration (-3.259)

## Pi SDK Startup

- Warm wall: 1747.363 -> 1645.959 ms (-101.404 ms (-5.80%))
- Bridge calls/iteration: 5278.000 -> 5278.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 106.775 -> 107.634 ms (+0.859 ms (+0.80%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.000 -> 4.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 0.275 -> 0.634 ms (+0.359 ms (+130.54%))
- Bridge time/iteration: 965.190 -> 879.118 ms (-86.072 ms (-8.92%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9362446.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 926.751 -> 836.082 ms/iteration (-90.669)

## Pi SDK End-to-End

- Warm wall: 1669.619 -> 1884.760 ms (+215.141 ms (+12.89%))
- Bridge calls/iteration: 5747.000 -> 5747.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.471 -> 106.159 ms (-1.312 ms (-1.22%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 100.500 ms (-1.500 ms (-1.47%))
- Warm residual overhead: 0.971 -> 1.159 ms (+0.188 ms (+19.36%))
- Bridge time/iteration: 919.529 -> 892.642 ms (-26.887 ms (-2.92%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9715780.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_resolveModule` 61.455 -> 41.287 ms/iteration (-20.168)

## Pi CLI Startup

- Warm wall: 1800.466 -> 1924.517 ms (+124.051 ms (+6.89%))
- Bridge calls/iteration: 5336.000 -> 5336.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.912 -> 107.356 ms (-0.556 ms (-0.52%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.500 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 0.911 -> 0.356 ms (-0.555 ms (-60.92%))
- Bridge time/iteration: 885.364 -> 997.710 ms (+112.346 ms (+12.69%))
- BridgeResponse encoded bytes/iteration: 9381015.333 -> 9381015.333 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 778.226 -> 897.458 ms/iteration (+119.232)

## Pi CLI End-to-End

- Warm wall: 1707.913 -> 2026.762 ms (+318.849 ms (+18.67%))
- Bridge calls/iteration: 5797.000 -> 5797.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.012 -> 109.701 ms (+1.689 ms (+1.56%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 6.000 -> 6.500 ms (+0.500 ms (+8.33%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.500 ms (+1.000 ms (+0.98%))
- Warm residual overhead: 0.512 -> 0.201 ms (-0.311 ms (-60.74%))
- Bridge time/iteration: 839.648 -> 1158.527 ms (+318.879 ms (+37.98%))
- BridgeResponse encoded bytes/iteration: 9750510.000 -> 9750510.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 766.126 -> 1081.009 ms/iteration (+314.883)

## Transport RTT

- Connect RTT: 0.432 -> 0.251 ms (-0.181 ms (-41.90%))
- 1 B mean RTT: 0.022 -> 0.025 ms (+0.003 ms (+13.64%))
- 1 B P95 RTT: 0.035 -> 0.040 ms (+0.005 ms (+14.29%))
- 1 KB mean RTT: 0.018 -> 0.020 ms (+0.002 ms (+11.11%))
- 1 KB P95 RTT: 0.022 -> 0.028 ms (+0.006 ms (+27.27%))
- 64 KB mean RTT: 0.137 -> 0.177 ms (+0.040 ms (+29.20%))
- 64 KB P95 RTT: 0.151 -> 0.331 ms (+0.180 ms (+119.20%))

