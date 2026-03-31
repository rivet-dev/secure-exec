# Transport RTT

Generated: 2026-03-31T22:29:20.656Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.200 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.015 ms | 0.027 ms | 0.045 ms | 0.055 ms |
| 1 KB | 20 | 0.015 ms | 0.018 ms | 0.024 ms | 0.030 ms |
| 64 KB | 20 | 0.108 ms | 0.115 ms | 0.136 ms | 0.137 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T22:18:09.805Z
- Connect RTT: 0.196 -> 0.200 ms (+0.004 ms (+2.04%))
- 1 B mean RTT: 0.024 -> 0.027 ms (+0.003 ms (+12.50%))
- 1 B P95 RTT: 0.041 -> 0.045 ms (+0.004 ms (+9.76%))
- 1 KB mean RTT: 0.018 -> 0.018 ms (0.000 ms (0.00%))
- 1 KB P95 RTT: 0.023 -> 0.024 ms (+0.001 ms (+4.35%))
- 64 KB mean RTT: 0.131 -> 0.115 ms (-0.016 ms (-12.21%))
- 64 KB P95 RTT: 0.176 -> 0.136 ms (-0.040 ms (-22.73%))

