# Module Load Benchmark

Generated: 2026-03-31T04:18:38.754Z
Git commit: 41215f4827a6759f97c60556672c51105bf74ddf
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8
Baseline summary: 2026-03-31T04:02:18.756Z

Use `comparison.md` for before/after deltas and the per-scenario `summary.md` files for the copy-ready progress numbers.

| Scenario | Warm Wall Mean | Bridge Calls/Iter | Warm Fixed Overhead | Dominant Method Time | Dominant Frame Bytes |
| --- | ---: | ---: | ---: | --- | --- |
| Hono Startup | 141.156 ms | 102.000 | 108.902 ms | `_loadPolyfill` 21.553 ms/iter | `send:Execute` 1240713.000 B/iter |
| Hono End-to-End | 145.024 ms | 102.000 | 107.840 ms | `_loadPolyfill` 29.381 ms/iter | `send:Execute` 1240830.000 B/iter |
| Pi SDK Startup | 1676.693 ms | 5278.000 | 107.224 ms | `_loadPolyfill` 873.085 ms/iter | `send:BridgeResponse` 9362446.000 B/iter |
| Pi SDK End-to-End | 2062.543 ms | 5747.000 | 106.510 ms | `_loadPolyfill` 968.389 ms/iter | `send:BridgeResponse` 9715780.000 B/iter |
| Pi CLI Startup | 1899.870 ms | 5336.000 | 107.644 ms | `_loadPolyfill` 964.642 ms/iter | `send:BridgeResponse` 9381015.333 B/iter |
| Pi CLI End-to-End | 2099.842 ms | 5797.000 | 107.250 ms | `_loadPolyfill` 1048.381 ms/iter | `send:BridgeResponse` 9750510.000 B/iter |

## Progress Guide

- Warm wall mean
- Bridge calls per iteration
- Warm fixed session overhead
- Dominant bridge method time and byte deltas from comparison.md

## Per-Scenario Summaries

- `hono-startup`: `hono-startup/summary.json`, `hono-startup/summary.md`
- `hono-end-to-end`: `hono-end-to-end/summary.json`, `hono-end-to-end/summary.md`
- `pi-sdk-startup`: `pi-sdk-startup/summary.json`, `pi-sdk-startup/summary.md`
- `pi-sdk-end-to-end`: `pi-sdk-end-to-end/summary.json`, `pi-sdk-end-to-end/summary.md`
- `pi-cli-startup`: `pi-cli-startup/summary.json`, `pi-cli-startup/summary.md`
- `pi-cli-end-to-end`: `pi-cli-end-to-end/summary.json`, `pi-cli-end-to-end/summary.md`

