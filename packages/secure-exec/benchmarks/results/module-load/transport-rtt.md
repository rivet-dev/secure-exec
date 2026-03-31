# Transport RTT

Generated: 2026-03-31T13:28:50.046Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.172 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.014 ms | 0.028 ms | 0.047 ms | 0.081 ms |
| 1 KB | 20 | 0.015 ms | 0.019 ms | 0.024 ms | 0.025 ms |
| 64 KB | 20 | 0.108 ms | 0.207 ms | 0.338 ms | 0.660 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T13:21:52.352Z
- Connect RTT: 0.174 -> 0.172 ms (-0.002 ms (-1.15%))
- 1 B mean RTT: 0.021 -> 0.028 ms (+0.007 ms (+33.33%))
- 1 B P95 RTT: 0.033 -> 0.047 ms (+0.014 ms (+42.42%))
- 1 KB mean RTT: 0.017 -> 0.019 ms (+0.002 ms (+11.77%))
- 1 KB P95 RTT: 0.020 -> 0.024 ms (+0.004 ms (+20.00%))
- 64 KB mean RTT: 0.113 -> 0.207 ms (+0.094 ms (+83.19%))
- 64 KB P95 RTT: 0.124 -> 0.338 ms (+0.214 ms (+172.58%))

