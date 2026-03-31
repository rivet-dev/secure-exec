# Module Load Benchmark

Generated: 2026-03-31T11:52:13.425Z
Git commit: a5f06534200cd4f6131d64de2c0a09c1bee14d53
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T11:03:59.802Z

Use `comparison.md` for before/after deltas, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers, and the per-scenario `summary.md` files for copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 139.820 ms | 59.000 | 109.259 ms | `_loadPolyfill` 15.623 ms/iter | `send:Execute` 422495.667 B/iter |
| Hono End-to-End | 141.644 ms | 59.000 | 109.618 ms | `_loadPolyfill` 21.603 ms/iter | `send:Execute` 422612.667 B/iter |
| pdf-lib Startup | 238.739 ms | 514.000 | 109.900 ms | `_loadPolyfill` 57.815 ms/iter | `send:BridgeResponse` 682128.000 B/iter |
| pdf-lib End-to-End | 349.741 ms | 529.000 | 111.777 ms | `_loadPolyfill` 68.094 ms/iter | `send:BridgeResponse` 682998.000 B/iter |
| JSZip Startup | 172.202 ms | 179.000 | 111.102 ms | `_loadPolyfill` 76.484 ms/iter | `send:Execute` 422616.667 B/iter |
| JSZip End-to-End | 215.876 ms | 182.000 | 109.703 ms | `_loadPolyfill` 62.205 ms/iter | `send:Execute` 424147.667 B/iter |
| Pi SDK Startup | 1780.762 ms | 2548.000 | 116.058 ms | `_loadPolyfill` 965.840 ms/iter | `send:BridgeResponse` 3457969.667 B/iter |
| Pi SDK End-to-End | 1857.941 ms | 2788.000 | 116.371 ms | `_loadPolyfill` 984.662 ms/iter | `send:BridgeResponse` 3602748.667 B/iter |
| Pi CLI Startup | 1854.094 ms | 2604.000 | 114.551 ms | `_loadPolyfill` 896.110 ms/iter | `send:BridgeResponse` 3466269.333 B/iter |
| Pi CLI End-to-End | 1993.647 ms | 2823.000 | 8.235 ms | `_loadPolyfill` 944.730 ms/iter | `send:BridgeResponse` 3614150.667 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 4.500 ms | 0.000 ms | 30.560 ms | 102.000 ms | 2.759 ms |
| Hono End-to-End | 1.000 ms | 5.000 ms | 0.000 ms | 32.026 ms | 102.500 ms | 2.118 ms |
| pdf-lib Startup | 0.000 ms | 5.000 ms | 0.000 ms | 128.839 ms | 101.500 ms | 3.400 ms |
| pdf-lib End-to-End | 1.000 ms | 5.000 ms | 0.000 ms | 237.964 ms | 102.000 ms | 4.777 ms |
| JSZip Startup | 0.000 ms | 4.500 ms | 0.000 ms | 61.100 ms | 103.000 ms | 3.603 ms |
| JSZip End-to-End | 0.000 ms | 5.000 ms | 0.000 ms | 106.172 ms | 102.000 ms | 2.704 ms |
| Pi SDK Startup | 0.000 ms | 4.500 ms | 0.000 ms | 1664.704 ms | 103.000 ms | 8.558 ms |
| Pi SDK End-to-End | 0.000 ms | 5.000 ms | 0.000 ms | 1741.570 ms | 102.000 ms | 9.371 ms |
| Pi CLI Startup | 1.000 ms | 5.000 ms | 0.000 ms | 1739.543 ms | 102.500 ms | 7.051 ms |
| Pi CLI End-to-End | 0.000 ms | 5.000 ms | 0.500 ms | 1985.412 ms | 0.000 ms | 2.734 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.244 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.083 ms | 0.127 ms | 0.218 ms |
| 1 KB | 0.047 ms | 0.083 ms | 0.090 ms |
| 64 KB | 0.120 ms | 0.154 ms | 0.169 ms |

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

