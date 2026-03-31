# Module Load Benchmark

Generated: 2026-03-31T23:10:47.898Z
Git commit: a8a9fabc86ff1f8f846bf13fb9e1504f90f14717
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T22:52:40.099Z
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

Use `comparison.md` for before/after deltas on the primary sandbox new-session replay mode, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers plus ranked target-level deltas. Lifecycle microbench rows isolate fixed session overhead; import microbench rows isolate single-import/bootstrap hotspots. Use the per-scenario `summary.md` files for copy-ready control-mode numbers such as true cold start, same-session replay, snapshot-off replay, host controls, and current target hotspots.

| Scenario | Kind | Sandbox New-Session Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Microbench Empty Session | `lifecycle` | 24.437 ms | 4.000 | 5.563 ms | `_loadPolyfill` 10.144 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import stream | `import` | 28.566 ms | 5.000 | 5.982 ms | `_loadPolyfill` 17.868 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import stream/web | `import` | 26.342 ms | 5.000 | 5.653 ms | `_loadPolyfill` 12.160 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import crypto | `import` | 48.858 ms | 8.000 | 6.345 ms | `_loadPolyfill` 38.490 ms/iter | `send:BridgeResponse` 512742.667 B/iter |
| Microbench Import zlib | `import` | 31.642 ms | 5.000 | 5.740 ms | `_loadPolyfill` 20.224 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import assert | `import` | 28.986 ms | 5.000 | 6.188 ms | `_loadPolyfill` 17.547 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import url | `import` | 22.880 ms | 4.000 | 5.468 ms | `_loadPolyfill` 10.195 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import @borewit/text-codec | `import` | 27.478 ms | 7.000 | 6.239 ms | `_bridgeDispatch` 11.719 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Hono Startup | `startup` | 36.428 ms | 59.000 | 5.836 ms | `_loadPolyfill` 10.027 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Hono End-to-End | `end_to_end` | 38.255 ms | 59.000 | 5.488 ms | `_loadPolyfill` 10.259 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| pdf-lib Startup | `startup` | 122.178 ms | 514.000 | 6.839 ms | `_bridgeDispatch` 34.338 ms/iter | `send:BridgeResponse` 652213.000 B/iter |
| pdf-lib End-to-End | `end_to_end` | 179.726 ms | 529.000 | 6.691 ms | `_bridgeDispatch` 33.189 ms/iter | `send:BridgeResponse` 653208.000 B/iter |
| JSZip Startup | `startup` | 68.439 ms | 179.000 | 6.226 ms | `_loadPolyfill` 25.936 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| JSZip End-to-End | `end_to_end` | 78.700 ms | 182.000 | 6.538 ms | `_loadPolyfill` 27.796 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Pi SDK Startup | `startup` | 886.870 ms | 2511.000 | 8.576 ms | `_bridgeDispatch` 429.228 ms/iter | `send:BridgeResponse` 3309659.000 B/iter |
| Pi SDK End-to-End | `end_to_end` | 1018.723 ms | 2745.000 | 9.188 ms | `_bridgeDispatch` 452.775 ms/iter | `send:BridgeResponse` 3444124.333 B/iter |
| Pi CLI Startup | `startup` | 953.642 ms | 2562.000 | 9.565 ms | `_bridgeDispatch` 417.974 ms/iter | `send:BridgeResponse` 3312400.333 B/iter |
| Pi CLI End-to-End | `end_to_end` | 1040.085 ms | 2772.000 | 9.563 ms | `_bridgeDispatch` 439.532 ms/iter | `send:BridgeResponse` 3449857.333 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Microbench Empty Session | 1.000 ms | 4.000 ms | 0.000 ms | 18.874 ms | 0.500 ms | 1.063 ms |
| Microbench Import stream | 0.000 ms | 5.000 ms | 0.500 ms | 22.584 ms | 0.000 ms | 0.482 ms |
| Microbench Import stream/web | 0.000 ms | 5.000 ms | 0.000 ms | 20.689 ms | 0.000 ms | 0.653 ms |
| Microbench Import crypto | 0.000 ms | 5.000 ms | 0.000 ms | 42.514 ms | 0.000 ms | 1.345 ms |
| Microbench Import zlib | 0.000 ms | 5.000 ms | 0.000 ms | 25.902 ms | 0.000 ms | 0.740 ms |
| Microbench Import assert | 0.000 ms | 5.500 ms | 0.000 ms | 22.797 ms | 0.000 ms | 0.688 ms |
| Microbench Import url | 0.000 ms | 4.500 ms | 0.000 ms | 17.412 ms | 0.500 ms | 0.468 ms |
| Microbench Import @borewit/text-codec | 0.000 ms | 5.000 ms | 0.000 ms | 21.239 ms | 0.000 ms | 1.239 ms |
| Hono Startup | 0.000 ms | 5.000 ms | 0.000 ms | 30.592 ms | 0.000 ms | 0.836 ms |
| Hono End-to-End | 0.000 ms | 4.500 ms | 0.000 ms | 32.767 ms | 0.500 ms | 0.487 ms |
| pdf-lib Startup | 0.000 ms | 5.000 ms | 0.500 ms | 115.339 ms | 0.000 ms | 1.340 ms |
| pdf-lib End-to-End | 0.000 ms | 5.000 ms | 0.000 ms | 173.036 ms | 0.500 ms | 1.190 ms |
| JSZip Startup | 0.000 ms | 5.000 ms | 0.000 ms | 62.213 ms | 0.000 ms | 1.226 ms |
| JSZip End-to-End | 0.000 ms | 5.000 ms | 0.000 ms | 72.162 ms | 0.500 ms | 1.038 ms |
| Pi SDK Startup | 0.000 ms | 6.000 ms | 0.000 ms | 878.293 ms | 0.000 ms | 2.577 ms |
| Pi SDK End-to-End | 0.000 ms | 6.000 ms | 0.000 ms | 1009.535 ms | 0.000 ms | 3.188 ms |
| Pi CLI Startup | 0.000 ms | 5.500 ms | 0.000 ms | 944.077 ms | 0.000 ms | 4.065 ms |
| Pi CLI End-to-End | 0.000 ms | 5.500 ms | 0.500 ms | 1030.522 ms | 0.000 ms | 3.563 ms |

