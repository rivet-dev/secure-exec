# Transport RTT

Generated: 2026-03-31T05:47:54.118Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.194 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.013 ms | 0.024 ms | 0.032 ms | 0.092 ms |
| 1 KB | 20 | 0.014 ms | 0.015 ms | 0.017 ms | 0.019 ms |
| 64 KB | 20 | 0.129 ms | 0.220 ms | 0.391 ms | 0.406 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T05:29:53.289Z
- Connect RTT: 0.200 -> 0.194 ms (-0.006 ms (-3.00%))
- 1 B mean RTT: 0.022 -> 0.024 ms (+0.002 ms (+9.09%))
- 1 B P95 RTT: 0.033 -> 0.032 ms (-0.001 ms (-3.03%))
- 1 KB mean RTT: 0.017 -> 0.015 ms (-0.002 ms (-11.77%))
- 1 KB P95 RTT: 0.019 -> 0.017 ms (-0.002 ms (-10.53%))
- 64 KB mean RTT: 0.128 -> 0.220 ms (+0.092 ms (+71.88%))
- 64 KB P95 RTT: 0.133 -> 0.391 ms (+0.258 ms (+193.99%))

