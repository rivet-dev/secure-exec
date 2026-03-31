# Module Load Benchmark

Generated: 2026-03-31T04:02:18.767Z
Git commit: f32fdfd33bf844cfb50284b07412da1db4b9fd1f
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8

| Scenario | Status | Cold Wall | Warm Wall Mean | Cold Sandbox | Warm Sandbox Mean | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Hono Startup | passed | 302.365 ms | 153.889 ms | 0.000 ms | 0.000 ms | - |
| Hono End-to-End | passed | 276.735 ms | 143.365 ms | 0.000 ms | 0.000 ms | - |
| Pi SDK Startup | passed | 2267.032 ms | 1615.126 ms | 0.000 ms | 0.000 ms | - |
| Pi SDK End-to-End | passed | 2515.994 ms | 2004.673 ms | 0.000 ms | 0.000 ms | - |
| Pi CLI Startup | passed | 2324.069 ms | 1919.521 ms | - | - | - |
| Pi CLI End-to-End | passed | 2577.123 ms | 2036.938 ms | - | - | - |

## Artifacts

- `hono-startup`: `hono-startup/result.json`, `hono-startup/metrics.prom`, `hono-startup/ipc.ndjson`, `hono-startup/runner.log`
- `hono-end-to-end`: `hono-end-to-end/result.json`, `hono-end-to-end/metrics.prom`, `hono-end-to-end/ipc.ndjson`, `hono-end-to-end/runner.log`
- `pi-sdk-startup`: `pi-sdk-startup/result.json`, `pi-sdk-startup/metrics.prom`, `pi-sdk-startup/ipc.ndjson`, `pi-sdk-startup/runner.log`
- `pi-sdk-end-to-end`: `pi-sdk-end-to-end/result.json`, `pi-sdk-end-to-end/metrics.prom`, `pi-sdk-end-to-end/ipc.ndjson`, `pi-sdk-end-to-end/runner.log`
- `pi-cli-startup`: `pi-cli-startup/result.json`, `pi-cli-startup/metrics.prom`, `pi-cli-startup/ipc.ndjson`, `pi-cli-startup/runner.log`
- `pi-cli-end-to-end`: `pi-cli-end-to-end/result.json`, `pi-cli-end-to-end/metrics.prom`, `pi-cli-end-to-end/ipc.ndjson`, `pi-cli-end-to-end/runner.log`

