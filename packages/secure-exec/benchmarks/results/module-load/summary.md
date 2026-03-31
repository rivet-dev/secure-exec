# Module Load Benchmark

Generated: 2026-03-31T05:47:54.440Z
Git commit: 88d1992eeca4a42f5db14755c593d86a2d776481
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T05:29:53.612Z

Use `comparison.md` for before/after deltas and the per-scenario `summary.md` files for the copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 149.600 ms | 102.000 | 113.206 ms | `_loadPolyfill` 16.518 ms/iter | `send:Execute` 1240713.000 B/iter |
| Hono End-to-End | 149.463 ms | 102.000 | 108.507 ms | `_loadPolyfill` 19.199 ms/iter | `send:Execute` 1240830.000 B/iter |
| pdf-lib Startup | 314.083 ms | 1651.000 | 108.981 ms | `_loadPolyfill` 64.567 ms/iter | `send:BridgeResponse` 1918520.000 B/iter |
| pdf-lib End-to-End | 387.063 ms | 1666.000 | 109.839 ms | `_loadPolyfill` 70.926 ms/iter | `send:BridgeResponse` 1919390.000 B/iter |
| JSZip Startup | 177.165 ms | 405.000 | 108.367 ms | `_loadPolyfill` 55.914 ms/iter | `send:Execute` 1240834.000 B/iter |
| JSZip End-to-End | 552.962 ms | 519.000 | 108.426 ms | `_loadPolyfill` 45.999 ms/iter | `send:Execute` 1242365.000 B/iter |
| Pi SDK Startup | 1441.818 ms | 5278.000 | 112.577 ms | `_loadPolyfill` 614.728 ms/iter | `send:BridgeResponse` 9362446.000 B/iter |
| Pi SDK End-to-End | 1294.301 ms | 5747.000 | 109.273 ms | `_loadPolyfill` 587.640 ms/iter | `send:BridgeResponse` 9715780.000 B/iter |
| Pi CLI Startup | 1735.594 ms | 5336.000 | 111.233 ms | `_loadPolyfill` 636.155 ms/iter | `send:BridgeResponse` 9381016.000 B/iter |
| Pi CLI End-to-End | 1959.386 ms | 5784.000 | 9.326 ms | `_loadPolyfill` 861.924 ms/iter | `send:BridgeResponse` 9737453.000 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 1.000 ms | 5.500 ms | 36.395 ms | 101.500 ms | 5.206 ms |
| Hono End-to-End | 0.000 ms | 0.500 ms | 5.000 ms | 40.955 ms | 101.500 ms | 1.508 ms |
| pdf-lib Startup | 0.000 ms | 0.000 ms | 5.000 ms | 205.103 ms | 101.500 ms | 2.481 ms |
| pdf-lib End-to-End | 0.000 ms | 0.000 ms | 5.500 ms | 277.224 ms | 102.000 ms | 2.338 ms |
| JSZip Startup | 1.000 ms | 0.500 ms | 5.000 ms | 68.798 ms | 101.500 ms | 1.367 ms |
| JSZip End-to-End | 0.000 ms | 0.500 ms | 4.500 ms | 444.536 ms | 102.000 ms | 1.426 ms |
| Pi SDK Startup | 0.000 ms | 0.500 ms | 4.000 ms | 1329.241 ms | 101.500 ms | 6.577 ms |
| Pi SDK End-to-End | 0.000 ms | 1.000 ms | 4.000 ms | 1185.027 ms | 101.500 ms | 2.773 ms |
| Pi CLI Startup | 1.000 ms | 1.000 ms | 4.500 ms | 1624.361 ms | 102.500 ms | 3.232 ms |
| Pi CLI End-to-End | 1.000 ms | 0.500 ms | 5.000 ms | 1950.059 ms | 0.000 ms | 3.826 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.194 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.024 ms | 0.032 ms | 0.092 ms |
| 1 KB | 0.015 ms | 0.017 ms | 0.019 ms |
| 64 KB | 0.220 ms | 0.391 ms | 0.406 ms |

## Progress Guide

- Warm wall mean
- Bridge calls per iteration
- Warm fixed session overhead
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

