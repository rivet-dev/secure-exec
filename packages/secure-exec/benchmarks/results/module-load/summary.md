# Module Load Benchmark

Generated: 2026-03-31T23:35:02.618Z
Git commit: 0f9e309606d7dd1aa7c7ddb84de20405f715b997
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T23:10:47.898Z
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

Use `comparison.md` for before/after deltas on the primary sandbox new-session replay mode, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers plus ranked target-level deltas. Lifecycle microbench rows isolate fixed session overhead; import microbench rows isolate single-import/bootstrap hotspots. Use the per-scenario `summary.md` files for copy-ready control-mode numbers such as true cold start, same-session replay, snapshot-off replay, host controls, current target hotspots, warm-run stability, and host-runtime resource usage.

| Scenario | Kind | Sandbox New-Session Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Microbench Empty Session | `lifecycle` | 23.645 ms | 4.000 | 6.282 ms | `_loadPolyfill` 10.960 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import stream | `import` | 29.101 ms | 5.000 | 6.048 ms | `_loadPolyfill` 33.939 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import stream/web | `import` | 27.473 ms | 5.000 | 5.537 ms | `_loadPolyfill` 12.940 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import crypto | `import` | 48.968 ms | 8.000 | 5.611 ms | `_loadPolyfill` 61.396 ms/iter | `send:BridgeResponse` 512742.667 B/iter |
| Microbench Import zlib | `import` | 32.294 ms | 5.000 | 5.720 ms | `_loadPolyfill` 22.151 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import assert | `import` | 30.436 ms | 5.000 | 5.758 ms | `_loadPolyfill` 27.128 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import url | `import` | 22.849 ms | 4.000 | 5.572 ms | `_loadPolyfill` 10.871 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Microbench Import @borewit/text-codec | `import` | 26.810 ms | 7.000 | 6.086 ms | `_bridgeDispatch` 10.970 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Hono Startup | `startup` | 37.572 ms | 59.000 | 5.554 ms | `_loadPolyfill` 10.746 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Hono End-to-End | `end_to_end` | 35.627 ms | 59.000 | 5.762 ms | `_loadPolyfill` 11.972 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| pdf-lib Startup | `startup` | 137.542 ms | 514.000 | 6.181 ms | `_bridgeDispatch` 51.118 ms/iter | `send:BridgeResponse` 652213.000 B/iter |
| pdf-lib End-to-End | `end_to_end` | 256.817 ms | 529.000 | 7.571 ms | `_bridgeDispatch` 47.334 ms/iter | `send:BridgeResponse` 653208.000 B/iter |
| JSZip Startup | `startup` | 79.511 ms | 179.000 | 6.397 ms | `_loadPolyfill` 45.911 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| JSZip End-to-End | `end_to_end` | 78.596 ms | 182.000 | 6.018 ms | `_loadPolyfill` 70.852 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Pi SDK Startup | `startup` | 1722.213 ms | 2511.000 | 10.099 ms | `_bridgeDispatch` 873.951 ms/iter | `send:BridgeResponse` 3309659.000 B/iter |
| Pi SDK End-to-End | `end_to_end` | 1705.717 ms | 2745.000 | 9.460 ms | `_bridgeDispatch` 825.558 ms/iter | `send:BridgeResponse` 3444124.333 B/iter |
| Pi CLI Startup | `startup` | 1644.750 ms | 2562.000 | 9.242 ms | `_bridgeDispatch` 791.547 ms/iter | `send:BridgeResponse` 3312400.333 B/iter |
| Pi CLI End-to-End | `end_to_end` | 1893.622 ms | 2772.000 | 9.846 ms | `_bridgeDispatch` 874.243 ms/iter | `send:BridgeResponse` 3449857.333 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Microbench Empty Session | 1.000 ms | 5.500 ms | 0.000 ms | 17.362 ms | 0.000 ms | 0.782 ms |
| Microbench Import stream | 1.000 ms | 5.000 ms | 0.000 ms | 23.053 ms | 0.500 ms | 0.548 ms |
| Microbench Import stream/web | 0.000 ms | 4.000 ms | 0.000 ms | 21.935 ms | 0.500 ms | 1.037 ms |
| Microbench Import crypto | 0.000 ms | 4.000 ms | 0.000 ms | 43.357 ms | 0.000 ms | 1.611 ms |
| Microbench Import zlib | 0.000 ms | 4.500 ms | 0.000 ms | 26.573 ms | 0.000 ms | 1.220 ms |
| Microbench Import assert | 0.000 ms | 5.000 ms | 0.000 ms | 24.678 ms | 0.500 ms | 0.258 ms |
| Microbench Import url | 0.000 ms | 4.500 ms | 0.500 ms | 17.277 ms | 1.000 ms | -0.427 ms |
| Microbench Import @borewit/text-codec | 0.000 ms | 5.500 ms | 0.000 ms | 20.724 ms | 0.000 ms | 0.586 ms |
| Hono Startup | 0.000 ms | 4.500 ms | 0.000 ms | 32.018 ms | 0.500 ms | 0.554 ms |
| Hono End-to-End | 0.000 ms | 4.500 ms | 0.000 ms | 29.864 ms | 0.000 ms | 1.262 ms |
| pdf-lib Startup | 0.000 ms | 5.000 ms | 0.000 ms | 131.361 ms | 0.000 ms | 1.181 ms |
| pdf-lib End-to-End | 0.000 ms | 5.000 ms | 0.500 ms | 249.246 ms | 0.000 ms | 2.071 ms |
| JSZip Startup | 0.000 ms | 5.000 ms | 0.000 ms | 73.114 ms | 0.500 ms | 0.897 ms |
| JSZip End-to-End | 0.000 ms | 4.500 ms | 0.000 ms | 72.577 ms | 0.000 ms | 1.518 ms |
| Pi SDK Startup | 0.000 ms | 6.000 ms | 0.000 ms | 1712.114 ms | 0.000 ms | 4.099 ms |
| Pi SDK End-to-End | 0.000 ms | 6.000 ms | 0.000 ms | 1696.257 ms | 0.000 ms | 3.460 ms |
| Pi CLI Startup | 0.000 ms | 5.500 ms | 0.000 ms | 1635.508 ms | 0.000 ms | 3.742 ms |
| Pi CLI End-to-End | 0.000 ms | 6.000 ms | 0.000 ms | 1883.776 ms | 0.500 ms | 3.346 ms |

