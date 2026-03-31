# Module Load Benchmark

Generated: 2026-03-31T22:52:40.099Z
Git commit: 71fde781e7f7e39367e687dc93ba10582ee749af
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: none
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

Use `comparison.md` for before/after deltas on the primary sandbox new-session replay mode, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers plus ranked target-level deltas. Use the per-scenario `summary.md` files for copy-ready control-mode numbers such as true cold start, same-session replay, snapshot-off replay, host controls, and current target hotspots.

| Scenario | Sandbox New-Session Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 50.069 ms | 59.000 | 5.976 ms | `_loadPolyfill` 11.579 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Hono End-to-End | 36.873 ms | 59.000 | 5.472 ms | `_loadPolyfill` 11.075 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| pdf-lib Startup | 174.310 ms | 514.000 | 7.675 ms | `_bridgeDispatch` 53.398 ms/iter | `send:BridgeResponse` 652213.000 B/iter |
| pdf-lib End-to-End | 243.269 ms | 529.000 | 7.503 ms | `_bridgeDispatch` 46.974 ms/iter | `send:BridgeResponse` 653208.000 B/iter |
| JSZip Startup | 67.864 ms | 179.000 | 6.059 ms | `_loadPolyfill` 27.428 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| JSZip End-to-End | 102.546 ms | 182.000 | 6.208 ms | `_loadPolyfill` 30.444 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Pi SDK Startup | 1559.370 ms | 2511.000 | 13.761 ms | `_bridgeDispatch` 805.889 ms/iter | `send:BridgeResponse` 3309659.000 B/iter |
| Pi SDK End-to-End | 1812.370 ms | 2745.000 | 9.002 ms | `_bridgeDispatch` 850.049 ms/iter | `send:BridgeResponse` 3444124.333 B/iter |
| Pi CLI Startup | 1603.007 ms | 2562.000 | 9.242 ms | `_bridgeDispatch` 833.158 ms/iter | `send:BridgeResponse` 3312400.333 B/iter |
| Pi CLI End-to-End | 1898.294 ms | 2772.000 | 10.689 ms | `_bridgeDispatch` 951.271 ms/iter | `send:BridgeResponse` 3449855.333 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 4.500 ms | 0.000 ms | 44.094 ms | 0.500 ms | 0.976 ms |
| Hono End-to-End | 1.000 ms | 4.000 ms | 0.000 ms | 31.401 ms | 0.000 ms | 1.472 ms |
| pdf-lib Startup | 0.000 ms | 5.000 ms | 0.000 ms | 166.635 ms | 0.000 ms | 2.675 ms |
| pdf-lib End-to-End | 1.000 ms | 5.000 ms | 0.000 ms | 235.766 ms | 0.000 ms | 2.503 ms |
| JSZip Startup | 0.000 ms | 5.000 ms | 0.000 ms | 61.805 ms | 0.000 ms | 1.059 ms |
| JSZip End-to-End | 0.000 ms | 4.500 ms | 0.000 ms | 96.338 ms | 0.500 ms | 1.208 ms |
| Pi SDK Startup | 0.000 ms | 5.500 ms | 0.000 ms | 1545.610 ms | 0.500 ms | 7.761 ms |
| Pi SDK End-to-End | 1.000 ms | 6.000 ms | 0.000 ms | 1803.367 ms | 0.000 ms | 3.002 ms |
| Pi CLI Startup | 0.000 ms | 6.500 ms | 0.000 ms | 1593.764 ms | 0.000 ms | 2.742 ms |
| Pi CLI End-to-End | 0.000 ms | 7.000 ms | 0.000 ms | 1887.606 ms | 0.000 ms | 3.689 ms |

## Benchmark Mode Controls

| Scenario | Cold Start Snapshot On/Off | Same-Session Replay | New-Session Replay Snapshot On/Off | Host Same-Session Control |
| --- | --- | --- | --- | --- |
| Hono Startup | on 210.930 ms / off 240.474 ms | total 136.069 ms | on 50.069 ms / off 41.746 ms | first 10.336 ms, replay 0.035 ms |
| Hono End-to-End | on 211.348 ms / off 178.313 ms | total 162.678 ms | on 36.873 ms / off 46.279 ms | first 25.027 ms, replay 0.361 ms |
| pdf-lib Startup | on 254.172 ms / off 262.140 ms | total 234.997 ms | on 174.310 ms / off 108.619 ms | first 52.518 ms, replay 0.154 ms |
| pdf-lib End-to-End | on 334.750 ms / off 417.929 ms | total 218.839 ms | on 243.269 ms / off 227.464 ms | first 74.601 ms, replay 7.460 ms |
| JSZip Startup | on 385.430 ms / off 329.272 ms | total 291.762 ms | on 67.864 ms / off 76.983 ms | first 14.507 ms, replay 0.055 ms |
| JSZip End-to-End | on 309.893 ms / off 298.387 ms | total 212.014 ms | on 102.546 ms / off 71.052 ms | first 14.027 ms, replay 0.596 ms |
| Pi SDK Startup | on 2185.021 ms / off 1991.023 ms | total 1735.667 ms | on 1559.370 ms / off 1333.907 ms | first 337.442 ms, replay 0.062 ms |
| Pi SDK End-to-End | on 2258.421 ms / off 2083.265 ms | total 1955.608 ms | on 1812.370 ms / off 1602.508 ms | first 407.112 ms, replay 8.804 ms |
| Pi CLI Startup | on 2193.705 ms / off 1994.483 ms | total 2040.786 ms | on 1603.007 ms / off 1561.701 ms | first 336.846 ms, replay 0.614 ms |
| Pi CLI End-to-End | on 2383.372 ms / off 2360.165 ms | total 2084.733 ms | on 1898.294 ms / off 1756.481 ms | first 378.516 ms, replay 4.051 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.286 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.048 ms | 0.080 ms | 0.086 ms |
| 1 KB | 0.016 ms | 0.017 ms | 0.018 ms |
| 64 KB | 0.141 ms | 0.205 ms | 0.276 ms |

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

