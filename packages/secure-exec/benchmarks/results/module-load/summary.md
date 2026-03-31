# Module Load Benchmark

Generated: 2026-03-31T05:29:53.612Z
Git commit: 6197d51aa59337c452dded8d5317cab31e30b8a5
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: none

Use `comparison.md` for before/after deltas and the per-scenario `summary.md` files for the copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 143.668 ms | 102.000 | 108.096 ms | `_loadPolyfill` 20.373 ms/iter | `send:Execute` 1240713.000 B/iter |
| Hono End-to-End | 158.059 ms | 102.000 | 107.936 ms | `_loadPolyfill` 18.976 ms/iter | `send:Execute` 1240830.000 B/iter |
| pdf-lib Startup | 283.235 ms | 1651.000 | 107.558 ms | `_loadPolyfill` 63.188 ms/iter | `send:BridgeResponse` 1918520.000 B/iter |
| pdf-lib End-to-End | 346.978 ms | 1666.000 | 107.320 ms | `_loadPolyfill` 64.109 ms/iter | `send:BridgeResponse` 1919390.000 B/iter |
| JSZip Startup | 179.459 ms | 405.000 | 107.322 ms | `_loadPolyfill` 85.118 ms/iter | `send:Execute` 1240834.000 B/iter |
| JSZip End-to-End | 588.452 ms | 519.000 | 107.377 ms | `_loadPolyfill` 80.144 ms/iter | `send:Execute` 1242293.000 B/iter |
| Pi SDK Startup | 1629.538 ms | 5278.000 | 107.279 ms | `_loadPolyfill` 881.464 ms/iter | `send:BridgeResponse` 9362446.000 B/iter |
| Pi SDK End-to-End | 1334.696 ms | 5747.000 | 106.892 ms | `_loadPolyfill` 556.728 ms/iter | `send:BridgeResponse` 9715780.000 B/iter |
| Pi CLI Startup | 1948.524 ms | 5336.000 | 107.761 ms | `_loadPolyfill` 994.653 ms/iter | `send:BridgeResponse` 9381016.000 B/iter |
| Pi CLI End-to-End | 1471.664 ms | 5784.000 | 5.091 ms | `_loadPolyfill` 741.734 ms/iter | `send:BridgeResponse` 9737451.667 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 0.500 ms | 5.000 ms | 35.573 ms | 102.000 ms | 0.596 ms |
| Hono End-to-End | 1.000 ms | 0.500 ms | 5.000 ms | 50.123 ms | 101.500 ms | 0.936 ms |
| pdf-lib Startup | 0.000 ms | 0.000 ms | 5.500 ms | 175.676 ms | 102.000 ms | 0.058 ms |
| pdf-lib End-to-End | 0.000 ms | 0.500 ms | 5.000 ms | 239.657 ms | 102.000 ms | -0.180 ms |
| JSZip Startup | 0.000 ms | 0.000 ms | 5.000 ms | 72.137 ms | 102.000 ms | 0.322 ms |
| JSZip End-to-End | 0.000 ms | 0.000 ms | 5.000 ms | 481.075 ms | 102.000 ms | 0.378 ms |
| Pi SDK Startup | 0.000 ms | 0.500 ms | 4.500 ms | 1522.259 ms | 102.000 ms | 0.279 ms |
| Pi SDK End-to-End | 1.000 ms | 0.500 ms | 4.500 ms | 1227.803 ms | 101.500 ms | 0.392 ms |
| Pi CLI Startup | 1.000 ms | 1.000 ms | 5.000 ms | 1840.763 ms | 102.000 ms | -0.239 ms |
| Pi CLI End-to-End | 0.000 ms | 1.000 ms | 3.500 ms | 1466.573 ms | 0.000 ms | 0.591 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.200 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.022 ms | 0.033 ms | 0.051 ms |
| 1 KB | 0.017 ms | 0.019 ms | 0.025 ms |
| 64 KB | 0.128 ms | 0.133 ms | 0.147 ms |

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

