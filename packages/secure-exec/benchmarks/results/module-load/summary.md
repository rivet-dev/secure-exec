# Module Load Benchmark

Generated: 2026-03-31T07:24:08.544Z
Git commit: 4bb099df925783f92b047045b09d8976fbec7a73
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T05:47:54.440Z

Use `comparison.md` for before/after deltas and the per-scenario `summary.md` files for the copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 149.600 ms | 102.000 | 113.206 ms | `_loadPolyfill` 16.518 ms/iter | `send:Execute` 1240713.000 B/iter |
| Hono End-to-End | 149.463 ms | 102.000 | 108.507 ms | `_loadPolyfill` 19.199 ms/iter | `send:Execute` 1240830.000 B/iter |
| pdf-lib Startup | 314.083 ms | 1651.000 | 108.981 ms | `_loadPolyfill` 64.567 ms/iter | `send:BridgeResponse` 1918520.000 B/iter |
| pdf-lib End-to-End | 387.063 ms | 1666.000 | 109.839 ms | `_loadPolyfill` 70.926 ms/iter | `send:BridgeResponse` 1919390.000 B/iter |
| JSZip Startup | 177.165 ms | 405.000 | 108.367 ms | `_loadPolyfill` 55.914 ms/iter | `send:Execute` 1240834.000 B/iter |
| JSZip End-to-End | 552.962 ms | 519.000 | 108.426 ms | `_loadPolyfill` 45.999 ms/iter | `send:Execute` 1242365.000 B/iter |
| Pi SDK Startup | 1693.028 ms | 2548.000 | 115.200 ms | `_loadPolyfill` 878.447 ms/iter | `send:BridgeResponse` 9142839.000 B/iter |
| Pi SDK End-to-End | 1949.559 ms | 2788.000 | 118.046 ms | `_loadPolyfill` 938.412 ms/iter | `send:BridgeResponse` 9477120.000 B/iter |
| Pi CLI Startup | 1827.171 ms | 2604.000 | 117.846 ms | `_loadPolyfill` 921.631 ms/iter | `send:BridgeResponse` 9161307.667 B/iter |
| Pi CLI End-to-End | 1665.810 ms | 2823.333 | 11.201 ms | `_loadPolyfill` 895.365 ms/iter | `send:BridgeResponse` 9498709.333 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 1.000 ms | 5.500 ms | 36.395 ms | 101.500 ms | 5.206 ms |
| Hono End-to-End | 0.000 ms | 0.500 ms | 5.000 ms | 40.955 ms | 101.500 ms | 1.508 ms |
| pdf-lib Startup | 0.000 ms | 0.000 ms | 5.000 ms | 205.103 ms | 101.500 ms | 2.481 ms |
| pdf-lib End-to-End | 0.000 ms | 0.000 ms | 5.500 ms | 277.224 ms | 102.000 ms | 2.338 ms |
| JSZip Startup | 1.000 ms | 0.500 ms | 5.000 ms | 68.798 ms | 101.500 ms | 1.367 ms |
| JSZip End-to-End | 0.000 ms | 0.500 ms | 4.500 ms | 444.536 ms | 102.000 ms | 1.426 ms |
| Pi SDK Startup | 0.000 ms | 0.500 ms | 4.500 ms | 1577.828 ms | 101.000 ms | 9.200 ms |
| Pi SDK End-to-End | 0.000 ms | 0.000 ms | 6.000 ms | 1831.514 ms | 102.000 ms | 10.046 ms |
| Pi CLI Startup | 0.000 ms | 0.500 ms | 4.500 ms | 1709.325 ms | 102.000 ms | 10.846 ms |
| Pi CLI End-to-End | 0.000 ms | 0.000 ms | 4.500 ms | 1654.608 ms | 0.000 ms | 6.701 ms |

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

