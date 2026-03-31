# Module Load Benchmark

Generated: 2026-03-31T21:03:06.214Z
Git commit: ba7f25d50dd615ef19498cc1d435e1b29a4bb665
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T20:29:57.618Z

Use `comparison.md` for before/after deltas, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers, and the per-scenario `summary.md` files for copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 33.412 ms | 59.000 | 5.440 ms | `_loadPolyfill` 10.399 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Hono End-to-End | 35.979 ms | 59.000 | 5.543 ms | `_loadPolyfill` 17.284 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| pdf-lib Startup | 230.975 ms | 514.000 | 7.713 ms | `_bridgeDispatch` 62.437 ms/iter | `send:BridgeResponse` 652213.000 B/iter |
| pdf-lib End-to-End | 297.079 ms | 529.000 | 7.191 ms | `_bridgeDispatch` 60.207 ms/iter | `send:BridgeResponse` 653208.000 B/iter |
| JSZip Startup | 68.886 ms | 179.000 | 6.290 ms | `_loadPolyfill` 37.582 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| JSZip End-to-End | 79.804 ms | 182.000 | 6.676 ms | `_loadPolyfill` 33.071 ms/iter | `send:WarmSnapshot` 411447.667 B/iter |
| Pi SDK Startup | 1665.403 ms | 2511.000 | 12.056 ms | `_bridgeDispatch` 779.699 ms/iter | `send:BridgeResponse` 3309659.000 B/iter |
| Pi SDK End-to-End | 1695.689 ms | 2745.000 | 9.169 ms | `_bridgeDispatch` 838.520 ms/iter | `send:BridgeResponse` 3444124.333 B/iter |
| Pi CLI Startup | 1367.156 ms | 2562.000 | 9.168 ms | `_bridgeDispatch` 716.479 ms/iter | `send:BridgeResponse` 3312400.333 B/iter |
| Pi CLI End-to-End | 1754.015 ms | 2772.333 | 13.227 ms | `_bridgeDispatch` 823.737 ms/iter | `send:BridgeResponse` 3449878.667 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 5.000 ms | 0.000 ms | 27.972 ms | 0.000 ms | 0.440 ms |
| Hono End-to-End | 0.000 ms | 5.000 ms | 0.000 ms | 30.435 ms | 0.000 ms | 0.543 ms |
| pdf-lib Startup | 0.000 ms | 5.500 ms | 0.000 ms | 223.263 ms | 0.500 ms | 1.712 ms |
| pdf-lib End-to-End | 0.000 ms | 4.500 ms | 0.000 ms | 289.889 ms | 0.000 ms | 2.691 ms |
| JSZip Startup | 0.000 ms | 4.500 ms | 0.000 ms | 62.596 ms | 0.500 ms | 1.290 ms |
| JSZip End-to-End | 0.000 ms | 5.500 ms | 0.000 ms | 73.129 ms | 0.000 ms | 1.175 ms |
| Pi SDK Startup | 1.000 ms | 6.000 ms | 0.000 ms | 1653.348 ms | 0.000 ms | 6.056 ms |
| Pi SDK End-to-End | 0.000 ms | 5.500 ms | 0.000 ms | 1686.520 ms | 0.000 ms | 3.669 ms |
| Pi CLI Startup | 1.000 ms | 5.500 ms | 0.000 ms | 1357.987 ms | 0.000 ms | 3.668 ms |
| Pi CLI End-to-End | 0.000 ms | 6.500 ms | 0.000 ms | 1740.789 ms | 0.500 ms | 6.226 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.220 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.048 ms | 0.059 ms | 0.321 ms |
| 1 KB | 0.023 ms | 0.028 ms | 0.031 ms |
| 64 KB | 0.126 ms | 0.158 ms | 0.172 ms |

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

