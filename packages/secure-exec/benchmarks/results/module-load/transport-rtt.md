# Transport RTT

Generated: 2026-03-31T22:18:09.805Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.196 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.014 ms | 0.024 ms | 0.041 ms | 0.044 ms |
| 1 KB | 20 | 0.014 ms | 0.018 ms | 0.023 ms | 0.038 ms |
| 64 KB | 20 | 0.109 ms | 0.131 ms | 0.176 ms | 0.219 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T21:01:07.549Z
- Connect RTT: 0.220 -> 0.196 ms (-0.024 ms (-10.91%))
- 1 B mean RTT: 0.048 -> 0.024 ms (-0.024 ms (-50.00%))
- 1 B P95 RTT: 0.059 -> 0.041 ms (-0.018 ms (-30.51%))
- 1 KB mean RTT: 0.023 -> 0.018 ms (-0.005 ms (-21.74%))
- 1 KB P95 RTT: 0.028 -> 0.023 ms (-0.005 ms (-17.86%))
- 64 KB mean RTT: 0.126 -> 0.131 ms (+0.005 ms (+3.97%))
- 64 KB P95 RTT: 0.158 -> 0.176 ms (+0.018 ms (+11.39%))

