# Module Load Benchmark

Generated: 2026-03-31T13:28:50.274Z
Git commit: be83b6fdd9fec12d9037d0ec08d0d360d3c33f30
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T13:21:52.548Z

Use `comparison.md` for before/after deltas, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers, and the per-scenario `summary.md` files for copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 140.959 ms | 59.000 | 109.115 ms | `_loadPolyfill` 38.364 ms/iter | `send:WarmSnapshot` 411389.667 B/iter |
| Hono End-to-End | 139.728 ms | 59.000 | 109.456 ms | `_loadPolyfill` 16.919 ms/iter | `send:WarmSnapshot` 411389.667 B/iter |
| pdf-lib Startup | 353.377 ms | 514.000 | 110.105 ms | `_loadPolyfill` 80.806 ms/iter | `send:BridgeResponse` 682128.000 B/iter |
| pdf-lib End-to-End | 362.870 ms | 529.000 | 111.424 ms | `_loadPolyfill` 59.792 ms/iter | `send:BridgeResponse` 682998.000 B/iter |
| JSZip Startup | 169.488 ms | 179.000 | 109.156 ms | `_loadPolyfill` 53.858 ms/iter | `send:BridgeResponse` 421617.667 B/iter |
| JSZip End-to-End | 193.293 ms | 182.000 | 108.653 ms | `_loadPolyfill` 59.379 ms/iter | `send:BridgeResponse` 421791.667 B/iter |
| Pi SDK Startup | 1668.363 ms | 2511.000 | 115.606 ms | `_loadPolyfill` 816.938 ms/iter | `send:BridgeResponse` 3497993.667 B/iter |
| Pi SDK End-to-End | 1835.606 ms | 2745.000 | 116.839 ms | `_loadPolyfill` 890.972 ms/iter | `send:BridgeResponse` 3642576.667 B/iter |
| Pi CLI Startup | 1809.331 ms | 2562.000 | 117.805 ms | `_loadPolyfill` 932.045 ms/iter | `send:BridgeResponse` 3500710.000 B/iter |
| Pi CLI End-to-End | 1926.880 ms | 2772.000 | 13.261 ms | `_loadPolyfill` 937.983 ms/iter | `send:BridgeResponse` 3648246.667 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 4.500 ms | 0.500 ms | 31.843 ms | 102.500 ms | 1.615 ms |
| Hono End-to-End | 0.000 ms | 5.000 ms | 0.500 ms | 30.273 ms | 102.500 ms | 1.456 ms |
| pdf-lib Startup | 0.000 ms | 5.000 ms | 0.000 ms | 243.272 ms | 103.000 ms | 2.104 ms |
| pdf-lib End-to-End | 0.000 ms | 5.000 ms | 0.000 ms | 251.446 ms | 102.500 ms | 3.924 ms |
| JSZip Startup | 0.000 ms | 4.500 ms | 0.500 ms | 60.332 ms | 101.500 ms | 2.656 ms |
| JSZip End-to-End | 0.000 ms | 4.500 ms | 1.000 ms | 84.640 ms | 101.500 ms | 1.653 ms |
| Pi SDK Startup | 0.000 ms | 5.500 ms | 0.000 ms | 1552.756 ms | 102.500 ms | 7.606 ms |
| Pi SDK End-to-End | 1.000 ms | 5.500 ms | 0.000 ms | 1718.767 ms | 102.000 ms | 9.339 ms |
| Pi CLI Startup | 0.000 ms | 5.500 ms | 0.000 ms | 1691.526 ms | 102.000 ms | 10.305 ms |
| Pi CLI End-to-End | 0.000 ms | 5.500 ms | 0.000 ms | 1913.619 ms | 0.000 ms | 7.760 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.172 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.028 ms | 0.047 ms | 0.081 ms |
| 1 KB | 0.019 ms | 0.024 ms | 0.025 ms |
| 64 KB | 0.207 ms | 0.338 ms | 0.660 ms |

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