## Benchmark Mode Controls

| Scenario | Cold Start Snapshot On/Off | Same-Session Replay | New-Session Replay Snapshot On/Off | Host Same-Session Control |
| --- | --- | --- | --- | --- |
| Microbench Empty Session | on 161.961 ms / off 173.986 ms | total 63.515 ms | on 24.437 ms / off 22.459 ms | first 0.028 ms, replay 0.004 ms |
| Microbench Import stream | on 188.623 ms / off 187.089 ms | total 90.675 ms | on 28.566 ms / off 28.834 ms | first 0.795 ms, replay 0.015 ms |
| Microbench Import stream/web | on 163.579 ms / off 163.938 ms | total 67.193 ms | on 26.342 ms / off 25.169 ms | first 1.661 ms, replay 0.019 ms |
| Microbench Import crypto | on 261.029 ms / off 265.663 ms | total 170.557 ms | on 48.858 ms / off 48.426 ms | first 0.053 ms, replay 0.011 ms |
| Microbench Import zlib | on 198.341 ms / off 203.165 ms | total 101.591 ms | on 31.642 ms / off 32.885 ms | first 1.286 ms, replay 0.019 ms |
| Microbench Import assert | on 185.980 ms / off 186.341 ms | total 88.131 ms | on 28.986 ms / off 26.895 ms | first 1.930 ms, replay 0.017 ms |
| Microbench Import url | on 164.915 ms / off 161.300 ms | total 65.091 ms | on 22.880 ms / off 24.753 ms | first 0.044 ms, replay 0.010 ms |
| Microbench Import @borewit/text-codec | on 197.020 ms / off 189.786 ms | total 108.070 ms | on 27.478 ms / off 26.326 ms | first 1.974 ms, replay 0.080 ms |
| Hono Startup | on 175.672 ms / off 180.369 ms | total 75.994 ms | on 36.428 ms / off 34.562 ms | first 7.397 ms, replay 0.041 ms |
| Hono End-to-End | on 183.601 ms / off 176.899 ms | total 92.726 ms | on 38.255 ms / off 34.049 ms | first 23.841 ms, replay 0.402 ms |
| pdf-lib Startup | on 275.410 ms / off 258.795 ms | total 163.561 ms | on 122.178 ms / off 101.367 ms | first 49.887 ms, replay 0.141 ms |
| pdf-lib End-to-End | on 333.953 ms / off 330.646 ms | total 197.930 ms | on 179.726 ms / off 163.219 ms | first 69.170 ms, replay 8.260 ms |
| JSZip Startup | on 267.833 ms / off 249.803 ms | total 166.881 ms | on 68.439 ms / off 62.174 ms | first 13.680 ms, replay 0.055 ms |
| JSZip End-to-End | on 274.945 ms / off 266.910 ms | total 156.507 ms | on 78.700 ms / off 71.707 ms | first 14.836 ms, replay 0.651 ms |
| Pi SDK Startup | on 1225.725 ms / off 1190.158 ms | total 1064.885 ms | on 886.870 ms / off 858.100 ms | first 341.415 ms, replay 0.068 ms |
| Pi SDK End-to-End | on 1355.654 ms / off 1334.497 ms | total 1172.461 ms | on 1018.723 ms / off 935.891 ms | first 409.986 ms, replay 7.492 ms |
| Pi CLI Startup | on 1284.640 ms / off 1311.226 ms | total 1134.964 ms | on 953.642 ms / off 893.856 ms | first 331.985 ms, replay 0.597 ms |
| Pi CLI End-to-End | on 1350.713 ms / off 1389.170 ms | total 1230.963 ms | on 1040.085 ms / off 966.697 ms | first 400.165 ms, replay 7.472 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.203 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.019 ms | 0.030 ms | 0.037 ms |
| 1 KB | 0.015 ms | 0.018 ms | 0.020 ms |
| 64 KB | 0.115 ms | 0.123 ms | 0.143 ms |