## Warm Stability

| Scenario | Warm Wall Median | Warm Wall Stddev | Warm Wall Min/Max | Warm Execute Median | Warm Execute Stddev | Warm Execute Min/Max |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| Microbench Empty Session | 23.645 ms | 0.870 ms | 22.775 ms / 24.514 ms | 17.362 ms | 0.293 ms | 17.069 ms / 17.656 ms |
| Microbench Import stream | 29.101 ms | 0.084 ms | 29.017 ms / 29.184 ms | 23.053 ms | 0.126 ms | 22.927 ms / 23.178 ms |
| Microbench Import stream/web | 27.473 ms | 1.477 ms | 25.996 ms / 28.949 ms | 21.935 ms | 1.123 ms | 20.813 ms / 23.058 ms |
| Microbench Import crypto | 48.968 ms | 0.209 ms | 48.759 ms / 49.178 ms | 43.357 ms | 0.077 ms | 43.280 ms / 43.434 ms |
| Microbench Import zlib | 32.294 ms | 0.481 ms | 31.813 ms / 32.774 ms | 26.573 ms | 0.100 ms | 26.473 ms / 26.673 ms |
| Microbench Import assert | 30.436 ms | 2.367 ms | 28.069 ms / 32.803 ms | 24.678 ms | 2.431 ms | 22.247 ms / 27.109 ms |
| Microbench Import url | 22.849 ms | 0.239 ms | 22.610 ms / 23.089 ms | 17.277 ms | 0.413 ms | 16.864 ms / 17.690 ms |
| Microbench Import @borewit/text-codec | 26.810 ms | 0.215 ms | 26.595 ms / 27.025 ms | 20.724 ms | 0.442 ms | 20.282 ms / 21.166 ms |
| Hono Startup | 37.572 ms | 0.160 ms | 37.413 ms / 37.732 ms | 32.018 ms | 0.167 ms | 31.851 ms / 32.185 ms |
| Hono End-to-End | 35.627 ms | 0.483 ms | 35.143 ms / 36.110 ms | 29.864 ms | 0.683 ms | 29.181 ms / 30.547 ms |
| pdf-lib Startup | 137.542 ms | 22.222 ms | 115.320 ms / 159.764 ms | 131.361 ms | 21.447 ms | 109.913 ms / 152.808 ms |
| pdf-lib End-to-End | 256.817 ms | 71.190 ms | 185.627 ms / 328.007 ms | 249.246 ms | 70.843 ms | 178.403 ms / 320.089 ms |
| JSZip Startup | 79.511 ms | 1.855 ms | 77.657 ms / 81.366 ms | 73.114 ms | 2.101 ms | 71.014 ms / 75.215 ms |
| JSZip End-to-End | 78.596 ms | 0.395 ms | 78.200 ms / 78.991 ms | 72.577 ms | 0.303 ms | 72.274 ms / 72.880 ms |
| Pi SDK Startup | 1722.213 ms | 27.424 ms | 1694.789 ms / 1749.638 ms | 1712.114 ms | 29.321 ms | 1682.793 ms / 1741.435 ms |
| Pi SDK End-to-End | 1705.717 ms | 68.281 ms | 1637.436 ms / 1773.998 ms | 1696.257 ms | 68.702 ms | 1627.555 ms / 1764.959 ms |
| Pi CLI Startup | 1644.750 ms | 75.632 ms | 1569.118 ms / 1720.382 ms | 1635.508 ms | 76.415 ms | 1559.092 ms / 1711.923 ms |
| Pi CLI End-to-End | 1893.622 ms | 4.081 ms | 1889.541 ms / 1897.703 ms | 1883.776 ms | 3.933 ms | 1879.843 ms / 1887.709 ms |

