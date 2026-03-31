# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T07:24:08.544Z (4bb099df925783f92b047045b09d8976fbec7a73)
Baseline benchmark: 2026-03-31T05:47:54.440Z (88d1992eeca4a42f5db14755c593d86a2d776481)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`.

## Hono Startup

- Warm wall: 149.600 -> 149.600 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 113.206 -> 113.206 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 1.000 -> 1.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 5.206 -> 5.206 ms (0.000 ms (0.00%))
- Bridge time/iteration: 16.572 -> 16.572 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

## Hono End-to-End

- Warm wall: 149.463 -> 149.463 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.507 -> 108.507 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.508 -> 1.508 ms (0.000 ms (0.00%))
- Bridge time/iteration: 19.269 -> 19.269 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))

## pdf-lib Startup

- Warm wall: 314.083 -> 314.083 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 1651.000 -> 1651.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.981 -> 108.981 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.481 -> 2.481 ms (0.000 ms (0.00%))
- Bridge time/iteration: 64.700 -> 64.700 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1918520.000 -> 1918520.000 bytes (0.000 bytes (0.00%))

## pdf-lib End-to-End

- Warm wall: 387.063 -> 387.063 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 1666.000 -> 1666.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 109.839 -> 109.839 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.000 -> 0.000 ms (0.000 ms)
- Warm InjectGlobals->Execute: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 2.338 -> 2.338 ms (0.000 ms (0.00%))
- Bridge time/iteration: 71.049 -> 71.049 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1919390.000 -> 1919390.000 bytes (0.000 bytes (0.00%))

## JSZip Startup

- Warm wall: 177.165 -> 177.165 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 405.000 -> 405.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.367 -> 108.367 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 5.000 -> 5.000 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.367 -> 1.367 ms (0.000 ms (0.00%))
- Bridge time/iteration: 55.965 -> 55.965 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1207899.000 -> 1207899.000 bytes (0.000 bytes (0.00%))

## JSZip End-to-End

- Warm wall: 552.962 -> 552.962 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 519.000 -> 519.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.426 -> 108.426 ms (0.000 ms (0.00%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.000 -> 102.000 ms (0.000 ms (0.00%))
- Warm residual overhead: 1.426 -> 1.426 ms (0.000 ms (0.00%))
- Bridge time/iteration: 46.083 -> 46.083 ms (0.000 ms (0.00%))
- BridgeResponse encoded bytes/iteration: 1214540.000 -> 1214540.000 bytes (0.000 bytes (0.00%))

## Pi SDK Startup

- Warm wall: 1441.818 -> 1693.028 ms (+251.210 ms (+17.42%))
- Bridge calls/iteration: 5278.000 -> 2548.000 calls (-2730.000 calls (-51.72%))
- Warm fixed overhead: 112.577 -> 115.200 ms (+2.623 ms (+2.33%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.000 -> 4.500 ms (+0.500 ms (+12.50%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 6.577 -> 9.200 ms (+2.623 ms (+39.88%))
- Bridge time/iteration: 655.910 -> 923.769 ms (+267.859 ms (+40.84%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9142839.000 bytes (-219607.000 bytes (-2.35%))
- Largest method-time delta: `_loadPolyfill` 614.728 -> 878.447 ms/iteration (+263.719)
- Largest method-byte delta: `_loadPolyfill` 9354193.000 -> 9136395.000 encoded bytes/iteration (-217798.000)
- Largest frame-byte delta: `recv:BridgeCall` 882903.000 -> 552317.000 encoded bytes/iteration (-330586.000)

## Pi SDK End-to-End

- Warm wall: 1294.301 -> 1949.559 ms (+655.258 ms (+50.63%))
- Bridge calls/iteration: 5747.000 -> 2788.000 calls (-2959.000 calls (-51.49%))
- Warm fixed overhead: 109.273 -> 118.046 ms (+8.773 ms (+8.03%))
- Warm Create->InjectGlobals: 1.000 -> 0.000 ms (-1.000 ms (-100.00%))
- Warm InjectGlobals->Execute: 4.000 -> 6.000 ms (+2.000 ms (+50.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 102.000 ms (+0.500 ms (+0.49%))
- Warm residual overhead: 2.773 -> 10.046 ms (+7.273 ms (+262.28%))
- Bridge time/iteration: 660.320 -> 1048.088 ms (+387.768 ms (+58.72%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9477120.000 bytes (-238660.000 bytes (-2.46%))
- Largest method-time delta: `_loadPolyfill` 587.640 -> 938.412 ms/iteration (+350.772)
- Largest method-byte delta: `_loadPolyfill` 9703825.000 -> 9466974.000 encoded bytes/iteration (-236851.000)
- Largest frame-byte delta: `recv:BridgeCall` 966611.000 -> 606939.000 encoded bytes/iteration (-359672.000)

## Pi CLI Startup

- Warm wall: 1735.594 -> 1827.171 ms (+91.577 ms (+5.28%))
- Bridge calls/iteration: 5336.000 -> 2604.000 calls (-2732.000 calls (-51.20%))
- Warm fixed overhead: 111.233 -> 117.846 ms (+6.613 ms (+5.95%))
- Warm Create->InjectGlobals: 1.000 -> 0.500 ms (-0.500 ms (-50.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.000 ms (-0.500 ms (-0.49%))
- Warm residual overhead: 3.232 -> 10.846 ms (+7.614 ms (+235.58%))
- Bridge time/iteration: 740.932 -> 1038.732 ms (+297.800 ms (+40.19%))
- BridgeResponse encoded bytes/iteration: 9381016.000 -> 9161307.667 bytes (-219708.333 bytes (-2.34%))
- Largest method-time delta: `_loadPolyfill` 636.155 -> 921.631 ms/iteration (+285.476)
- Largest method-byte delta: `_loadPolyfill` 9370068.000 -> 9152170.000 encoded bytes/iteration (-217898.000)
- Largest frame-byte delta: `recv:BridgeCall` 893538.000 -> 562788.000 encoded bytes/iteration (-330750.000)

## Pi CLI End-to-End

- Warm wall: 1959.386 -> 1665.810 ms (-293.576 ms (-14.98%))
- Bridge calls/iteration: 5784.000 -> 2823.333 calls (-2960.667 calls (-51.19%))
- Warm fixed overhead: 9.326 -> 11.201 ms (+1.875 ms (+20.11%))
- Warm Create->InjectGlobals: 0.500 -> 0.000 ms (-0.500 ms (-100.00%))
- Warm InjectGlobals->Execute: 5.000 -> 4.500 ms (-0.500 ms (-10.00%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.826 -> 6.701 ms (+2.875 ms (+75.14%))
- Bridge time/iteration: 975.198 -> 1011.245 ms (+36.047 ms (+3.70%))
- BridgeResponse encoded bytes/iteration: 9737453.000 -> 9498709.333 bytes (-238743.667 bytes (-2.45%))
- Largest method-time delta: `_loadPolyfill` 861.924 -> 895.365 ms/iteration (+33.441)
- Largest method-byte delta: `_loadPolyfill` 9719927.000 -> 9482993.667 encoded bytes/iteration (-236933.333)
- Largest frame-byte delta: `recv:BridgeCall` 971466.000 -> 611661.667 encoded bytes/iteration (-359804.333)

## Transport RTT

- Connect RTT: 0.194 -> 0.194 ms (0.000 ms (0.00%))
- 1 B mean RTT: 0.024 -> 0.024 ms (0.000 ms (0.00%))
- 1 B P95 RTT: 0.032 -> 0.032 ms (0.000 ms (0.00%))
- 1 KB mean RTT: 0.015 -> 0.015 ms (0.000 ms (0.00%))
- 1 KB P95 RTT: 0.017 -> 0.017 ms (0.000 ms (0.00%))
- 64 KB mean RTT: 0.220 -> 0.220 ms (0.000 ms (0.00%))
- 64 KB P95 RTT: 0.391 -> 0.391 ms (0.000 ms (0.00%))

