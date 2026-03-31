# Transport RTT

Generated: 2026-03-31T21:01:07.549Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.220 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.021 ms | 0.048 ms | 0.059 ms | 0.321 ms |
| 1 KB | 20 | 0.020 ms | 0.023 ms | 0.028 ms | 0.031 ms |
| 64 KB | 20 | 0.110 ms | 0.126 ms | 0.158 ms | 0.172 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T20:29:57.453Z
- Connect RTT: 0.177 -> 0.220 ms (+0.043 ms (+24.29%))
- 1 B mean RTT: 0.049 -> 0.048 ms (-0.001 ms (-2.04%))
- 1 B P95 RTT: 0.061 -> 0.059 ms (-0.002 ms (-3.28%))
- 1 KB mean RTT: 0.038 -> 0.023 ms (-0.015 ms (-39.47%))
- 1 KB P95 RTT: 0.052 -> 0.028 ms (-0.024 ms (-46.15%))
- 64 KB mean RTT: 0.118 -> 0.126 ms (+0.008 ms (+6.78%))
- 64 KB P95 RTT: 0.133 -> 0.158 ms (+0.025 ms (+18.80%))