## Progress Guide

- Warm wall mean
- Bridge calls per iteration
- Warm fixed session overhead
- Benchmark mode controls from per-scenario summary.md: true cold start on/off, same-session replay, new-session replay on/off, and host same-session control
- `_loadPolyfill` real polyfill-body vs `__bd:*` bridge-dispatch splits from comparison.md
- `_loadPolyfill` ranked target hotspots from per-scenario summary.md and target-level deltas from comparison.md
- Warm phase attribution when fixed overhead changes
- Transport RTT means from transport-rtt.md for transport-sensitive changes
- Dominant bridge method time and byte deltas from comparison.md

## Per-Scenario Summaries

- `micro-empty-session`: `micro-empty-session/summary.json`, `micro-empty-session/summary.md`
- `micro-import-stream`: `micro-import-stream/summary.json`, `micro-import-stream/summary.md`
- `micro-import-stream-web`: `micro-import-stream-web/summary.json`, `micro-import-stream-web/summary.md`
- `micro-import-crypto`: `micro-import-crypto/summary.json`, `micro-import-crypto/summary.md`
- `micro-import-zlib`: `micro-import-zlib/summary.json`, `micro-import-zlib/summary.md`
- `micro-import-assert`: `micro-import-assert/summary.json`, `micro-import-assert/summary.md`
- `micro-import-url`: `micro-import-url/summary.json`, `micro-import-url/summary.md`
- `micro-import-text-codec`: `micro-import-text-codec/summary.json`, `micro-import-text-codec/summary.md`
- `hono-startup`: `hono-startup/summary.json`, `hono-startup/summary.md`
- `hono-end-to-end`: `hono-end-to-end/summary.json`, `hono-end-to-end/summary.md`
- `pdf-lib-startup`: `pdf-lib-startup/summary.json`, `pdf-lib-startup/summary.md`
- `pdf-lib-end-to-end`: `pdf-lib-end-to-end/summary.json`, `pdf-lib-end-to-end/summary.md`
- `jszip-startup`: `jszip-startup/summary.json`, `jszip-startup/summary.md`
- `jszip-end-to-end`: `jszip-end-to-end/summary.json`, `jszip-end-to-end/summary.md`
- `pi-sdk-startup`: `pi-sdk-startup/summary.json`, `pi-sdk-startup/summary.md`
- `pi-sdk-end-to-end`: `pi-sdk-end-to-end/summary.json`, `pi-sdk-end-to-end/summary.md`
- `pi-cli-startup`: `pi-cli-startup/summary.json`, `pi-cli-startup/summary.md`
- `pi-cli-end-to-end`: `pi-cli-end-to-end/summary.json`, `pi-cli-end-to-end/summary.md`
- `transport-rtt`: `transport-rtt.json`, `transport-rtt.md`

