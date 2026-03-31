# Module Load Benchmark

Generated: 2026-03-31T04:43:52.284Z
Git commit: 3772f039226af33b598e63088829fd4f39b345d3
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T04:38:53.052Z

Use `comparison.md` for before/after deltas and the per-scenario `summary.md` files for the copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 167.784 ms | 102.000 | 109.038 ms | `_loadPolyfill` 22.890 ms/iter | `send:Execute` 1240713.000 B/iter |
| Hono End-to-End | 146.134 ms | 102.000 | 107.780 ms | `_loadPolyfill` 17.628 ms/iter | `send:Execute` 1240830.000 B/iter |
| Pi SDK Startup | 1645.959 ms | 5278.000 | 107.634 ms | `_loadPolyfill` 836.082 ms/iter | `send:BridgeResponse` 9362446.000 B/iter |
| Pi SDK End-to-End | 1884.760 ms | 5747.000 | 106.159 ms | `_loadPolyfill` 815.311 ms/iter | `send:BridgeResponse` 9715780.000 B/iter |
| Pi CLI Startup | 1924.517 ms | 5336.000 | 107.356 ms | `_loadPolyfill` 897.458 ms/iter | `send:BridgeResponse` 9381015.333 B/iter |
| Pi CLI End-to-End | 2026.762 ms | 5797.000 | 109.701 ms | `_loadPolyfill` 1081.009 ms/iter | `send:BridgeResponse` 9750510.000 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 0.000 ms | 5.000 ms | 58.745 ms | 103.500 ms | 0.538 ms |
| Hono End-to-End | 0.000 ms | 0.500 ms | 5.000 ms | 38.354 ms | 102.000 ms | 0.280 ms |
| Pi SDK Startup | 1.000 ms | 0.500 ms | 4.000 ms | 1538.325 ms | 102.500 ms | 0.634 ms |
| Pi SDK End-to-End | 0.000 ms | 0.000 ms | 4.500 ms | 1778.601 ms | 100.500 ms | 1.159 ms |
| Pi CLI Startup | 1.000 ms | 0.000 ms | 4.500 ms | 1817.161 ms | 102.500 ms | 0.356 ms |
| Pi CLI End-to-End | 0.000 ms | 0.500 ms | 6.500 ms | 1917.061 ms | 102.500 ms | 0.201 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.251 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.025 ms | 0.040 ms | 0.048 ms |
| 1 KB | 0.020 ms | 0.028 ms | 0.028 ms |
| 64 KB | 0.177 ms | 0.331 ms | 0.345 ms |

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
- `pi-sdk-startup`: `pi-sdk-startup/summary.json`, `pi-sdk-startup/summary.md`
- `pi-sdk-end-to-end`: `pi-sdk-end-to-end/summary.json`, `pi-sdk-end-to-end/summary.md`
- `pi-cli-startup`: `pi-cli-startup/summary.json`, `pi-cli-startup/summary.md`
- `pi-cli-end-to-end`: `pi-cli-end-to-end/summary.json`, `pi-cli-end-to-end/summary.md`
- `transport-rtt`: `transport-rtt.json`, `transport-rtt.md`

