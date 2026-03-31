# Module Load Benchmark

Generated: 2026-03-31T11:03:59.802Z
Git commit: 91c688ced6f9ca8d055acfcf03bb79a20d21736f
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T10:39:00.515Z

Use `comparison.md` for before/after deltas, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers, and the per-scenario `summary.md` files for copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 144.760 ms | 59.000 | 108.532 ms | `_loadPolyfill` 32.236 ms/iter | `send:Execute` 546102.000 B/iter |
| Hono End-to-End | 144.303 ms | 59.000 | 108.572 ms | `_loadPolyfill` 20.738 ms/iter | `send:Execute` 546219.000 B/iter |
| pdf-lib Startup | 299.063 ms | 514.000 | 111.150 ms | `_loadPolyfill` 93.122 ms/iter | `send:BridgeResponse` 682128.000 B/iter |
| pdf-lib End-to-End | 344.577 ms | 529.000 | 111.449 ms | `_loadPolyfill` 66.811 ms/iter | `send:BridgeResponse` 682998.000 B/iter |
| JSZip Startup | 197.583 ms | 179.000 | 108.335 ms | `_loadPolyfill` 50.123 ms/iter | `send:Execute` 546223.000 B/iter |
| JSZip End-to-End | 220.933 ms | 182.000 | 111.137 ms | `_loadPolyfill` 85.607 ms/iter | `send:Execute` 547754.000 B/iter |
| Pi SDK Startup | 1732.934 ms | 2548.000 | 116.982 ms | `_loadPolyfill` 958.124 ms/iter | `send:BridgeResponse` 3457969.667 B/iter |
| Pi SDK End-to-End | 1613.442 ms | 2788.000 | 115.983 ms | `_loadPolyfill` 858.330 ms/iter | `send:BridgeResponse` 3602748.667 B/iter |
| Pi CLI Startup | 1869.642 ms | 2604.000 | 117.090 ms | `_loadPolyfill` 936.657 ms/iter | `send:BridgeResponse` 3466269.333 B/iter |
| Pi CLI End-to-End | 1789.771 ms | 2823.000 | 11.449 ms | `_loadPolyfill` 954.038 ms/iter | `send:BridgeResponse` 3614151.333 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 1.000 ms | 4.500 ms | 0.000 ms | 36.227 ms | 102.000 ms | 2.032 ms |
| Hono End-to-End | 0.000 ms | 4.000 ms | 0.500 ms | 35.731 ms | 101.000 ms | 3.072 ms |
| pdf-lib Startup | 1.000 ms | 4.500 ms | 0.500 ms | 187.912 ms | 103.000 ms | 3.150 ms |
| pdf-lib End-to-End | 0.000 ms | 4.000 ms | 0.500 ms | 233.128 ms | 102.000 ms | 4.949 ms |
| JSZip Startup | 0.000 ms | 4.500 ms | 0.000 ms | 89.248 ms | 102.000 ms | 1.835 ms |
| JSZip End-to-End | 0.000 ms | 5.500 ms | 0.000 ms | 109.797 ms | 102.000 ms | 3.637 ms |
| Pi SDK Startup | 0.000 ms | 4.500 ms | 0.000 ms | 1615.952 ms | 102.500 ms | 9.982 ms |
| Pi SDK End-to-End | 0.000 ms | 4.000 ms | 0.000 ms | 1497.459 ms | 102.000 ms | 9.983 ms |
| Pi CLI Startup | 0.000 ms | 4.500 ms | 0.000 ms | 1752.552 ms | 102.000 ms | 10.591 ms |
| Pi CLI End-to-End | 0.000 ms | 4.500 ms | 0.500 ms | 1778.322 ms | 0.000 ms | 6.449 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.344 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.049 ms | 0.084 ms | 0.123 ms |
| 1 KB | 0.040 ms | 0.060 ms | 0.064 ms |
| 64 KB | 0.150 ms | 0.208 ms | 0.209 ms |

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

