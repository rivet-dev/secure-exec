# Module Load Benchmark

Generated: 2026-03-31T05:05:15.176Z
Git commit: 9adad215396587b45268138893f1efffe08c06ed
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T05:03:50.186Z

Use `comparison.md` for before/after deltas and the per-scenario `summary.md` files for the copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 151.127 ms | 102.000 | 107.166 ms | `_loadPolyfill` 25.621 ms/iter | `send:Execute` 1240713.000 B/iter |
| Hono End-to-End | 142.192 ms | 102.000 | 107.334 ms | `_loadPolyfill` 18.455 ms/iter | `send:Execute` 1240830.000 B/iter |
| Pi SDK Startup | 1605.896 ms | 5278.000 | 107.982 ms | `_loadPolyfill` 813.611 ms/iter | `send:BridgeResponse` 9362446.000 B/iter |
| Pi SDK End-to-End | 1991.222 ms | 5747.000 | 107.215 ms | `_loadPolyfill` 935.682 ms/iter | `send:BridgeResponse` 9715780.000 B/iter |
| Pi CLI Startup | 1927.126 ms | 5336.000 | 107.510 ms | `_loadPolyfill` 977.736 ms/iter | `send:BridgeResponse` 9381014.000 B/iter |
| Pi CLI End-to-End | 1749.175 ms | 5784.000 | 5.340 ms | `_loadPolyfill` 826.220 ms/iter | `send:BridgeResponse` 9737452.333 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 1.000 ms | 0.500 ms | 4.500 ms | 43.962 ms | 101.500 ms | 0.665 ms |
| Hono End-to-End | 0.000 ms | 0.000 ms | 5.000 ms | 34.858 ms | 101.500 ms | 0.834 ms |
| Pi SDK Startup | 1.000 ms | 0.500 ms | 4.500 ms | 1497.915 ms | 103.500 ms | -0.518 ms |
| Pi SDK End-to-End | 1.000 ms | 0.000 ms | 4.500 ms | 1884.008 ms | 102.000 ms | 0.715 ms |
| Pi CLI Startup | 1.000 ms | 0.500 ms | 4.000 ms | 1819.616 ms | 102.500 ms | 0.509 ms |
| Pi CLI End-to-End | 0.000 ms | 0.000 ms | 4.500 ms | 1743.835 ms | 0.000 ms | 0.840 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.198 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.022 ms | 0.040 ms | 0.040 ms |
| 1 KB | 0.017 ms | 0.020 ms | 0.025 ms |
| 64 KB | 0.143 ms | 0.181 ms | 0.184 ms |

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

