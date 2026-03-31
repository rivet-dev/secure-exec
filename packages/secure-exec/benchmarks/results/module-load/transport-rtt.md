# Transport RTT

Generated: 2026-03-31T05:05:14.915Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.198 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.013 ms | 0.022 ms | 0.040 ms | 0.040 ms |
| 1 KB | 20 | 0.014 ms | 0.017 ms | 0.020 ms | 0.025 ms |
| 64 KB | 20 | 0.123 ms | 0.143 ms | 0.181 ms | 0.184 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T05:03:49.892Z
- Connect RTT: 0.210 -> 0.198 ms (-0.012 ms (-5.71%))
- 1 B mean RTT: 0.024 -> 0.022 ms (-0.002 ms (-8.33%))
- 1 B P95 RTT: 0.036 -> 0.040 ms (+0.004 ms (+11.11%))
- 1 KB mean RTT: 0.022 -> 0.017 ms (-0.005 ms (-22.73%))
- 1 KB P95 RTT: 0.030 -> 0.020 ms (-0.010 ms (-33.33%))
- 64 KB mean RTT: 0.334 -> 0.143 ms (-0.191 ms (-57.19%))
- 64 KB P95 RTT: 0.725 -> 0.181 ms (-0.544 ms (-75.03%))

