# Transport RTT

Generated: 2026-03-31T09:40:59.453Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.173 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.013 ms | 0.024 ms | 0.043 ms | 0.048 ms |
| 1 KB | 20 | 0.014 ms | 0.016 ms | 0.019 ms | 0.021 ms |
| 64 KB | 20 | 0.107 ms | 0.117 ms | 0.123 ms | 0.132 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T05:47:54.118Z
- Connect RTT: 0.194 -> 0.173 ms (-0.021 ms (-10.82%))
- 1 B mean RTT: 0.024 -> 0.024 ms (0.000 ms (0.00%))
- 1 B P95 RTT: 0.032 -> 0.043 ms (+0.011 ms (+34.38%))
- 1 KB mean RTT: 0.015 -> 0.016 ms (+0.001 ms (+6.67%))
- 1 KB P95 RTT: 0.017 -> 0.019 ms (+0.002 ms (+11.77%))
- 64 KB mean RTT: 0.220 -> 0.117 ms (-0.103 ms (-46.82%))
- 64 KB P95 RTT: 0.391 -> 0.123 ms (-0.268 ms (-68.54%))

