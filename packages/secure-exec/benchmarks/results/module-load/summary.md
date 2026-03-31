# Module Load Benchmark

Generated: 2026-03-31T22:29:20.833Z
Git commit: 11a33bb0c1004ceacac7c43975dbbd6931fe0eba
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T22:18:09.989Z
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

Use `comparison.md` for before/after deltas on the primary sandbox new-session replay mode, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers plus ranked target-level deltas. Use the per-scenario `summary.md` files for copy-ready control-mode numbers such as true cold start, same-session replay, snapshot-off replay, host controls, and current target hotspots.

| Scenario | Sandbox New-Session Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 36.227 ms | 59.000 | 5.636 ms | `_loadPolyfill` 13.067 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Hono End-to-End | 37.440 ms | 59.000 | 5.484 ms | `_loadPolyfill` 11.844 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| pdf-lib Startup | 117.555 ms | 514.000 | 6.139 ms | `_bridgeDispatch` 52.767 ms/iter | `send:BridgeResponse` 652213.000 B/iter |
| pdf-lib End-to-End | 254.933 ms | 529.000 | 7.121 ms | `_bridgeDispatch` 50.310 ms/iter | `send:BridgeResponse` 653208.000 B/iter |
| JSZip Startup | 111.213 ms | 179.000 | 6.728 ms | `_loadPolyfill` 37.737 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| JSZip End-to-End | 93.152 ms | 182.000 | 6.330 ms | `_loadPolyfill` 50.391 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Pi SDK Startup | 1628.007 ms | 2511.000 | 9.200 ms | `_bridgeDispatch` 832.555 ms/iter | `send:BridgeResponse` 3309659.000 B/iter |
| Pi SDK End-to-End | 1720.678 ms | 2745.000 | 11.187 ms | `_bridgeDispatch` 824.004 ms/iter | `send:BridgeResponse` 3444124.333 B/iter |
| Pi CLI Startup | 1595.248 ms | 2562.000 | 9.021 ms | `_bridgeDispatch` 851.606 ms/iter | `send:BridgeResponse` 3312401.000 B/iter |
| Pi CLI End-to-End | 1548.452 ms | 2772.000 | 13.201 ms | `_bridgeDispatch` 725.989 ms/iter | `send:BridgeResponse` 3449856.000 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 4.500 ms | 0.000 ms | 30.591 ms | 0.500 ms | 0.637 ms |
| Hono End-to-End | 0.000 ms | 4.500 ms | 0.000 ms | 31.956 ms | 0.000 ms | 0.984 ms |
| pdf-lib Startup | 0.000 ms | 5.000 ms | 0.000 ms | 111.417 ms | 0.000 ms | 1.139 ms |
| pdf-lib End-to-End | 0.000 ms | 5.500 ms | 0.000 ms | 247.811 ms | 0.500 ms | 1.121 ms |
| JSZip Startup | 0.000 ms | 5.000 ms | 0.000 ms | 104.485 ms | 0.000 ms | 1.728 ms |
| JSZip End-to-End | 0.000 ms | 5.000 ms | 0.000 ms | 86.822 ms | 0.500 ms | 0.830 ms |
| Pi SDK Startup | 0.000 ms | 6.000 ms | 0.000 ms | 1618.807 ms | 0.500 ms | 2.700 ms |
| Pi SDK End-to-End | 0.000 ms | 6.500 ms | 0.500 ms | 1709.492 ms | 0.500 ms | 3.687 ms |
| Pi CLI Startup | 0.000 ms | 5.500 ms | 0.000 ms | 1586.228 ms | 0.500 ms | 3.021 ms |
| Pi CLI End-to-End | 1.000 ms | 5.500 ms | 0.000 ms | 1535.251 ms | 0.500 ms | 7.202 ms |

## Benchmark Mode Controls

| Scenario | Cold Start Snapshot On/Off | Same-Session Replay | New-Session Replay Snapshot On/Off | Host Same-Session Control |
| --- | --- | --- | --- | --- |
| Hono Startup | on 140.827 ms / off 131.357 ms | total 36.157 ms | on 36.227 ms / off 32.871 ms | first 7.345 ms, replay 0.032 ms |
| Hono End-to-End | on 143.220 ms / off 126.328 ms | total 36.245 ms | on 37.440 ms / off 32.519 ms | first 23.868 ms, replay 0.343 ms |
| pdf-lib Startup | on 291.115 ms / off 210.397 ms | total 199.569 ms | on 117.555 ms / off 230.905 ms | first 50.089 ms, replay 0.147 ms |
| pdf-lib End-to-End | on 384.660 ms / off 273.410 ms | total 206.970 ms | on 254.933 ms / off 221.947 ms | first 71.635 ms, replay 8.382 ms |
| JSZip Startup | on 191.478 ms / off 154.390 ms | total 58.075 ms | on 111.213 ms / off 78.558 ms | first 16.003 ms, replay 0.051 ms |
| JSZip End-to-End | on 171.130 ms / off 166.038 ms | total 69.920 ms | on 93.152 ms / off 69.210 ms | first 17.352 ms, replay 0.580 ms |
| Pi SDK Startup | on 1737.443 ms / off 1821.573 ms | total 1560.715 ms | on 1628.007 ms / off 1421.628 ms | first 338.902 ms, replay 0.062 ms |
| Pi SDK End-to-End | on 2085.137 ms / off 1717.360 ms | total 1634.830 ms | on 1720.678 ms / off 1748.344 ms | first 402.624 ms, replay 10.109 ms |
| Pi CLI Startup | on 1553.175 ms / off 1300.629 ms | total 1489.551 ms | on 1595.248 ms / off 1271.171 ms | first 339.371 ms, replay 0.682 ms |
| Pi CLI End-to-End | on 2135.625 ms / off 1789.730 ms | total 1850.802 ms | on 1548.452 ms / off 1661.832 ms | first 374.901 ms, replay 5.917 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.200 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.027 ms | 0.045 ms | 0.055 ms |
| 1 KB | 0.018 ms | 0.024 ms | 0.030 ms |
| 64 KB | 0.115 ms | 0.136 ms | 0.137 ms |

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

