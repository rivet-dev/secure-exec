# Transport RTT

Generated: 2026-03-31T23:35:02.407Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.310 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.013 ms | 0.038 ms | 0.047 ms | 0.278 ms |
| 1 KB | 20 | 0.016 ms | 0.020 ms | 0.021 ms | 0.057 ms |
| 64 KB | 20 | 0.110 ms | 0.136 ms | 0.214 ms | 0.216 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T23:10:47.711Z
- Connect RTT: 0.203 -> 0.310 ms (+0.107 ms (+52.71%))
- 1 B mean RTT: 0.019 -> 0.038 ms (+0.019 ms (+100.00%))
- 1 B P95 RTT: 0.030 -> 0.047 ms (+0.017 ms (+56.67%))
- 1 KB mean RTT: 0.015 -> 0.020 ms (+0.005 ms (+33.33%))
- 1 KB P95 RTT: 0.018 -> 0.021 ms (+0.003 ms (+16.67%))
- 64 KB mean RTT: 0.115 -> 0.136 ms (+0.021 ms (+18.26%))
- 64 KB P95 RTT: 0.123 -> 0.214 ms (+0.091 ms (+73.98%))

