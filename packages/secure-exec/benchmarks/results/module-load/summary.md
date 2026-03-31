# Module Load Benchmark

Generated: 2026-03-31T20:29:57.618Z
Git commit: d22ee524f26e5a40e09ee48800a38942524b5239
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T20:10:29.899Z

Use `comparison.md` for before/after deltas, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers, and the per-scenario `summary.md` files for copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 37.787 ms | 59.000 | 5.579 ms | `_loadPolyfill` 12.742 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Hono End-to-End | 43.049 ms | 59.000 | 6.241 ms | `_loadPolyfill` 10.391 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| pdf-lib Startup | 132.760 ms | 514.000 | 7.157 ms | `_bridgeDispatch` 63.650 ms/iter | `send:BridgeResponse` 652213.000 B/iter |
| pdf-lib End-to-End | 297.079 ms | 529.000 | 7.191 ms | `_bridgeDispatch` 60.207 ms/iter | `send:BridgeResponse` 653208.000 B/iter |
| JSZip Startup | 72.290 ms | 179.000 | 6.176 ms | `_loadPolyfill` 38.119 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| JSZip End-to-End | 77.776 ms | 182.000 | 6.130 ms | `_loadPolyfill` 43.727 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Pi SDK Startup | 1422.383 ms | 2511.000 | 9.264 ms | `_bridgeDispatch` 822.419 ms/iter | `send:BridgeResponse` 3309659.000 B/iter |
| Pi SDK End-to-End | 1823.659 ms | 2745.000 | 12.578 ms | `_bridgeDispatch` 816.475 ms/iter | `send:BridgeResponse` 3444124.333 B/iter |
| Pi CLI Startup | 1470.153 ms | 2562.000 | 9.412 ms | `_bridgeDispatch` 640.133 ms/iter | `send:BridgeResponse` 3312400.333 B/iter |
| Pi CLI End-to-End | 1049.009 ms | 2772.000 | 9.409 ms | `_bridgeDispatch` 440.689 ms/iter | `send:BridgeResponse` 3449856.000 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 5.000 ms | 0.000 ms | 32.208 ms | 0.000 ms | 0.579 ms |
| Hono End-to-End | 0.000 ms | 5.500 ms | 0.000 ms | 36.808 ms | 0.000 ms | 0.741 ms |
| pdf-lib Startup | 0.000 ms | 5.000 ms | 0.000 ms | 125.602 ms | 0.000 ms | 2.158 ms |
| pdf-lib End-to-End | 0.000 ms | 4.500 ms | 0.000 ms | 289.889 ms | 0.000 ms | 2.691 ms |
| JSZip Startup | 0.000 ms | 5.500 ms | 0.000 ms | 66.114 ms | 0.000 ms | 0.676 ms |
| JSZip End-to-End | 0.000 ms | 5.500 ms | 0.000 ms | 71.646 ms | 0.000 ms | 0.630 ms |
| Pi SDK Startup | 0.000 ms | 6.000 ms | 0.000 ms | 1413.120 ms | 0.000 ms | 3.263 ms |
| Pi SDK End-to-End | 1.000 ms | 6.500 ms | 0.500 ms | 1811.081 ms | 0.000 ms | 5.578 ms |
| Pi CLI Startup | 0.000 ms | 5.500 ms | 0.000 ms | 1460.741 ms | 0.000 ms | 3.912 ms |
| Pi CLI End-to-End | 0.000 ms | 6.000 ms | 0.000 ms | 1039.601 ms | 0.000 ms | 3.409 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.177 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.049 ms | 0.061 ms | 0.331 ms |
| 1 KB | 0.038 ms | 0.052 ms | 0.127 ms |
| 64 KB | 0.118 ms | 0.133 ms | 0.136 ms |

## Progress Guide

- Warm wall mean
- Bridge calls per iteration
- Warm fixed session overhead
- `_loadPolyfill` real polyfill-body vs `__bd:*` bridge-dispatch splits from comparison.md
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