## Host Runtime Resources

| Scenario | Peak RSS | Peak Heap Used | Peak Heap / Limit | CPU User | CPU System | CPU Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Microbench Empty Session | 208.164 MiB | 46.912 MiB | 1.094% | 0.592 s | 0.106 s | 0.698 s |
| Microbench Import stream | 207.027 MiB | 47.555 MiB | 1.109% | 0.495 s | 0.099 s | 0.594 s |
| Microbench Import stream/web | 209.426 MiB | 46.780 MiB | 1.091% | 0.476 s | 0.118 s | 0.594 s |
| Microbench Import crypto | 213.660 MiB | 47.978 MiB | 1.119% | 0.550 s | 0.097 s | 0.647 s |
| Microbench Import zlib | 210.910 MiB | 47.966 MiB | 1.119% | 0.484 s | 0.105 s | 0.589 s |
| Microbench Import assert | 204.359 MiB | 47.397 MiB | 1.105% | 0.475 s | 0.114 s | 0.589 s |
| Microbench Import url | 205.195 MiB | 46.920 MiB | 1.094% | 0.529 s | 0.080 s | 0.609 s |
| Microbench Import @borewit/text-codec | 217.957 MiB | 47.128 MiB | 1.099% | 0.503 s | 0.114 s | 0.617 s |
| Hono Startup | 209.438 MiB | 49.030 MiB | 1.143% | 0.503 s | 0.105 s | 0.608 s |
| Hono End-to-End | 209.820 MiB | 47.159 MiB | 1.100% | 0.555 s | 0.132 s | 0.686 s |
| pdf-lib Startup | 210.695 MiB | 50.391 MiB | 1.175% | 0.875 s | 0.168 s | 1.044 s |
| pdf-lib End-to-End | 207.223 MiB | 46.093 MiB | 1.075% | 0.803 s | 0.191 s | 0.994 s |
| JSZip Startup | 214.441 MiB | 45.646 MiB | 1.065% | 0.586 s | 0.175 s | 0.760 s |
| JSZip End-to-End | 215.832 MiB | 45.896 MiB | 1.070% | 0.707 s | 0.114 s | 0.821 s |
| Pi SDK Startup | 294.043 MiB | 78.514 MiB | 1.831% | 2.652 s | 0.606 s | 3.258 s |
| Pi SDK End-to-End | 322.566 MiB | 88.678 MiB | 2.068% | 2.891 s | 0.623 s | 3.514 s |
| Pi CLI Startup | 352.422 MiB | 95.823 MiB | 2.235% | 2.579 s | 0.591 s | 3.171 s |
| Pi CLI End-to-End | 339.629 MiB | 86.695 MiB | 2.022% | 3.068 s | 0.628 s | 3.696 s |

