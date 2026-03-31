# Module Load Benchmark Comparison

Current benchmark: 2026-03-31T04:18:38.754Z (41215f4827a6759f97c60556672c51105bf74ddf)
Baseline benchmark: 2026-03-31T04:02:18.756Z (f32fdfd33bf844cfb50284b07412da1db4b9fd1f)

Copy the warm wall, bridge calls/iteration, warm fixed overhead, and the highlighted method/frame deltas below into `scripts/ralph/progress.txt`.

## Hono Startup

- Warm wall: 153.889 -> 141.156 ms (-12.733 ms (-8.27%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.073 -> 108.902 ms (+0.829 ms (+0.77%))
- Bridge time/iteration: 22.174 -> 21.626 ms (-0.548 ms (-2.47%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 22.048 -> 21.553 ms/iteration (-0.495)

## Hono End-to-End

- Warm wall: 143.365 -> 145.024 ms (+1.659 ms (+1.16%))
- Bridge calls/iteration: 102.000 -> 102.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.237 -> 107.840 ms (+0.603 ms (+0.56%))
- Bridge time/iteration: 16.426 -> 29.472 ms (+13.046 ms (+79.42%))
- BridgeResponse encoded bytes/iteration: 408130.000 -> 408130.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 16.322 -> 29.381 ms/iteration (+13.059)

## Pi SDK Startup

- Warm wall: 1615.126 -> 1676.693 ms (+61.567 ms (+3.81%))
- Bridge calls/iteration: 5278.000 -> 5278.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.054 -> 107.224 ms (+0.170 ms (+0.16%))
- Bridge time/iteration: 843.322 -> 925.197 ms (+81.875 ms (+9.71%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9362446.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 802.036 -> 873.085 ms/iteration (+71.049)

## Pi SDK End-to-End

- Warm wall: 2004.673 -> 2062.543 ms (+57.870 ms (+2.89%))
- Bridge calls/iteration: 5747.000 -> 5747.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 105.947 -> 106.510 ms (+0.563 ms (+0.53%))
- Bridge time/iteration: 1046.459 -> 1047.848 ms (+1.389 ms (+0.13%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9715780.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_fsExists` 36.854 -> 28.566 ms/iteration (-8.288)

## Pi CLI Startup

- Warm wall: 1919.521 -> 1899.870 ms (-19.651 ms (-1.02%))
- Bridge calls/iteration: 5336.000 -> 5336.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.798 -> 107.644 ms (-0.154 ms (-0.14%))
- Bridge time/iteration: 1003.838 -> 1067.942 ms (+64.104 ms (+6.39%))
- BridgeResponse encoded bytes/iteration: 9381014.667 -> 9381015.333 bytes (+0.666 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 899.241 -> 964.642 ms/iteration (+65.401)
- Largest method-byte delta: `_fsStat` 205.667 -> 206.333 encoded bytes/iteration (+0.666)
- Largest frame-byte delta: `send:BridgeResponse` 9381014.667 -> 9381015.333 encoded bytes/iteration (+0.666)

## Pi CLI End-to-End

- Warm wall: 2036.938 -> 2099.842 ms (+62.904 ms (+3.09%))
- Bridge calls/iteration: 5797.000 -> 5797.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.020 -> 107.250 ms (+0.230 ms (+0.21%))
- Bridge time/iteration: 1045.575 -> 1119.110 ms (+73.535 ms (+7.03%))
- BridgeResponse encoded bytes/iteration: 9750510.000 -> 9750510.000 bytes (0.000 bytes (0.00%))
- Largest method-time delta: `_loadPolyfill` 969.950 -> 1048.381 ms/iteration (+78.431)

