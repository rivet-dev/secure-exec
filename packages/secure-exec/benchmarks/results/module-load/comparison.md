# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T05:29:53.612Z (6197d51aa59337c452dded8d5317cab31e30b8a5)
Baseline benchmark: none

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`.

## Hono Startup

- Warm wall: 144.133 -> 143.668 ms (-0.465 ms (-0.32%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.197 -> 108.096 ms (-0.101 ms (-0.09%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.697 -> 0.596 ms (-0.101 ms (-14.49%))
- Bridge time/iteration: 17.115 -> 20.530 ms (+3.415 ms (+19.95%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 17.042 -> 20.373 ms/iteration (+3.331)

## Hono End-to-End

- Warm wall: 147.534 -> 158.059 ms (+10.525 ms (+7.13%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.888 -> 107.936 ms (+0.048 ms (+0.04%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 101.500 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 0.388 -> 0.936 ms (+0.548 ms (+141.24%))
- Bridge time/iteration: 23.426 -> 19.030 ms (-4.396 ms (-18.77%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 23.347 -> 18.976 ms/iteration (-4.371)

## pdf-lib Startup

- Warm wall: 280.452 -> 283.235 ms (+2.783 ms (+0.99%))
- Bridge calls/iteration: 1651.000 -> 1651.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.194 -> 107.558 ms (+0.364 ms (+0.34%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.500 ms (+0.500 ms (+10.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.194 -> 0.058 ms (-0.136 ms (-70.10%))
- Bridge time/iteration: 67.254 -> 63.273 ms (-3.981 ms (-5.92%))
- BridgeResponse encoded bytes/iteration: 1918520.000 -> 1918520.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 67.157 -> 63.188 ms/iteration (-3.969)

## pdf-lib End-to-End

- Warm wall: 501.043 -> 346.978 ms (-154.065 ms (-30.75%))
- Bridge calls/iteration: 1666.000 -> 1666.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.704 -> 107.320 ms (-0.384 ms (-0.36%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.705 -> -0.180 ms (-0.885 ms (-125.53%))
- Bridge time/iteration: 109.755 -> 64.197 ms (-45.558 ms (-41.51%))
- BridgeResponse encoded bytes/iteration: 1919390.000 -> 1919390.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 109.612 -> 64.109 ms/iteration (-45.503)

## JSZip Startup

- Warm wall: 205.767 -> 179.459 ms (-26.308 ms (-12.79%))
- Bridge calls/iteration: 405.000 -> 405.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.606 -> 107.322 ms (-0.284 ms (-0.26%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.500 -> 5.000 ms (+0.500 ms (+11.11%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.606 -> 0.322 ms (-0.284 ms (-46.87%))
- Bridge time/iteration: 50.993 -> 85.171 ms (+34.178 ms (+67.03%))
- BridgeResponse encoded bytes/iteration: 1207899.000 -> 1207899.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 50.935 -> 85.118 ms/iteration (+34.183)

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