## Benchmark Mode Controls

| Scenario | Cold Start Snapshot On/Off | Same-Session Replay | New-Session Replay Snapshot On/Off | Host Same-Session Control |
| --- | --- | --- | --- | --- |
| Microbench Empty Session | on 166.326 ms / off 163.900 ms | total 80.798 ms | on 23.645 ms / off 23.483 ms | first 0.029 ms, replay 0.005 ms |
| Microbench Import stream | on 194.175 ms / off 205.434 ms | total 115.896 ms | on 29.101 ms / off 28.489 ms | first 0.809 ms, replay 0.016 ms |
| Microbench Import stream/web | on 188.098 ms / off 166.843 ms | total 73.870 ms | on 27.473 ms / off 25.599 ms | first 2.281 ms, replay 0.026 ms |
| Microbench Import crypto | on 313.269 ms / off 320.412 ms | total 225.651 ms | on 48.968 ms / off 49.742 ms | first 0.054 ms, replay 0.011 ms |
| Microbench Import zlib | on 263.059 ms / off 207.618 ms | total 152.556 ms | on 32.294 ms / off 32.909 ms | first 1.357 ms, replay 0.018 ms |
| Microbench Import assert | on 231.651 ms / off 185.936 ms | total 121.352 ms | on 30.436 ms / off 27.191 ms | first 1.940 ms, replay 0.038 ms |
| Microbench Import url | on 163.958 ms / off 167.576 ms | total 68.123 ms | on 22.849 ms / off 22.830 ms | first 0.045 ms, replay 0.010 ms |
| Microbench Import @borewit/text-codec | on 221.184 ms / off 199.697 ms | total 106.641 ms | on 26.810 ms / off 26.273 ms | first 2.930 ms, replay 0.087 ms |
| Hono Startup | on 207.562 ms / off 180.133 ms | total 77.777 ms | on 37.572 ms / off 35.058 ms | first 7.907 ms, replay 0.044 ms |
| Hono End-to-End | on 212.903 ms / off 192.096 ms | total 96.190 ms | on 35.627 ms / off 35.008 ms | first 28.018 ms, replay 0.364 ms |
| pdf-lib Startup | on 271.157 ms / off 311.461 ms | total 159.259 ms | on 137.542 ms / off 144.569 ms | first 49.154 ms, replay 0.143 ms |
| pdf-lib End-to-End | on 383.380 ms / off 541.959 ms | total 273.334 ms | on 256.817 ms / off 168.483 ms | first 67.558 ms, replay 7.605 ms |
| JSZip Startup | on 286.904 ms / off 349.490 ms | total 327.663 ms | on 79.511 ms / off 88.078 ms | first 17.039 ms, replay 0.053 ms |
| JSZip End-to-End | on 470.696 ms / off 284.619 ms | total 270.333 ms | on 78.596 ms / off 84.287 ms | first 20.217 ms, replay 0.546 ms |
| Pi SDK Startup | on 1885.206 ms / off 2448.468 ms | total 1818.984 ms | on 1722.213 ms / off 1631.499 ms | first 328.385 ms, replay 0.063 ms |
| Pi SDK End-to-End | on 2503.316 ms / off 2028.725 ms | total 1711.478 ms | on 1705.717 ms / off 1679.476 ms | first 405.658 ms, replay 8.296 ms |
| Pi CLI Startup | on 2289.180 ms / off 2098.134 ms | total 1951.112 ms | on 1644.750 ms / off 1712.459 ms | first 337.869 ms, replay 0.749 ms |
| Pi CLI End-to-End | on 2203.131 ms / off 2142.625 ms | total 2126.300 ms | on 1893.622 ms / off 1805.687 ms | first 380.337 ms, replay 7.852 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.310 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.038 ms | 0.047 ms | 0.278 ms |
| 1 KB | 0.020 ms | 0.021 ms | 0.057 ms |
| 64 KB | 0.136 ms | 0.214 ms | 0.216 ms |

## Progress Guide

- Warm wall mean
- Bridge calls per iteration
- Warm fixed session overhead
- Warm wall and execute stability (median, min/max, stddev)
- Host runtime peak RSS, peak heap / limit, and CPU seconds
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

