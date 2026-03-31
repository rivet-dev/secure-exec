# Module Load Benchmark

Generated: 2026-03-31T02:01:34.230Z
Git commit: 17cacf5009860765991bd8f1e79b14681cd2bdee
Host: {"node":"v24.13.0","platform":"linux","arch":"x64","cpu":"12th Gen Intel(R) Core(TM) i7-12700KF","cores":20,"ramGb":62.558}
V8 binary: /home/nathan/se6/native/v8-runtime/target/release/secure-exec-v8

| Scenario | Status | Cold Wall | Warm Wall Mean | Cold Sandbox | Warm Sandbox Mean | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Hono Startup | passed | 276.657 ms | 143.791 ms | 0.000 ms | 0.000 ms | - |
| Hono End-to-End | passed | 314.008 ms | 146.734 ms | 0.000 ms | 0.000 ms | - |
| Pi SDK Startup | passed | 2087.659 ms | 1874.052 ms | 0.000 ms | 0.000 ms | - |
| Pi SDK End-to-End | passed | 2652.074 ms | 1901.765 ms | 0.000 ms | 0.000 ms | - |
| Pi CLI Startup | passed | 2667.455 ms | 1810.580 ms | - | - | - |
| Pi CLI End-to-End | failed | - | - | - | - | Error: Pi CLI end-to-end failed with code 0; mockRequests=0; stdout=""; stderr=""     at runScenarioIteration (/home/nathan/se6/packages/secure-exec/benchmarks/ |

## Artifacts

- `hono-startup`: `hono-startup/result.json`, `hono-startup/metrics.prom`, `hono-startup/ipc.ndjson`, `hono-startup/runner.log`
- `hono-end-to-end`: `hono-end-to-end/result.json`, `hono-end-to-end/metrics.prom`, `hono-end-to-end/ipc.ndjson`, `hono-end-to-end/runner.log`
- `pi-sdk-startup`: `pi-sdk-startup/result.json`, `pi-sdk-startup/metrics.prom`, `pi-sdk-startup/ipc.ndjson`, `pi-sdk-startup/runner.log`
- `pi-sdk-end-to-end`: `pi-sdk-end-to-end/result.json`, `pi-sdk-end-to-end/metrics.prom`, `pi-sdk-end-to-end/ipc.ndjson`, `pi-sdk-end-to-end/runner.log`
- `pi-cli-startup`: `pi-cli-startup/result.json`, `pi-cli-startup/metrics.prom`, `pi-cli-startup/ipc.ndjson`, `pi-cli-startup/runner.log`
- `pi-cli-end-to-end`: `pi-cli-end-to-end/result.json`, `pi-cli-end-to-end/metrics.prom`, `pi-cli-end-to-end/ipc.ndjson`, `pi-cli-end-to-end/runner.log`

