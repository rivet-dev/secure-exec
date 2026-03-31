# Module Load Benchmark

Generated: 2026-03-31T09:40:59.609Z
Git commit: 4aae2210f7fa581952f107153f551fbe2530285c
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T07:24:08.544Z

Use `comparison.md` for before/after deltas, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers, and the per-scenario `summary.md` files for copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 143.079 ms | 59.000 | 110.603 ms | `_loadPolyfill` 14.572 ms/iter | `send:Execute` 1242094.000 B/iter |
| Hono End-to-End | 150.142 ms | 59.000 | 109.981 ms | `_loadPolyfill` 16.343 ms/iter | `send:Execute` 1242211.000 B/iter |
| pdf-lib Startup | 330.374 ms | 514.000 | 111.281 ms | `_loadPolyfill` 71.276 ms/iter | `send:BridgeResponse` 1617593.333 B/iter |
| pdf-lib End-to-End | 342.928 ms | 529.000 | 112.789 ms | `_loadPolyfill` 71.015 ms/iter | `send:BridgeResponse` 1618463.333 B/iter |
| JSZip Startup | 206.266 ms | 179.000 | 109.216 ms | `_loadPolyfill` 53.063 ms/iter | `send:Execute` 1242215.000 B/iter |
| JSZip End-to-End | 552.962 ms | 63.667 | - | `_loadPolyfill` 58.723 ms/iter | `send:Execute` 414582.000 B/iter |
| Pi SDK Startup | 1729.225 ms | 2548.000 | 117.534 ms | `_loadPolyfill` 844.908 ms/iter | `send:BridgeResponse` 7475865.667 B/iter |
| Pi SDK End-to-End | 1949.559 ms | 929.333 | - | `_loadPolyfill` 403.905 ms/iter | `send:BridgeResponse` 3159486.000 B/iter |
| Pi CLI Startup | 1697.463 ms | 2604.000 | 118.185 ms | `_loadPolyfill` 895.929 ms/iter | `send:BridgeResponse` 7494335.000 B/iter |
| Pi CLI End-to-End | 1770.193 ms | 2823.000 | 11.691 ms | `_loadPolyfill` 889.795 ms/iter | `send:BridgeResponse` 7831719.667 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 0.500 ms | 5.000 ms | 32.476 ms | 102.000 ms | 3.103 ms |
| Hono End-to-End | 0.000 ms | 0.500 ms | 4.500 ms | 40.162 ms | 102.000 ms | 2.981 ms |
| pdf-lib Startup | 0.000 ms | 0.500 ms | 5.000 ms | 219.092 ms | 102.500 ms | 3.282 ms |
| pdf-lib End-to-End | 0.000 ms | 0.000 ms | 5.000 ms | 230.139 ms | 102.500 ms | 5.289 ms |
| JSZip Startup | 0.000 ms | 0.500 ms | 4.000 ms | 97.050 ms | 102.000 ms | 2.716 ms |
| JSZip End-to-End | 0.000 ms | - | - | - | - | - |
| Pi SDK Startup | 0.000 ms | 0.500 ms | 4.500 ms | 1611.691 ms | 102.500 ms | 10.034 ms |
| Pi SDK End-to-End | 1.000 ms | 1.000 ms | 6.000 ms | - | - | - |
| Pi CLI Startup | 1.000 ms | 0.500 ms | 4.500 ms | 1579.278 ms | 102.500 ms | 10.685 ms |
| Pi CLI End-to-End | 1.000 ms | 0.500 ms | 5.500 ms | 1758.502 ms | 0.000 ms | 5.691 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.173 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.024 ms | 0.043 ms | 0.048 ms |
| 1 KB | 0.016 ms | 0.019 ms | 0.021 ms |
| 64 KB | 0.117 ms | 0.123 ms | 0.132 ms |

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

