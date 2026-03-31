# Module Load Benchmark

Generated: 2026-03-31T10:39:00.515Z
Git commit: 96164a4c4cc10ca38a643067fa4ff87be490a85a
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: none

Use `comparison.md` for before/after deltas, including the split between real `_loadPolyfill` bodies and `__bd:*` dispatch wrappers, and the per-scenario `summary.md` files for copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 154.125 ms | 59.000 | 109.961 ms | `_loadPolyfill` 26.212 ms/iter | `send:Execute` 1243801.000 B/iter |
| Hono End-to-End | 150.765 ms | 59.000 | 108.845 ms | `_loadPolyfill` 22.864 ms/iter | `send:Execute` 1243918.000 B/iter |
| pdf-lib Startup | 393.688 ms | 514.000 | 110.483 ms | `_loadPolyfill` 74.815 ms/iter | `send:Execute` 1243923.000 B/iter |
| pdf-lib End-to-End | 395.505 ms | 529.000 | 111.662 ms | `_loadPolyfill` 70.165 ms/iter | `send:Execute` 1244662.000 B/iter |
| JSZip Startup | 188.114 ms | 179.000 | 109.624 ms | `_loadPolyfill` 53.965 ms/iter | `send:Execute` 1243922.000 B/iter |
| JSZip End-to-End | 211.995 ms | 182.000 | 110.157 ms | `_loadPolyfill` 45.656 ms/iter | `send:Execute` 1245453.000 B/iter |
| Pi SDK Startup | 1773.563 ms | 2548.000 | 116.142 ms | `_loadPolyfill` 942.061 ms/iter | `send:BridgeResponse` 3457969.667 B/iter |
| Pi SDK End-to-End | 1689.811 ms | 2788.000 | 116.113 ms | `_loadPolyfill` 885.443 ms/iter | `send:BridgeResponse` 3602748.667 B/iter |
| Pi CLI Startup | 1916.797 ms | 2604.000 | 117.143 ms | `_loadPolyfill` 917.682 ms/iter | `send:BridgeResponse` 3466268.667 B/iter |
| Pi CLI End-to-End | 1764.241 ms | 2823.000 | 9.732 ms | `_loadPolyfill` 905.867 ms/iter | `send:BridgeResponse` 3614151.000 B/iter |

## Warm Session Phase Means

| Scenario | Connect RTT | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hono Startup | 0.000 ms | 1.000 ms | 4.500 ms | 44.164 ms | 102.000 ms | 2.461 ms |
| Hono End-to-End | 1.000 ms | 0.500 ms | 5.000 ms | 41.920 ms | 101.500 ms | 1.845 ms |
| pdf-lib Startup | 1.000 ms | 0.500 ms | 4.500 ms | 283.204 ms | 102.000 ms | 3.484 ms |
| pdf-lib End-to-End | 0.000 ms | 0.500 ms | 4.500 ms | 283.844 ms | 102.500 ms | 4.162 ms |
| JSZip Startup | 0.000 ms | 0.000 ms | 5.000 ms | 78.490 ms | 102.000 ms | 2.624 ms |
| JSZip End-to-End | 0.000 ms | 0.000 ms | 4.500 ms | 101.839 ms | 102.000 ms | 3.657 ms |
| Pi SDK Startup | 0.000 ms | 0.000 ms | 4.500 ms | 1657.421 ms | 102.000 ms | 9.642 ms |
| Pi SDK End-to-End | 0.000 ms | 0.500 ms | 4.000 ms | 1573.698 ms | 102.000 ms | 9.613 ms |
| Pi CLI Startup | 1.000 ms | 0.500 ms | 5.500 ms | 1799.654 ms | 101.000 ms | 10.143 ms |
| Pi CLI End-to-End | 0.000 ms | 0.500 ms | 4.500 ms | 1754.509 ms | 0.000 ms | 4.732 ms |

## Transport RTT

Dedicated IPC connect RTT: 0.359 ms

| Payload | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: |
| 1 B | 0.218 ms | 0.533 ms | 1.083 ms |
| 1 KB | 0.103 ms | 0.151 ms | 0.219 ms |
| 64 KB | 0.614 ms | 0.626 ms | 4.845 ms |

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

